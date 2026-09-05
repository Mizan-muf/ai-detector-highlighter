import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

class TextClassifierSingleton {
  static task = 'text-classification';
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
      await TextClassifierSingleton.getInstance((progress) => {
        self.postMessage({ type: 'download_progress', progress });
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
    return;
  }

  if (type === 'classify') {
    try {
      const classifier = await TextClassifierSingleton.getInstance((progress) => {
        self.postMessage({ type: 'download_progress', progress });
      });

      const results = [];
      const total = sentences.length;

      for (let i = 0; i < total; i++) {
        const text = sentences[i].trim();
        if (!text) continue;

        let output;
        try {
          output = await classifier(text);
        } catch (e) {
          // Fallback if individual line fails
          output = [{ label: 'LABEL_0', score: 0.5 }];
        }

        // roberta-base-openai-detector outputs LABEL_0 (Human/Real) vs LABEL_1 (Fake/AI) or 'Real'/'Fake'
        const first = output[0] || { label: 'LABEL_0', score: 0.5 };
        const isAi = first.label === 'LABEL_1' || first.label.toLowerCase() === 'fake';
        const aiScore = isAi ? first.score : 1 - first.score;
        const aiPercent = Math.round(aiScore * 100);

        results.push({
          text: sentences[i],
          aiScore: aiPercent,
          label: aiPercent >= 65 ? 'AI' : aiPercent <= 35 ? 'Human' : 'Uncertain',
        });

        self.postMessage({
          type: 'progress',
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
        });
      }

      self.postMessage({ type: 'complete', results });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
});
