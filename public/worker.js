// Use @xenova/transformers v2 — the stable, browser-native version.
// Note: @huggingface/transformers (v4) has breaking API differences and
// does NOT exist at v3.x. @xenova/transformers@2 is the proven browser build.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Serve ONNX wasm from the Xenova CDN, disable local model lookup
env.allowLocalModels = false;
env.useBrowserCache = true;

// Lazy singleton — model only downloads on first classify call
let classifier = null;

async function getClassifier(onProgress) {
  if (classifier) return classifier;

  // Xenova/roberta-base-openai-detector is the public HuggingFace repo with
  // prebuilt ONNX files: LABEL_0 = Real/Human, LABEL_1 = AI/Fake
  classifier = await pipeline(
    'text-classification',
    'Xenova/roberta-base-openai-detector',
    { progress_callback: onProgress }
  );

  return classifier;
}

self.addEventListener('message', async (event) => {
  const { type, sentences } = event.data;

  if (type === 'ping') {
    self.postMessage({ type: 'pong' });
    return;
  }

  if (type === 'classify') {
    try {
      // ── 1. Load / download model ──────────────────────────────────────────
      self.postMessage({ type: 'status', message: 'Downloading model (first run only)...' });

      const cls = await getClassifier((prog) => {
        // prog: { status, name, file, progress, loaded, total }
        const pct = prog.progress != null ? Math.round(prog.progress) : null;
        self.postMessage({ type: 'download_progress', file: prog.file, percent: pct });
      });

      // ── 2. Classify each sentence ─────────────────────────────────────────
      const valid = (sentences || [])
        .map(s => (s || '').trim())
        .filter(s => s.length > 0);

      if (valid.length === 0) {
        self.postMessage({ type: 'complete', results: [] });
        return;
      }

      self.postMessage({ type: 'status', message: 'Scanning sentences...' });

      const results = [];
      for (let i = 0; i < valid.length; i++) {
        const text = valid[i];
        // RoBERTa max token limit ~512. Truncate by chars as a safety net.
        const safe = text.length > 800 ? text.slice(0, 800) : text;

        let out;
        try {
          out = await cls(safe, { topk: 1 });
        } catch (e) {
          // Per-sentence fallback — don't abort the whole run
          out = [{ label: 'LABEL_0', score: 0.5 }];
        }

        // Normalize label — model returns LABEL_0 (Real) or LABEL_1 (AI/Fake)
        const top = (out && out[0]) ? out[0] : { label: 'LABEL_0', score: 0.5 };
        const isAI = top.label === 'LABEL_1';
        const aiPct = Math.min(99, Math.max(1, Math.round((isAI ? top.score : 1 - top.score) * 100)));

        results.push({
          text: valid[i],
          aiScore: aiPct,
          label: aiPct >= 65 ? 'AI' : aiPct <= 35 ? 'Human' : 'Uncertain',
        });

        self.postMessage({
          type: 'progress',
          current: i + 1,
          total: valid.length,
          percent: Math.round(((i + 1) / valid.length) * 100),
        });
      }

      self.postMessage({ type: 'complete', results });

    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      self.postMessage({ type: 'error', error: msg });
    }
  }
});
