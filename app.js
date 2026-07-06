import {
  createDictionaryHint,
  enrichWordDetails,
  generateReading,
  generateSentenceBundle,
} from "./api.js?v=20260706-3";
import {
  loadAppState,
  persistAppState,
  recordReview,
  getReviewStats,
} from "./db.js?v=20260706-3";
import {
  generateLocalReading,
  generateLocalSentenceBundle,
  getLocalAiInfo,
  loadLocalAi,
} from "./local-ai.js?v=20260706-3";

const DEFAULT_STATE = {
  words: [],
  currentWordId: "",
  flipped: false,
  ocrLanguage: "jpn+eng",
  aiMode: "cloud",
  ollamaModel: "",
  filter: "all",
  search: "",
};

const state = structuredClone(DEFAULT_STATE);
let selectedImageFile = null;
let previewObjectUrl = "";

const els = {
  imageInput: document.querySelector("#imageInput"),
  previewImage: document.querySelector("#previewImage"),
  scanButton: document.querySelector("#scanButton"),
  ocrLanguageSelect: document.querySelector("#ocrLanguageSelect"),
  ocrStatus: document.querySelector("#ocrStatus"),
  manualWords: document.querySelector("#manualWords"),
  mergeWordsButton: document.querySelector("#mergeWordsButton"),
  cleanWordsButton: document.querySelector("#cleanWordsButton"),
  clearWordsButton: document.querySelector("#clearWordsButton"),
  flashcard: document.querySelector("#flashcard"),
  cardWord: document.querySelector("#cardWord"),
  cardMeta: document.querySelector("#cardMeta"),
  cardMeaning: document.querySelector("#cardMeaning"),
  cardSchedule: document.querySelector("#cardSchedule"),
  speakButton: document.querySelector("#speakButton"),
  shuffleButton: document.querySelector("#shuffleButton"),
  knownButton: document.querySelector("#knownButton"),
  unknownButton: document.querySelector("#unknownButton"),
  showAllButton: document.querySelector("#showAllButton"),
  showReviewButton: document.querySelector("#showReviewButton"),
  showKnownButton: document.querySelector("#showKnownButton"),
  totalCount: document.querySelector("#totalCount"),
  knownCount: document.querySelector("#knownCount"),
  reviewCount: document.querySelector("#reviewCount"),
  dueTodayCount: document.querySelector("#dueTodayCount"),
  streakCount: document.querySelector("#streakCount"),
  generateSentenceButton: document.querySelector("#generateSentenceButton"),
  sentenceOutput: document.querySelector("#sentenceOutput"),
  translationOutput: document.querySelector("#translationOutput"),
  grammarOutput: document.querySelector("#grammarOutput"),
  wordBank: document.querySelector("#wordBank"),
  searchInput: document.querySelector("#searchInput"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  aiModeSelect: document.querySelector("#aiModeSelect"),
  ollamaModelSelect: document.querySelector("#ollamaModelSelect"),
  downloadLocalAiButton: document.querySelector("#downloadLocalAiButton"),
  localAiStatus: document.querySelector("#localAiStatus"),
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeWord(raw) {
  return raw.trim().toLowerCase().replace(/^[^a-z]+|[^a-z-]+$/g, "");
}

function normalizeJapaneseToken(raw) {
  return raw.trim().replace(/^[\s、。，．・:：;；!！?？()（）[\]【】"'“”‘’]+|[\s、。，．・:：;；!！?？()（）[\]【】"'“”‘’]+$/g, "");
}

function isJapaneseToken(token) {
  return /[ぁ-んァ-ン一-龥]/.test(token);
}

function isUsefulEnglishToken(token) {
  return /^[a-z][a-z'-]{2,}$/.test(token) && /[aeiou]/.test(token);
}

function isUsefulJapaneseToken(token) {
  const chars = [...token];
  if (chars.length < 2 || /^ー+$/.test(token)) {
    return false;
  }
  if (/^[ぁ-んァ-ンー]+$/.test(token) && chars.length < 3) {
    return false;
  }
  return /[ぁ-んァ-ン一-龥]/.test(token);
}

function isUsefulToken(token) {
  if (!token) {
    return false;
  }
  return isJapaneseToken(token) ? isUsefulJapaneseToken(token) : isUsefulEnglishToken(token);
}

function isKanaToken(token) {
  return /^[ぁ-んァ-ンー]+$/.test(token);
}

function toHiragana(token) {
  return token.replace(/[ァ-ン]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function extractOcrTokens(line) {
  return (
    line.match(/[A-Za-z][A-Za-z-']+|[ぁ-んァ-ン一-龥ー々〆ヵヶ]+/g) ?? []
  ).map((token) => token.trim()).filter(Boolean);
}

function isLikelyMeaningToken(token) {
  const value = normalizeJapaneseToken(token);
  if (!value || isKanaToken(value)) {
    return false;
  }
  if (/^[A-Za-z]/.test(value)) {
    return true;
  }
  return /[一-龥]/.test(value);
}

function extractWords(text) {
  const matches = text.match(/[A-Za-z][A-Za-z-']+/g) ?? [];
  return [...new Set(matches.map(normalizeWord).filter(isUsefulEnglishToken))];
}

function pickBestJapaneseWord(tokens) {
  const normalizedTokens = tokens.map(normalizeJapaneseToken).filter(Boolean);
  const firstToken = normalizedTokens[0] || "";
  return (
    normalizedTokens.find((token) => /[一-龥]/.test(token) && /[ぁ-んァ-ンー]/.test(token)) ||
    (isKanaToken(firstToken) && normalizedTokens.slice(1).some(isLikelyMeaningToken)
      ? firstToken
      : "") ||
    normalizedTokens.find((token) => /[一-龥]/.test(token) && isUsefulJapaneseToken(token)) ||
    normalizedTokens.find((token) => isKanaToken(token) && isUsefulJapaneseToken(token)) ||
    ""
  );
}

function parseJapaneseOcrTokens(tokens) {
  if (!tokens.length) {
    return null;
  }

  const word = pickBestJapaneseWord(tokens);
  const wordIndex = tokens.findIndex((token) => normalizeJapaneseToken(token) === word);
  if (wordIndex === -1) {
    return null;
  }

  const readingToken =
    tokens
      .slice(wordIndex + 1)
      .find((token) => isKanaToken(normalizeJapaneseToken(token)) && normalizeJapaneseToken(token) !== word) ||
    tokens.find((token, index) => index !== wordIndex && isKanaToken(normalizeJapaneseToken(token)));
  const phonetic = readingToken ? toHiragana(normalizeJapaneseToken(readingToken)) : "";
  const detailStart = readingToken ? tokens.indexOf(readingToken) + 1 : wordIndex + 1;
  let definition = tokens
    .slice(detailStart)
    .filter(isLikelyMeaningToken)
    .map(normalizeJapaneseToken)
    .filter((token) => token && token !== word)
    .join("、");
  if (!definition) {
    definition = tokens
      .filter((token, index) => index !== wordIndex && token !== readingToken)
      .filter(isLikelyMeaningToken)
      .map(normalizeJapaneseToken)
      .filter((token) => token && token !== word)
      .join("、");
  }

  return {
    word,
    phonetic,
    definition,
    note: definition || createDictionaryHint(word),
  };
}

function parseJapaneseOcrLine(line) {
  return parseJapaneseOcrTokens(extractOcrTokens(line));
}

function hasOcrCardDetail(entry) {
  return Boolean(entry?.word && (entry.phonetic || entry.definition));
}

function getWordBox(item) {
  const box = item?.bbox || item;
  const x0 = box?.x0 ?? box?.left ?? box?.x ?? 0;
  const y0 = box?.y0 ?? box?.top ?? box?.y ?? 0;
  const x1 = box?.x1 ?? (box?.left ?? box?.x ?? 0) + (box?.width ?? 0);
  const y1 = box?.y1 ?? (box?.top ?? box?.y ?? 0) + (box?.height ?? 0);
  return { x0, y0, x1, y1, midY: (y0 + y1) / 2, height: Math.max(1, y1 - y0) };
}

function extractEntriesFromOcrWords(ocrWords = []) {
  const positioned = ocrWords
    .map((item) => ({
      text: normalizeJapaneseToken(item?.text || item?.symbols?.map((symbol) => symbol.text).join("") || ""),
      box: getWordBox(item),
    }))
    .filter((item) => item.text && extractOcrTokens(item.text).length);
  if (!positioned.length) {
    return [];
  }

  const rows = [];
  for (const item of positioned.sort((a, b) => a.box.midY - b.box.midY || a.box.x0 - b.box.x0)) {
    const row = rows.find((candidate) => Math.abs(candidate.midY - item.box.midY) <= Math.max(10, item.box.height * 0.8));
    if (row) {
      row.items.push(item);
      row.midY = row.items.reduce((sum, entry) => sum + entry.box.midY, 0) / row.items.length;
    } else {
      rows.push({ midY: item.box.midY, items: [item] });
    }
  }

  const entriesByWord = new Map();
  for (const row of rows) {
    const tokens = row.items
      .sort((a, b) => a.box.x0 - b.box.x0)
      .flatMap((item) => extractOcrTokens(item.text));
    const entry = parseJapaneseOcrTokens(tokens);
    if (hasOcrCardDetail(entry) && !entriesByWord.has(entry.word)) {
      entriesByWord.set(entry.word, entry);
    }
  }
  return [...entriesByWord.values()];
}

function extractOcrEntries(text, language, data = null) {
  if (language === "eng") {
    return extractWords(text);
  }

  const entriesByWord = new Map();
  for (const entry of extractEntriesFromOcrWords(data?.words)) {
    if (entry.word) {
      entriesByWord.set(entry.word, entry);
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const entry = parseJapaneseOcrLine(line);
    if (!hasOcrCardDetail(entry) || entriesByWord.has(entry.word)) {
      continue;
    }
    const existing = entriesByWord.get(entry.word);
    entriesByWord.set(entry.word, {
      ...entry,
      phonetic: existing?.phonetic || entry.phonetic,
      definition: existing?.definition || entry.definition,
      note: existing?.definition || entry.definition || entry.note,
    });
  }

  if (!entriesByWord.size) {
    const tokens = extractOcrTokens(text);
    for (let index = 0; index < tokens.length; index += 3) {
      const entry = parseJapaneseOcrTokens(tokens.slice(index, index + 3));
      if (hasOcrCardDetail(entry) && !entriesByWord.has(entry.word)) {
        entriesByWord.set(entry.word, entry);
      }
    }
  }

  if (entriesByWord.size) {
    return [...entriesByWord.values()];
  }

  return extractMixedWords(text, language);
}

function extractMixedWords(text, language) {
  if (language === "jpn") {
    const matches = text.match(/[ぁ-んァ-ン一-龥ー]{1,}/g) ?? [];
    return [...new Set(matches.map(normalizeJapaneseToken).filter(isUsefulJapaneseToken))];
  }

  const japanese = text.match(/[ぁ-んァ-ン一-龥ー]{1,}/g) ?? [];
  const english = extractWords(text);
  const japaneseWords = japanese.map(normalizeJapaneseToken).filter(isUsefulJapaneseToken);
  return [
    ...new Set([
      ...japaneseWords,
      ...(japaneseWords.length ? [] : english),
    ]),
  ];
}

function formatDate(dateString) {
  if (!dateString) {
    return "随时可复习";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function isDue(word) {
  return !word.nextReviewAt || new Date(word.nextReviewAt).getTime() <= Date.now();
}

function createWordEntry(word) {
  return {
    id: uid(),
    word,
    note: createDictionaryHint(word),
    phonetic: "",
    partOfSpeech: "",
    definition: "",
    sentence: "",
    translation: "",
    grammar: "",
    known: false,
    review: true,
    reviewCount: 0,
    wrongCount: 0,
    createdAt: nowIso(),
    lastReviewedAt: "",
    nextReviewAt: "",
  };
}

function mergeState(savedState) {
  Object.assign(state, structuredClone(DEFAULT_STATE), savedState || {});
  state.words = Array.isArray(savedState?.words) ? savedState.words : [];
  state.ocrLanguage = savedState?.ocrLanguage || "jpn+eng";
  state.aiMode = savedState?.aiMode || "cloud";
  state.ollamaModel = savedState?.ollamaModel || "";
}

async function saveState() {
  await persistAppState(state);
}

function getCurrentWord() {
  return state.words.find((item) => item.id === state.currentWordId) ?? null;
}

function getFilteredWords() {
  const keyword = state.search.trim().toLowerCase();
  return state.words.filter((item) => {
    const matchFilter =
      state.filter === "all" ||
      (state.filter === "review" && isDue(item)) ||
      (state.filter === "known" && item.known);
    const matchSearch =
      !keyword ||
      item.word.includes(keyword) ||
      item.definition.toLowerCase().includes(keyword) ||
      item.translation.toLowerCase().includes(keyword);
    return matchFilter && matchSearch;
  });
}

function ensureCurrentWordVisible() {
  const visible = getFilteredWords();
  if (visible.some((item) => item.id === state.currentWordId)) {
    return;
  }
  state.currentWordId = visible[0]?.id || "";
}

async function setCurrentWord(wordId) {
  state.currentWordId = wordId;
  state.flipped = false;
  render();
  await saveState();
}

function randomVisibleWord() {
  const visible = getFilteredWords();
  if (!visible.length) {
    return null;
  }
  return visible[Math.floor(Math.random() * visible.length)];
}

async function mergeWords(words) {
  const existing = new Map(state.words.map((entry) => [entry.word, entry]));
  const addedEntries = [];

  for (const word of words) {
    const normalized = typeof word === "string" ? word : word.word;
    if (!normalized || existing.has(normalized)) {
      if (normalized && typeof word !== "string" && existing.has(normalized)) {
        const existingEntry = existing.get(normalized);
        for (const key of ["phonetic", "definition", "partOfSpeech", "note"]) {
          if (word[key]) {
            existingEntry[key] = word[key];
          }
        }
      }
      continue;
    }
    const entry =
      typeof word === "string"
        ? createWordEntry(normalized)
        : { ...createWordEntry(normalized), ...word };
    existing.set(normalized, entry);
    addedEntries.push(entry);
  }

  state.words = [...existing.values()].sort((a, b) => a.word.localeCompare(b.word));
  if (!state.currentWordId && state.words.length) {
    state.currentWordId = state.words[0].id;
  }

  render();
  await saveState();

  for (const entry of addedEntries) {
    void enrichWord(entry);
  }
}

async function cleanNoisyWords() {
  const before = state.words.length;
  state.words = state.words.filter((entry) => {
    if (!isUsefulToken(entry.word)) {
      return false;
    }
    if (!isJapaneseToken(entry.word) && !entry.definition && !entry.sentence) {
      return false;
    }
    return true;
  });
  if (!state.words.some((entry) => entry.id === state.currentWordId)) {
    state.currentWordId = state.words[0]?.id || "";
  }
  render();
  await saveState();
  return before - state.words.length;
}

async function enrichWord(wordEntry) {
  if (!wordEntry || wordEntry.definition) {
    return;
  }
  const detail = await enrichWordDetails(wordEntry.word);
  if (!detail) {
    return;
  }
  Object.assign(wordEntry, detail, {
    note: detail.definition || wordEntry.note,
  });
  render();
  await saveState();
}

function renderStats() {
  els.totalCount.textContent = String(state.words.length);
  els.knownCount.textContent = String(state.words.filter((item) => item.known).length);
  els.reviewCount.textContent = String(state.words.filter((item) => item.review).length);
  els.dueTodayCount.textContent = String(state.words.filter((item) => isDue(item)).length);
}

async function renderReviewStats() {
  const stats = await getReviewStats();
  els.streakCount.textContent = String(stats.streakDays);
}

function renderCard() {
  const current = getCurrentWord();
  if (!current) {
    els.cardWord.textContent = "还没有单词";
    els.cardMeta.textContent = "导入后会显示假名或音标";
    els.cardMeaning.textContent = "先导入单词，我们就能开始抽卡。";
    els.cardSchedule.textContent = "复习计划会显示在这里";
    els.flashcard.classList.remove("flipped");
    return;
  }

  els.cardWord.textContent = current.word;
  els.cardMeta.textContent =
    [current.phonetic, current.partOfSpeech].filter(Boolean).join(" · ") || "暂无假名/音标";
  const meaning = current.definition || current.translation || "";
  els.cardMeaning.textContent = [
    `假名/音标：${current.phonetic || "暂无"}`,
    `中文意思：${meaning || "暂无"}`,
    current.known ? "状态：已掌握" : isDue(current) ? "状态：现在该复习" : "状态：已安排复习",
    current.sentence ? `例句：${current.sentence}` : current.note,
  ]
    .filter(Boolean)
    .join("\n\n");
  els.cardSchedule.textContent = `下次复习：${formatDate(current.nextReviewAt)}`;
  els.flashcard.classList.toggle("flipped", state.flipped);
}

function renderWordBank() {
  els.wordBank.innerHTML = "";
  for (const item of getFilteredWords()) {
    const button = document.createElement("button");
    button.className = "word-chip";
    if (item.id === state.currentWordId) {
      button.classList.add("active");
    }
    if (isDue(item) && item.id !== state.currentWordId) {
      button.classList.add("review");
    }
    button.textContent = item.word;
    button.addEventListener("click", () => void setCurrentWord(item.id));
    els.wordBank.appendChild(button);
  }
}

function renderOutputs() {
  const current = getCurrentWord();
  els.sentenceOutput.textContent = current?.sentence || "选择一个单词后，点击按钮开始生成。";
  els.translationOutput.textContent =
    current?.translation || "这里会显示例句中文释义，方便对照记忆。";
  els.grammarOutput.textContent =
    current?.grammar || "这里会解释句子结构、时态、词性和关键用法。";
}

function revokePreviewUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  }
}

function renderImage() {
  if (!previewObjectUrl) {
    els.previewImage.hidden = true;
    els.previewImage.removeAttribute("src");
    return;
  }
  els.previewImage.src = previewObjectUrl;
  els.previewImage.hidden = false;
}

function setPreviewFile(file) {
  revokePreviewUrl();
  selectedImageFile = file;
  if (!file) {
    renderImage();
    return;
  }
  previewObjectUrl = URL.createObjectURL(file);
  renderImage();
}

function renderSettings() {
  els.ocrLanguageSelect.value = state.ocrLanguage;
  els.aiModeSelect.value = state.aiMode;
  els.ollamaModelSelect.value = state.ollamaModel;
  els.ollamaModelSelect.disabled = state.aiMode !== "local";
  els.downloadLocalAiButton.disabled = state.aiMode !== "local";
  els.searchInput.value = state.search;
  els.showAllButton.classList.toggle("primary", state.filter === "all");
  els.showReviewButton.classList.toggle("primary", state.filter === "review");
  els.showKnownButton.classList.toggle("primary", state.filter === "known");
}

function render() {
  ensureCurrentWordVisible();
  renderStats();
  renderCard();
  renderOutputs();
  renderWordBank();
  renderImage();
  renderSettings();
  void renderReviewStats();
}

function nextReviewDate(reviewCount) {
  const minute = 60 * 1000;
  const schedule = [
    30 * minute,
    12 * 60 * minute,
    24 * 60 * minute,
    3 * 24 * 60 * minute,
    7 * 24 * 60 * minute,
  ];
  const delay =
    schedule[Math.min(reviewCount - 1, schedule.length - 1)] || 14 * 24 * 60 * minute;
  return new Date(Date.now() + delay).toISOString();
}

async function markWord(known) {
  const current = getCurrentWord();
  if (!current) {
    return;
  }

  current.lastReviewedAt = nowIso();
  if (known) {
    current.reviewCount += 1;
    current.known = true;
    current.review = false;
    current.nextReviewAt = nextReviewDate(current.reviewCount);
  } else {
    current.wrongCount += 1;
    current.reviewCount = 0;
    current.known = false;
    current.review = true;
    current.nextReviewAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  }

  await recordReview({
    word: current.word,
    known,
    reviewedAt: current.lastReviewedAt,
  });
  await saveState();
  const nextWord = randomVisibleWord();
  if (nextWord) {
    state.currentWordId = nextWord.id;
  }
  state.flipped = false;
  render();
}

async function runOcr() {
  const file = selectedImageFile || els.imageInput.files?.[0];
  if (!file) {
    els.ocrStatus.textContent = "请先上传一张图片。";
    return;
  }

  els.scanButton.disabled = true;
  els.ocrStatus.textContent = "正在识别中，请稍等…";

  try {
    const selectedLanguage = state.ocrLanguage || "jpn+eng";
    const { data } = await Tesseract.recognize(file, selectedLanguage, {
      logger: (message) => {
        if (message.status && typeof message.progress === "number") {
          els.ocrStatus.textContent = `${message.status} ${Math.round(message.progress * 100)}%`;
        }
      },
    });

    const rawText = data.text?.trim() || "";
    const words = extractOcrEntries(rawText, selectedLanguage, data);
    await mergeWords(words);
    els.ocrStatus.textContent = words.length
      ? `识别完成，已提取 ${words.length} 个条目。`
      : "识别完成，但没有找到清晰可用的文字。建议拍近一点、裁掉空白边缘后再试。";
  } catch (error) {
    els.ocrStatus.textContent = `识别失败：${error.message}`;
  } finally {
    els.scanButton.disabled = false;
  }
}

async function generateSentence() {
  const current = getCurrentWord();
  if (!current) {
    els.sentenceOutput.textContent = "先导入单词，我们再来生成例句。";
    return;
  }

  els.generateSentenceButton.disabled = true;
  els.sentenceOutput.textContent = `正在为 ${current.word} 生成例句…`;
  els.translationOutput.textContent = "正在生成中文释义…";
  els.grammarOutput.textContent = "正在整理语法说明…";

  try {
    const result =
      state.aiMode === "local"
        ? await generateLocalSentenceBundle(current.word, state.ollamaModel)
        : await generateSentenceBundle(current.word);
    current.sentence = result.sentence;
    current.translation = result.translation;
    current.grammar = result.grammar;
    current.note = "已生成例句与语法。";
    render();
    await saveState();
  } catch (error) {
    els.grammarOutput.textContent = `生成失败：${error.message}`;
  } finally {
    els.generateSentenceButton.disabled = false;
  }
}

async function markCurrentReading() {
  const current = getCurrentWord();
  if (!current?.word) {
    return;
  }

  try {
    els.speakButton.disabled = true;
    els.ocrStatus.textContent = `正在为 ${current.word} 标注读音…`;
    current.phonetic =
      state.aiMode === "local"
        ? await generateLocalReading(current.word, state.ollamaModel)
        : await generateReading(current.word);
    render();
    await saveState();
    els.ocrStatus.textContent = `已标注：${current.word} → ${current.phonetic}`;
  } catch (error) {
    els.ocrStatus.textContent = `读音标注失败：${error.message}`;
  } finally {
    els.speakButton.disabled = false;
  }
}

async function downloadLocalAi() {
  if (state.aiMode !== "local") {
    els.localAiStatus.textContent = "请先把 AI 模式切换为“本机 Ollama”。";
    return;
  }

  els.downloadLocalAiButton.disabled = true;
  const info = getLocalAiInfo(state.ollamaModel);
  els.localAiStatus.textContent = `准备连接：${info.modelId}（${info.runtime}）`;
  try {
    const localInfo = await loadLocalAi(state.ollamaModel, (message) => {
      els.localAiStatus.textContent = message;
    });
    renderOllamaModelOptions(localInfo);
    state.ollamaModel = localInfo.model || state.ollamaModel;
    state.aiMode = "local";
    await saveState();
    renderSettings();
    els.localAiStatus.textContent = `已连接本机 Ollama：${state.ollamaModel}`;
  } catch (error) {
    els.localAiStatus.textContent = `本机 Ollama 连接失败：${error.message}`;
  } finally {
    els.downloadLocalAiButton.disabled = false;
  }
}

function renderOllamaModelOptions(info) {
  const models = Array.isArray(info?.models) ? info.models : [];
  const selected = state.ollamaModel || info?.model || "";
  els.ollamaModelSelect.innerHTML = [
    `<option value="">自动选择</option>`,
    ...models.map((item) => {
      const name = item.name || "";
      const sizeGb = item.size ? ` · ${(item.size / 1024 / 1024 / 1024).toFixed(1)}GB` : "";
      return `<option value="${escapeHtml(name)}">${escapeHtml(name)}${sizeGb}</option>`;
    }),
  ].join("");
  els.ollamaModelSelect.value = models.some((item) => item.name === selected) ? selected : "";
}

async function refreshOllamaModels() {
  try {
    const response = await fetch("/api/local/status");
    const info = await response.json().catch(() => ({}));
    if (!response.ok || !info.ok) {
      throw new Error(info?.error || "没有连上本机 Ollama");
    }
    renderOllamaModelOptions(info);
    const hasSavedModel = (info.models || []).some((item) => item.name === state.ollamaModel);
    if (state.ollamaModel && !hasSavedModel) {
      state.ollamaModel = "";
      await saveState();
      renderSettings();
    } else if (!state.ollamaModel && info.model) {
      state.ollamaModel = info.model;
      await saveState();
      renderSettings();
    }
    els.localAiStatus.textContent = `已发现 ${info.models?.length || 0} 个 Ollama 模型，可按需选择。`;
  } catch (error) {
    els.localAiStatus.textContent = `未连接 Ollama：${error.message}`;
  }
}

function exportDeck() {
  const payload = {
    exportedAt: nowIso(),
    words: state.words,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "word-booster-deck.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importDeck(file) {
  const content = await file.text();
  const parsed = JSON.parse(content);
  const words = Array.isArray(parsed) ? parsed : parsed.words;
  if (!Array.isArray(words)) {
    throw new Error("文件格式不对");
  }
  const merged = words
    .filter((item) => item?.word)
    .map((item) => ({
      ...createWordEntry(normalizeWord(item.word)),
      ...item,
      word: normalizeWord(item.word),
      id: item.id || uid(),
    }));

  const existingByWord = new Map(state.words.map((item) => [item.word, item]));
  for (const imported of merged) {
    const existing = existingByWord.get(imported.word);
    if (existing) {
      Object.assign(existing, imported, { id: existing.id });
    }
  }
  await mergeWords(merged.filter((item) => !existingByWord.has(item.word)));
  render();
  await saveState();
  els.ocrStatus.textContent = `导入完成，共载入 ${merged.length} 个单词。`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }

  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

async function cleanupDevCaches() {
  const isLocalhost =
    window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (!isLocalhost) {
    return;
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister())).catch(
      () => []
    );
  }

  if ("caches" in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map((key) => caches.delete(key))).catch(() => []);
  }
}

els.imageInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    setPreviewFile(null);
    return;
  }
  setPreviewFile(file);
  els.ocrStatus.textContent = `已选择图片：${file.name}`;
});

els.scanButton.addEventListener("click", () => void runOcr());
els.ocrLanguageSelect.addEventListener("change", async (event) => {
  state.ocrLanguage = event.target.value;
  await saveState();
});
els.aiModeSelect.addEventListener("change", async (event) => {
  state.aiMode = event.target.value;
  await saveState();
  renderSettings();
  els.localAiStatus.textContent =
    state.aiMode === "local"
      ? "已切换到本机 Ollama。使用前请确保 Ollama 正在运行。"
      : "已切换到云端模型。Ollama 模型选择已停用。";
});
els.ollamaModelSelect.addEventListener("change", async (event) => {
  state.ollamaModel = event.target.value;
  await saveState();
  els.localAiStatus.textContent = state.ollamaModel
    ? `已选择 Ollama 模型：${state.ollamaModel}`
    : "已切换为自动选择 Ollama 模型。";
});
els.downloadLocalAiButton.addEventListener("click", () => void downloadLocalAi());
els.mergeWordsButton.addEventListener("click", async () => {
  const words = extractWords(els.manualWords.value);
  await mergeWords(words);
  els.manualWords.value = "";
  els.ocrStatus.textContent = words.length
    ? `已从手动输入中加入 ${words.length} 个单词。`
    : "没有检测到可加入的英文单词。";
});
els.cleanWordsButton.addEventListener("click", async () => {
  const removedCount = await cleanNoisyWords();
  els.ocrStatus.textContent = removedCount
    ? `已清理 ${removedCount} 个识别噪音。`
    : "当前词库看起来已经很干净。";
});
els.clearWordsButton.addEventListener("click", async () => {
  state.words = [];
  state.currentWordId = "";
  state.flipped = false;
  selectedImageFile = null;
  revokePreviewUrl();
  els.imageInput.value = "";
  await saveState();
  render();
  els.ocrStatus.textContent = "词库已清空。";
});
els.flashcard.addEventListener("click", () => {
  if (!getCurrentWord()) {
    return;
  }
  state.flipped = !state.flipped;
  renderCard();
});
els.shuffleButton.addEventListener("click", () => {
  const nextWord = randomVisibleWord();
  if (nextWord) {
    void setCurrentWord(nextWord.id);
  }
});
els.knownButton.addEventListener("click", () => void markWord(true));
els.unknownButton.addEventListener("click", () => void markWord(false));
els.showAllButton.addEventListener("click", async () => {
  state.filter = "all";
  render();
  await saveState();
});
els.showReviewButton.addEventListener("click", async () => {
  state.filter = "review";
  render();
  await saveState();
});
els.showKnownButton.addEventListener("click", async () => {
  state.filter = "known";
  render();
  await saveState();
});
els.speakButton.addEventListener("click", () => void markCurrentReading());
els.generateSentenceButton.addEventListener("click", () => void generateSentence());
els.searchInput.addEventListener("input", async (event) => {
  state.search = event.target.value.trim().toLowerCase();
  render();
  await saveState();
});
els.exportButton.addEventListener("click", exportDeck);
els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    await importDeck(file);
  } catch (error) {
    els.ocrStatus.textContent = `导入失败：${error.message}`;
  }
});

async function init() {
  await cleanupDevCaches();
  const savedState = await loadAppState();
  mergeState(savedState);
  render();
  void refreshOllamaModels();
  registerServiceWorker();
}

window.addEventListener("beforeunload", revokePreviewUrl);

init();
