import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fallbackTtsEndpoint } from "./_shared/config.mjs";
import { detectLanguageType, json } from "./_shared/helpers.mjs";

const execFileAsync = promisify(execFile);
const API_KEY =
  process.env.BAILIAN_API_KEY || process.env.WORD_BOOSTER_BAILIAN_KEY || "";
const ENDPOINT =
  process.env.BAILIAN_TTS_ENDPOINT ||
  fallbackTtsEndpoint ||
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const MODEL = process.env.BAILIAN_TTS_MODEL || "qwen3-tts-flash";
const VOICE = process.env.BAILIAN_TTS_VOICE || "Cherry";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return json(400, { error: "缺少 text" });
    }

    if (!API_KEY) {
      return json(503, { error: "服务端未配置语音 Key" });
    }

    const payload = JSON.stringify({
      model: MODEL,
      input: {
        text,
        voice: VOICE,
        language_type: detectLanguageType(text),
      },
    });

    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "-X",
      "POST",
      ENDPOINT,
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Bearer ${API_KEY}`,
      "-d",
      payload,
    ]);

    const raw = stdout || "";
    const data = raw ? JSON.parse(raw) : {};
    if (data?.code && !data?.output?.audio?.url) {
      return json(502, {
        error: data?.message || data?.code || "语音生成失败",
      });
    }

    const url = data?.output?.audio?.url;
    if (!url) {
      return json(500, { error: raw || "语音接口没有返回音频地址" });
    }

    return json(200, { url: `/api/audio?url=${encodeURIComponent(url)}` });
  } catch (error) {
    return json(500, { error: error.message || "语音服务异常" });
  }
}
