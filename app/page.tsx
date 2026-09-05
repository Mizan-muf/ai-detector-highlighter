'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Zap,
  Cpu,
  RefreshCw,
  Copy,
  Check,
  Download,
  AlertCircle,
  FileText,
  HelpCircle,
  BarChart3,
  ShieldCheck
} from 'lucide-react';
import { analyzeStatisticalPatterns, StatisticalAnalysis } from '@/lib/statistical';

interface SentenceResult {
  text: string;
  aiScore: number;
  label: 'AI' | 'Human' | 'Uncertain';
}

const SAMPLE_TEXTS = {
  ai: `Artificial intelligence has undeniably become a cornerstone of modern technological innovation, revolutionizing industries and redefining human potential. In the contemporary digital era, machine learning algorithms delve into complex data structures with remarkable precision. Furthermore, the seamless integration of neural networks across multifaceted domains serves as a testament to human ingenuity. In conclusion, it is vital to recognize the transformative interplay between automated systems and society, as this technological paradigm shift fosters unprecedented growth and underscores a holistic future.`,
  human: `I started playing guitar when I was twelve, mostly because my older brother had an old acoustic sitting in his closet that nobody ever touched. It had rusty strings and high action that tore my fingers up. But after a few weeks of struggling through basic open chords, I finally managed to play a decent version of 'Wish You Were Here'. Honestly, it sounded terrible to anyone listening, but to me it felt like magic. Years later, I still keep that beat-up instrument in the corner of my living room.`,
  mixed: `Quantum computing leverages the principles of superposition and entanglement to solve computational problems beyond the reach of classical supercomputers. This paradigm shift will revolutionize cryptography, optimization, and molecular modeling. I remember trying to read a textbook about quantum mechanics in college and getting completely lost after the first three chapters. The math was just way too dense for my sleep-deprived brain back then. Nonetheless, the interplay of quantum state vectors remains a crucial cornerstone for modern quantum algorithms.`,
};

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<'neural' | 'statistical'>('neural');
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<string>('idle');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SentenceResult[]>([]);
  const [statData, setStatData] = useState<StatisticalAnalysis | null>(null);
  const [overallAiScore, setOverallAiScore] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'AI' | 'Uncertain' | 'Human'>('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      workerRef.current = new Worker('/worker.js', { type: 'module' });

      workerRef.current.onmessage = (e) => {
        const { type, results: workerResults, progress: workerProgress, error } = e.data;

        if (type === 'download_progress') {
          setModelStatus('loading_model');
        } else if (type === 'ready') {
          setModelStatus('ready');
        } else if (type === 'progress') {
          setProgress(workerProgress?.percent || 0);
        } else if (type === 'complete') {
          setResults(workerResults);
          if (workerResults.length > 0) {
            const avg = Math.round(
              workerResults.reduce((acc: number, curr: SentenceResult) => acc + curr.aiScore, 0) /
                workerResults.length
            );
            setOverallAiScore(avg);
          }
          setLoading(false);
          setModelStatus('idle');
        } else if (type === 'error') {
          console.error('Worker error:', error);
          setLoading(false);
          setModelStatus('error');
          // Fallback automatically to statistical
          fallbackToStatistical();
        }
      };

      workerRef.current.postMessage({ type: 'init' });
    } catch (err) {
      console.warn('Web Worker not supported or failed to initialize:', err);
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const fallbackToStatistical = (text = inputText) => {
    const stats = analyzeStatisticalPatterns(text);
    setStatData(stats);
    setOverallAiScore(stats.aiLikelihoodEstimate);
    const converted: SentenceResult[] = stats.sentenceStats.map((s) => ({
      text: s.text,
      aiScore: s.estimatedAiScore,
      label: s.estimatedAiScore >= 65 ? 'AI' : s.estimatedAiScore <= 35 ? 'Human' : 'Uncertain',
    }));
    setResults(converted);
    setLoading(false);
  };

  const handleAnalyze = () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setProgress(0);
    setResults([]);
    setOverallAiScore(null);

    // Compute statistical data immediately
    const stats = analyzeStatisticalPatterns(inputText);
    setStatData(stats);

    if (mode === 'statistical' || !workerRef.current) {
      fallbackToStatistical(inputText);
      return;
    }

    // Split text into meaningful sentences preserving punctuation
    const rawMatches = inputText.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [inputText];
    const sentences = rawMatches.map((s) => s.trim()).filter((s) => s.length > 0);

    if (sentences.length === 0) {
      setLoading(false);
      return;
    }

    workerRef.current.postMessage({
      type: 'classify',
      sentences,
    });
  };

  const loadSample = (type: 'ai' | 'human' | 'mixed') => {
    setInputText(SAMPLE_TEXTS[type]);
    setResults([]);
    setOverallAiScore(null);
    setStatData(null);
  };

  const copyResults = () => {
    const textOutput = results
      .map((r) => `[${r.label.toUpperCase()} - ${r.aiScore}%] ${r.text}`)
      .join('\n');
    navigator.clipboard.writeText(textOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportJson = () => {
    const data = {
      timestamp: new Date().toISOString(),
      overallAiScore,
      mode,
      statisticalMetrics: statData,
      sentences: results,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-detector-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = results.filter((r) => {
    if (activeFilter === 'all') return true;
    return r.label === activeFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white pb-16">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  AuraDetect
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  Free & Open Source
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                In-Browser Neural & Statistical AI Detector & Highlighter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
              <button
                onClick={() => setMode('neural')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  mode === 'neural'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Uses RoBERTa ONNX neural detector inside your browser"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Neural ONNX</span>
              </button>
              <button
                onClick={() => setMode('statistical')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  mode === 'statistical'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Uses statistical Burstiness, Perplexity & Lexical entropy"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Instant (Stats)</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Hero Banner */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Free Forever AI Content Detector
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Runs 100% locally in your browser. No server limits, zero cost, completely private.
          </p>
        </div>

        {/* Quick Sample Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>Load Demo Text:</span>
            <button
              onClick={() => loadSample('ai')}
              className="px-2.5 py-1 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 hover:bg-red-900/50 transition font-medium"
            >
              🤖 100% AI Generated
            </button>
            <button
              onClick={() => loadSample('human')}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 hover:bg-emerald-900/50 transition font-medium"
            >
              👤 Human Written
            </button>
            <button
              onClick={() => loadSample('mixed')}
              className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300 hover:bg-amber-900/50 transition font-medium"
            >
              ⚡ Mixed Sample
            </button>
          </div>

          {inputText && (
            <button
              onClick={() => {
                setInputText('');
                setResults([]);
                setOverallAiScore(null);
                setStatData(null);
              }}
              className="text-slate-400 hover:text-rose-400 transition flex items-center gap-1 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Clear Text
            </button>
          )}
        </div>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Text Input */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <div className="relative rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-sm p-4 flex flex-col h-[520px] shadow-xl">
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2 mb-3">
                <span className="font-semibold text-slate-300">Input Content</span>
                <span>{inputText.trim() ? inputText.trim().split(/\s+/).length : 0} words</span>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste any article, essay, resume bullet, cover letter, or paragraph here..."
                className="w-full flex-1 bg-transparent text-slate-200 text-sm leading-relaxed resize-none focus:outline-none placeholder:text-slate-600 font-sans"
              />
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="text-[11px] text-slate-500">
                  {mode === 'neural' ? 'ONNX RoBERTa Classifier' : 'Burstiness & Perplexity Analysis'}
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={loading || !inputText.trim()}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition shadow-lg shadow-indigo-600/30"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {modelStatus === 'loading_model'
                          ? 'Loading Model...'
                          : `Scanning (${progress}%)...`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analyze & Highlight</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Sentence Highlighter & Inspector */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-sm p-4 flex flex-col h-[520px] shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-300">Highlighted Breakdown</span>
                  {overallAiScore !== null && (
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        overallAiScore >= 65
                          ? 'bg-rose-950/60 text-rose-400 border-rose-800/80'
                          : overallAiScore <= 35
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                          : 'bg-amber-950/60 text-amber-400 border-amber-800/80'
                      }`}
                    >
                      Overall AI: {overallAiScore}%
                    </span>
                  )}
                </div>

                {results.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={copyResults}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition"
                      title="Copy breakdown"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={exportJson}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition"
                      title="Export JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Highlighting Content Area */}
              <div className="flex-1 overflow-y-auto pr-1 text-sm leading-relaxed space-y-2">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center p-6 space-y-2">
                    <ShieldCheck className="w-12 h-12 text-slate-700 stroke-[1.5]" />
                    <p className="text-sm font-medium text-slate-400">No analysis performed yet</p>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Paste text on the left and click &quot;Analyze &amp; Highlight&quot; to inspect sentence-by-sentence AI likelihood.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {results.map((item, idx) => {
                      let colorClass = 'bg-emerald-950/30 text-emerald-200 border-b border-emerald-700/50';
                      if (item.aiScore >= 65) {
                        colorClass = 'bg-rose-950/50 text-rose-100 border-b-2 border-rose-500';
                      } else if (item.aiScore >= 35) {
                        colorClass = 'bg-amber-950/40 text-amber-100 border-b-2 border-amber-500';
                      }

                      return (
                        <span
                          key={idx}
                          onMouseEnter={() => setHoveredIdx(idx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          className={`inline-block mr-1.5 mb-1 px-1.5 py-0.5 rounded cursor-pointer transition relative group ${colorClass}`}
                        >
                          {item.text}
                          {/* Hover Tooltip */}
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-20 whitespace-nowrap bg-slate-900 border border-slate-700 text-xs px-2.5 py-1.5 rounded-lg shadow-2xl text-slate-200">
                            <span className="font-bold flex items-center gap-1.5">
                              <span>Sentence #{idx + 1}</span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] ${
                                  item.aiScore >= 65
                                    ? 'text-rose-400'
                                    : item.aiScore <= 35
                                    ? 'text-emerald-400'
                                    : 'text-amber-400'
                                }`}
                              >
                                {item.label} ({item.aiScore}%)
                              </span>
                            </span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500/80"></span> Likely AI (&gt;65%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-amber-500/80"></span> Mixed (35-65%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500/80"></span> Likely Human (&lt;35%)
                  </span>
                </div>
                {results.length > 0 && (
                  <span className="text-[11px] text-slate-500">{results.length} sentences analyzed</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Deep Dive Metrics & Statistical Inspection */}
        {statData && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Linguistic &amp; Statistical Breakdown</h2>
              </div>
              <span className="text-xs text-slate-400">
                Linguistic variation and entropy signatures
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Burstiness Score</p>
                <p className="text-2xl font-bold text-indigo-400 mt-1">{statData.burstinessScore}/100</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {statData.burstinessScore > 50 ? 'High variation (Human-like)' : 'Uniform pacing (AI-like)'}
                </p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Lexical Diversity (TTR)</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">{statData.lexicalDiversity}%</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Unique vocabulary ratio</p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Avg Sentence Length</p>
                <p className="text-2xl font-bold text-pink-400 mt-1">{statData.avgSentenceLength} wds</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Std dev: {statData.sentenceLengthVariance}</p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Total Sentences</p>
                <p className="text-2xl font-bold text-cyan-400 mt-1">{statData.sentenceCount}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{statData.wordCount} total words</p>
              </div>
            </div>

            {/* Sentence Filter and Table */}
            {results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Sentence-by-Sentence Inspector</h3>
                  <div className="flex items-center gap-1 text-xs">
                    {(['all', 'AI', 'Uncertain', 'Human'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-3 py-1 rounded-lg transition capitalize font-medium ${
                          activeFilter === filter
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                    {filteredResults.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 flex items-start justify-between gap-4 text-xs transition ${
                          hoveredIdx === idx ? 'bg-indigo-950/30' : 'bg-slate-950/40 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="space-y-1 flex-1">
                          <span className="font-mono text-slate-500 mr-2">#{idx + 1}</span>
                          <span className="text-slate-300">{item.text}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                              item.aiScore >= 65
                                ? 'bg-rose-950/80 text-rose-400 border border-rose-800'
                                : item.aiScore <= 35
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {item.aiScore}% AI
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
