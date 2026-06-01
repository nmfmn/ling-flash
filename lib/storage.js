// 灵闪单词 — IndexedDB Storage
const DB_NAME = 'lingflash';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('vocab')) {
        const vocab = db.createObjectStore('vocab', { keyPath: 'id', autoIncrement: true });
        vocab.createIndex('word', 'word', { unique: false });
        vocab.createIndex('type', 'type', { unique: false });
        vocab.createIndex('addedAt', 'addedAt', { unique: false });
        vocab.createIndex('mastered', 'mastered', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

const Storage = {
  // --- Vocabulary ---
  async addWord(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readwrite');
      const store = tx.objectStore('vocab');
      const req = store.add({
        ...entry,
        addedAt: entry.addedAt || Date.now(),
        lastSeen: null,
        seenCount: 0,
        mastered: false
      });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async updateWord(id, updates) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readwrite');
      const store = tx.objectStore('vocab');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return reject(new Error('Word not found'));
        Object.assign(record, updates);
        store.put(record).onsuccess = () => resolve(record);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  },

  async getWord(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readonly');
      const req = tx.objectStore('vocab').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getAllWords(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readonly');
      const store = tx.objectStore('vocab');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result;
        if (options.type) results = results.filter(w => w.type === options.type);
        if (options.mastered !== undefined) results = results.filter(w => w.mastered === options.mastered);
        if (options.search) {
          const q = options.search.toLowerCase();
          results = results.filter(w =>
            w.word.toLowerCase().includes(q) ||
            (w.translation && w.translation.toLowerCase().includes(q))
          );
        }
        results.sort((a, b) => b.addedAt - a.addedAt);
        if (options.limit) results = results.slice(0, options.limit);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async findByWord(word) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readonly');
      const store = tx.objectStore('vocab');
      const idx = store.index('word');
      const req = idx.getAll(word.toLowerCase());
      req.onsuccess = () => resolve(req.result.length > 0 ? req.result[0] : null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async deleteWord(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readwrite');
      const req = tx.objectStore('vocab').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async markSeen(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readwrite');
      const store = tx.objectStore('vocab');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return resolve();
        record.lastSeen = Date.now();
        record.seenCount = (record.seenCount || 0) + 1;
        store.put(record).onsuccess = () => resolve(record);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  },

  async getMatchWords() {
    // Get all non-mastered words for page matching (lightweight)
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vocab', 'readonly');
      const store = tx.objectStore('vocab');
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result
          .filter(w => !w.mastered)
          .map(w => ({ id: w.id, word: w.word, type: w.type, translation: w.translation }));
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // --- Settings ---
  async getSetting(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async setSetting(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
};
