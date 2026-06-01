// 灵闪单词 — DOM Highlighter Engine

const Highlighter = {
  _words: [],
  _observer: null,
  _debounceTimer: null,
  _tooltip: null,
  _activeMark: null,
  _rescanTimer: null,

  init(words) {
    this._words = words || [];
    this.clearHighlights();
    this._injectTooltip();
    this.scan();
    this._observe();
    this._periodicRescan();
    console.log('[灵闪 Highlighter] Init with', this._words.length, 'words');
  },

  scan() {
    if (this._words.length === 0) return;
    if (!document.body) return;
    console.log('[灵闪] Scanning for words:', this._words.map(w => w.word).join(', '));

    let matchCount = 0;

    // Scan main document
    matchCount += this._scanRoot(document.body);

    // Scan same-origin iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.body) {
          matchCount += this._scanRoot(doc.body);
        }
      } catch (e) { /* cross-origin, skip */ }
    });

    // Scan shadow DOMs
    this._scanShadowRoots(document.body);

    console.log('[灵闪] Scan complete, found', matchCount, 'matches');
  },

  _scanRoot(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input', 'select', 'code', 'pre'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('.flash-word')) return NodeFilter.FILTER_REJECT;
          if (parent.closest('#flash-tooltip') || parent.closest('#flash-add-btn')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    let count = 0;
    for (const node of textNodes) {
      count += this._processNode(node);
    }
    return count;
  },

  _scanShadowRoots(el) {
    if (el.shadowRoot) {
      this._scanRoot(el.shadowRoot);
      el.shadowRoot.querySelectorAll('*').forEach(child => this._scanShadowRoots(child));
    }
    el.querySelectorAll('*').forEach(child => this._scanShadowRoots(child));
  },

  _processNode(textNode) {
    const text = textNode.textContent;
    if (!text || text.trim().length < 2) return 0;

    const matches = [];
    for (const entry of this._words) {
      if (!entry.word) continue;
      const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = entry.type === 'phrase'
        ? escaped.replace(/\s+/g, '\\s+')
        : escaped;
      try {
        const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            entry: entry
          });
        }
      } catch (e) {}
    }

    if (matches.length === 0) return 0;

    matches.sort((a, b) => a.start - b.start);
    const filtered = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        filtered.push(m);
        lastEnd = m.end;
      }
    }

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of filtered) {
      if (m.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
      }
      const span = document.createElement('span');
      span.className = 'flash-word';
      span.dataset.flashId = m.entry.id;
      span.dataset.flashWord = m.entry.word;
      span.dataset.flashTranslation = m.entry.translation || '';
      span.textContent = m.text;
      frag.appendChild(span);
      cursor = m.end;
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }

    if (cursor > 0 && textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
      return filtered.length;
    }
    return 0;
  },

  _injectTooltip() {
    if (this._tooltip) return;
    if (!document.body) return;

    const tip = document.createElement('div');
    tip.id = 'flash-tooltip';
    tip.innerHTML = `
      <div class="flash-tip-word"></div>
      <div class="flash-tip-translation"></div>
      <div class="flash-tip-sentence"></div>
      <div class="flash-tip-loading">翻译中...</div>
      <div class="flash-tip-actions">
        <button class="flash-tip-btn" data-action="master">✓ 掌握</button>
        <button class="flash-tip-btn" data-action="remove">✕ 移除</button>
      </div>
    `;
    document.body.appendChild(tip);
    this._tooltip = tip;

    document.addEventListener('mouseover', (e) => {
      const mark = e.target.closest('.flash-word');
      if (mark) this._showTooltip(mark);
    });

    document.addEventListener('mouseout', (e) => {
      const mark = e.target.closest('.flash-word');
      if (mark) {
        setTimeout(() => {
          if (!this._tooltip.matches(':hover') && this._activeMark === mark) {
            this._hideTooltip();
          }
        }, 200);
      }
    });

    this._tooltip.addEventListener('mouseleave', () => this._hideTooltip());

    tip.querySelector('[data-action="master"]').addEventListener('click', () => {
      if (this._activeMark) {
        const id = parseInt(this._activeMark.dataset.flashId);
        chrome.runtime.sendMessage({ action: 'masterWord', id });
        document.querySelectorAll(`.flash-word[data-flash-id="${id}"]`).forEach(el => {
          el.replaceWith(document.createTextNode(el.textContent));
        });
        this._hideTooltip();
      }
    });

    tip.querySelector('[data-action="remove"]').addEventListener('click', () => {
      if (this._activeMark) {
        const id = parseInt(this._activeMark.dataset.flashId);
        chrome.runtime.sendMessage({ action: 'deleteWord', id });
        document.querySelectorAll(`.flash-word[data-flash-id="${id}"]`).forEach(el => {
          el.replaceWith(document.createTextNode(el.textContent));
        });
        this._hideTooltip();
      }
    });
  },

  async _showTooltip(mark) {
    this._activeMark = mark;
    const rect = mark.getBoundingClientRect();
    const tip = this._tooltip;

    tip.querySelector('.flash-tip-word').textContent = mark.dataset.flashWord;
    tip.querySelector('.flash-tip-translation').textContent = mark.dataset.flashTranslation || '';
    tip.querySelector('.flash-tip-sentence').textContent = '';
    tip.querySelector('.flash-tip-loading').style.display = 'block';

    tip.style.display = 'block';
    const tipRect = tip.getBoundingClientRect();
    let top = rect.top + window.scrollY - tipRect.height - 8;
    if (top < window.scrollY) top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + (rect.width - tipRect.width) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';

    mark.classList.add('flash-sparkle');

    const id = parseInt(mark.dataset.flashId);
    chrome.runtime.sendMessage({ action: 'markSeen', id });

    try {
      const sentence = this._getSentence(mark);
      if (sentence && sentence.length > 10) {
        const res = await chrome.runtime.sendMessage({
          action: 'translateSentence',
          sentence,
          targetWord: mark.dataset.flashWord
        });
        if (res && res.translation) {
          tip.querySelector('.flash-tip-sentence').textContent =
            '📖 ' + res.translation + (res.wordUsage ? '\n💡 ' + res.wordUsage : '');
        }
      }
    } catch (e) {}

    tip.querySelector('.flash-tip-loading').style.display = 'none';
  },

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = 'none';
    if (this._activeMark) {
      this._activeMark.classList.remove('flash-sparkle');
      this._activeMark = null;
    }
  },

  _getSentence(mark) {
    let parent = mark.parentElement;
    while (parent && !['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'SPAN', 'ARTICLE', 'SECTION'].includes(parent.tagName)) {
      parent = parent.parentElement;
    }
    if (!parent) return mark.textContent;

    const text = parent.textContent;
    const wordText = mark.textContent;
    const idx = text.indexOf(wordText);
    if (idx === -1) return text.slice(0, 200);

    const before = text.slice(0, idx);
    const after = text.slice(idx + wordText.length);
    const sentStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1;
    const sentEndRel = (() => {
      const ends = [after.indexOf('.'), after.indexOf('!'), after.indexOf('?')].filter(i => i >= 0);
      return ends.length > 0 ? Math.min(...ends) + 1 : Math.min(after.length, 200);
    })();
    return (before.slice(sentStart) + wordText + after.slice(0, sentEndRel)).trim().slice(0, 300);
  },

  clearHighlights() {
    document.querySelectorAll('.flash-word').forEach(el => {
      if (el.parentNode) el.replaceWith(document.createTextNode(el.textContent));
    });
  },

  // Watch for DOM changes (child additions AND text content changes)
  _observe() {
    if (this._observer) this._observer.disconnect();
    this._observer = new MutationObserver((mutations) => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        if (this._words.length === 0) return;
        for (const mutation of mutations) {
          // New elements added
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !node.closest('.flash-word') && !node.closest('#flash-tooltip')) {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) this._processNode(walker.currentNode);
            }
          }
          // Text content changed in existing elements
          if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
            const parent = mutation.target.parentElement;
            if (parent && !parent.closest('.flash-word') && !parent.closest('#flash-tooltip')) {
              this._processNode(mutation.target);
            }
          }
        }
      }, 300);
    });
    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,        // watch text content changes
      characterDataOldValue: false
    });
  },

  // Periodic re-scan for SPA pages that load content late
  _periodicRescan() {
    if (this._rescanTimer) clearInterval(this._rescanTimer);
    let count = 0;
    this._rescanTimer = setInterval(() => {
      count++;
      if (count > 15 || this._words.length === 0) { // stop after 30 seconds
        clearInterval(this._rescanTimer);
        return;
      }
      // Only rescan if there are un-highlighted words on the page
      const pageText = document.body ? document.body.innerText : '';
      const hasUnmatched = this._words.some(w => {
        try {
          return new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(pageText);
        } catch { return false; }
      });
      if (hasUnmatched) {
        // Check if there are still un-highlighted instances
        const remaining = this._words.some(w => {
          try {
            const regex = new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            const text = document.body.innerText;
            return regex.test(text);
          } catch { return false; }
        });
        if (remaining) {
          console.log('[灵闪] Re-scan #' + count);
          this.scan();
        }
      }
    }, 2000);
  },

  destroy() {
    if (this._observer) this._observer.disconnect();
    if (this._rescanTimer) clearInterval(this._rescanTimer);
    this.clearHighlights();
    if (this._tooltip) this._tooltip.remove();
  }
};
