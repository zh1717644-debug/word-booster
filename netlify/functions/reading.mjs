import { fallbackChatEndpoint } from "./_shared/config.mjs";
import { isJapaneseText, json } from "./_shared/helpers.mjs";

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

    const isJapanese = isJapaneseText(word);
    if (/^[ぁ-んー]+$/.test(word) || !API_KEY) {
      return json(200, { reading: word });
    }

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
      return json(response.status, {
        error: data?.message || data?.error?.message || "假名生成失败",
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return json(500, { error: "假名接口没有返回内容" });
    }

    const parsed = JSON.parse(content);
    return json(200, { reading: parsed.reading || word });
  } catch (error) {
    return json(500, { error: error.message || "假名服务异常" });
  }
}
