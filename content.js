// 灵闪单词 — Content Script
// Initializes highlighter + right-click to add words

(async function() {
  // Load vocabulary and init highlighter
  async function loadAndInit() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getMatchWords' });
      if (chrome.runtime.lastError) {
        console.warn('[灵闪] sendMessage error:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.error) {
        console.warn('[灵闪] getMatchWords error:', response.error);
        return;
      }
      if (response && Array.isArray(response) && response.length > 0) {
        console.log('[灵闪] Loaded', response.length, 'words, scanning page...');
        Highlighter.init(response);
        console.log('[灵闪] Scan complete');
      } else {
        console.log('[灵闪] No words to highlight (empty vocab or all mastered)');
      }
    } catch (e) {
      console.warn('[灵闪] Failed to load words:', e.message);
    }
  }

  await loadAndInit();

  // Listen for vocab updates from background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'vocabUpdated') {
      console.log('[灵闪] Vocab updated, re-scanning...');
      loadAndInit();
      sendResponse({ ok: true });
    }
  });

  // Double-click to quick-add a word
  document.addEventListener('dblclick', async (e) => {
    // Skip if target is inside our UI
    if (e.target.closest('#flash-tooltip') || e.target.closest('#flash-add-btn')) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text || text.length < 2 || text.length > 50) return;
    // Skip if it's mostly Chinese
    if (/[\u4e00-\u9fff]/.test(text)) return;

    showAddButton(selection, text);
  });

  function showAddButton(selection, word) {
    // Remove existing button
    const existing = document.getElementById('flash-add-btn');
    if (existing) existing.remove();

    let rect;
    try {
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    } catch (e) {
      return;
    }

    const btn = document.createElement('div');
    btn.id = 'flash-add-btn';
    btn.innerHTML = '⚡';
    btn.title = '添加到灵闪单词';
    btn.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width / 2 - 14}px;
      top: ${rect.top - 32}px;
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #6c8cff, #a855f7);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483647;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(108,140,255,0.5);
      animation: flash-pop 0.3s ease;
      transition: transform 0.15s;
    `;
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.2)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.innerHTML = '⏳';
      try {
        const result = await chrome.runtime.sendMessage({
          action: 'addWord',
          word: word
        });
        if (result && result.error) throw new Error(result.error);
        btn.innerHTML = '✅';
        btn.style.background = '#4ade80';
        // Refresh highlights
        setTimeout(() => loadAndInit(), 500);
      } catch (err) {
        console.warn('[灵闪] Failed to add word:', err.message);
        btn.innerHTML = '❌';
      }
      setTimeout(() => btn.remove(), 1500);
    });

    document.body.appendChild(btn);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (btn.parentElement) btn.remove();
    }, 5000);

    // Remove on click elsewhere
    const handler = (e) => {
      if (!btn.contains(e.target)) {
        if (btn.parentElement) btn.remove();
        document.removeEventListener('click', handler);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 200);
  }
})();
