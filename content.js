// 灵闪单词 — Content Script
// Initializes highlighter + right-click to add words

(async function() {
  // Load vocabulary and init highlighter
  async function loadAndInit() {
    const words = await chrome.runtime.sendMessage({ action: 'getMatchWords' });
    if (words && words.length > 0) {
      Highlighter.init(words);
    }
  }

  await loadAndInit();

  // Listen for vocab updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'vocabUpdated') {
      loadAndInit();
    }
  });

  // Double-click to quick-add a word
  document.addEventListener('dblclick', async (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text || text.length < 2 || text.length > 50) return;
    // Skip if it's mostly Chinese
    if (/[\u4e00-\u9fff]/.test(text)) return;

    // Show mini floating button near selection
    showAddButton(selection, text);
  });

  function showAddButton(selection, word) {
    // Remove existing button
    const existing = document.getElementById('flash-add-btn');
    if (existing) existing.remove();

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

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
      btn.innerHTML = '⏳';
      try {
        const result = await chrome.runtime.sendMessage({
          action: 'addWord',
          word: word
        });
        if (result.error) throw new Error(result.error);
        btn.innerHTML = '✅';
        btn.style.background = '#4ade80';
        // Refresh highlights
        loadAndInit();
      } catch (err) {
        btn.innerHTML = '❌';
      }
      setTimeout(() => btn.remove(), 1500);
    });

    document.body.appendChild(btn);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (btn.parentElement) btn.remove();
    }, 4000);

    // Remove on click elsewhere
    setTimeout(() => {
      document.addEventListener('click', function handler() {
        if (btn.parentElement) btn.remove();
        document.removeEventListener('click', handler);
      }, { once: true });
    }, 100);
  }
})();
