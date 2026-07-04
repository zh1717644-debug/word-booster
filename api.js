function getApiBase() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:4173";
  }
  return "";
}

export function createDictionaryHint(word) {
  return `点击“生成例句”后，这里会更新 ${word} 的例句与讲解。`;
}

export async function enrichWordDetails(word) {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const first = data?.[0];
    return {
      phonetic: first?.phonetic || first?.phonetics?.find((item) => item.text)?.text || "",
      partOfSpeech: first?.meanings?.[0]?.partOfSpeech || "",
      definition: first?.meanings?.[0]?.definitions?.[0]?.definition || "",
    };
  } catch {
    return null;
  }
}

export async function generateSentenceBundle(word) {
  const response = await fetch(`${getApiBase()}/api/sentence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ word }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `接口请求失败（${response.status}）`);
  }
  return data;
}

export async function generateReading(word) {
  const response = await fetch(`${getApiBase()}/api/reading`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ word }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `假名接口失败（${response.status}）`);
  }
  return data.reading;
}
