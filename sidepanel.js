// 灵闪单词 — Side Panel

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'daily') loadDaily();
    if (tab.dataset.tab === 'vocab') loadVocab();
    if (tab.dataset.tab === 'settings') { loadSettings(); loadFullStats(); }
  });
});

// --- Utility ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// --- Daily Words ---
async function loadDaily() {
  const words = await chrome.runtime.sendMessage({ action: 'getDailyWords' });
  const el = document.getElementById('daily-list');
  const statsEl = document.getElementById('daily-stats');

  if (!words || words.length === 0) {
    el.innerHTML = '<div style="color:var(--text2);padding:16px;">加载中...</div>';
    return;
  }

  const inVocabCount = words.filter(w => w.inVocab).length;
  statsEl.innerHTML = `<span>${words.length} 个词</span> · <span style="color:var(--green)">${inVocabCount} 已收录</span>`;

  el.innerHTML = words.map(w => `
    <div class="daily-card ${w.inVocab ? 'in-vocab' : ''}">
      <div class="daily-word">
        <span class="word">${escapeHtml(w.word)}</span>
        ${w.phonetic ? `<span class="phonetic">${escapeHtml(w.phonetic)}</span>` : ''}
        ${w.inVocab ? '<span class="badge-added">已收录</span>' : ''}
      </div>
      <div class="daily-trans">${escapeHtml(w.translation)}</div>
      <div class="daily-example">"${escapeHtml(w.example)}"
        <div class="daily-example-cn">${escapeHtml(w.exampleTranslation)}</div>
      </div>
      ${!w.inVocab ? `<button class="btn-add-vocab" data-word="${escapeHtml(w.word)}">⚡ 收录</button>` : ''}
    </div>
  `).join('');

  // Add buttons
  el.querySelectorAll('.btn-add-vocab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const word = btn.dataset.word;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'addWord', word });
        if (res.error) throw new Error(res.error);
        btn.textContent = '✅ 已收录';
        btn.classList.add('added');
        toast(`已收录「${word}」`);
      } catch (e) {
        btn.textContent = '失败';
        toast('添加失败: ' + e.message, 'error');
      }
    });
  });
}

// --- Vocabulary Management ---
let vocabList = [];

async function loadVocab(options = {}) {
  vocabList = await chrome.runtime.sendMessage({
    action: 'getAllWords',
    options: { search: options.search || '', limit: 500 }
  });

  const el = document.getElementById('vocab-list');
  const statsEl = document.getElementById('vocab-stats');

  if (!vocabList || vocabList.length === 0) {
    statsEl.textContent = '';
    el.innerHTML = '<div style="color:var(--text2);padding:16px;">词汇表为空。在网页上双击单词，或在每日词卡中收录。</div>';
    return;
  }

  statsEl.textContent = `共 ${vocabList.length} 个词汇`;

  el.innerHTML = vocabList.map(w => {
    const typeIcon = w.type === 'phrase' ? '📝' : '📖';
    const masteredBadge = w.mastered ? '<span class="badge-mastered">已掌握</span>' : '';
    return `
    <div class="vocab-item ${w.mastered ? 'mastered' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="vocab-word">${typeIcon} ${escapeHtml(w.word)} ${masteredBadge}</div>
        <div style="display:flex;gap:4px;">
          ${!w.mastered ? `<button class="btn-icon" data-action="master" data-id="${w.id}" title="标记掌握">✓</button>` : ''}
          <button class="btn-icon" data-action="delete" data-id="${w.id}" title="删除">✕</button>
        </div>
      </div>
      <div class="vocab-trans">${escapeHtml(w.translation || '')}</div>
      ${w.example ? `<div class="vocab-example">"${escapeHtml(w.example)}"</div>` : ''}
      <div class="vocab-meta">
        ${w.phonetic ? `<span>${escapeHtml(w.phonetic)}</span>` : ''}
        <span>见过 ${w.seenCount || 0} 次</span>
        <span>${new Date(w.addedAt).toLocaleDateString()}</span>
      </div>
    </div>
    `;
  }).join('');

  // Actions
  el.querySelectorAll('[data-action="master"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ action: 'masterWord', id: parseInt(btn.dataset.id) });
      toast('已标记为掌握');
      loadVocab(options);
    });
  });

  el.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ action: 'deleteWord', id: parseInt(btn.dataset.id) });
      toast('已删除');
      loadVocab(options);
    });
  });
}

// Vocab search
let vocabSearchTimer = null;
document.getElementById('vocab-search').addEventListener('input', (e) => {
  clearTimeout(vocabSearchTimer);
  vocabSearchTimer = setTimeout(() => {
    loadVocab({ search: e.target.value.trim() });
  }, 300);
});

// Manual add dialog
document.getElementById('add-manual-btn').addEventListener('click', () => {
  document.getElementById('add-dialog').classList.remove('hidden');
  document.getElementById('dialog-word').value = '';
  document.getElementById('dialog-translation').value = '';
  document.getElementById('dialog-word').focus();
});

document.getElementById('dialog-cancel').addEventListener('click', () => {
  document.getElementById('add-dialog').classList.add('hidden');
});

document.getElementById('dialog-confirm').addEventListener('click', async () => {
  const word = document.getElementById('dialog-word').value.trim();
  if (!word) return;
  const translation = document.getElementById('dialog-translation').value.trim();

  const btn = document.getElementById('dialog-confirm');
  btn.disabled = true;
  btn.textContent = '添加中...';

  try {
    const res = await chrome.runtime.sendMessage({ action: 'addWord', word });
    if (res.error) throw new Error(res.error);
    // Override translation if user provided one
    if (translation && res.id) {
      await chrome.runtime.sendMessage({ action: 'setSetting', key: 'temp', value: '' });
    }
    document.getElementById('add-dialog').classList.add('hidden');
    toast(`已收录「${word}」`);
    loadVocab();
  } catch (e) {
    toast('添加失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '添加';
  }
});

// Export vocab
document.getElementById('export-vocab-btn').addEventListener('click', async () => {
  const words = await chrome.runtime.sendMessage({ action: 'getAllWords', options: { limit: 9999 } });
  if (!words || words.length === 0) return toast('词汇表为空', 'error');

  const data = JSON.stringify(words, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lingflash-vocab.json';
  a.click();
  URL.revokeObjectURL(url);
  toast(`已导出 ${words.length} 个词汇`);
});

// --- Settings ---
async function loadSettings() {
  const apiKey = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'api_key' });
  const apiUrl = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'api_url' });
  const model = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'model' });
  if (apiKey) document.getElementById('setting-apikey').value = apiKey;
  if (apiUrl) document.getElementById('setting-apiurl').value = apiUrl;
  if (model) document.getElementById('setting-model').value = model;
}

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('setting-apikey').value.trim();
  const apiUrl = document.getElementById('setting-apiurl').value.trim();
  const model = document.getElementById('setting-model').value.trim();
  if (apiKey) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'api_key', value: apiKey });
  if (apiUrl) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'api_url', value: apiUrl });
  if (model) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'model', value: model });
  toast('设置已保存');
});

document.getElementById('test-api-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test-api-btn');
  btn.disabled = true;
  btn.textContent = '测试中...';
  try {
    const res = await chrome.runtime.sendMessage({ action: 'addWord', word: 'test' });
    if (res.error) throw new Error(res.error);
    toast('✅ API 连接正常');
    // Clean up test word
    if (res.id) await chrome.runtime.sendMessage({ action: 'deleteWord', id: res.id });
  } catch (e) {
    toast('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 测试连接';
  }
});

document.getElementById('clear-data-btn').addEventListener('click', async () => {
  if (!confirm('确定要清除所有词汇数据？此操作不可恢复。')) return;
  // Clear IndexedDB
  const req = indexedDB.deleteDatabase('lingflash');
  req.onsuccess = () => { toast('数据已清除'); loadVocab(); };
  req.onerror = () => toast('清除失败', 'error');
});

async function loadFullStats() {
  const res = await chrome.runtime.sendMessage({ action: 'getStats' });
  if (res) {
    document.getElementById('full-stats').innerHTML =
      `总词汇: ${res.total} · 学习中: ${res.learning} · 已掌握: ${res.mastered} · 今日新增: ${res.addedToday}`;
  }
}

// Init
loadDaily();
