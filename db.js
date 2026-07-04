const DB_NAME = "word-booster-db";
const DB_VERSION = 1;
const STATE_STORE = "state";
const REVIEW_STORE = "reviews";
const STATE_KEY = "app-state";
const LOCAL_FALLBACK_KEY = "word-booster-local-fallback";

function toPersistedState(state) {
  return {
    ...state,
    imageDataUrl: "",
  };
}

function openDb() {
  if (!("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }
      if (!db.objectStoreNames.contains(REVIEW_STORE)) {
        const store = db.createObjectStore(REVIEW_STORE, { keyPath: "id" });
        store.createIndex("reviewedAt", "reviewedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDb();
  if (!db) {
    return null;
  }
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAppState() {
  const indexedResult = await withStore(STATE_STORE, "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }).catch(() => null);

  if (indexedResult) {
    return {
      ...indexedResult,
      imageDataUrl: "",
    };
  }

  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) {
      return null;
    }
    return {
      ...JSON.parse(raw),
      imageDataUrl: "",
    };
  } catch {
    localStorage.removeItem(LOCAL_FALLBACK_KEY);
    return null;
  }
}

export async function persistAppState(state) {
  const persistedState = toPersistedState(state);
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(persistedState));
  } catch {
    localStorage.removeItem(LOCAL_FALLBACK_KEY);
  }
  await withStore(STATE_STORE, "readwrite", (store) => {
    store.put(persistedState, STATE_KEY);
  }).catch(() => null);
}

export async function recordReview(review) {
  const payload = {
    ...review,
    id: `${review.word}-${review.reviewedAt}`,
  };
  await withStore(REVIEW_STORE, "readwrite", (store) => {
    store.put(payload);
  }).catch(() => null);
}

export async function getReviewStats() {
  const fallback = { streakDays: 0 };
  const reviews = await withStore(REVIEW_STORE, "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }).catch(() => null);

  if (!reviews?.length) {
    return fallback;
  }

  const uniqueDays = [...new Set(reviews.map((item) => item.reviewedAt.slice(0, 10)))].sort().reverse();
  let streakDays = 0;
  let cursorDate = new Date();

  for (const day of uniqueDays) {
    const cursorKey = cursorDate.toISOString().slice(0, 10);
    if (day === cursorKey) {
      streakDays += 1;
      cursorDate.setDate(cursorDate.getDate() - 1);
      continue;
    }
    if (streakDays === 0) {
      cursorDate.setDate(cursorDate.getDate() - 1);
      if (day === cursorDate.toISOString().slice(0, 10)) {
        streakDays += 1;
        cursorDate.setDate(cursorDate.getDate() - 1);
        continue;
      }
    }
    break;
  }

  return { streakDays };
}
