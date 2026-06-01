// 灵闪单词 — Popup Script

async function loadStats() {
  const res = await chrome.runtime.sendMessage({ action: 'getStats' });
  if (res) {
    document.getElementById('stat-total').textContent = res.total;
    document.getElementById('stat-learning').textContent = res.learning;
    document.getElementById('stat-today').textContent = res.addedToday;
  }
}
loadStats();

document.getElementById('add-btn').addEventListener('click', addWord);
document.getElementById('word-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addWord();
});

async function addWord() {
  const input = document.getElementById('word-input');
  const word = input.value.trim();
  if (!word) return;

  const btn = document.getElementById('add-btn');
  btn.disabled = true;
  btn.textContent = '...';
  hideMsgs();

  try {
    const res = await chrome.runtime.sendMessage({ action: 'addWord', word });
    if (res.error) throw new Error(res.error);

    if (res.alreadyExists) {
      showMsg('msg-ok', '该词已在词汇表中 ✓');
    } else {
      showMsg('msg-ok', '已添加 ✓');
    }

    if (res.info) {
      const r = document.getElementById('result');
      r.classList.add('show');
      document.getElementById('r-word').textContent = res.info.word + (res.info.phonetic ? '  ' + res.info.phonetic : '');
      document.getElementById('r-trans').textContent = res.info.translation;
      document.getElementById('r-example').textContent = res.info.example
        ? `"${res.info.example}" — ${res.info.exampleTranslation}`
        : '';
    }

    input.value = '';
    loadStats();
  } catch (e) {
    showMsg('msg-err', '失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '添加';
  }
}

function showMsg(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.add('show');
}

function hideMsgs() {
  document.querySelectorAll('.msg').forEach(m => m.classList.remove('show'));
}

document.getElementById('open-panel').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });
});

document.getElementById('open-vocab').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });
});
