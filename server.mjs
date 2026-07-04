import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4173);
const execFileAsync = promisify(execFile);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(message);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildFallbackSentence(word) {
  if (isJapaneseText(word)) {
    const sentence = `${word}を使って、短い文を作ります。`;
    const translation = `我用“${word}”造一个短句。`;
    const grammar = `这是日语练习用的兜底例句。“${word}”作为目标词出现，实际语法说明需要连接模型后生成。`;
    return { sentence, translation, grammar };
  }

  const templates = [
    `I review the word "${word}" for ten minutes every morning.`,
    `Our teacher asked us to use "${word}" in a simple sentence today.`,
    `When I see the word "${word}", I try to remember a real example.`,
  ];
  const sentence = templates[Math.floor(Math.random() * templates.length)];
  const translation = `我用这个句子来练习单词“${word}”的实际用法。`;
  const grammar = `这个句子使用一般现在时或课堂叙述语境，结构清晰，适合背词。"${word}" 在句中作为核心目标词，能帮助你把单词和真实语境绑定起来。`;
  return { sentence, translation, grammar };
}

function isJapaneseText(text) {
  return /[ぁ-んァ-ン一-龥]/.test(text);
}

function buildSentencePrompt(word) {
  if (isJapaneseText(word)) {
    return {
      system:
        "你是一位日语老师。请为用户给出的日语词或短语生成一个自然、适合背词的日语例句，并用简体中文给出句子翻译和语法解释。返回 JSON，格式为 {\"sentence\":\"日语例句\",\"translation\":\"简体中文翻译\",\"grammar\":\"简体中文语法解释\"}。sentence 必须是日语，不要生成英语句子；translation 和 grammar 必须是纯简体中文，不能包含任何平假名或片假名；语法说明里可以引用目标词，但解释文字必须是中文。",
      user: `日语词：${word}。要求：句子不要太长，适合初中级学习者；中文翻译必须像“这本书买得很便宜。”这种中文句子；语法说明必须像“‘安く’是副词形式，修饰动词‘买’，表示动作发生的方式。”这种中文说明。`,
    };
  }

  return {
    system:
      "你是一位英语老师。请为用户给出的英文单词生成一个自然、适合背单词的英文例句，并用简体中文给出句子翻译和语法解释。返回 JSON，格式为 {\"sentence\":\"...\",\"translation\":\"...\",\"grammar\":\"...\"}。",
    user: `英文单词：${word}。要求：句子不要太长，难度适中，并解释时态、句子结构和这个词在句中的作用。`,
  };
}

function extractJsonObject(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("模型没有返回 JSON");
  }
  return JSON.parse(match[0]);
}

function getOllamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
}

function getOllamaModel() {
  return process.env.OLLAMA_MODEL || "qwen3.5:9b-mlx";
}

async function callOllamaChat(messages, options = {}) {
  const model = options.model || getOllamaModel();
  const response = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      format: "json",
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.numPredict ?? 260,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Ollama 调用失败：${response.status}`);
  }

  const content = data?.message?.content || data?.response || "";
  if (!content) {
    throw new Error("Ollama 没有返回内容");
  }

  return extractJsonObject(content);
}

async function handleLocalStatusApi(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const requestedModel = requestUrl.searchParams.get("model") || "";
    const response = await fetch(`${getOllamaBaseUrl()}/api/tags`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, response.status, {
        ok: false,
        error: data?.error || "无法连接 Ollama",
      });
    }

    const models = (Array.isArray(data.models) ? data.models : []).filter((item) => {
      const name = item.name || item.model || "";
      return !item.remote_model && !name.endsWith(":cloud");
    });
    const modelNames = models.map((item) => item.name || item.model).filter(Boolean);
    const preferred = requestedModel || getOllamaModel();
    const selectedModel =
      modelNames.includes(preferred)
        ? preferred
        : modelNames.find((name) => !name.endsWith(":cloud")) || modelNames[0] || preferred;
    return sendJson(res, 200, {
      ok: true,
      baseUrl: getOllamaBaseUrl(),
      model: selectedModel,
      defaultModel: getOllamaModel(),
      models: models.map((item) => ({
        name: item.name || item.model,
        size: item.size || 0,
        format: item.details?.format || "",
      })),
      hasPreferredModel: modelNames.includes(preferred),
      hasAnyModel: modelNames.length > 0,
    });
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      error: "没有连上 Ollama。请先打开 Ollama，或确认 11434 端口可用。",
    });
  }
}

async function handleLocalSentenceApi(req, res) {
  try {
    const { word, model } = await readJsonBody(req);
    if (!word) {
      return sendJson(res, 400, { error: "缺少 word" });
    }

    const prompt = buildSentencePrompt(word);
    const result = await callOllamaChat(
      [
        {
          role: "system",
          content: `${prompt.system}\n必须只返回合法 JSON，不要 Markdown，不要额外解释。`,
        },
        {
          role: "user",
          content: prompt.user,
        },
      ],
      { model, temperature: 0.2, numPredict: 320 }
    );

    return sendJson(res, 200, {
      sentence: result.sentence || "",
      translation: result.translation || "",
      grammar: result.grammar || "",
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Ollama 本地造句失败" });
  }
}

async function handleLocalReadingApi(req, res) {
  try {
    const { word, model } = await readJsonBody(req);
    if (!word) {
      return sendJson(res, 400, { error: "缺少 word" });
    }

    if (/^[ぁ-んー]+$/.test(word)) {
      return sendJson(res, 200, { reading: word });
    }

    const isJapanese = isJapaneseText(word);
    const result = await callOllamaChat(
      [
        {
          role: "system",
          content: isJapanese
            ? "你是日语词典助手。只返回合法 JSON：{\"reading\":\"...\"}。reading 必须是平假名读音，不要罗马音，不要解释。"
            : "你是英语词典助手。只返回合法 JSON：{\"reading\":\"...\"}。reading 必须是标准 IPA 音标，包含斜杠，例如 /ˈæpəl/，不要解释。",
        },
        {
          role: "user",
          content: isJapanese
            ? `请给这个词标注平假名读音：${word}`
            : `请给这个英文单词标注 IPA 音标：${word}`,
        },
      ],
      { model, temperature: 0, numPredict: 120 }
    );

    return sendJson(res, 200, { reading: result.reading || word });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Ollama 本地标读音失败" });
  }
}

async function handleSentenceApi(req, res) {
  try {
    const { word } = await readJsonBody(req);
    if (!word) {
      return sendJson(res, 400, { error: "缺少 word" });
    }

    const apiKey = process.env.BAILIAN_API_KEY;
    if (!apiKey) {
      return sendJson(res, 200, buildFallbackSentence(word));
    }

    const endpoint =
      process.env.BAILIAN_CHAT_ENDPOINT ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const model = process.env.BAILIAN_LLM_MODEL || "qwen-turbo";
    const prompt = buildSentencePrompt(word);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: prompt.system,
          },
          {
            role: "user",
            content: prompt.user,
          },
        ],
        temperature: 0.7,
        response_format: {
          type: "json_object",
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.message || data?.error?.message || "句子生成失败",
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return sendJson(res, 500, { error: "句子接口没有返回内容" });
    }

    return sendJson(res, 200, JSON.parse(content));
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "句子服务异常" });
  }
}

async function handleReadingApi(req, res) {
  try {
    const { word } = await readJsonBody(req);
    if (!word) {
      return sendJson(res, 400, { error: "缺少 word" });
    }

    if (/^[ぁ-んー]+$/.test(word)) {
      return sendJson(res, 200, { reading: word });
    }

    const apiKey = process.env.BAILIAN_API_KEY;
    if (!apiKey) {
      return sendJson(res, 200, { reading: word });
    }

    const endpoint =
      process.env.BAILIAN_CHAT_ENDPOINT ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const model = process.env.BAILIAN_LLM_MODEL || "qwen-turbo";
    const isJapanese = isJapaneseText(word);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: isJapanese
              ? "你是日语词典助手。用户会给一个日语词或短语。请只返回 JSON：{\"reading\":\"...\"}。reading 必须是平假名读音，不要解释，不要罗马音。"
              : "你是英语词典助手。用户会给一个英文单词。请只返回 JSON：{\"reading\":\"...\"}。reading 必须是标准 IPA 音标，包含斜杠，例如 /ˈæpəl/。不要解释。",
          },
          {
            role: "user",
            content: isJapanese
              ? `请给这个词标注平假名读音：${word}`
              : `请给这个英文单词标注 IPA 音标：${word}`,
          },
        ],
        temperature: 0,
        response_format: {
          type: "json_object",
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.message || data?.error?.message || "假名生成失败",
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return sendJson(res, 500, { error: "假名接口没有返回内容" });
    }

    const parsed = JSON.parse(content);
    return sendJson(res, 200, { reading: parsed.reading || word });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "假名服务异常" });
  }
}

function detectLanguageType(text) {
  if (/[ぁ-んァ-ン一-龥]/.test(text)) {
    return "Japanese";
  }
  return "English";
}

async function handleTtsApi(req, res) {
  try {
    const { text } = await readJsonBody(req);
    if (!text) {
      return sendJson(res, 400, { error: "缺少 text" });
    }

    const apiKey = process.env.BAILIAN_API_KEY;
    if (!apiKey) {
      return sendJson(res, 503, {
        error: "未配置语音 API Key。把 Key 发我，我来替你写进本地配置。",
      });
    }

    const endpoint =
      process.env.BAILIAN_TTS_ENDPOINT ||
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
    const model = process.env.BAILIAN_TTS_MODEL || "qwen3-tts-flash";
    const voice = process.env.BAILIAN_TTS_VOICE || "Cherry";

    const payload = JSON.stringify({
      model,
      input: {
        text,
        voice,
        language_type: detectLanguageType(text),
      },
    });
    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "-X",
      "POST",
      endpoint,
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Bearer ${apiKey}`,
      "-d",
      payload,
    ]);

    const raw = stdout || "";
    const data = raw ? JSON.parse(raw) : {};
    if (data?.code && !data?.output?.audio?.url) {
      return sendJson(res, 502, {
        error: data?.message || data?.code || "语音生成失败",
      });
    }

    const audioUrl = data?.output?.audio?.url;
    if (!audioUrl) {
      return sendJson(res, 500, {
        error: raw || "语音接口没有返回音频地址",
      });
    }

    return sendJson(res, 200, {
      url: `/api/audio?url=${encodeURIComponent(audioUrl)}`,
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "语音服务异常" });
  }
}

async function handleAudioProxy(req, res) {
  let inputPath = "";
  let outputPath = "";
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const audioUrl = requestUrl.searchParams.get("url");
    if (!audioUrl || !/^https?:\/\//.test(audioUrl)) {
      return sendText(res, 400, "缺少音频地址");
    }

    const { stdout } = await execFileAsync(
      "curl",
      ["-L", "-sS", audioUrl],
      {
        encoding: "buffer",
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    const tempDir = await mkdtemp(path.join(tmpdir(), "word-booster-audio-"));
    inputPath = path.join(tempDir, "source.wav");
    outputPath = path.join(tempDir, "speech.m4a");
    await writeFile(inputPath, stdout);
    await execFileAsync("afconvert", [inputPath, outputPath, "-f", "m4af", "-d", "aac"]);
    const convertedAudio = await readFile(outputPath);

    res.writeHead(200, {
      "Content-Type": "audio/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(convertedAudio);
  } catch (error) {
    return sendText(res, 502, error.message || "音频代理失败");
  } finally {
    await Promise.all([inputPath, outputPath].filter(Boolean).map((file) => unlink(file).catch(() => null)));
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.join(__dirname, pathname);
  readFile(filePath)
    .then((content) => {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    })
    .catch(() => {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    });
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  if (req.method === "POST" && req.url === "/api/sentence") {
    return handleSentenceApi(req, res);
  }

  if (req.method === "POST" && req.url === "/api/reading") {
    return handleReadingApi(req, res);
  }

  if (req.method === "GET" && req.url.startsWith("/api/local/status")) {
    return handleLocalStatusApi(req, res);
  }

  if (req.method === "POST" && req.url === "/api/local/sentence") {
    return handleLocalSentenceApi(req, res);
  }

  if (req.method === "POST" && req.url === "/api/local/reading") {
    return handleLocalReadingApi(req, res);
  }

  if (req.method === "POST" && req.url === "/api/tts") {
    return handleTtsApi(req, res);
  }

  if (req.method === "GET" && req.url.startsWith("/api/audio")) {
    return handleAudioProxy(req, res);
  }

  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Word Booster running at http://127.0.0.1:${PORT}`);
});
