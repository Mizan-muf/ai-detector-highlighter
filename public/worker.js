import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

class TextClassifierSingleton {
  static task = 'text-classification';
  // LABEL_0 = Real/Human, LABEL_1 = AI/Fake (some versions: 'Real' / 'Fake')
  static model = 'onnx-community/roberta-base-openai-detector';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (!this.instance) {
      this.instance = await pipeline(this.task, this.model, {
        progress_callback,
        dtype: 'q8',
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const { type, sentences } = event.data;

  if (type === 'init') {
    try {
      await TextClassifierSingleton.getInstance((prog) => {
        self.postMessage({ type: 'download_progress', data: prog });
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err && err.message ? err.message : err) });
    }
    return;
  }

  if (type === 'classify') {
    try {
      const classifier = await TextClassifierSingleton.getInstance((prog) => {
        self.postMessage({ type: 'download_progress', data: prog });
      });

      const validSentences = (sentences || []).filter(s => s && s.trim().length > 0);
      const total = validSentences.length;

      if (total === 0) {
        self.postMessage({ type: 'complete', results: [] });
        return;
      }

      const results = [];

      for (let i = 0; i < total; i++) {
        const text = validSentences[i].trim();
        // RoBERTa has a 512-token limit; truncate long sentences safely
        const safe = text.length > 900 ? text.slice(0, 900) : text;

        let output;
        try {
          output = await classifier(safe);
        } catch (e) {
          output = [{ label: 'LABEL_0', score: 0.5 }];
        }

        // top result from pipeline is always index 0
        const top = output[0] || { label: 'LABEL_0', score: 0.5 };
        // normalize label – handle both 'LABEL_1' and 'Fake' variants
        const labelLower = String(top.label).toLowerCase();
        const isAI = labelLower === 'label_1' || labelLower === 'fake';
        const aiScore = isAI ? top.score : 1 - top.score;
        const aiPercent = Math.min(99, Math.max(1, Math.round(aiScore * 100)));

        results.push({
          text: validSentences[i],
          aiScore: aiPercent,
          label: aiPercent >= 65 ? 'AI' : aiPercent <= 35 ? 'Human' : 'Uncertain',
        });

        // percent is sent as a top-level field (not nested under a 'progress' key)
        self.postMessage({
          type: 'progress',
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
        });
      }

      self.postMessage({ type: 'complete', results });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err && err.message ? err.message : err) });
    }
  }
});
