/**
 * AuraDetect Neural Worker
 * 
 * Uses the HuggingFace FREE Inference API — no token required for public models.
 * Model: openai-community/roberta-base-openai-detector (the original OpenAI model)
 * Labels: "Real" = Human-written, "Fake" = AI-generated
 * 
 * No ONNX download. No local model. Sentences are sent to HF servers.
 * Rate limit: ~30k chars/month without token, unlimited with a free HF token.
 */

const HF_API_URL =
  'https://api-inference.huggingface.co/models/openai-community/roberta-base-openai-detector';

// Retry with exponential backoff (handles model cold-start 503)
async function callHF(text, token, attempt = 0) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: text }),
  });

  if (res.status === 503) {
    // Model is warming up — HF returns estimated_time
    const body = await res.json().catch(() => ({}));
    const wait = Math.min((body.estimated_time || 10) * 1000, 20000);
    self.postMessage({ type: 'status', message: `Model warming up, retrying in ${Math.round(wait / 1000)}s…` });
    await new Promise(r => setTimeout(r, wait));
    if (attempt < 3) return callHF(text, token, attempt + 1);
    throw new Error('Model did not respond after 3 retries. Try again in a minute.');
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('Token rejected. Check your HuggingFace token and try again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

self.addEventListener('message', async (event) => {
  const { type, sentences, token } = event.data;

  if (type === 'ping') {
    self.postMessage({ type: 'pong' });
    return;
  }

  if (type === 'classify') {
    try {
      const valid = (sentences || [])
        .map(s => (s || '').trim())
        .filter(s => s.length > 2); // skip tiny fragments

      if (valid.length === 0) {
        self.postMessage({ type: 'complete', results: [] });
        return;
      }

      self.postMessage({ type: 'status', message: 'Connecting to model…' });

      const results = [];

      for (let i = 0; i < valid.length; i++) {
        const text = valid[i];
        // RoBERTa max 512 tokens — cap at 500 chars safely
        const safe = text.length > 500 ? text.slice(0, 500) : text;

        let aiPercent = 50; // neutral default on per-sentence failure

        try {
          const raw = await callHF(safe, token || null);

          /**
           * HF response format for text-classification:
           *   [[{ label: "Real", score: 0.97 }, { label: "Fake", score: 0.03 }]]
           * OR (batch=1):
           *   [{ label: "Real", score: 0.97 }, { label: "Fake", score: 0.03 }]
           */
          const topLevel = Array.isArray(raw) ? raw : [];
          const preds = Array.isArray(topLevel[0]) ? topLevel[0] : topLevel;

          const fakeEntry = preds.find(p =>
            String(p.label).toLowerCase() === 'fake'
          );
          const realEntry = preds.find(p =>
            String(p.label).toLowerCase() === 'real'
          );

          if (fakeEntry) {
            aiPercent = Math.min(99, Math.max(1, Math.round(fakeEntry.score * 100)));
          } else if (realEntry) {
            aiPercent = Math.min(99, Math.max(1, Math.round((1 - realEntry.score) * 100)));
          }
        } catch (sentenceErr) {
          // Per-sentence failure: log and continue with neutral score
          console.warn(`Sentence ${i + 1} failed:`, sentenceErr);
          aiPercent = 50;
        }

        results.push({
          text: valid[i],
          aiScore: aiPercent,
          label: aiPercent >= 65 ? 'AI' : aiPercent <= 35 ? 'Human' : 'Uncertain',
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
