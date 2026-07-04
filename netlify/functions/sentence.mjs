import { buildFallbackSentence, buildSentencePrompt, json } from "./_shared/helpers.mjs";
import { fallbackChatEndpoint } from "./_shared/config.mjs";

const API_KEY =
  process.env.BAILIAN_API_KEY || process.env.WORD_BOOSTER_BAILIAN_KEY || "";
const ENDPOINT =
  process.env.BAILIAN_CHAT_ENDPOINT ||
  fallbackChatEndpoint ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL = process.env.BAILIAN_LLM_MODEL || "qwen-turbo";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { word } = JSON.parse(event.body || "{}");
    if (!word) {
      return json(400, { error: "缺少 word" });
    }

    if (!API_KEY) {
      return json(200, buildFallbackSentence(word));
    }

    const prompt = buildSentencePrompt(word);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
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
      return json(response.status, {
        error: data?.message || data?.error?.message || "句子生成失败",
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return json(500, { error: "句子接口没有返回内容" });
    }

    return json(200, JSON.parse(content));
  } catch (error) {
    return json(500, { error: error.message || "句子服务异常" });
  }
}
