// 灵闪单词 — Background Service Worker
importScripts('lib/storage.js', 'lib/ai.js');

// Handle messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(e => sendResponse({ error: e.message }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.action) {
    case 'addWord':
      return addWord(msg.word);
    case 'getMatchWords':
      return Storage.getMatchWords();
    case 'getAllWords':
      return Storage.getAllWords(msg.options || {});
    case 'deleteWord':
      await Storage.deleteWord(msg.id);
      notifyContentScripts();
      return { ok: true };
    case 'masterWord':
      await Storage.updateWord(msg.id, { mastered: true });
      notifyContentScripts();
      return { ok: true };
    case 'markSeen':
      return Storage.markSeen(msg.id);
    case 'translateSentence':
      return AI.translateSentence(msg.sentence, msg.targetWord);
    case 'getSetting':
      return Storage.getSetting(msg.key);
    case 'setSetting':
      await Storage.setSetting(msg.key, msg.value);
      return { ok: true };
    case 'getDailyWords':
      return getDailyWords();
    case 'getStats':
      return getStats();
    default:
      return { error: 'Unknown action: ' + msg.action };
  }
}

// Add a word: lookup via AI, then save
async function addWord(word) {
  // Check if already exists
  const existing = await Storage.findByWord(word.toLowerCase());
  if (existing) return { id: existing.id, alreadyExists: true, message: '该词已在词汇表中' };

  // AI lookup
  const info = await AI.lookupWord(word);

  const id = await Storage.addWord({
    word: word.toLowerCase().trim(),
    type: word.includes(' ') ? 'phrase' : 'word',
    translation: info ? info.translation : '',
    phonetic: info ? info.phonetic : '',
    example: info ? info.example : '',
    exampleTranslation: info ? info.exampleTranslation : '',
    source: 'manual'
  });

  notifyContentScripts();
  return { id, saved: true, info };
}

// Notify all tabs to refresh highlights
async function notifyContentScripts() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, { action: 'vocabUpdated' });
    } catch (e) {}
  }
}

// Get daily 10 words from built-in list
async function getDailyWords() {
  try {
    const res = await fetch(chrome.runtime.getURL('data/daily-words.json'));
    const allWords = await res.json();

    // Use date as seed for consistent daily selection
    const today = new Date().toISOString().slice(0, 10);
    const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
    const startIdx = (seed * 7) % (allWords.length - 10);

    const daily = allWords.slice(startIdx, startIdx + 10);

    // Check which ones are already in vocab
    for (const w of daily) {
      const existing = await Storage.findByWord(w.word.toLowerCase());
      w.inVocab = !!existing;
    }

    return daily;
  } catch (e) {
    return [];
  }
}

// Get stats
async function getStats() {
  const all = await Storage.getAllWords({});
  const mastered = all.filter(w => w.mastered).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayWords = all.filter(w => w.addedAt >= today.getTime());
  return {
    total: all.length,
    mastered,
    learning: all.length - mastered,
    addedToday: todayWords.length
  };
}

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'flash-add-word',
    title: '⚡ 添加「%s」到灵闪单词',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'flash-add-word' && info.selectionText) {
    const word = info.selectionText.trim();
    if (word.length >= 2 && word.length <= 50) {
      const result = await addWord(word);
      // Show notification on the tab
      chrome.tabs.sendMessage(tab.id, { action: 'vocabUpdated' });
    }
  }
});

// Open side panel on icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
