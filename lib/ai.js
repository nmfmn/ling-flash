// 灵闪单词 — AI Translation Client

const AI = {
  async getConfig() {
    const apiKey = await Storage.getSetting('api_key');
    const baseUrl = await Storage.getSetting('api_url') || 'https://api.openai.com/v1';
    const model = await Storage.getSetting('model') || 'gpt-4o-mini';
    return { apiKey, baseUrl, model };
  },

  async chat(messages, options = {}) {
    const { apiKey, baseUrl, model } = await this.getConfig();
    if (!apiKey) throw new Error('请先在设置中配置 API Key');

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: options.model || model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens || 1024
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI API 错误 (${res.status}): ${err}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  },

  // Look up a word: translation + phonetic + example
  async lookupWord(word) {
    const prompt = `查询英语单词或短语：「${word}」

严格用 JSON 格式输出，只输出 JSON，不要其他文字：
{
  "word": "${word}",
  "translation": "中文释义（多个义项用;分隔）",
  "phonetic": "音标",
  "example": "一个地道的英文例句",
  "exampleTranslation": "例句中文翻译"
}

注意：
- 如果输入是短语（多个词），按短语处理
- 例句尽量来自真实语境（新闻、学术、日常）
- 音标用国际音标`;

    const result = await this.chat([
      { role: 'system', content: '你是一个英语词典助手。只输出 JSON。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.1 });

    try {
      const match = result.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  },

  // Translate a sentence in context
  async translateSentence(sentence, targetWord) {
    const prompt = `翻译以下英文句子为中文，重点翻译「${targetWord}」在句中的含义：

"${sentence}"

输出格式（只输出 JSON）：
{
  "translation": "完整句子的中文翻译",
  "wordUsage": "「${targetWord}」在本句中的具体含义和用法（一句话）"
}`;

    const result = await this.chat([
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.1 });

    try {
      const match = result.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }
};
