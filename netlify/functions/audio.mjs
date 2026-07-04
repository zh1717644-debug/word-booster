import { json } from "./_shared/helpers.mjs";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const audioUrl = event.queryStringParameters?.url || "";
    if (!audioUrl || !/^https?:\/\//.test(audioUrl)) {
      return json(400, { error: "缺少音频地址" });
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      return json(response.status, { error: "音频下载失败" });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "audio/wav",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return json(502, { error: error.message || "音频代理失败" });
  }
}

