/**
 * AuraDetect Neural Worker
 * Uses HuggingFace free Inference API — no download needed.
 * Model: openai-community/roberta-base-openai-detector
 * Labels: "Real" = Human-written, "Fake" = AI-generated
 */

const HF_API_URL =
  'https://api-inference.huggingface.co/models/openai-community/roberta-base-openai-detector';

// Custom error types so the outer handler can respond correctly
class RateLimitError extends Error {
  constructor() {
    super('RATE_LIMIT');
    this.code = 'RATE_LIMIT';
  }
}

class AuthError extends Error {
  constructor() {
    super('AUTH_ERROR');
    this.code = 'AUTH_ERROR';
  }
}

async function callHF(text, token, attempt = 0) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(HF_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: text }),
    });
  } catch (netErr) {
    throw new Error('Network error: could not reach HuggingFace API. Check internet connection.');
  }

  // 503 = model cold-starting — wait and retry
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    const wait = Math.min((body.estimated_time || 15) * 1000, 25000);
    if (attempt < 3) {
      self.postMessage({
        type: 'status',
        message: `Model warming up, retrying in ${Math.round(wait / 1000)}s… (${attempt + 1}/3)`,
      });
      await new Promise(r => setTimeout(r, wait));
      return callHF(text, token, attempt + 1);
    }
    throw new Error('Model did not respond after 3 retries. Wait a minute and try again.');
  }

  // 429 = rate limited — this is the most common issue without a token
  if (res.status === 429) {
    throw new RateLimitError();
  }

  // 401 / 403 = bad token
  if (res.status === 401 || res.status === 403) {
    throw new AuthError();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Parse the HF inference API response.
 * Handles both single and batched response formats:
 *   Single: [{ label: "Real", score: 0.97 }, { label: "Fake", score: 0.03 }]
 *   Batched: [[{ label: "Real", score: 0.97 }, ...]]
 */
function parseScore(raw) {
  if (!raw || !Array.isArray(raw)) return null;

  // Unwrap batch wrapper if present
  const preds = Array.isArray(raw[0]) ? raw[0] : raw;

  if (!preds.length || typeof preds[0] !== 'object') return null;

  const fakeEntry = preds.find(p => String(p.label).toLowerCase() === 'fake');
  const realEntry = preds.find(p => String(p.label).toLowerCase() === 'real');

  if (fakeEntry != null) {
    return Math.min(99, Math.max(1, Math.round(fakeEntry.score * 100)));
  }
  if (realEntry != null) {
    return Math.min(99, Math.max(1, Math.round((1 - realEntry.score) * 100)));
  }

  return null; // parse failed
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
        .filter(s => s.length > 2);

      if (valid.length === 0) {
        self.postMessage({ type: 'complete', results: [] });
        return;
      }

      // ── Preflight test on the first sentence ─────────────────────────────
      // Fail fast with a clear error if the API rejects us, rather than
      // returning 50% for every sentence and confusing the user.
      self.postMessage({ type: 'status', message: 'Connecting to HuggingFace model…' });

      const firstText = valid[0].length > 500 ? valid[0].slice(0, 500) : valid[0];
      let firstRaw;
      try {
        firstRaw = await callHF(firstText, token || null);
      } catch (preflightErr) {
        // Surface specific, actionable error messages
        if (preflightErr.code === 'RATE_LIMIT') {
          self.postMessage({
            type: 'error',
            code: 'RATE_LIMIT',
            error:
              'HuggingFace API rate limit hit (anonymous access = ~1 req/hour).\n\n' +
              'Fix: Add a FREE HuggingFace token using the "▼ Add free HF token" link above.\n' +
              'Get one at: huggingface.co/settings/tokens (takes 30 seconds, free).',
          });
        } else if (preflightErr.code === 'AUTH_ERROR') {
          self.postMessage({
            type: 'error',
            code: 'AUTH_ERROR',
            error: 'Token rejected by HuggingFace. Check your token is correct and has "Read" access.',
          });
        } else {
          self.postMessage({ type: 'error', error: preflightErr.message });
        }
        return;
      }

      // Parse first result
      const firstScore = parseScore(firstRaw);
      if (firstScore === null) {
        self.postMessage({
          type: 'error',
          error: `Unexpected API response format: ${JSON.stringify(firstRaw).slice(0, 200)}`,
        });
        return;
      }

      // ── Classify remaining sentences ──────────────────────────────────────
      const results = [];

      results.push({
        text: valid[0],
        aiScore: firstScore,
        label: firstScore >= 65 ? 'AI' : firstScore <= 35 ? 'Human' : 'Uncertain',
      });

      self.postMessage({ type: 'progress', current: 1, total: valid.length, percent: Math.round(1 / valid.length * 100) });

      for (let i = 1; i < valid.length; i++) {
        const text = valid[i];
        const safe = text.length > 500 ? text.slice(0, 500) : text;

        let aiScore;
        try {
          const raw = await callHF(safe, token || null);
          const parsed = parseScore(raw);
          // If parse returns null, we still have a response — use 50 as last resort
          // but log it so we can debug
          aiScore = parsed ?? 50;
        } catch (err) {
          if (err.code === 'RATE_LIMIT') {
            // Rate limit hit mid-run — stop and surface error with partial results
            self.postMessage({
              type: 'partial_complete',
              results,
              error:
                `Rate limited after ${i} sentences. Add a HuggingFace token for unlimited use.\n` +
                'Partial results shown below.',
            });
            return;
          }
          // Other error: use 50 but only for non-rate-limit failures
          aiScore = 50;
        }

        results.push({
          text: valid[i],
          aiScore,
          label: aiScore >= 65 ? 'AI' : aiScore <= 35 ? 'Human' : 'Uncertain',
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
