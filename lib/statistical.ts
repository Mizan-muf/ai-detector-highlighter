export interface StatisticalAnalysis {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  burstinessScore: number; // 0 (uniform AI) to 100 (high burstiness / human)
  lexicalDiversity: number; // Type-Token Ratio (TTR) %
  aiLikelihoodEstimate: number; // 0 to 100%
  sentenceStats: {
    text: string;
    wordCount: number;
    uniqueness: number;
    estimatedAiScore: number;
  }[];
}

export function analyzeStatisticalPatterns(text: string): StatisticalAnalysis {
  if (!text || text.trim().length === 0) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      burstinessScore: 50,
      lexicalDiversity: 0,
      aiLikelihoodEstimate: 50,
      sentenceStats: [],
    };
  }

  // Split into sentences
  const rawSentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const sentences = rawSentences.map(s => s.trim()).filter(s => s.length > 0);

  const words = text.toLowerCase().match(/\b[a-z0-9'-]+\b/g) || [];
  const totalWords = words.length;

  if (totalWords === 0 || sentences.length === 0) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      burstinessScore: 50,
      lexicalDiversity: 0,
      aiLikelihoodEstimate: 50,
      sentenceStats: [],
    };
  }

  // Lexical Diversity (Type-Token Ratio)
  const uniqueWords = new Set(words);
  const lexicalDiversity = Math.round((uniqueWords.size / totalWords) * 100);

  // Sentence Lengths and Variance (Burstiness)
  const sentenceLengths = sentences.map(s => {
    const sWords = s.toLowerCase().match(/\b[a-z0-9'-]+\b/g) || [];
    return sWords.length;
  });

  const avgSentenceLength = totalWords / sentences.length;
  const variance = sentenceLengths.reduce((acc, len) => acc + Math.pow(len - avgSentenceLength, 2), 0) / sentences.length;
  const standardDeviation = Math.sqrt(variance);

  // Coefficient of Variation (CV) as Burstiness Metric
  // AI tends to produce uniform sentence lengths (low CV < 0.35)
  // Humans write with high variety: very short mixed with long sentences (CV > 0.55)
  const cv = avgSentenceLength > 0 ? standardDeviation / avgSentenceLength : 0;
  const burstinessScore = Math.min(100, Math.max(0, Math.round(cv * 100)));

  // Common AI Transition and Cliché density
  const aiBuzzwords = [
    'furthermore', 'moreover', 'in conclusion', 'delve', 'testament',
    'beacon', 'tapestry', 'crucial', 'vital', 'realm', 'multifaceted',
    'pivotal', 'interplay', 'underscores', 'paramount', 'holistic',
    'nuanced', 'game-changer', 'fostering', 'seamlessly', 'unwavering'
  ];

  let aiBuzzwordCount = 0;
  words.forEach(w => {
    if (aiBuzzwords.includes(w)) aiBuzzwordCount++;
  });
  const buzzwordDensity = (aiBuzzwordCount / totalWords) * 100;

  // Individual sentence analysis
  const sentenceStats = sentences.map(s => {
    const sWords = s.toLowerCase().match(/\b[a-z0-9'-]+\b/g) || [];
    const sUnique = new Set(sWords);
    const uniqueness = sWords.length > 0 ? (sUnique.size / sWords.length) * 100 : 100;
    
    // Heuristic score for individual sentence
    let sScore = 50;
    // Check if sentence length is very close to mean and has AI clichés
    const lengthDiffFromMean = Math.abs(sWords.length - avgSentenceLength);
    if (lengthDiffFromMean < 3 && sWords.length > 10) sScore += 15;
    
    let hasBuzzword = false;
    sWords.forEach(w => {
      if (aiBuzzwords.includes(w)) {
        sScore += 20;
        hasBuzzword = true;
      }
    });

    if (uniqueness < 70 && sWords.length > 10) sScore += 10;
    if (sWords.length < 5 || sWords.length > 35) sScore -= 15; // Extreme variations are human

    return {
      text: s,
      wordCount: sWords.length,
      uniqueness: Math.round(uniqueness),
      estimatedAiScore: Math.min(99, Math.max(1, Math.round(sScore)))
    };
  });

  // Calculate Overall Estimated AI Score
  // Low burstiness (uniform lengths) + low/mid lexical diversity + high clichés => High AI probability
  let rawAiEstimate = 50;
  if (burstinessScore < 30) rawAiEstimate += 25;
  else if (burstinessScore < 45) rawAiEstimate += 12;
  else if (burstinessScore > 70) rawAiEstimate -= 25;
  else if (burstinessScore > 55) rawAiEstimate -= 12;

  if (buzzwordDensity > 1.5) rawAiEstimate += 20;
  else if (buzzwordDensity > 0.8) rawAiEstimate += 10;

  if (lexicalDiversity < 45 && totalWords > 100) rawAiEstimate += 10;
  else if (lexicalDiversity > 65) rawAiEstimate -= 10;

  return {
    wordCount: totalWords,
    sentenceCount: sentences.length,
    avgSentenceLength: Number(avgSentenceLength.toFixed(1)),
    sentenceLengthVariance: Number(standardDeviation.toFixed(1)),
    burstinessScore,
    lexicalDiversity,
    aiLikelihoodEstimate: Math.min(99, Math.max(1, rawAiEstimate)),
    sentenceStats,
  };
}
