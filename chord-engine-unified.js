/**
 * 🎹 ChordEngine UNIFIED v15.0 - SMART KEY DETECTION
 * 
 * 🆕 v15.0 NEW FEATURES:
 * 1. PERIODICITY DETECTION - finds where music starts
 * 2. STRUCTURAL KEY DETECTION - first/last chord analysis
 * 3. Skips intro drums automatically
 * 
 * 🔧 v14.1 FIXES (inherited):
 * 1. Tonic threshold: 95% → 75% (trust tonic detection more)
 * 2. First chord bonus: 5 → 80 points (listen to the third!)
 * 3. Universal veto for chromatic contradictions
 * 
 * 🎯 KEY INSIGHT: Key = Tonic + Third
 * - Tonic: Where song starts/ends
 * - Third: Major or minor (from first chord)
 * - First chord tells you BOTH!
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
  }


  // ============================================================
  // 🆕 v15.0: PERIODICITY DETECTION (מחזוריות)
  // ============================================================
  
  /**
   * Detect where REAL MUSIC starts by finding periodicity
   * Returns frame index where harmonic patterns begin
   */
  detectMusicStart(bassPc, chroma) {
    if (!bassPc || bassPc.length < 100) return 0;
    
    const windowSize = Math.min(200, Math.floor(bassPc.length / 4));
    const minLag = 8;
    const maxLag = Math.min(100, Math.floor(bassPc.length / 4));
    
    // Slide through signal to find first periodic section
    for (let start = 0; start < bassPc.length - windowSize; start += 10) {
      const window = bassPc.slice(start, start + windowSize);
      const periodicity = this.measurePeriodicity(window, minLag, maxLag);
      
      // 🔧 v15.0.3: Lower threshold from 0.3 to 0.25
      if (periodicity > 0.25) {
        console.log(`🎵 Music detected at frame ${start} (periodicity: ${periodicity.toFixed(2)})`);
        return start;
      }
    }
    
    // 🆕 v15.0.3: If NO periodicity found, assume intro noise and skip first 10%
    const safetySkip = Math.floor(bassPc.length * 0.10);
    console.log(`⚠️ No periodicity found - skipping first ${safetySkip} frames (10%) as safety`);
    return safetySkip;
  }
  
  /**
   * Measure periodicity using autocorrelation
   */
  measurePeriodicity(signal, minLag, maxLag) {
    const autocorr = this.autoCorrelate(signal, maxLag);
    
    let maxPeak = 0;
    for (let lag = minLag; lag < autocorr.length; lag++) {
      if (autocorr[lag] > maxPeak) maxPeak = autocorr[lag];
    }
    
    return maxPeak;
  }
  
  /**
   * Autocorrelation function
   */
  autoCorrelate(signal, maxLag) {
    const n = signal.length;
    const result = new Float32Array(maxLag);
    
    let mean = 0;
    for (let i = 0; i < n; i++) mean += signal[i];
    mean /= n;
    
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const diff = signal[i] - mean;
      variance += diff * diff;
    }
    
    if (variance === 0) return result;
    
    for (let lag = 0; lag < maxLag && lag < n; lag++) {
      let sum = 0;
      const count = n - lag;
      
      for (let i = 0; i < count; i++) {
        sum += (signal[i] - mean) * (signal[i + lag] - mean);
      }
      
      result[lag] = sum / variance;
    }
    
    return result;
  }

  // ============================================================
  // 🆕 v15.0: SMART KEY DETECTION
  // ============================================================
  
  /**
   * Smart key detection using musical structure
   * Replaces old detectKey logic
   */
  detectKeyStructural(timeline, feats) {
    const { bassPc, chroma, hop, sr } = feats;
    
    // 1. Find where music starts
    const musicStartFrame = this.detectMusicStart(bassPc, chroma);
    const musicStartTime = (musicStartFrame * hop) / sr;
    
    console.log(`🎵 Structural analysis: music starts at ${musicStartTime.toFixed(1)}s`);
    
    // 2. Filter to musical section
    const musicalChords = timeline.filter(ch => ch.t >= musicStartTime);
    
    if (musicalChords.length === 0) {
      console.warn('⚠️ No chords in musical section');
      return this.detectKeyFallback(timeline);
    }
    
    // 3. Collect key votes
    const keyVotes = {};
    
    // FIRST CHORD = strong tonic candidate
    const firstRoot = this.parseRootPc(musicalChords[0].label);
    if (firstRoot >= 0) {
      const maj = this.NOTES_SHARP[firstRoot];
      const min = maj + 'm';
      keyVotes[maj] = (keyVotes[maj] || 0) + 150;
      keyVotes[min] = (keyVotes[min] || 0) + 150;
      console.log(`  First chord: ${musicalChords[0].label} → ${maj}/${min}`);
    }
    
    // LAST CHORD = likely tonic
    const lastRoot = this.parseRootPc(musicalChords[musicalChords.length - 1].label);
    if (lastRoot >= 0) {
      const maj = this.NOTES_SHARP[lastRoot];
      const min = maj + 'm';
      keyVotes[maj] = (keyVotes[maj] || 0) + 100;
      keyVotes[min] = (keyVotes[min] || 0) + 100;
      console.log(`  Last chord: ${musicalChords[musicalChords.length-1].label} → ${maj}/${min}`);
    }
    
    // 4. Score each candidate
    const candidates = Object.keys(keyVotes).map(keyStr => {
      const isMinor = keyStr.endsWith('m');
      const rootStr = isMinor ? keyStr.slice(0, -1) : keyStr;
      const root = this.NOTES_SHARP.indexOf(rootStr);
      
      if (root < 0) return null;
      
      const key = { root, minor: isMinor };
      const diatonicScore = this.scoreDiatonic(musicalChords, key);
      
      return {
        keyStr,
        root,
        minor: isMinor,
        score: (keyVotes[keyStr] || 0) + diatonicScore
      };
    }).filter(c => c);
    
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      const winner = candidates[0];
      console.log(`🏆 Winner: ${winner.keyStr} (${winner.score})`);
      console.log(`  Top 3: ${candidates.slice(0,3).map(c => `${c.keyStr}:${c.score}`).join(', ')}`);
      return { root: winner.root, minor: winner.minor };
    }
    
    return this.detectKeyFallback(timeline);
  }
  
  /**
   * Parse root PC from label
   */
  parseRootPc(label) {
    const m = label?.match?.(/^([A-G](?:#|b)?)/);
    if (!m) return -1;
    return this.NOTES_SHARP.indexOf(m[1].replace('b', '#'));
  }
  
  /**
   * Score key by diatonic fitness
   */
  scoreDiatonic(timeline, key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(i => this.toPc(key.root + i));
    
    let score = 0;
    for (const ch of timeline) {
      const root = this.parseRootPc(ch.label);
      if (root >= 0 && diatonic.includes(root)) score += 10;
    }
    return score;
  }
  
  /**
   * Fallback to simple histogram
   */
  detectKeyFallback(timeline) {
    const hist = new Array(12).fill(0);
    for (const ch of timeline) {
      const root = this.parseRootPc(ch.label);
      if (root >= 0) hist[root]++;
    }
    
    let maxIdx = 0;
    for (let i = 1; i < 12; i++) {
      if (hist[i] > hist[maxIdx]) maxIdx = i;
    }
    
    const minorPc = this.toPc(maxIdx + 3);
    const majorPc = this.toPc(maxIdx + 4);
    const minor = hist[minorPc] > hist[majorPc];
    
    return { root: maxIdx, minor };
  }


  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      validationMultiplier: options.validationMultiplier || 1.0,
      channelData: options.channelData || null,
      sampleRate: options.sampleRate || null,
      progressCallback: options.progressCallback || null
    };

    const audioData = this.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    
    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'extracting', progress: 0.1 });
    }
    
    const feats = this.extractFeatures(audioData);
    
    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });
    }
    
    // 🆕 v15.0: Get initial chords with NEUTRAL key (C major = no bias)
    // This prevents wrong key from biasing chord detection
    const neutralKey = { root: 0, minor: false, confidence: 0.5 }; // C major
    console.log('🎯 v15.0: Using neutral key for preliminary detection');
    
    let preliminaryTimeline = this.chordTrackingHMMHybrid(feats, neutralKey, opts.bassMultiplier, false);
    
    console.log(`🎵 Preliminary: ${preliminaryTimeline.length} chords detected`);
    
    // 🆕 v15.0: NOW use structural analysis on unbiased chords
    let key = this.detectKeyStructural(preliminaryTimeline, feats);
    
    // Get confidence from spectral analysis
    const spectralKey = this.detectKeyEnhanced(feats, audioData.duration);
    key.confidence = spectralKey.confidence;
    
    console.log(`🏆 Structural key: ${this.NOTES_SHARP[key.root]}${key.minor ? 'm' : ''} (confidence: ${key.confidence})`);
    
    if (opts.progressCallback) {
      opts.progressCallback({ 
        stage: 'key_detected', 
        progress: 0.4,
        key: this.NOTES_SHARP[key.root] + (key.minor ? 'm' : ''),
        confidence: key.confidence
      });
    }
    
    const useFullHMM = key.confidence > 0.80;
    
    if (opts.progressCallback) {
      opts.progressCallback({ 
        stage: useFullHMM ? 'analyzing_full' : 'analyzing_simple', 
        progress: 0.5 
      });
    }
    
    // Re-detect chords with correct key
    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, useFullHMM);
    
    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'refining', progress: 0.7 });
    }
    
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    
    // 🔧 FIX: Better key validation
    const validatedKey = this.validateKeyFromChords(timeline, key, feats);
    
    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    }
    
    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'decorating', progress: 0.8 });
    }
    
    timeline = this.enforceEarlyDiatonic(timeline, key, feats, audioData.bpm);
    timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier);
    timeline = this.adjustMinorMajors(timeline, feats, key);
    timeline = this.addInversionsUltimate(timeline, feats, opts.bassMultiplier);
    timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
    timeline = this.classifyOrnaments(timeline, audioData.bpm, feats);
    timeline = this.analyzeModalContext(timeline, key);
    
    const tonic = this.detectTonicMusically(timeline, key, audioData.duration);
    
    // 🔧 FIX 1: Lower threshold from 95% to 75%
    const tonicThreshold = opts.tonicRerunThreshold !== undefined ? opts.tonicRerunThreshold : 75;
    
    if (tonic.root !== key.root && tonic.confidence >= tonicThreshold) {
      key.root = tonic.root;
      
      if (opts.progressCallback) {
        opts.progressCallback({ stage: 'correcting_key', progress: 0.85 });
      }
      
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timeline = this.enforceEarlyDiatonic(timeline, key, feats, audioData.bpm);
      timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier);
      timeline = this.adjustMinorMajors(timeline, feats, key);
      timeline = this.addInversionsUltimate(timeline, feats, opts.bassMultiplier);
      timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
      timeline = this.classifyOrnaments(timeline, audioData.bpm, feats);
      timeline = this.analyzeModalContext(timeline, key);
    }
    
    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'complete', progress: 1.0 });
    }
    
    const stats = {
      totalChords: timeline.length,
      structural: timeline.filter(e => e.ornamentType === 'structural').length,
      ornaments: timeline.filter(e => e.ornamentType !== 'structural').length,
      secondaryDominants: timeline.filter(e => e.modalContext === 'secondary_dominant').length,
      modalBorrowings: timeline.filter(e => e.modalContext && e.modalContext !== 'secondary_dominant').length,
      inversions: timeline.filter(e => e.label.includes('/')).length,
      extensions: timeline.filter(e => /[679]|11|13|sus|dim|aug/.test(e.label)).length,
      modulations: 0
    };
    
    return {
      chords: timeline,
      key: key,
      tonic: tonic,
      bpm: audioData.bpm,
      duration: audioData.duration,
      stats: stats,
      mode: this.detectMode(key)
    };
  }

  detectMode(key) {
    return key.minor ? 'Natural Minor (Aeolian)' : 'Major (Ionian)';
  }

  processAudio(audioBuffer, channelData, sampleRate) {
    let mono;
    if (channelData && sampleRate) {
      mono = channelData;
      const sr0 = sampleRate, sr = 22050;
      const x = this.resampleLinear(mono, sr0, sr);
      const bpm = this.estimateTempo(x, sr);
      return { x, sr, bpm, duration: x.length / sr };
    }
    const channels = audioBuffer.numberOfChannels;
    mono = channels === 1 ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate, sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);
    return { x, sr, bpm, duration: x.length / sr };
  }

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr), frames = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      frames.push(e);
    }
    const minLag = Math.floor(0.3 / (hop / sr)), maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const bpm = 60 / (bestLag * (hop / sr));
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  extractFeatures(audioData) {
    const { x, sr } = audioData, hop = Math.floor(0.10 * sr), win = 4096;
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) frames.push(x.subarray(s, s + win));
    const chroma = [], bassPc = [], frameE = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i], windowed = new Float32Array(win);
      for (let k = 0; k < win; k++) windowed[k] = frame[k] * hann[k];
      let en = 0;
      for (let k = 0; k < win; k++) en += windowed[k] * windowed[k];
      frameE.push(en);
      const { mags, N } = this.fft(windowed), c = new Float32Array(12);
      for (let b = 1; b < mags.length; b++) {
        const f = b * sr / N;
        if (f < 80 || f > 5000) continue;
        const midi = 69 + 12 * Math.log2(f / 440), pc = this.toPc(Math.round(midi));
        c[pc] += mags[b];
      }
      const sum = c.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;
      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }
    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) {
      const v = bassPc[i];
      if (v < 0 || frameE[i] < thrE || (bassPc[i - 1] !== v && bassPc[i + 1] !== v)) bassPc[i] = -1;
    }
    return { chroma, bassPc, frameE, hop, sr };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250, magsLP = new Float32Array(mags.length);
    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) magsLP[b] = mags[b];
    }
    const win = N, yLP = new Float32Array(win);
    for (let b = 1; b < magsLP.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < win; n++) yLP[n] += magsLP[b] * Math.cos(omega * n);
      }
    }
    const f0minLag = Math.floor(sr / fmax), f0maxLag = Math.floor(sr / Math.max(1, fmin));
    let bestLag = -1, bestR = -1;
    const mean = yLP.reduce((s, v) => s + v, 0) / win;
    let denom = 0;
    for (let n = 0; n < win; n++) { const d = yLP[n] - mean; denom += d * d; }
    denom = Math.max(denom, 1e-9);
    for (let lag = f0minLag; lag <= f0maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < win - lag; n++) { const a = yLP[n] - mean, b = yLP[n + lag] - mean; r += a * b; }
      r /= denom;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    if (bestLag > 0) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        const midiF0 = 69 + 12 * Math.log2(f0 / 440);
        return this.toPc(Math.round(midiF0));
      }
    }
    return -1;
  }

  fft(input) {
    let n = input.length, N = 1;
    while (N < n) N <<= 1;
    const re = new Float32Array(N), im = new Float32Array(N);
    re.set(input);
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      let m = N >> 1;
      while (m >= 1 && j >= m) { j -= m; m >>= 1; }
      j += m;
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wlr = Math.cos(ang), wli = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < (len >> 1); k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi;
          const vi = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + (len >> 1)] = ur - vr; im[i + k + (len >> 1)] = ui - vi;
          const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr;
        }
      }
    }
    const mags = new Float32Array(N >> 1);
    for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
    return { mags, N };
  }

  detectTonicFromBass(feats) {
    const { bassPc, frameE } = feats;
    const bassHist = new Array(12).fill(0);
    const threshold = this.percentile(frameE, 40);
    
    for (let i = 0; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        bassHist[bp] += 1.0;
      }
    }
    
    let maxCount = 0;
    let tonicPc = 0;
    
    for (let pc = 0; pc < 12; pc++) {
      if (bassHist[pc] > maxCount) {
        maxCount = bassHist[pc];
        tonicPc = pc;
      }
    }
    
    const totalBass = bassHist.reduce((a, b) => a + b, 0);
    const confidence = totalBass > 0 ? (maxCount / totalBass) : 0;
    
    return {
      root: tonicPc,
      confidence: confidence
    };
  }

  detectKeyEnhanced(feats, duration) {
    const { chroma } = feats;
    const bassTonic = this.detectTonicFromBass(feats);
    
    const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    const aggWeighted = new Array(12).fill(0);
    
    for (let i = 0; i < chroma.length; i++) {
      const position = i / chroma.length;
      let weight = 1.0;
      
      if (position < 0.10) weight = 5.0;
      else if (position > 0.90) weight = 3.0;
      else weight = 1.0;
      
      for (let p = 0; p < 12; p++) {
        aggWeighted[p] += chroma[i][p] * weight;
      }
    }
    
    const sumW = aggWeighted.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) aggWeighted[p] /= sumW;
    
    let candidateRoots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    
    if (bassTonic.confidence > 0.40) {
      candidateRoots = [bassTonic.root];
    } else if (bassTonic.confidence > 0.25) {
      candidateRoots = [
        bassTonic.root,
        this.toPc(bassTonic.root + 7),
        this.toPc(bassTonic.root - 7)
      ];
    }
    
    let best = { score: -Infinity, root: 0, minor: false };
    
    for (const r of candidateRoots) {
      let scoreMaj = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += aggWeighted[this.toPc(r + i)] * KS_MAJOR[i];
      }
      
      let scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        scoreMin += aggWeighted[this.toPc(r + i)] * KS_MINOR[i];
      }
      
      if (scoreMaj > best.score) {
        best = { score: scoreMaj, root: r, minor: false };
      }
      
      if (scoreMin > best.score) {
        best = { score: scoreMin, root: r, minor: true };
      }
    }
    
    return {
      root: best.root,
      minor: best.minor,
      confidence: Math.min(1.0, best.score / 10)
    };
  }

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode = true, chromaticMode = false) {
    const { chroma, bassPc, hop, sr, frameE } = feats;
    
    const candidates = [];
    
    // 🆕 v15.0.2: Chromatic mode = all 12 notes, no key bias
    if (chromaticMode) {
      console.log('🎵 HMM: Chromatic mode (all 12 chromatic notes)');
      for (let r = 0; r < 12; r++) {
        candidates.push({ root: r, label: this.NOTES_SHARP[r], type: 'major' });
        candidates.push({ root: r, label: this.NOTES_SHARP[r] + 'm', type: 'minor' });
      }
    } else {
      // Normal diatonic mode
      const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
      const diatonicPcs = scale.map(s => this.toPc(key.root + s));
      
      for (const r of diatonicPcs) {
        candidates.push({ root: r, label: this.NOTES_SHARP[r], type: 'major' });
        candidates.push({ root: r, label: this.NOTES_SHARP[r] + 'm', type: 'minor' });
      }
    }
    
    const maskVec = (root, intervals) => {
      const v = new Array(12).fill(0);
      for (const iv of intervals) {
        v[this.toPc(root + iv)] = 1;
      }
      return v;
    };
    
    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const norm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0)) || 1;
    const cosineSim = (a, b) => dot(a, b) / (norm(a) * norm(b));
    
    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      
      const intervals = cand.type === 'minor' ? [0, 3, 7] : [0, 4, 7];
      const mask = maskVec(cand.root, intervals);
      
      let score = cosineSim([...c], mask);
      
      if (bassPc[i] >= 0 && cand.root === bassPc[i]) {
        score += 0.15 * bassMultiplier;
      }
      
      if (frameE[i] < this.percentile(frameE, 30)) {
        score -= 0.10;
      }
      
      return score;
    };
    
    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0;
      
      const dist = Math.min((b.root - a.root + 12) % 12, (a.root - b.root + 12) % 12);
      return 0.6 + 0.1 * dist + (a.type === b.type ? 0.0 : 0.05);
    };
    
    const N = candidates.length;
    const M = chroma.length;
    const dp = new Array(N).fill(0);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    
    for (let s = 0; s < N; s++) {
      dp[s] = emitScore(0, candidates[s]);
    }
    
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      
      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestJ = -1;
        
        for (let j = 0; j < N; j++) {
          const val = dp[j] - transitionCost(candidates[j], candidates[s]);
          if (val > bestVal) {
            bestVal = val;
            bestJ = j;
          }
        }
        
        newdp[s] = bestVal + emitScore(i, candidates[s]);
        backptr[i][s] = bestJ;
      }
      
      for (let s = 0; s < N; s++) {
        dp[s] = newdp[s];
      }
    }
    
    let bestS = 0;
    let bestVal = -Infinity;
    for (let s = 0; s < N; s++) {
      if (dp[s] > bestVal) {
        bestVal = dp[s];
        bestS = s;
      }
    }
    
    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) {
      states[i - 1] = backptr[i][states[i]];
    }
    
    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0];
    let start = 0;
    
    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        timeline.push({
          t: start * secPerHop,
          label: candidates[cur].label,
          fi: start
        });
        cur = states[i];
        start = i;
      }
    }
    
    timeline.push({
      t: start * secPerHop,
      label: candidates[cur].label,
      fi: start
    });
    
    return timeline;
  }

  // 🔧 FIX 2 & 3: Enhanced validation with veto logic and stronger first chord
  validateKeyFromChords(timeline, currentKey, feats) {
    if (!timeline || timeline.length < 3) {
      return currentKey;
    }
    
    const chordRoots = [];
    timeline.forEach(chord => {
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        const isMinor = /^[A-G](#|b)?m(?!aj)/.test(chord.label);
        const isDim = /dim/.test(chord.label);
        chordRoots.push({ root, isMinor, isDim, label: chord.label });
      }
    });
    
    if (chordRoots.length === 0) {
      return currentKey;
    }
    
    const candidates = [];
    
    for (let keyRoot = 0; keyRoot < 12; keyRoot++) {
      for (let keyMinor of [false, true]) {
        const scale = keyMinor ? this.MINOR_SCALE : this.MAJOR_SCALE;
        const qualities = keyMinor ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
        
        const diatonicChords = scale.map((degree, i) => ({
          root: this.toPc(keyRoot + degree),
          quality: qualities[i]
        }));
        
        // 🔧 FIX 3: Universal veto for chromatic contradictions
        let hasContradiction = false;
        
        // Build scale notes for this candidate key
        const scaleNotes = scale.map(degree => this.toPc(keyRoot + degree));
        
        for (const songChord of chordRoots) {
          if (/sus/.test(songChord.label)) continue;
          
          const chordRoot = songChord.root;
          
          // Check if chord root is 1 semitone away from ANY scale note
          for (const scaleNote of scaleNotes) {
            const diff = Math.abs(chordRoot - scaleNote);
            
            // 1 semitone away = chromatic contradiction!
            if (diff === 1 || diff === 11) {
              hasContradiction = true;
              break;
            }
          }
          
          if (hasContradiction) break;
        }
        
        if (hasContradiction) continue;
        
        let matchCount = 0;
        let totalChords = 0;
        
        for (const songChord of chordRoots) {
          totalChords++;
          
          if (/sus/.test(songChord.label)) {
            matchCount++;
            continue;
          }
          
          const found = diatonicChords.some(dc => {
            if (dc.root !== songChord.root) return false;
            
            if (songChord.isDim) return dc.quality === 'dim';
            if (songChord.isMinor) return dc.quality === 'm';
            return dc.quality === '';
          });
          
          if (found) matchCount++;
        }
        
        if (matchCount >= totalChords * 0.70) {
          candidates.push({
            root: keyRoot,
            minor: keyMinor,
            score: matchCount / totalChords * 10
          });
        }
      }
    }
    
    if (candidates.length === 0) {
      return currentKey;
    }
    
    if (candidates.length === 1) {
      return { root: candidates[0].root, minor: candidates[0].minor, confidence: 0.95 };
    }
    
    // Check V→I
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      const currRoot = this.parseRoot(curr.label);
      const nextRoot = this.parseRoot(next.label);
      
      if (currRoot >= 0 && nextRoot >= 0) {
        const interval = this.toPc(nextRoot - currRoot);
        
        if (interval === 5 || interval === 7) {
          for (const cand of candidates) {
            if (nextRoot === cand.root) {
              cand.score += 10.0;
            }
          }
        }
      }
    }
    
    // Check IV→V→I
    for (let i = 0; i < timeline.length - 2; i++) {
      const chord1 = this.parseRoot(timeline[i].label);
      const chord2 = this.parseRoot(timeline[i + 1].label);
      const chord3 = this.parseRoot(timeline[i + 2].label);
      
      if (chord1 >= 0 && chord2 >= 0 && chord3 >= 0) {
        for (const cand of candidates) {
          const scale = cand.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
          const IV = this.toPc(cand.root + scale[3]);
          const V = this.toPc(cand.root + scale[4]);
          const I = cand.root;
          
          if (chord1 === IV && chord2 === V && chord3 === I) {
            cand.score += 15.0;
          }
        }
      }
    }
    
    // 🔧 FIX 2: MASSIVE first chord bonus + listen to third!
    const firstChord = this.parseRoot(timeline[0].label);
    const firstChordLabel = timeline[0].label;
    const firstIsMinor = /m(?!aj)/.test(firstChordLabel);
    
    if (firstChord >= 0) {
      for (const cand of candidates) {
        if (firstChord === cand.root) {
          cand.score += 50.0;  // Was 5.0!
          
          // ✅ KEY INSIGHT: Listen to the third!
          // If first chord is minor, key is probably minor
          if (firstIsMinor && cand.minor) {
            cand.score += 30.0;
          }
          
          // If first chord is major, key is probably major
          if (!firstIsMinor && !cand.minor) {
            cand.score += 30.0;
          }
        }
      }
    }
    
    // Last chord bonus
    const lastChord = this.parseRoot(timeline[timeline.length - 1].label);
    if (lastChord >= 0) {
      for (const cand of candidates) {
        if (lastChord === cand.root) {
          cand.score += 10.0;
        }
      }
    }
    
    let best = candidates[0];
    for (const cand of candidates) {
      if (cand.score > best.score) {
        best = cand;
      }
    }
    
    return {
      root: best.root,
      minor: best.minor,
      confidence: Math.min(0.99, 0.7 + best.score / 50)
    };
  }

  detectTonicMusically(timeline, key, duration) {
    if (timeline.length < 3) {
      return { root: key.root, label: this.NOTES_SHARP[key.root] + (key.minor ? 'm' : ''), confidence: 50 };
    }
    
    const candidates = {};
    let totalDuration = 0;
    
    timeline.forEach(chord => {
      const root = this.parseRoot(chord.label);
      if (root < 0) return;
      const dur = this.getChordDuration(chord, timeline, duration);
      totalDuration += dur;
      if (!candidates[root]) {
        candidates[root] = { duration: 0, count: 0, openingScore: 0, closingScore: 0, cadenceScore: 0, finalScore: 0 };
      }
      candidates[root].duration += dur;
      candidates[root].count++;
    });
    
    const openingChords = timeline.slice(0, Math.min(3, timeline.length));
    openingChords.forEach((chord, idx) => {
      const root = this.parseRoot(chord.label);
      if (root >= 0 && candidates[root]) {
        const weight = idx === 0 ? 50 : (3 - idx) * 5;
        candidates[root].openingScore += weight;
      }
    });
    
    const closingChords = timeline.slice(Math.max(0, timeline.length - 3));
    closingChords.forEach((chord, idx) => {
      const root = this.parseRoot(chord.label);
      if (root >= 0 && candidates[root]) candidates[root].closingScore += (idx + 1) * 10;
    });
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i], next = timeline[i + 1];
      const currRoot = this.parseRoot(curr.label), nextRoot = this.parseRoot(next.label);
      if (currRoot < 0 || nextRoot < 0) continue;
      const interval = this.toPc(nextRoot - currRoot);
      if (interval === 5 || interval === 7) {
        const dur = this.getChordDuration(next, timeline, duration);
        candidates[nextRoot].cadenceScore += 5.0 * dur;
      }
    }
    
    Object.keys(candidates).forEach(root => {
      const cand = candidates[root];
      cand.finalScore = (cand.duration / totalDuration) * 40 + cand.openingScore + cand.closingScore + cand.cadenceScore;
    });
    
    let tonicRoot = key.root, maxScore = 0;
    Object.entries(candidates).forEach(([root, cand]) => {
      if (cand.finalScore > maxScore) {
        maxScore = cand.finalScore;
        tonicRoot = parseInt(root);
      }
    });
    
    const confidence = Math.min(100, maxScore);
    const label = this.NOTES_SHARP[tonicRoot] + (key.minor ? 'm' : '');
    return { root: tonicRoot, label, confidence };
  }

  getChordDuration(chord, timeline, totalDuration) {
    const idx = timeline.indexOf(chord);
    if (idx < 0) return 0.5;
    const next = timeline[idx + 1];
    return next ? (next.t - chord.t) : Math.max(0.5, totalDuration - chord.t);
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.45 * spb);
    const out = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      const b = timeline[i + 1];
      const dur = (b ? b.t : a.t + 4 * spb) - a.t;
      
      if (dur < minDur && out.length) {
        const fiA = a.fi;
        const fiB = b ? b.fi : fiA + 1;
        const bpA = feats.bassPc[fiA] ?? -1;
        const bpB = feats.bassPc[Math.min(feats.bassPc.length - 1, fiB)] ?? -1;
        
        if (!(bpA >= 0 && bpB >= 0 && bpA !== bpB)) {
          const prev = out[out.length - 1];
          const r = this.parseRoot(a.label);
          const pr = this.parseRoot(prev.label);
          
          if (!this.inKey(r, key.root, key.minor) || this.inKey(pr, key.root, key.minor)) {
            continue;
          }
        }
      }
      
      out.push(a);
    }
    
    const snapped = [];
    for (const ev of out) {
      const q = Math.max(0, Math.round(ev.t / spb) * spb);
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: q, label: ev.label, fi: ev.fi });
      }
    }
    
    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline || !timeline.length) return timeline;
    
    const spb = 60 / (bpm || 120);
    const earlyWindow = Math.max(3.5, 2 * spb);
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    
    const qualities = key.minor ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    
    const getCorrectQuality = (pc) => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === this.toPc(pc)) return qualities[i];
      }
      return '';
    };
    
    const snapToDiatonic = (pc) => {
      let best = diatonicPcs[0], bestD = 99;
      for (const d of diatonicPcs) {
        const dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12);
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
      return best;
    };
    
    const out = [];
    for (const ev of timeline) {
      let label = ev.label;
      
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        const isIn = r >= 0 && this.inKey(r, key.root, key.minor);
        
        if (!isIn) {
          const bp = feats.bassPc[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          const veryEarly = ev.t < Math.min(2.0, spb * 1.5);
          if (veryEarly) newRoot = key.root;
          const q = getCorrectQuality(newRoot);
          label = this.NOTES_SHARP[newRoot] + q;
        } else {
          const q = getCorrectQuality(r);
          label = this.NOTES_SHARP[r] + q;
        }
      }
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));
    
    const mul = extensionMul;
    const out = [];
    
    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) {
        out.push(ev);
        continue;
      }
      
      const baseTriadMinor = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|11|13|6|m7b5|alt|b9|#9|b5|#5)$/, '');
      if (baseTriadMinor) base += 'm';
      
      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      
      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) {
          avg[p] += c[p] || 0;
        }
      }
      
      for (let p = 0; p < 12; p++) {
        avg[p] /= (i1 - i0 + 1);
      }
      
      const s = d => avg[this.toPc(root + d)] || 0;
      
      const sR = s(0), sM3 = s(4), s_m3 = s(3), s5 = s(7), s_b5 = s(6), s_sharp5 = s(8);
      const s2 = s(2), s4 = s(5), s_b7 = s(10), s7 = s(11), s6 = s(9);
      
      let label = base;
      
      const thirdStrong = baseTriadMinor ? (s_m3 > 0.13 * mul) : (sM3 > 0.13 * mul);
      const thirdWeak = !thirdStrong;
      const sus2Strong = s2 > 0.22 / mul && s2 > s4 * 0.9 && s5 > 0.10;
      const sus4Strong = s4 > 0.22 / mul && s4 > s2 * 0.9 && s5 > 0.10;
      
      if (!baseTriadMinor && thirdWeak) {
        if (sus4Strong) label = base.replace(/m$/, '') + 'sus4';
        else if (sus2Strong) label = base.replace(/m$/, '') + 'sus2';
      }
      
      const sixth6Strong = s6 > 0.18 / mul && s6 > s_b7 * 1.2;
      if (sixth6Strong && !/sus/.test(label) && (baseTriadMinor ? s_m3 : sM3) > 0.12 / mul) {
        label = base + '6';
      }
      
      const domContext = this.degreeOfChord(label, key) === 4;
      const majContext = !/m$/.test(label) && !/sus/.test(label);
      const b7Confident = s_b7 > 0.16 / mul && s_b7 > (baseTriadMinor ? s_m3 : sM3) * 0.7 && sR > 0.10 / mul;
      const maj7Confident = majContext && s7 > 0.20 / mul && s7 > s_b7 * 1.2 && (baseTriadMinor ? s_m3 : sM3) > 0.12 / mul;
      
      if (!/6$/.test(label)) {
        if (maj7Confident) {
          label = base.replace(/m$/, '') + 'maj7';
        } else if (!/sus/.test(label) && (domContext ? (s_b7 > 0.15 / mul) : b7Confident) && !/7$/.test(label) && !/maj7$/.test(label)) {
          label += '7';
        }
      }
      
      const dimTriad = (baseTriadMinor && s_b5 > 0.26 / mul && s5 < 0.12 * mul && s_m3 > 0.14 / mul) || (!baseTriadMinor && s_b5 > 0.30 / mul && s5 < 0.10 * mul && sM3 < 0.08 * mul);
      if (dimTriad) {
        label = (baseTriadMinor && s_b7 > 0.18 / mul) ? base.replace(/m$/, 'm7b5') : base.replace(/m$/, '') + 'dim';
      }
      
      const augTriad = !baseTriadMinor && s_sharp5 > 0.24 / mul && s5 < 0.10 * mul && sM3 > 0.12 / mul;
      if (augTriad) {
        label = base.replace(/m$/, '') + 'aug';
      }
      
      if (mode === 'jazz' || mode === 'pro') {
        const has7 = /7$/.test(label) || /maj7$/.test(label);
        const nineStrong = s2 > 0.25 / mul && sR > 0.10 / mul;
        
        if (has7 && nineStrong) {
          label = label.replace(/7$/, '9');
        } else if (!/sus/.test(label) && nineStrong && (baseTriadMinor ? s_m3 : sM3) > 0.10 / mul && !/maj7|7|9|add9/.test(label)) {
          label += 'add9';
        }
      }
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  adjustMinorMajors(timeline, feats, key) {
    if (!key.minor) return timeline;
    
    const out = [];
    for (const ev of timeline) {
      let label = ev.label;
      const r = this.parseRoot(label);
      
      if (r < 0 || /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label) || !/(^[A-G](?:#|b)?)(m)(?!aj)/.test(label)) {
        out.push(ev);
        continue;
      }
      
      const rel = this.toPc(r - key.root);
      
      if (!(rel === this.MINOR_SCALE[2] || rel === this.MINOR_SCALE[4] || rel === this.MINOR_SCALE[6])) {
        out.push(ev);
        continue;
      }
      
      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      
      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) {
          avg[p] += c[p] || 0;
        }
      }
      
      for (let p = 0; p < 12; p++) {
        avg[p] /= (i1 - i0 + 1);
      }
      
      const s = (d) => avg[this.toPc(r + d)] || 0;
      const M3 = s(4);
      const m3 = s(3);
      
      if (M3 > m3 * 1.25 && M3 > 0.08) {
        label = label.replace(/m(?!aj)/, '');
      }
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  addInversionsUltimate(timeline, feats, bassMultiplier) {
    const out = [];
    
    for (const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if (r < 0) {
        out.push(ev);
        continue;
      }
      
      const isMinor = /m(?!aj)/.test(ev.label);
      const isSus2 = /sus2/.test(ev.label);
      const isSus4 = /sus4/.test(ev.label);
      const has7 = /7/.test(ev.label);
      const hasMaj7 = /maj7/.test(ev.label);
      const has9 = /9/.test(ev.label) || /add9/.test(ev.label);
      const has6 = /6/.test(ev.label);
      
      let triad = isSus2 ? [0, 2, 7] : (isSus4 ? [0, 5, 7] : (isMinor ? [0, 3, 7] : [0, 4, 7]));
      if (has7 && !hasMaj7) triad.push(10);
      if (hasMaj7) triad.push(11);
      if (has9) triad.push(2);
      if (has6) triad.push(9);
      
      const bassPc = feats.bassPc[ev.fi] ?? -1;
      
      if (bassPc < 0 || bassPc === r) {
        out.push(ev);
        continue;
      }
      
      const rel = this.toPc(bassPc - r);
      const inChord = triad.includes(rel);
      
      if (inChord) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        const bassStrength = c[bassPc] || 0;
        const rootStrength = c[r] || 0;
        const bassIsStronger = bassStrength > rootStrength * 0.7;
        
        let stableCount = 0;
        for (let j = Math.max(0, ev.fi - 2); j <= Math.min(feats.bassPc.length - 1, ev.fi + 2); j++) {
          if (feats.bassPc[j] === bassPc) stableCount++;
        }
        
        if (bassStrength > 0.15 / Math.max(1, bassMultiplier * 0.9) && stableCount >= 3 && bassIsStronger) {
          const rootName = ev.label.match(/^([A-G](?:#|b)?)/)?.[1] || '';
          const suffix = ev.label.slice(rootName.length);
          out.push({ ...ev, label: rootName + suffix + '/' + this.NOTES_SHARP[bassPc] });
          continue;
        }
      }
      
      out.push(ev);
    }
    
    return out;
  }

  validateAndRefine(timeline, key, feats, valMultiplier) {
    const out = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const r = this.parseRoot(ev.label);
      
      if (r < 0) {
        out.push(ev);
        continue;
      }
      
      const c = feats.chroma[ev.fi] || new Float32Array(12);
      const sR = c[this.toPc(r)] || 0;
      const s5 = c[this.toPc(r + 7)] || 0;
      const sM3 = c[this.toPc(r + 4)] || 0;
      const sm3 = c[this.toPc(r + 3)] || 0;
      
      if (sR > 0.15 && s5 > 0.15 && sM3 < 0.08 && sm3 < 0.08 && /m/.test(ev.label)) {
        const base = ev.label.match(/^([A-G](?:#|b)?)/)?.[1] || '';
        out.push({ ...ev, label: base });
        continue;
      }
      
      out.push(ev);
    }
    
    return out;
  }

  classifyOrnaments(timeline, bpm, feats) {
    const spb = 60 / (bpm || 120);
    const out = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = i > 0 ? timeline[i - 1] : null;
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      const dur = next ? (next.t - ev.t) : spb;
      
      let ornamentType = 'structural';
      
      if (dur < 0.35 * spb && prev && next) {
        const rPrev = this.parseRoot(prev.label);
        const r = this.parseRoot(ev.label);
        const rNext = this.parseRoot(next.label);
        
        if (rPrev >= 0 && r >= 0 && rNext >= 0) {
          const d1 = Math.abs(r - rPrev);
          const d2 = Math.abs(rNext - r);
          if ((d1 <= 2 || d1 >= 10) && (d2 <= 2 || d2 >= 10)) {
            ornamentType = 'passing';
          }
        }
      }
      
      if (dur < 0.4 * spb && prev && next && prev.label === next.label) {
        ornamentType = 'neighbor';
      }
      
      if (prev) {
        const bassCur = feats.bassPc[ev.fi] ?? -1;
        const bassPrev = feats.bassPc[prev.fi] ?? -1;
        
        if (bassCur >= 0 && bassPrev >= 0 && bassCur === bassPrev) {
          const rCur = this.parseRoot(ev.label);
          const rPrev = this.parseRoot(prev.label);
          if (rCur >= 0 && rPrev >= 0 && rCur !== rPrev) {
            ornamentType = 'pedal';
          }
        }
      }
      
      out.push({ ...ev, ornamentType });
    }
    
    return out;
  }

  analyzeModalContext(timeline, key) {
    const out = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const r = this.parseRoot(ev.label);
      
      if (r < 0) {
        out.push({ ...ev, modalContext: null });
        continue;
      }
      
      const rel = this.toPc(r - key.root);
      let modalContext = null;
      
      if (/7$/.test(ev.label) && !/maj7/.test(ev.label)) {
        const targetRoot = this.toPc(r + 7);
        const nextChord = timeline[i + 1];
        
        if (nextChord) {
          const nextRoot = this.parseRoot(nextChord.label);
          if (nextRoot >= 0 && nextRoot === targetRoot && this.inKey(targetRoot, key.root, key.minor)) {
            modalContext = 'secondary_dominant';
          }
        }
      }
      
      if (!key.minor) {
        if (rel === 8) modalContext = 'borrowed_bVI';
        if (rel === 10) modalContext = 'borrowed_bVII';
        if (rel === 5 && /m/.test(ev.label)) modalContext = 'borrowed_iv';
        if (rel === 3) modalContext = 'borrowed_bIII';
      } else if (rel === 5 && !/m/.test(ev.label)) {
        modalContext = 'borrowed_IV_major';
      }
      
      if (rel === 1 && !/m/.test(ev.label)) {
        modalContext = 'neapolitan';
      }
      
      out.push({ ...ev, modalContext });
    }
    
    return out;
  }

  degreeOfChord(label, key) {
    const rootPc = this.parseRoot(label);
    if (rootPc < 0) return null;
    
    const rel = this.toPc(rootPc - key.root);
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    
    let bestDeg = null;
    let bestDist = 999;
    
    for (let d = 0; d < scale.length; d++) {
      const dist = Math.min((rel - scale[d] + 12) % 12, (scale[d] - rel + 12) % 12);
      if (dist < bestDist) {
        bestDist = dist;
        bestDeg = d;
      }
    }
    
    return bestDeg;
  }

  inKey(pc, keyRoot, minor) {
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const rel = this.toPc(pc - keyRoot);
    
    const diatonicPcs = scale.map(interval => this.toPc(keyRoot + interval));
    if (diatonicPcs.includes(this.toPc(pc))) return true;
    
    if (minor) {
      if (rel === 7) return true;
      if (rel === 11) return true;
    } else {
      if (rel === 2) return true;
      if (rel === 10) return true;
      if (rel === 8) return true;
    }
    
    return false;
  }

  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#|b)?/);
    if (!m) return -1;
    return this.NOTES_SHARP.indexOf((m[1] + (m[2] || '')).replace('b', '#'));
  }

  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.NOTES_SHARP[this.toPc(pc)]; }
  nameFlat(pc) { return this.NOTES_FLAT[this.toPc(pc)]; }

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) / 2;
    }
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    
    const ratio = fromRate / toRate;
    const newLength = Math.floor(samples.length / ratio);
    const resampled = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
      const t = srcIndex - srcIndexFloor;
      resampled[i] = samples[srcIndexFloor] * (1 - t) + samples[srcIndexCeil] * t;
    }
    
    return resampled;
  }

  percentile(arr, p) {
    const a = [...arr].filter(x => Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[Math.floor((p / 100) * (a.length - 1))];
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    return scale.map((degree, i) => {
      const pc = this.toPc(tonicPc + degree);
      return this.NOTES_SHARP[pc] + qualities[i];
    });
  }

  buildCircleOfFifths(key) {
    const keyName = this.NOTES_SHARP[key.root] + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(keyName.replace('m', ''), key.minor ? 'minor' : 'major');
    const functions = key.minor ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    return chords.map((label, i) => ({ label, function: functions[i] }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
