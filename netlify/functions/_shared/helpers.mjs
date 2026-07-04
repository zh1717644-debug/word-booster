export function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(payload),
  };
}

export function buildFallbackSentence(word) {
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
  const grammar = `这个句子使用一般现在时或课堂叙述语境，结构清晰，适合背词。“${word}”在句中作为核心目标词，能帮助你把单词和真实语境绑定起来。`;
  return { sentence, translation, grammar };
}

export function isJapaneseText(text) {
  return /[ぁ-んァ-ン一-龥]/.test(text);
}

export function buildSentencePrompt(word) {
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

export function detectLanguageType(text) {
  if (/[ぁ-んァ-ン一-龥]/.test(text)) {
    return "Japanese";
  }
  return "English";
}
