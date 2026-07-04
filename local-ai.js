const LOCAL_MODEL_LABEL = "Ollama";

function withModel(payload, model) {
  return model ? { ...payload, model } : payload;
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "本地 Ollama 调用失败");
  }
  return data;
}

export function getLocalAiInfo(model = "") {
  return {
    modelId: model ? `${LOCAL_MODEL_LABEL} · ${model}` : LOCAL_MODEL_LABEL,
    runtime: "本机 Ollama",
    supported: true,
  };
}

export async function loadLocalAi(model = "", onProgress = () => {}) {
  onProgress("正在连接本机 Ollama…");
  const query = model ? `?model=${encodeURIComponent(model)}` : "";
  const response = await fetch(`/api/local/status${query}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data?.error || "没有连上本机 Ollama");
  }

  const modelNames = (data.models || []).map((item) => item.name).filter(Boolean);
  if (!data.hasAnyModel) {
    throw new Error("Ollama 已启动，但还没有下载任何本地模型");
  }

  if (model && !data.hasPreferredModel) {
    throw new Error(
      `没有找到 ${model}。可用模型：${modelNames.join("、") || "无"}`
    );
  }

  onProgress(`已连接本机 Ollama：${data.model}`);
  return data;
}

export async function generateLocalReading(word, model = "") {
  const info = await loadLocalAi(model);
  const result = await requestJson("/api/local/reading", withModel({ word }, info.model));
  return result.reading || word;
}

export async function generateLocalSentenceBundle(word, model = "") {
  const info = await loadLocalAi(model);
  const result = await requestJson("/api/local/sentence", withModel({ word }, info.model));
  return {
    sentence: result.sentence || "",
    translation: result.translation || "",
    grammar: result.grammar || "",
  };
}
