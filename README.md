# 灵闪单词 ⚡

> 背单词新方式 — 每日外刊高频词 + 网页高亮闪卡

告别枯燥的单词本，在真实语境中学习英语。灵闪单词会在你浏览的网页上自动高亮你学过的词汇，并用星星动画提醒你，鼠标悬停即可查看翻译和句子释义。

## ✨ 功能

- **📅 每日 10 词** — 内置 150+ 外刊高频词汇，每天推送 10 个新词
- **⚡ 一键收录** — 双击网页上任意英文单词，或右键菜单，快速添加到词汇表
- **🔍 网页高亮** — 浏览网页时自动高亮词汇表中的单词，蓝色下划线一目了然
- **✦ 星星动画** — 鼠标悬停在高亮词上，触发星星闪烁动画，加深记忆
- **📖 句子翻译** — 悬停查看该词所在句子的完整翻译和用法说明
- **📝 短语支持** — 不仅是单词，常用短语也能收录和高亮
- **📋 词汇管理** — 侧边栏管理所有词汇，标记掌握、删除、搜索
- **📤 导出词汇** — 一键导出词汇表为 JSON 文件

## 🛠️ 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript（无框架依赖）
- IndexedDB 本地存储
- TreeWalker + MutationObserver 高效 DOM 扫描
- OpenAI 兼容 API（单词查询 + 句子翻译）

## 📦 安装

1. 克隆本仓库
   ```bash
   git clone https://github.com/nmfmn/ling-flash.git
   ```

2. 打开 Chrome，访问 `chrome://extensions/`

3. 开启「开发者模式」

4. 点击「加载已解压的扩展程序」，选择 `ling-flash` 目录

5. 在扩展设置中配置你的 OpenAI API Key

## ⚙️ 配置

点击扩展图标打开侧边栏，在设置中配置：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | OpenAI 或兼容 API 的密钥 | — |
| API URL | API 端点地址 | `https://api.openai.com/v1` |
| Model | 使用的模型 | `gpt-4o-mini` |

支持任何 OpenAI 兼容的 API（如 DeepSeek、Ollama、vLLM 等）。

## 📁 项目结构

```
ling-flash/
├── manifest.json          # 扩展配置
├── background.js          # Service Worker（消息处理、AI 调用）
├── content.js             # 内容脚本（双击添加单词）
├── flash.css              # 网页注入样式（高亮、动画、tooltip）
├── popup.html             # 弹出窗口（快捷添加 + 统计）
├── sidepanel.html/js      # 侧边栏界面
├── styles.css             # 侧边栏样式
├── lib/
│   ├── storage.js         # IndexedDB 存储层
│   ├── ai.js              # AI API 客户端
│   └── highlighter.js     # DOM 扫描 + 高亮引擎
├── data/
│   └── daily-words.json   # 内置外刊高频词库（155 词）
└── icons/                 # 扩展图标
```

## 💡 使用方式

1. **每日背诵** — 打开侧边栏「📅 每日」tab，浏览今日 10 个高频词
2. **收录单词** — 在每日词卡中点击「⚡ 收录」，或在网页上双击任意英文单词
3. **网页高亮** — 收录后，浏览任何英文网页，词汇会自动高亮显示
4. **悬停学习** — 鼠标悬停在高亮词上，查看翻译、音标、句子翻译
5. **管理词汇** — 侧边栏「📋 词汇」tab 查看所有词汇，标记已掌握

## 🔒 隐私

- 所有词汇数据存储在浏览器本地 IndexedDB
- 仅在用户主动触发时调用 AI API（单词查询、句子翻译）
- 不收集任何个人信息

## 📄 License

MIT
