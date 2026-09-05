# AuraDetect ⚡ Open-Source AI Detector & Sentence Highlighter

A high-performance, open-source AI content detector and sentence-level highlighter designed to be hosted **100% free forever on Vercel**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

---

## ✨ Features

- **100% Free Forever**: Zero server compute costs. Inference runs locally in the client browser using [Transformers.js](https://huggingface.co/docs/transformers.js) and ONNX Runtime Web.
- **Sentence-by-Sentence Colored Highlighting**:
  - 🔴 **Likely AI (>65%)**: Highlighted in soft red with confidence pills.
  - 🟡 **Uncertain / Mixed (35%–65%)**: Highlighted in amber.
  - 🟢 **Likely Human (<35%)**: Highlighted in emerald green.
- **Dual Mode**:
  1. **Neural ONNX Model**: Quantized RoBERTa AI detector model loaded into Web Worker for non-blocking UI.
  2. **Instant Statistical Engine**: Real-time Perplexity, Burstiness (sentence length variation), Lexical Diversity (TTR), and AI cliché density analyzer (<5ms).
- **Interactive Inspector**: Filter sentences by category, hover tooltips with individual sentence confidence, and 1-click JSON report export.
- **Completely Private**: Text never leaves the user's browser.

---

## 🚀 One-Click Deployment to Vercel

1. Push this repository to your GitHub account.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Click **Deploy**. No environment variables or API keys required!

---

## 💻 Local Development

```bash
git clone https://github.com/YOUR_USERNAME/ai-detector-highlighter.git
cd ai-detector-highlighter
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 License
MIT License - Free for personal and commercial use.
