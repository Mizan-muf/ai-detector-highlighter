'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Zap, Cpu, RefreshCw, Copy, Check,
  Download, FileText, BarChart3, ShieldCheck,
  AlertTriangle, Loader2, Info
} from 'lucide-react';
import { analyzeStatisticalPatterns, StatisticalAnalysis } from '@/lib/statistical';

interface SentenceResult {
  text: string;
  aiScore: number;
  label: 'AI' | 'Human' | 'Uncertain';
}

type Mode = 'neural' | 'statistical';
type AppStatus = 'idle' | 'downloading' | 'scanning' | 'done' | 'error';

const SAMPLE_TEXTS = {
  ai: `Artificial intelligence has undeniably become a cornerstone of modern technological innovation, revolutionizing industries and redefining human potential. In the contemporary digital era, machine learning algorithms delve into complex data structures with remarkable precision. Furthermore, the seamless integration of neural networks across multifaceted domains serves as a testament to human ingenuity. In conclusion, it is vital to recognize the transformative interplay between automated systems and society, as this technological paradigm shift fosters unprecedented growth and underscores a holistic future.`,
  human: `I started playing guitar when I was twelve, mostly because my older brother had an old acoustic sitting in his closet that nobody ever touched. It had rusty strings and high action that tore my fingers up. But after a few weeks of struggling through basic open chords, I finally managed to play a decent version of Wish You Were Here. Honestly, it sounded terrible to anyone listening, but to me it felt like magic. Years later, I still keep that beat-up instrument in the corner of my living room.`,
  mixed: `Quantum computing leverages the principles of superposition and entanglement to solve computational problems beyond the reach of classical supercomputers. This paradigm shift will revolutionize cryptography, optimization, and molecular modeling. I remember trying to read a textbook about quantum mechanics in college and getting completely lost after the first three chapters. The math was just way too dense for my sleep-deprived brain back then. Nonetheless, the interplay of quantum state vectors remains a crucial cornerstone for modern quantum algorithms.`,
};

export default function Home() {
  const [inputText, setInputText]             = useState('');
  const [mode, setMode]                       = useState<Mode>('neural');
  const [appStatus, setAppStatus]             = useState<AppStatus>('idle');
  const [statusMsg, setStatusMsg]             = useState('');
  const [downloadPct, setDownloadPct]         = useState<number | null>(null);
  const [scanPct, setScanPct]                 = useState(0);
  const [errorMsg, setErrorMsg]               = useState('');
  const [results, setResults]                 = useState<SentenceResult[]>([]);
  const [statData, setStatData]               = useState<StatisticalAnalysis | null>(null);
  const [overallScore, setOverallScore]       = useState<number | null>(null);
  const [copied, setCopied]                   = useState(false);
  const [activeFilter, setActiveFilter]       = useState<'all' | 'AI' | 'Uncertain' | 'Human'>('all');
  const [workerReady, setWorkerReady]         = useState(false);

  const workerRef = useRef<Worker | null>(null);

  // ── Initialise Web Worker ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const w = new Worker('/worker.js', { type: 'module' });

      w.onmessage = (e) => {
        const d = e.data || {};
        switch (d.type) {
          case 'pong':
            setWorkerReady(true);
            break;

          case 'download_progress': {
            setAppStatus('downloading');
            const pct = d.percent;
            if (pct != null && !isNaN(pct)) {
              setDownloadPct(pct);
              setStatusMsg(`Downloading model… ${pct}%`);
            } else {
              setStatusMsg('Downloading model…');
            }
            break;
          }

          case 'status':
            if (d.message?.includes('Scanning')) {
              setAppStatus('scanning');
              setDownloadPct(null);
            }
            setStatusMsg(d.message || '');
            break;

          case 'progress':
            setScanPct(d.percent ?? 0);
            setStatusMsg(`Scanning sentence ${d.current} of ${d.total}…`);
            break;

          case 'complete': {
            const res: SentenceResult[] = d.results || [];
            finishWithResults(res);
            break;
          }

          case 'error':
            setAppStatus('error');
            setErrorMsg(d.error || 'Unknown worker error');
            setStatusMsg('');
            break;
        }
      };

      w.onerror = (e) => {
        setAppStatus('error');
        setErrorMsg(`Worker failed to load: ${e.message || 'Check browser console for details.'}`);
      };

      workerRef.current = w;
      // ping to confirm worker is alive
      w.postMessage({ type: 'ping' });

    } catch (err) {
      setAppStatus('error');
      setErrorMsg('Web Workers are not supported in this browser.');
    }

    return () => workerRef.current?.terminate();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function computeOverall(res: SentenceResult[]) {
    if (res.length === 0) return null;
    return Math.round(res.reduce((a, r) => a + r.aiScore, 0) / res.length);
  }

  function finishWithResults(res: SentenceResult[]) {
    setResults(res);
    setOverallScore(computeOverall(res));
    setAppStatus('done');
    setStatusMsg('');
    setScanPct(0);
  }

  function runStatistical(text: string) {
    const stats = analyzeStatisticalPatterns(text);
    setStatData(stats);
    const converted: SentenceResult[] = stats.sentenceStats.map((s) => ({
      text: s.text,
      aiScore: s.estimatedAiScore,
      label: s.estimatedAiScore >= 65 ? 'AI' : s.estimatedAiScore <= 35 ? 'Human' : 'Uncertain',
    }));
    finishWithResults(converted);
  }

  // ── Analyse ───────────────────────────────────────────────────────────────
  const handleAnalyse = () => {
    const text = inputText.trim();
    if (!text) return;

    // Reset
    setResults([]);
    setOverallScore(null);
    setErrorMsg('');
    setScanPct(0);
    setDownloadPct(null);

    // Always run statistical (populates the stats panel)
    const stats = analyzeStatisticalPatterns(text);
    setStatData(stats);

    if (mode === 'statistical' || !workerRef.current) {
      setAppStatus('scanning');
      setStatusMsg('Calculating…');
      runStatistical(text);
      return;
    }

    // Neural: split into sentences and hand off to worker
    const sentences = text
      .match(/[^.!?\n]+[.!?\n]+(\s|$)|[^.!?\n]+$/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0)
      ?? [text];

    if (sentences.length === 0) return;

    setAppStatus('downloading');
    setStatusMsg('Starting model…');
    workerRef.current.postMessage({ type: 'classify', sentences });
  };

  const loadSample = (key: keyof typeof SAMPLE_TEXTS) => {
    setInputText(SAMPLE_TEXTS[key]);
    setResults([]);
    setOverallScore(null);
    setStatData(null);
    setErrorMsg('');
    setAppStatus('idle');
  };

  const copyResults = () => {
    navigator.clipboard.writeText(
      results.map((r) => `[${r.label} ${r.aiScore}%] ${r.text}`).join('\n')
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportJSON = () => {
    const blob = new Blob(
      [JSON.stringify({ overallScore, mode, statData, sentences: results }, null, 2)],
      { type: 'application/json' }
    );
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `auradetect-${Date.now()}.json`,
    });
    a.click();
  };

  const isLoading  = appStatus === 'downloading' || appStatus === 'scanning';
  const filtered   = activeFilter === 'all' ? results : results.filter(r => r.label === activeFilter);

  // ── Score colour helper ───────────────────────────────────────────────────
  const scoreColor = (score: number) =>
    score >= 65 ? 'rose' : score <= 35 ? 'emerald' : 'amber';

  const scoreLabel = (score: number) =>
    score >= 65 ? 'Likely AI' : score <= 35 ? 'Likely Human' : 'Uncertain';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 selection:bg-indigo-500/40">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-lg">AuraDetect</span>
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                Free &amp; Open Source
              </span>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs gap-0.5">
            {(['neural', 'statistical'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  mode === m
                    ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'neural' ? <Cpu className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                {m === 'neural' ? 'Neural' : 'Statistical'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-6">

        {/* ── Hero ── */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Free AI Content Detector &amp; Sentence Highlighter
          </h1>
          <p className="text-slate-400 text-sm">
            100% in-browser · No server · No API key · Completely private
          </p>
        </div>

        {/* ── Mode info banner ── */}
        {mode === 'neural' && (
          <div className="flex items-start gap-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-3.5 text-sm text-indigo-200 max-w-3xl mx-auto">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" />
            <span>
              <strong>Neural mode</strong> downloads ~80 MB ONNX model on first run (cached afterwards).
              Results are highly accurate. Switch to <strong>Statistical</strong> for instant results.
            </span>
          </div>
        )}

        {/* ── Samples ── */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Demo:</span>
          {(['ai', 'human', 'mixed'] as const).map((k) => {
            const labels = { ai: '🤖 AI Text', human: '👤 Human Text', mixed: '⚡ Mixed' };
            const colors = { ai: 'rose', human: 'emerald', mixed: 'amber' };
            const c = colors[k];
            return (
              <button
                key={k}
                onClick={() => loadSample(k)}
                className={`px-3 py-1.5 rounded-lg bg-${c}-950/40 border border-${c}-800/50 text-${c}-300 hover:bg-${c}-900/50 transition font-medium`}
              >
                {labels[k]}
              </button>
            );
          })}
          {inputText && (
            <button
              onClick={() => { setInputText(''); setResults([]); setOverallScore(null); setStatData(null); setAppStatus('idle'); setErrorMsg(''); }}
              className="ml-auto text-slate-500 hover:text-rose-400 transition flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* ── Main workspace ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Input panel */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-sm overflow-hidden shadow-xl h-[520px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Input</span>
              <span>{inputText.trim() ? inputText.trim().split(/\s+/).length : 0} words</span>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste an essay, article, email, or any text here…"
              className="flex-1 w-full bg-transparent text-slate-200 text-sm leading-relaxed px-4 py-3 resize-none focus:outline-none placeholder:text-slate-600"
            />
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                {mode === 'neural' ? 'RoBERTa ONNX · Xenova HuggingFace' : 'Burstiness + Lexical Entropy'}
              </span>
              <button
                onClick={handleAnalyse}
                disabled={isLoading || !inputText.trim()}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition shadow-lg shadow-indigo-600/25"
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span>{statusMsg || 'Working…'}</span></>
                  : <><Sparkles className="w-4 h-4" /><span>Detect &amp; Highlight</span></>
                }
              </button>
            </div>
          </div>

          {/* Results panel */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-sm overflow-hidden shadow-xl h-[520px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-slate-300">Highlighted Breakdown</span>
                {overallScore !== null && (
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border bg-${scoreColor(overallScore)}-950/60 text-${scoreColor(overallScore)}-400 border-${scoreColor(overallScore)}-800/80`}>
                    Overall: {overallScore}% AI · {scoreLabel(overallScore)}
                  </span>
                )}
              </div>
              {results.length > 0 && (
                <div className="flex gap-1.5">
                  <button onClick={copyResults} title="Copy" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={exportJSON} title="Export JSON" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {isLoading && (
              <div className="px-4 py-2 border-b border-slate-800 shrink-0 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{statusMsg}</span>
                  {appStatus === 'scanning' && <span>{scanPct}%</span>}
                  {appStatus === 'downloading' && downloadPct != null && <span>{downloadPct}%</span>}
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      appStatus === 'downloading' ? 'bg-violet-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${appStatus === 'scanning' ? scanPct : (downloadPct ?? 5)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error state */}
            {appStatus === 'error' && (
              <div className="mx-4 mt-4 flex items-start gap-3 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3.5 text-sm text-rose-200 shrink-0">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-300">Neural model error</p>
                  <p className="text-xs text-rose-400">{errorMsg}</p>
                  <button
                    onClick={() => { setMode('statistical'); setAppStatus('idle'); setErrorMsg(''); }}
                    className="mt-1.5 px-3 py-1 rounded-lg bg-rose-800/40 hover:bg-rose-700/40 text-rose-200 text-xs font-medium transition"
                  >
                    Switch to Statistical mode →
                  </button>
                </div>
              </div>
            )}

            {/* Highlighted sentences */}
            <div className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-loose">
              {results.length === 0 && appStatus !== 'error' && !isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-slate-600 p-6">
                  <ShieldCheck className="w-12 h-12 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-500">No analysis yet</p>
                  <p className="text-xs text-slate-600 max-w-xs">
                    Paste text on the left and click <strong className="text-slate-400">Detect &amp; Highlight</strong>
                  </p>
                </div>
              ) : (
                results.map((item, idx) => {
                  const c = scoreColor(item.aiScore);
                  return (
                    <span
                      key={idx}
                      title={`Sentence ${idx + 1} · ${item.label} · ${item.aiScore}% AI`}
                      className={`inline cursor-help mr-1 px-1 rounded transition
                        ${c === 'rose'    ? 'bg-rose-500/25 text-rose-100 border-b-2 border-rose-500'    : ''}
                        ${c === 'amber'   ? 'bg-amber-500/20 text-amber-100 border-b-2 border-amber-500'  : ''}
                        ${c === 'emerald' ? 'bg-emerald-500/15 text-emerald-100'                           : ''}
                      `}
                    >
                      {item.text}{' '}
                    </span>
                  );
                })
              )}
            </div>

            {/* Legend */}
            <div className="px-4 py-2.5 border-t border-slate-800 shrink-0 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              {[
                { color: 'bg-rose-500/80',    label: 'Likely AI (>65%)' },
                { color: 'bg-amber-500/80',   label: 'Uncertain (35-65%)' },
                { color: 'bg-emerald-500/80', label: 'Likely Human (<35%)' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded ${color}`} /> {label}
                </span>
              ))}
              {results.length > 0 && (
                <span className="ml-auto text-slate-500">{results.length} sentences</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Sentence Inspector Table ── */}
        {results.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4.5 h-4.5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Sentence Inspector</h2>
              </div>
              <div className="flex gap-1 text-xs">
                {(['all', 'AI', 'Uncertain', 'Human'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      activeFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                {filtered.map((item, idx) => {
                  const c = scoreColor(item.aiScore);
                  return (
                    <div key={idx} className="px-4 py-3 flex items-start justify-between gap-4 text-xs bg-slate-950/30 hover:bg-slate-900/60 transition">
                      <p className="text-slate-300 flex-1 leading-relaxed">
                        <span className="font-mono text-slate-500 mr-2">#{idx + 1}</span>
                        {item.text}
                      </p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full font-semibold text-[11px] bg-${c}-950/80 text-${c}-400 border border-${c}-800`}>
                        {item.aiScore}% AI
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Statistical Metrics Panel ── */}
        {statData && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4.5 h-4.5 text-violet-400" /> Statistical Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Burstiness', value: `${statData.burstinessScore}/100`, color: 'text-indigo-400',  note: statData.burstinessScore > 50 ? 'High variation (Human)' : 'Uniform pacing (AI)' },
                { label: 'Lexical Diversity', value: `${statData.lexicalDiversity}%`, color: 'text-violet-400', note: 'Type-token ratio' },
                { label: 'Avg Sentence Len', value: `${statData.avgSentenceLength} wds`, color: 'text-pink-400', note: `±${statData.sentenceLengthVariance} std dev` },
                { label: 'Sentences', value: String(statData.sentenceCount), color: 'text-cyan-400', note: `${statData.wordCount} total words` },
              ].map(({ label, value, color, note }) => (
                <div key={label} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <p className="text-xs text-slate-400 font-medium">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
