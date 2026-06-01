// 灵闪单词 — DOM Highlighter Engine
// Efficiently scans text nodes and highlights vocabulary matches

const Highlighter = {
  _words: [],        // current vocab list
  _wordMap: null,    // Map for fast lookup
  _observer: null,
  _debounceTimer: null,
  _tooltip: null,
  _activeMark: null,

  // Initialize with vocabulary list
  init(words) {
    this._words = words;
    this._buildIndex();
    this._injectTooltip();
    this.scan();
    this._observe();
  },

  // Build first-letter index for fast matching
  _buildIndex() {
    this._wordMap = new Map();
    for (const entry of this._words) {
      const key = entry.word.toLowerCase().charAt(0);
      if (!this._wordMap.has(key)) this._wordMap.set(key, []);
      this._wordMap.get(key).push(entry);
    }
  },

  // Update vocabulary list and re-scan
  update(words) {
    this._words = words;
    this._buildIndex();
    this.clearHighlights();
    this.scan();
  },

  // Scan page for matches
  scan() {
    if (this._words.length === 0) return;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          // Skip scripts, styles, inputs, already-highlighted
          if (['script', 'style', 'noscript', 'textarea', 'input', 'select', 'code', 'pre'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.classList && (parent.classList.contains('flash-word') || parent.closest('.flash-word'))) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('#flash-tooltip') || parent.closest('#flash-popup') || parent.closest('#flash-sidepanel')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      this._processNode(node);
    }
  },

  // Process a single text node
  _processNode(textNode) {
    const text = textNode.textContent;
    if (!text || text.trim().length < 2) return;

    // Build regex from vocabulary words (word boundary matching)
    const matches = [];
    for (const entry of this._words) {
      const word = entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // For phrases, match with flexible whitespace
      const pattern = entry.type === 'phrase'
        ? word.replace(/\s+/g, '\\s+')
        : word;
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
    }

    if (matches.length === 0) return;

    // Sort by position, deduplicate overlaps
    matches.sort((a, b) => a.start - b.start);
    const filtered = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        filtered.push(m);
        lastEnd = m.end;
      }
    }

    // Build replacement nodes
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of filtered) {
      // Text before match
      if (m.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
      }
      // Highlighted match
      const span = document.createElement('span');
      span.className = 'flash-word';
      span.dataset.flashId = m.entry.id;
      span.dataset.flashWord = m.entry.word;
      span.dataset.flashTranslation = m.entry.translation || '';
      span.textContent = m.text;
      frag.appendChild(span);
      cursor = m.end;
    }
    // Remaining text
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }

    // Replace original text node
    if (cursor > 0) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  },

  // Inject tooltip element
  _injectTooltip() {
    if (this._tooltip) return;
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

    // Event: hover on highlighted words
    document.addEventListener('mouseover', (e) => {
      const mark = e.target.closest('.flash-word');
      if (mark) this._showTooltip(mark);
    });

    document.addEventListener('mouseout', (e) => {
      const mark = e.target.closest('.flash-word');
      if (mark) {
        // Delay hide to allow moving to tooltip
        setTimeout(() => {
          if (!this._tooltip.matches(':hover') && this._activeMark === mark) {
            this._hideTooltip();
          }
        }, 200);
      }
    });

    this._tooltip.addEventListener('mouseleave', () => {
      this._hideTooltip();
    });

    // Action buttons
    tip.querySelector('[data-action="master"]').addEventListener('click', () => {
      if (this._activeMark) {
        const id = parseInt(this._activeMark.dataset.flashId);
        chrome.runtime.sendMessage({ action: 'masterWord', id });
        // Remove all highlights for this word
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

  // Show tooltip for a highlighted word
  async _showTooltip(mark) {
    this._activeMark = mark;
    const rect = mark.getBoundingClientRect();
    const tip = this._tooltip;

    tip.querySelector('.flash-tip-word').textContent = mark.dataset.flashWord;
    tip.querySelector('.flash-tip-translation').textContent = mark.dataset.flashTranslation || '';
    tip.querySelector('.flash-tip-sentence').textContent = '';
    tip.querySelector('.flash-tip-loading').style.display = 'block';

    // Position above the word
    tip.style.display = 'block';
    const tipRect = tip.getBoundingClientRect();
    let top = rect.top + window.scrollY - tipRect.height - 8;
    if (top < window.scrollY) top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + (rect.width - tipRect.width) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';

    // Trigger star animation
    mark.classList.add('flash-sparkle');

    // Mark as seen
    const id = parseInt(mark.dataset.flashId);
    chrome.runtime.sendMessage({ action: 'markSeen', id });

    // Translate sentence
    try {
      const sentence = this._getSentence(mark);
      if (sentence) {
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

  // Get the sentence containing the marked word
  _getSentence(mark) {
    // Walk up to find a block-level parent, then get full text
    let parent = mark.parentElement;
    while (parent && !['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'SPAN'].includes(parent.tagName)) {
      parent = parent.parentElement;
    }
    if (!parent) return mark.textContent;

    // Get text content of the parent block
    const text = parent.textContent;
    const wordText = mark.textContent;
    const idx = text.indexOf(wordText);
    if (idx === -1) return text.slice(0, 200);

    // Extract sentence (rough: split by . ! ?)
    const before = text.slice(0, idx);
    const after = text.slice(idx + wordText.length);
    const sentStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1;
    const sentEndRel = (() => {
      const ends = [after.indexOf('.'), after.indexOf('!'), after.indexOf('?')].filter(i => i >= 0);
      return ends.length > 0 ? Math.min(...ends) + 1 : after.length;
    })();
    return (before.slice(sentStart) + wordText + after.slice(0, sentEndRel)).trim().slice(0, 300);
  },

  // Clear all highlights
  clearHighlights() {
    document.querySelectorAll('.flash-word').forEach(el => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
  },

  // Observe DOM changes for dynamic content
  _observe() {
    if (this._observer) this._observer.disconnect();
    this._observer = new MutationObserver((mutations) => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !node.closest('.flash-word') && !node.closest('#flash-tooltip')) {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) this._processNode(walker.currentNode);
            }
          }
        }
      }, 500);
    });
    this._observer.observe(document.body, { childList: true, subtree: true });
  },

  destroy() {
    if (this._observer) this._observer.disconnect();
    this.clearHighlights();
    if (this._tooltip) this._tooltip.remove();
  }
};
