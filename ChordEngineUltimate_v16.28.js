/**
 * ChordEngine v16.28 - Balanced Detection
 * 
 * Fixes two issues:
 * 1. No chords at song start - now accepts clear pitch even without bass
 * 2. Too many chords mid-song - stricter change detection + longer minimums
 * 
 * Changes:
 * - findMusicStart: accepts chroma-only start (piano/guitar intros)
 * - Bass threshold: 0.25 (was 0.30) - helps detect weak bass
 * - Chord change: requires flux AND bass change (was OR)
 * - Min duration: 0.8s (was 0.6s)
 * - Chromatic: needs score > 70 AND duration >= 0.8s
 */

class ChordEngineUltimate {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    
    this._hannCache = {};
    
    // v16.28: Smart HPSS settings
    this.hpss = {
      mode: 'auto',      // 'auto' | 'always' | 'never'
      kernelSize: 15,
      maxFreq: 400,
      percussionThreshold: 1.5,  // CV threshold for detecting percussion
      _isPercussive: null        // Cached detection result
    };
  }

  async detect(audioBuffer, options = {}) {
    const opts = this.parseOptions(options);
    const timings = {};
    const t0 = this.now();

    console.log('🎵 ChordEngine v16.28 (Smart HPSS)');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    // v16.28: Detect if song has strong percussion (for smart HPSS)
    this.hpss._isPercussive = this.detectPercussionLevel(features);
    if (this.hpss.mode === 'auto') {
      console.log(`🥁 Percussion: ${this.hpss._isPercussive ? 'HIGH (HPSS enabled)' : 'LOW (HPSS skipped)'}`);
    }

    const musicStart = this.findMusicStart(features);
    console.log(`✅ Music starts at ${musicStart.time.toFixed(2)}s`);

    const tonicResult = this.detectTonicHybrid(features, musicStart.frame);
    console.log(`✅ Tonic: ${this.NOTES_SHARP[tonicResult.root]} (${tonicResult.confidence}%) [${tonicResult.method}]`);

    // ❗ מודליות (מז'ור/מינור) נקבעת אך ורק לפי ה־3 מעל הטוניקה
    const modeResult = this.detectModeFromThird(features, tonicResult.root, musicStart.frame);

    const key = {
      root: tonicResult.root,
      minor: modeResult.isMinor,
      // הביטחון הכללי הוא המינימום בין ביטחון הטוניקה לביטחון המוד
      confidence: Math.min(tonicResult.confidence, modeResult.confidence) / 100
    };
    console.log(`✅ Mode: ${key.minor ? 'MINOR' : 'MAJOR'} (${modeResult.confidence}%) [third_only]`);

    let timeline = this.buildChordsStableBass(features, key, musicStart.frame, audio.bpm);
    console.log(`🎸 Bass engine: ${timeline.length} chords`);
    
    // v16.28: Run HMM engine in parallel and compare
    const hmmTimeline = this.buildChordsHMM(features, key, musicStart.frame);
    console.log(`🎹 HMM engine: ${hmmTimeline.length} chords`);
    
    // Merge with consensus
    timeline = this.mergeEngines(timeline, hmmTimeline, features, key);
    console.log(`🤝 Consensus: ${timeline.length} chords`);

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    timeline = this.addExtensions(timeline, features, key, opts);
    timeline = this.finalizeTimeline(timeline, audio.bpm, features);

    // v16.28: Auto-detect "easy rock" songs and clean up
    const stats = this.buildStats(timeline, key);
    const isEasy = this.isEasyRockSong(stats, key);
    
    if (isEasy) {
      console.log(`🎸 v16.28: Easy rock song detected - enforcing diatonic`);
      timeline = this.enforceEasyDiatonic(timeline, key);
      
      // v16.28: Apply pattern memory for easy rock songs
      timeline = this.applyPatternMemory(timeline, key);
    }
    
    // v16.28: Always run outlier smoothing (removes isolated chromatic chords)
    timeline = this.smoothOutliers(timeline, key, this.getDiatonicInfo(key));

    timeline = timeline.filter(ev => 
      ev && ev.label && typeof ev.label === 'string' && ev.label.trim() && ev.fi != null
    );

    timings.total = this.now() - t0;
    console.log(`🎉 Final: ${timeline.length} chords in ${timings.total.toFixed(0)}ms`);

    return {
      chords: timeline,
      key,
      tonic: {
        root: tonicResult.root,
        label: this.NOTES_SHARP[tonicResult.root] + (key.minor ? 'm' : ''),
        confidence: tonicResult.confidence,
        method: tonicResult.method
      },
      mode: modeResult,
      musicStart: musicStart.time,
      bpm: audio.bpm,
      duration: audio.duration,
      stats: this.buildStats(timeline, key),
      timings
    };
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIO PROCESSING
  // ═══════════════════════════════════════════════════════════
  
  processAudio(audioBuffer) {
    let mono;
    if (audioBuffer.numberOfChannels === 1) {
      mono = audioBuffer.getChannelData(0);
    } else {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      const len = Math.min(left.length, right.length);
      mono = new Float32Array(len);
      for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    }

    const sr0 = audioBuffer.sampleRate || 44100;
    const sr = 22050;
    
    // v16.28: Clean signal before processing
    const cleaned = this.cleanSignal(mono, sr0);
    const x = this.resample(cleaned, sr0, sr);
    const bpm = this.estimateTempo(x, sr);

    return { x, sr, bpm, duration: x.length / sr };
  }

  // v16.28: Clean signal - pre-emphasis + noise gate + smoothing
  cleanSignal(x, sr) {
    const out = new Float32Array(x.length);

    // 1. Pre-emphasis (הדגשת תדרים גבוהים)
    let prev = 0;
    for (let i = 0; i < x.length; i++) {
      const y = x[i] - 0.97 * prev;
      prev = x[i];
      out[i] = y;
    }

    // 2. Noise gate (מסנן רעש חלש)
    const threshold = 1e-4;
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(out[i]) < threshold) out[i] = 0;
    }

    // 3. החלקה קלה (מסיר ספייקים)
    const smoothed = new Float32Array(out.length);
    smoothed[0] = out[0];
    for (let i = 1; i < out.length - 1; i++) {
      smoothed[i] = (out[i - 1] + out[i] + out[i + 1]) / 3;
    }
    smoothed[out.length - 1] = out[out.length - 1];

    return smoothed;
  }

  resample(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLen = Math.floor(samples.length / ratio);
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const t = srcIdx - i0;
      out[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
    return out;
  }

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const energy = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      energy.push(e);
    }
    if (energy.length < 4) return 120;

    const minLag = Math.floor(0.3 / (hop / sr));
    const maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < energy.length - lag; i++) r += energy[i] * energy[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    const bpm = 60 / (bestLag * hop / sr);
    return isFinite(bpm) ? Math.max(60, Math.min(200, Math.round(bpm))) : 120;
  }

  // ═══════════════════════════════════════════════════════════
  // FEATURE EXTRACTION
  // ═══════════════════════════════════════════════════════════
  
  extractFeatures(audio) {
    const { x, sr } = audio;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;

    if (!this._hannCache[win]) {
      const hann = new Float32Array(win);
      for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
      this._hannCache[win] = hann;
    }
    const hann = this._hannCache[win];

    const chroma = [];
    const bassRaw = [];
    const energy = [];

    for (let start = 0; start + win <= x.length; start += hop) {
      const frame = x.subarray(start, start + win);
      const windowed = new Float32Array(win);
      let frameEnergy = 0;
      
      for (let i = 0; i < win; i++) {
        windowed[i] = frame[i] * hann[i];
        frameEnergy += windowed[i] * windowed[i];
      }
      energy.push(frameEnergy);

      const { mags, N } = this.fft(windowed);

      // v16.28: Improved chroma with harmonic weighting
      const chromaFrame = new Float32Array(12);
      for (let bin = 1; bin < mags.length; bin++) {
        const freq = bin * sr / N;
        if (freq < 80 || freq > 5000) continue;
        
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = this.toPc(Math.round(midi));
        
        // v16.28: Weight by harmonic clarity
        // Lower harmonics (2nd, 3rd) get more weight than high harmonics
        const octave = Math.floor(midi / 12);
        const harmonicWeight = octave >= 3 && octave <= 6 ? 1.2 : // Sweet spot
                              octave < 3 ? 0.8 : // Too low (muddy)
                              0.7; // Too high (harsh)
        
        // Also weight by magnitude (louder = more confident)
        const magWeight = Math.sqrt(mags[bin]); // Square root to compress dynamic range
        
        chromaFrame[pc] += magWeight * harmonicWeight;
      }
      
      // Normalize
      const chromaSum = chromaFrame.reduce((a, b) => a + b, 0) || 1;
      for (let i = 0; i < 12; i++) chromaFrame[i] /= chromaSum;
      chroma.push(chromaFrame);

      bassRaw.push(this.detectBassNote(mags, sr, N));
    }

    const bass = [];
    for (let i = 0; i < bassRaw.length; i++) {
      const bp = bassRaw[i];
      if (bp < 0) { bass.push(-1); continue; }
      let stable = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(bassRaw.length - 1, i + 2); j++) {
        if (bassRaw[j] === bp) stable++;
      }
      bass.push(stable >= 2 ? bp : -1);
    }

    const globalChroma = new Float32Array(12);
    let totalE = 0;
    for (let i = 0; i < chroma.length; i++) {
      const w = energy[i];
      for (let p = 0; p < 12; p++) globalChroma[p] += chroma[i][p] * w;
      totalE += w;
    }
    if (totalE > 0) for (let p = 0; p < 12; p++) globalChroma[p] /= totalE;

    const sortedE = [...energy].sort((a, b) => a - b);
    const percentile = (p) => sortedE[Math.floor(p / 100 * (sortedE.length - 1))] || 0;

    // v16.28: Compute spectral flux with energy for better onset detection
    const flux = this.computeSpectralFlux(chroma, energy);
    const sortedFlux = [...flux].sort((a, b) => a - b);
    const fluxP80 = sortedFlux[Math.floor(0.80 * (sortedFlux.length - 1))] || 0;

    return {
      chroma, bass, bassRaw, energy, globalChroma,
      flux, fluxP80,
      hop, sr, numFrames: chroma.length,
      secPerFrame: hop / sr,
      energyP30: percentile(30),
      energyP50: percentile(50),
      energyP70: percentile(70),
      energyP80: percentile(80)
    };
  }

  // v16.28: Spectral flux - detects changes in chroma
  // Enhanced with energy-based onset detection
  computeSpectralFlux(chroma, energy = null) {
    const flux = new Float32Array(chroma.length);
    for (let i = 1; i < chroma.length; i++) {
      let sum = 0;
      const prev = chroma[i - 1];
      const curr = chroma[i];
      for (let p = 0; p < 12; p++) {
        const diff = curr[p] - prev[p];
        if (diff > 0) sum += diff; // רק עליות (onset detection)
      }
      
      // v16.28: Boost flux if there's also an energy spike (percussive onset)
      if (energy && i < energy.length) {
        const prevE = energy[i - 1] || 0;
        const currE = energy[i];
        if (currE > prevE * 1.5) {
          sum *= 1.3; // Boost flux on energy transients
        }
      }
      
      flux[i] = sum;
    }
    return flux;
  }

  // v16.28: Beat grid based on BPM
  getBeatGrid(duration, bpm) {
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const beats = [];
    for (let t = 0; t < duration; t += spb) {
      beats.push(t);
    }
    return beats;
  }

  // v16.28: Stricter chord change candidates - require both flux AND bass, or minimum gap
  getChordChangeCandidates(features, bpm, startFrame = 0) {
    const { secPerFrame, bass, flux, fluxP80, numFrames } = features;
    const beats = this.getBeatGrid(numFrames * secPerFrame, bpm);
    const beatFrames = beats.map(t => Math.round(t / secPerFrame));
    const candidates = new Set();

    // Always include start
    candidates.add(startFrame);
    
    // v16.28: Minimum gap between candidates (0.5 seconds)
    const minGapFrames = Math.round(0.5 / secPerFrame);
    let lastCandidate = startFrame;

    for (const bf of beatFrames) {
      for (let off = -1; off <= 1; off++) {
        const i = bf + off;
        if (i <= startFrame || i >= numFrames) continue;

        const strongFlux = flux[i] >= fluxP80;
        const bassChange = (bass[i] >= 0 && i > 0 && bass[i - 1] !== bass[i]);
        const enoughGap = (i - lastCandidate) >= minGapFrames;

        // v16.28: Stricter conditions:
        // 1. Both flux AND bass change (strong evidence), OR
        // 2. Bass change alone, but only if enough time passed
        if ((strongFlux && bassChange) || (bassChange && enoughGap)) {
          candidates.add(i);
          lastCandidate = i;
        }
      }
    }

    return [...candidates].sort((a, b) => a - b);
  }

  detectBassNote(mags, sr, N) {
    // v16.28: Smart HPSS - only apply if needed
    const shouldUseHPSS = this.shouldApplyHPSS();
    const cleanMags = shouldUseHPSS 
      ? this.applyHPSSToMags(mags, sr, N)
      : mags;
    
    const fmin = 40, fmax = 300;
    const yLP = new Float32Array(N);

    // Low-pass filter for bass frequencies
    for (let bin = 1; bin < cleanMags.length; bin++) {
      const freq = bin * sr / N;
      if (freq > fmax) break;
      if (freq >= fmin) {
        const omega = 2 * Math.PI * freq / sr;
        // Weight lower frequencies more
        const weight = freq < 150 ? 1.5 : 1.0;
        for (let n = 0; n < N; n++) yLP[n] += cleanMags[bin] * Math.cos(omega * n) * weight;
      }
    }

    const minLag = Math.floor(sr / fmax);
    const maxLag = Math.floor(sr / fmin);
    let bestLag = -1, bestR = 0;

    let mean = 0;
    for (let n = 0; n < N; n++) mean += yLP[n];
    mean /= N;

    let variance = 0;
    for (let n = 0; n < N; n++) variance += (yLP[n] - mean) ** 2;
    variance = variance || 1e-9;

    // Autocorrelation
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) r += (yLP[n] - mean) * (yLP[n + lag] - mean);
      r /= variance;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    // v16.28: Slightly lower threshold (was 0.30) - helps detect bass in intros
    if (bestLag > 0 && bestR > 0.25) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        return this.toPc(Math.round(69 + 12 * Math.log2(f0 / 440)));
      }
    }
    return -1;
  }

  // v16.28: Decide if HPSS should be applied
  shouldApplyHPSS() {
    if (this.hpss.mode === 'always') return true;
    if (this.hpss.mode === 'never') return false;
    // 'auto' - use cached percussion detection result
    return this.hpss._isPercussive === true;
  }

  // v16.28: Detect if song has strong percussion (drums/kicks)
  // Called once at the start, result is cached
  detectPercussionLevel(features) {
    const { energy, chroma } = features;
    
    // Sample frames across the song
    const sampleCount = Math.min(50, Math.floor(features.numFrames / 4));
    const step = Math.floor(features.numFrames / sampleCount);
    
    let percussiveFrames = 0;
    let totalSampled = 0;
    
    for (let i = step; i < features.numFrames - step; i += step) {
      totalSampled++;
      
      // Check for percussive characteristics:
      // 1. High energy variance between adjacent frames (transients)
      const prevEnergy = energy[i - 1] || 0;
      const currEnergy = energy[i];
      const nextEnergy = energy[i + 1] || 0;
      
      const energySpike = currEnergy > prevEnergy * 2 && currEnergy > nextEnergy * 1.5;
      
      // 2. Flat chroma (percussion has no clear pitch)
      const chromaFrame = chroma[i];
      let chromaMax = 0, chromaSum = 0;
      for (let p = 0; p < 12; p++) {
        chromaMax = Math.max(chromaMax, chromaFrame[p]);
        chromaSum += chromaFrame[p];
      }
      const chromaFlat = chromaMax < (chromaSum / 12) * 1.8; // No dominant pitch
      
      if (energySpike || chromaFlat) {
        percussiveFrames++;
      }
    }
    
    const percussiveRatio = totalSampled > 0 ? percussiveFrames / totalSampled : 0;
    
    // If more than 30% of frames show percussive characteristics → use HPSS
    return percussiveRatio > 0.30;
  }

  // v16.28: Apply HPSS (Harmonic-Percussive Separation) to magnitude spectrum
  // Removes percussive spikes (drums) that confuse bass detection
  applyHPSSToMags(mags, sr, N) {
    const maxBin = Math.floor(this.hpss.maxFreq * N / sr);
    const result = new Float32Array(mags.length);
    const halfKernel = Math.floor(this.hpss.kernelSize / 2);
    
    // Copy everything above maxFreq unchanged
    for (let i = maxBin; i < mags.length; i++) {
      result[i] = mags[i];
    }
    
    // Apply median filter only to bass frequencies
    // Median preserves harmonic content, smooths percussive spikes
    for (let bin = 0; bin < maxBin; bin++) {
      const values = [];
      for (let k = -halfKernel; k <= halfKernel; k++) {
        const idx = Math.max(0, Math.min(maxBin - 1, bin + k));
        values.push(mags[idx]);
      }
      result[bin] = this.medianValue(values);
    }
    
    return result;
  }

  // v16.28: Fast median calculation
  medianValue(arr) {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  fft(input) {
    let n = input.length, N = 1;
    while (N < n) N <<= 1;

    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);

    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) { j -= m; m >>= 1; }
      j += m;
    }

    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang), wli = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < len / 2; k++) {
          const uRe = re[i + k], uIm = im[i + k];
          const vRe = re[i + k + len/2] * wr - im[i + k + len/2] * wi;
          const vIm = re[i + k + len/2] * wi + im[i + k + len/2] * wr;
          re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
          re[i + k + len/2] = uRe - vRe; im[i + k + len/2] = uIm - vIm;
          const nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr; wr = nwr;
        }
      }
    }

    const mags = new Float32Array(N >> 1);
    for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
    return { mags, N };
  }

  // v16.28: Improved music start detection - doesn't require bass
  findMusicStart(features) {
    const { energy, bass, chroma, secPerFrame, energyP50 } = features;
    
    let musicFrame = 0;
    let stableCount = 0;
    
    for (let i = 0; i < energy.length; i++) {
      // v16.28: Lower energy threshold (was 1.0 * P50)
      const isHighEnergy = energy[i] >= energyP50 * 0.7;
      const hasBass = bass[i] >= 0;
      
      // v16.28: Check for clear pitch in chroma (musical content without bass)
      const c = chroma[i];
      let chromaMax = 0, chromaSum = 0;
      for (let p = 0; p < 12; p++) {
        chromaMax = Math.max(chromaMax, c[p]);
        chromaSum += c[p];
      }
      const hasClearPitch = chromaMax > (chromaSum / 12) * 2.0;
      
      // v16.28: Accept either bass OR clear pitch (not just bass)
      if (isHighEnergy && (hasBass || hasClearPitch)) {
        stableCount++;
        // v16.28: Only need 2 stable frames (was 3)
        if (stableCount >= 2) {
          musicFrame = Math.max(0, i - 1);
          break;
        }
      } else {
        stableCount = 0;
      }
    }
    
    const maxFrame = Math.floor(8.0 / secPerFrame);
    musicFrame = Math.min(musicFrame, maxFrame);
    
    return { frame: musicFrame, time: musicFrame * secPerFrame };
  }

  // ═══════════════════════════════════════════════════════════
  // TONIC DETECTION
  // ═══════════════════════════════════════════════════════════
  
  detectTonicHybrid(features, startFrame) {
    // 1. טוניקה ראשונית – רק מהבס והמהלכים (כולל התחלה/סיום וקאדנסים)
    const bassTonic = this.detectTonicFromBass(features, startFrame);

    // 2. KS מקומי – רק כדי לתת "רמז" אם הבס חלש
    const ksTonic = this.detectTonicKSFromFeatures(features, startFrame);

    console.log(`  Bass says: ${this.NOTES_SHARP[bassTonic.root]} (${bassTonic.confidence}%)`);
    console.log(`  KS says: ${this.NOTES_SHARP[ksTonic.root]} (${ksTonic.confidence}%)`);

    // 📌 מקרה 1: הבס חזק – סומכים עליו כמעט לגמרי
    if (bassTonic.confidence >= 75) {
      return {
        root: bassTonic.root,
        confidence: bassTonic.confidence,
        method: 'bass_strong'
      };
    }

    // 📌 מקרה 2: KS מסכים עם הבס – מחזקים את הביטחון אבל לא משנים טוניקה
    if (ksTonic.root === bassTonic.root) {
      const conf = Math.min(
        98,
        Math.max(bassTonic.confidence, ksTonic.confidence) + 5
      );
      return {
        root: bassTonic.root,
        confidence: conf,
        method: 'bass+KS_agree'
      };
    }

    // 📌 מקרה 3: KS חולק על הבס – הבס עדיין מחליט, KS רק משפיע על confidence
    const combined = bassTonic.confidence * 0.7 + ksTonic.confidence * 0.3;

    return {
      root: bassTonic.root,
      confidence: Math.round(combined),
      method: 'bass_main_KS_hint'
    };
  }

  // v16.28: getFirstStrongChord and detectTriadFromChroma removed - not used in new tonic detection

  detectTonicFromBass(features, startFrame) {
    const { bass, energy, energyP70, secPerFrame, numFrames } = features;
    
    const bassHist = new Array(12).fill(0);
    const openingEnd = Math.min(startFrame + Math.floor(15 / secPerFrame), numFrames);
    const closingStart = Math.max(0, numFrames - Math.floor(15 / secPerFrame));
    
    let totalWeight = 0;
    
    for (let i = startFrame; i < numFrames; i++) {
      const bp = bass[i];
      if (bp < 0 || energy[i] < energyP70 * 0.5) continue;
      
      let w = energy[i] / energyP70;
      if (i < openingEnd) w *= (i === startFrame) ? 5.0 : 2.0;
      if (i >= closingStart) w *= (i >= numFrames - 5) ? 3.0 : 1.5;
      
      bassHist[bp] += w;
      totalWeight += w;
    }
    
    const bassTimeline = this.buildBassTimeline(features, startFrame);
    const cadenceScores = this.analyzeCadences(bassTimeline);
    
    const candidates = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = (bassHist[tonic] / (totalWeight || 1)) * 50;
      score += (cadenceScores[tonic] || 0) * 2;
      score += this.countTransition(bassTimeline, this.toPc(tonic + 7), tonic) * 12;
      score += this.countTransition(bassTimeline, this.toPc(tonic + 5), tonic) * 8;
      candidates.push({ root: tonic, score });
    }
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1] || { score: 0 };
    const confidence = Math.min(98, Math.max(50, 50 + (best.score - second.score) * 1.5));
    
    return { root: best.root, confidence: Math.round(confidence) };
  }

  detectTonicKS(globalChroma) {
    let best = { root: 0, minor: false, score: -Infinity };
    
    for (let root = 0; root < 12; root++) {
      let scoreMaj = 0, scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        const pc = this.toPc(root + i);
        scoreMaj += globalChroma[pc] * this.KS_MAJOR[i];
        scoreMin += globalChroma[pc] * this.KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { root, minor: false, score: scoreMaj };
      if (scoreMin > best.score) best = { root, minor: true, score: scoreMin };
    }
    
    const confidence = Math.min(95, Math.max(40, best.score * 12));
    return { root: best.root, minor: best.minor, confidence: Math.round(confidence) };
  }

  // KS מקומי: מחשב פרופיל כרומה רק מאזורי אנרגיה גבוהים אחרי תחילת המוזיקה
  detectTonicKSFromFeatures(features, startFrame) {
    const { chroma, energy, energyP70 } = features;
    const local = new Float32Array(12);
    let totalW = 0;

    for (let i = startFrame; i < chroma.length; i++) {
      // רק פריימים עם מספיק אנרגיה – למנוע בלבול מאינטרו שקט או דרופים
      if (energy[i] < energyP70 * 0.6) continue;

      const w = energy[i];
      const frame = chroma[i];

      for (let p = 0; p < 12; p++) {
        local[p] += frame[p] * w;
      }
      totalW += w;
    }

    if (totalW > 0) {
      for (let p = 0; p < 12; p++) {
        local[p] /= totalW;
      }
    }

    // משתמשים באותה פונקציה קיימת של KS, רק על הפרופיל המקומי
    return this.detectTonicKS(local);
  }

  buildBassTimeline(features, startFrame) {
    const { bass, energy, energyP70 } = features;
    const timeline = [];
    let currentBass = -1, start = startFrame;
    
    for (let i = startFrame; i < bass.length; i++) {
      if (energy[i] < energyP70 * 0.4) continue;
      if (bass[i] >= 0 && bass[i] !== currentBass) {
        if (currentBass >= 0) timeline.push({ bass: currentBass, startFrame: start, endFrame: i });
        currentBass = bass[i];
        start = i;
      }
    }
    if (currentBass >= 0) timeline.push({ bass: currentBass, startFrame: start, endFrame: bass.length });
    
    return timeline;
  }

  analyzeCadences(bassTimeline) {
    const scores = new Array(12).fill(0);
    if (bassTimeline.length < 2) return scores;
    
    for (let i = 0; i < bassTimeline.length - 1; i++) {
      const curr = bassTimeline[i].bass;
      const next = bassTimeline[i + 1].bass;
      
      for (let tonic = 0; tonic < 12; tonic++) {
        if (curr === this.toPc(tonic + 7) && next === tonic) scores[tonic] += 10;
        if (curr === this.toPc(tonic + 5) && next === tonic) scores[tonic] += 8;
        if (curr === this.toPc(tonic + 11) && next === tonic) scores[tonic] += 7;
      }
      
      if (i < bassTimeline.length - 2) {
        const third = bassTimeline[i + 2].bass;
        for (let tonic = 0; tonic < 12; tonic++) {
          if (curr === this.toPc(tonic + 2) && next === this.toPc(tonic + 7) && third === tonic) scores[tonic] += 15;
        }
      }
    }
    return scores;
  }

  countTransition(timeline, from, to) {
    let count = 0;
    for (let i = 0; i < timeline.length - 1; i++) {
      if (timeline[i].bass === from && timeline[i + 1].bass === to) count++;
    }
    return count;
  }

  // v16.28: detectModeHybrid removed - using detectModeFromThird directly

  detectModeFromThird(features, tonic, startFrame) {
    const { chroma, energy, energyP70, energyP50 } = features;
    
    let m3Total = 0, M3Total = 0, totalWeight = 0;
    let m6Total = 0, M6Total = 0, m7Total = 0, M7Total = 0;
    
    const m3pc = this.toPc(tonic + 3);
    const M3pc = this.toPc(tonic + 4);
    const m6pc = this.toPc(tonic + 8);
    const M6pc = this.toPc(tonic + 9);
    const m7pc = this.toPc(tonic + 10);
    const M7pc = this.toPc(tonic + 11);
    
    for (let i = startFrame; i < chroma.length; i++) {
      if (energy[i] < energyP50 * 0.3) continue;
      
      const w = Math.min(3.0, energy[i] / energyP70);
      const c = chroma[i];
      const arpeggioBonus = c[tonic] > 0.15 ? 1.5 : 1.0;
      
      m3Total += c[m3pc] * w * arpeggioBonus;
      M3Total += c[M3pc] * w * arpeggioBonus;
      m6Total += c[m6pc] * w;
      M6Total += c[M6pc] * w;
      m7Total += c[m7pc] * w;
      M7Total += c[M7pc] * w;
      totalWeight += w;
    }
    
    if (totalWeight > 0) {
      m3Total /= totalWeight; M3Total /= totalWeight;
      m6Total /= totalWeight; M6Total /= totalWeight;
      m7Total /= totalWeight; M7Total /= totalWeight;
    }
    
    const thirdRatio = (m3Total + 0.0001) / (M3Total + 0.0001);
    const sixthRatio = (m6Total + 0.0001) / (M6Total + 0.0001);
    const seventhRatio = (m7Total + 0.0001) / (M7Total + 0.0001);
    
    let minorScore = 0, majorScore = 0;
    
    if (thirdRatio > 1.1) minorScore += 50 * Math.min(3, thirdRatio - 1);
    else if (thirdRatio < 0.9) majorScore += 50 * Math.min(3, 1 / thirdRatio - 1);
    
    if (sixthRatio > 1.15) minorScore += 20 * Math.min(2, sixthRatio - 1);
    else if (sixthRatio < 0.85) majorScore += 20 * Math.min(2, 1 / sixthRatio - 1);
    
    if (seventhRatio > 1.15) minorScore += 15 * Math.min(2, seventhRatio - 1);
    else if (seventhRatio < 0.85) majorScore += 15 * Math.min(2, 1 / seventhRatio - 1);
    
    if (m3Total > 0.12 && m3Total > M3Total) minorScore += 15;
    if (M3Total > 0.12 && M3Total > m3Total) majorScore += 15;
    
    const isMinor = minorScore > majorScore;
    const confidence = Math.min(100, Math.max(60, 60 + Math.abs(minorScore - majorScore)));
    
    return { isMinor, confidence: Math.round(confidence), m3: m3Total, M3: M3Total, ratio: thirdRatio };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎯 v16.28: STABLE BASS CHORD BUILDING - Bass is King
  // ═══════════════════════════════════════════════════════════
  
  buildChordsStableBass(features, key, startFrame, bpm) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);
    
    // v16.28: Increased minimum durations to reduce chord spam
    const MIN_DURATION_SEC = 0.8;           // Was 0.6
    const MIN_DURATION_NO_BASS_CHANGE = 1.6; // Was 1.2
    const CHROMA_CHANGE_THRESHOLD = 0.40;    // Was 0.35
    const SIGNIFICANT_THIRD_FIFTH_CHANGE = 0.30; // Was 0.25
    
    let currentBass = -1;
    let currentStart = startFrame;
    let currentChroma = null;
    
    const changeFrames = this.getChordChangeCandidates(features, bpm, startFrame);
    console.log(`🎵 v16.28: ${changeFrames.length} chord change candidates`);
    
    for (const i of changeFrames) {
      if (i >= bass.length) continue;
      
      const bp = bass[i];
      const hasEnergy = energy[i] >= energyP70 * 0.3;
      
      if (!hasEnergy || bp < 0) continue;
      
      if (currentBass === -1) {
        // First chord
        currentBass = bp;
        currentStart = i;
        currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        continue;
      }
      
      const durationSec = (i - currentStart) * secPerFrame;
      const bassChanged = (bp !== currentBass);
      
      let chromaChange = 0;
      let thirdFifthChange = 0;
      if (currentChroma) {
        chromaChange = this.calculateChromaDistance(currentChroma, chroma[i]);
        // v16.28: Check specifically for 3rd and 5th changes
        thirdFifthChange = this.calculateThirdFifthChange(currentChroma, chroma[i], currentBass);
      }
      
      // v16.28: Decision logic - Bass is King
      let shouldCommit = false;
      
      if (bassChanged) {
        // Bass changed clearly - commit if duration is reasonable
        shouldCommit = durationSec >= MIN_DURATION_SEC;
      } else {
        // Bass NOT changed - be very careful!
        // Only commit if:
        // 1. Long duration AND significant chroma change, OR
        // 2. Very significant change in 3rd/5th (real harmonic change)
        
        if (durationSec >= MIN_DURATION_NO_BASS_CHANGE && chromaChange >= CHROMA_CHANGE_THRESHOLD) {
          shouldCommit = true;
        } else if (thirdFifthChange >= SIGNIFICANT_THIRD_FIFTH_CHANGE && durationSec >= MIN_DURATION_SEC) {
          // Real harmonic change even without bass change
          shouldCommit = true;
          console.log(`  🎹 v16.28: Harmonic change detected (3rd/5th) without bass change at ${(i * secPerFrame).toFixed(2)}s`);
        }
        // Else: bass unchanged + short duration = probably noise, ignore
      }
      
      if (shouldCommit) {
        const chord = this.determineChordTheoryAware(
          chroma, currentStart, i, key, diatonic, currentBass, secPerFrame
        );
        
        if (chord) {
          timeline.push({
            t: currentStart * secPerFrame,
            fi: currentStart,
            label: chord.label,
            root: chord.root,
            type: chord.type,
            bassNote: currentBass,
            inScale: chord.inScale,
            confidence: chord.confidence,
            chordType: chord.chordType,
            duration: durationSec
          });
        }
        
        currentBass = bp;
        currentStart = i;
        currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
      }
      // Else: ignore - probably noise or passing tone
    }
    
    // Final segment
    if (currentBass >= 0 && chroma.length > currentStart) {
      const chord = this.determineChordTheoryAware(
        chroma, currentStart, chroma.length, key, diatonic, currentBass, secPerFrame
      );
      if (chord) {
        timeline.push({
          t: currentStart * secPerFrame,
          fi: currentStart,
          label: chord.label,
          root: chord.root,
          type: chord.type,
          bassNote: currentBass,
          inScale: chord.inScale,
          confidence: chord.confidence,
          chordType: chord.chordType
        });
      }
    }
    
    return timeline;
  }

  // v16.28: Check for significant change in 3rd and 5th intervals
  calculateThirdFifthChange(chroma1, chroma2, bassNote) {
    if (bassNote < 0) return 0;
    
    const m3 = this.toPc(bassNote + 3);
    const M3 = this.toPc(bassNote + 4);
    const p5 = this.toPc(bassNote + 7);
    
    const thirdChange = Math.max(
      Math.abs(chroma1[m3] - chroma2[m3]),
      Math.abs(chroma1[M3] - chroma2[M3])
    );
    const fifthChange = Math.abs(chroma1[p5] - chroma2[p5]);
    
    return Math.max(thirdChange, fifthChange);
  }

  /**
   * Calculate chroma distance (0 = identical, 1 = completely different)
   */
  calculateChromaDistance(chroma1, chroma2) {
    let diff = 0;
    for (let p = 0; p < 12; p++) {
      diff += Math.abs(chroma1[p] - chroma2[p]);
    }
    return diff / 2; // Normalize to [0, 1]
  }

  /**
   * Average chroma over a range
   */
  avgChroma(chromaArray, start, end) {
    const avg = new Float32Array(12);
    const count = end - start;
    if (count <= 0) return avg;
    
    for (let i = start; i < end && i < chromaArray.length; i++) {
      for (let p = 0; p < 12; p++) {
        avg[p] += chromaArray[i][p];
      }
    }
    
    for (let p = 0; p < 12; p++) {
      avg[p] /= count;
    }
    
    return avg;
  }

  getChordsWithBassNote(bassNote, key) {
    const candidates = [];
    const diatonic = this.getDiatonicInfo(key);
    
    // v16.28: Check if bass note is diatonic scale degree
    const bassIsDiatonic = diatonic.pcs.includes(bassNote);
    
    // v16.28: HIGHEST PRIORITY - Bass is root of diatonic chord
    // If bass is C in C major, prefer C over Am/C
    for (const dc of diatonic.chords) {
      if (dc.root === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: null,
          chordType: 'diatonic_root',
          priority: bassIsDiatonic ? 120 : 100 // v16.28: Extra boost if diatonic bass
        });
      }
    }
    
    // v16.28: LOWER PRIORITY for inversions when bass is diatonic
    // Am/C when bass is C should lose to plain C
    for (const dc of diatonic.chords) {
      const third = this.toPc(dc.root + (dc.minor ? 3 : 4));
      if (third === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: bassNote,
          chordType: 'diatonic_inv1',
          priority: bassIsDiatonic ? 70 : 85 // v16.28: Lower if bass is diatonic (prefer root position)
        });
      }
    }
    
    for (const dc of diatonic.chords) {
      const fifth = this.toPc(dc.root + 7);
      if (fifth === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: bassNote,
          chordType: 'diatonic_inv2',
          priority: 80
        });
      }
    }
    
    // 🎯 NEW: Check if bass is M3 (major third) in major key
    if (!key.minor) {
      const M3 = this.toPc(key.root + 4);
      if (bassNote === M3) {
        candidates.push({
          root: M3,
          isMinor: false,
          inversionBass: null,
          chordType: 'scale_degree_M3',
          priority: 90,
          scaleDegree: 'M3'
        });
      }
    }
    
    const secondaryDominants = this.getSecondaryDominants(key);
    for (const sd of secondaryDominants) {
      if (sd.root === bassNote) {
        candidates.push({
          root: sd.root,
          isMinor: false,
          inversionBass: null,
          chordType: 'secondary_dominant',
          target: sd.target,
          priority: 75
        });
      }
      const third = this.toPc(sd.root + 4);
      if (third === bassNote) {
        candidates.push({
          root: sd.root,
          isMinor: false,
          inversionBass: bassNote,
          chordType: 'secondary_dominant_inv1',
          target: sd.target,
          priority: 70
        });
      }
    }
    
    const borrowed = this.getBorrowedChords(key);
    for (const bc of borrowed) {
      if (bc.root === bassNote) {
        candidates.push({
          root: bc.root,
          isMinor: bc.minor,
          inversionBass: null,
          chordType: 'borrowed',
          borrowedFrom: bc.from,
          priority: 65
        });
      }
      const third = this.toPc(bc.root + (bc.minor ? 3 : 4));
      if (third === bassNote) {
        candidates.push({
          root: bc.root,
          isMinor: bc.minor,
          inversionBass: bassNote,
          chordType: 'borrowed_inv1',
          borrowedFrom: bc.from,
          priority: 60
        });
      }
    }
    
    return candidates.sort((a, b) => b.priority - a.priority);
  }
  
  getSecondaryDominants(key) {
    const dominants = [];
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    
    for (let i = 0; i < scale.length; i++) {
      if (i === 0) continue;
      if (i === 6 && !key.minor) continue;
      if (i === 1 && key.minor) continue;
      
      const target = this.toPc(key.root + scale[i]);
      const dominant = this.toPc(target + 7);
      
      dominants.push({ root: dominant, target: target });
    }
    
    return dominants;
  }
  
  getBorrowedChords(key) {
    const borrowed = [];
    
    if (!key.minor) {
      borrowed.push({ root: this.toPc(key.root + 10), minor: false, from: 'bVII' }); // Bb in C
      // v16.28: REMOVED bVI (Ab/G#) - causes confusion with E
      borrowed.push({ root: this.toPc(key.root + 3), minor: false, from: 'bIII' });  // Eb in C
      borrowed.push({ root: this.toPc(key.root + 5), minor: true, from: 'iv' });     // Fm in C
    } else {
      borrowed.push({ root: this.toPc(key.root + 7), minor: false, from: 'V' });     // E in Am
      borrowed.push({ root: this.toPc(key.root + 5), minor: false, from: 'IV' });    // D in Am
    }
    
    return borrowed;
  }

  determineChordTheoryAware(chroma, startFrame, endFrame, key, diatonic, bassNote, secPerFrame) {
    const avg = new Float32Array(12);
    const count = endFrame - startFrame;
    
    if (count <= 0) return null;
    
    for (let i = startFrame; i < endFrame && i < chroma.length; i++) {
      for (let p = 0; p < 12; p++) avg[p] += chroma[i][p];
    }
    for (let p = 0; p < 12; p++) avg[p] /= count;
    
    let total = 0;
    for (let p = 0; p < 12; p++) total += avg[p];
    if (total <= 0) return null;
    
    const norm = new Float32Array(12);
    for (let p = 0; p < 12; p++) norm[p] = avg[p] / total;
    
    const durSec = count * (secPerFrame || 0.1);
    
    if (durSec < 0.18) {
      let max1 = 0, max2 = 0, max3 = 0;
      for (let p = 0; p < 12; p++) {
        const v = norm[p];
        if (v > max1) { max3 = max2; max2 = max1; max1 = v; }
        else if (v > max2) { max3 = max2; max2 = v; }
        else if (v > max3) { max3 = v; }
      }
      if (max1 + max2 + max3 < 0.75) return null;
    }
    
    const theoryCandidates = this.getChordsWithBassNote(bassNote, key);
    const candidates = [];
    
    for (const tc of theoryCandidates) {
      // v16.28: Pass inversionBass to scoreChordCandidate
      const score = this.scoreChordCandidate(
        avg, tc.root, tc.isMinor, bassNote, 
        tc.chordType.startsWith('diatonic'),
        tc.inversionBass ?? null
      );
      if (score > 0) {
        candidates.push({
          ...tc,
          score: score + tc.priority * 0.5
        });
      }
    }
    
    if (candidates.length === 0) {
      // v16.28: Chromatic fallback - only if VERY clear AND long enough
      for (const isMinor of [false, true]) {
        const score = this.scoreChordCandidate(avg, bassNote, isMinor, bassNote, false, null);
        // v16.28: Higher threshold (was 60) + require minimum duration
        if (score > 70 && durSec >= 0.8) {
          // Check if this chromatic makes sense
          const isReasonable = this.isReasonableChromaticChord(bassNote, key, null);
          if (isReasonable || score > 85) { // Only if reasonable OR super strong
            candidates.push({
              root: bassNote,
              isMinor,
              inversionBass: null,
              chordType: 'chromatic',
              score: score - 35, // v16.28: Bigger penalty (was -30)
              priority: 15        // v16.28: Lower priority (was 20)
            });
          }
        }
      }
    }
    
    if (!candidates.length) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    if (best.score < 45 && durSec < 0.40) return null; // v16.28: Stricter threshold
    
    // v16.28: Enharmonic substitution for unlikely chromatics
    // Example: G# in C major → FORCE to E (modal interchange)
    let finalRoot = best.root;
    
    if (!key.minor && !diatonic.pcs.includes(best.root)) {
      // In C major: G#=8 → MUST BE E=4 (not Ab!)
      // In C major: C#=1 → could be Db=1 (neapolitan) 
      // In C major: D#=3 → MUST BE Eb=3 (bIII)
      // In C major: F#=6 → MUST BE F=5
      
      const toPc = (interval) => (key.root + interval) % 12;
      
      const forcedSubstitutions = [
        { from: toPc(8),  to: toPc(4),  name: 'G#→E' },   // G# → E (very common!)
        { from: toPc(3),  to: toPc(3),  name: 'D#→Eb' },  // D#=Eb (bIII)
        { from: toPc(6),  to: toPc(5),  name: 'F#→F' },   // F# → F
        { from: toPc(10), to: toPc(10), name: 'A#→Bb' }   // A#=Bb (bVII)
      ];
      
      for (const sub of forcedSubstitutions) {
        if (best.root === sub.from) {
          finalRoot = sub.to;
          console.log(`🎵 Forced substitution: ${this.NOTES_SHARP[sub.from]} → ${this.NOTES_SHARP[sub.to]} in ${this.NOTES_SHARP[key.root]} major`);
          break;
        }
      }
    }
    
    // v16.28: AUTO-CORRECT quality based on actual third (use finalRoot!)
    const m3 = avg[this.toPc(finalRoot + 3)];
    const M3 = avg[this.toPc(finalRoot + 4)];
    
    let finalIsMinor = best.isMinor;
    if (m3 > M3 * 1.5) {
      finalIsMinor = true;  // Strong minor third → definitely minor
    } else if (M3 > m3 * 1.5) {
      finalIsMinor = false; // Strong major third → definitely major
    }
    // else: keep best.isMinor (ambiguous)
    
    const noteName = this.getNoteName(finalRoot, key);
    let label = noteName + (finalIsMinor ? 'm' : '');
    
    if (best.inversionBass !== null) {
      const bassName = this.getNoteName(best.inversionBass, key);
      label += '/' + bassName;
    }
    
    const inScale = diatonic.pcs.includes(finalRoot);
    
    return {
      root: finalRoot,
      label,
      type: finalIsMinor ? 'minor' : 'major',
      inScale: inScale || best.chordType.startsWith('diatonic'),
      confidence: Math.min(100, Math.round(best.score)),
      chordType: best.chordType,
      isInversion: best.inversionBass !== null,
      inversionBass: best.inversionBass
    };
  }

  scoreChordCandidate(avg, root, isMinor, bassNote, inScale, inversionBass = null) {
    const rootStrength = avg[root];
    if (rootStrength < 0.05) return 0;
    
    const m3 = this.toPc(root + 3);  // minor third (E→G)
    const M3 = this.toPc(root + 4);  // major third (E→G#)
    const fifth = this.toPc(root + 7);
    
    // v16.28: AUTO-DETECT which third is actually present!
    const m3Strength = avg[m3];
    const M3Strength = avg[M3];
    
    // Decide which third is REALLY there
    let actualThird, wrongThird, actuallyMinor;
    if (m3Strength > M3Strength * 1.3) {
      // Minor third is stronger → it's a MINOR chord
      actualThird = m3;
      wrongThird = M3;
      actuallyMinor = true;
    } else if (M3Strength > m3Strength * 1.3) {
      // Major third is stronger → it's a MAJOR chord
      actualThird = M3;
      wrongThird = m3;
      actuallyMinor = false;
    } else {
      // Ambiguous → use the candidate's suggestion
      actualThird = this.toPc(root + (isMinor ? 3 : 4));
      wrongThird = this.toPc(root + (isMinor ? 4 : 3));
      actuallyMinor = isMinor;
    }
    
    // Score based on what we HEARD, not what we assumed
    let score = rootStrength * 40 + avg[actualThird] * 30 + avg[fifth] * 20;
    score -= avg[wrongThird] * 25;
    
    // Penalty if candidate type doesn't match what we heard
    if (isMinor !== actuallyMinor) {
      score -= 15; // Wrong quality!
    }
    
    if (bassNote === root) score += 15;
    else if (bassNote === actualThird) score += 10; // v16.28: Slightly lower for first inversion
    else if (bassNote === fifth) score += 8;        // v16.28: Slightly lower for second inversion
    
    // v16.28: Extra validation for inversions - the bass note must be STRONG in the audio
    if (inversionBass !== null && inversionBass !== root) {
      // For inversions, verify the bass note is actually prominent
      const bassStrength = avg[inversionBass] || 0;
      if (bassStrength < 0.08) {
        score -= 15; // Bass note not strong enough for inversion
      }
    }
    
    if (inScale) score += 8;
    
    return score;
  }

  getDiatonicInfo(key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = key.minor 
      ? [true, false, false, true, true, false, false]
      : [false, true, true, false, false, true, false];
    
    const pcs = scale.map(deg => this.toPc(key.root + deg));
    const chords = scale.map((deg, i) => ({
      root: this.toPc(key.root + deg),
      minor: qualities[i],
      degree: i + 1
    }));
    
    return { pcs, chords };
  }

  // v16.28: Check if chromatic chord makes harmonic sense
  isReasonableChromaticChord(root, key, prevChord) {
    const tonicPc = key.root;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    
    // Common borrowed chords in MAJOR:
    if (!key.minor) {
      const bVII = this.toPc(tonicPc + 10); // Bb in C major (common!)
      const bIII = this.toPc(tonicPc + 3);  // Eb in C major (common!)
      const iv = this.toPc(tonicPc + 5);    // Fm in C major (minor iv, common!)
      
      // v16.28: REMOVED bVI (Ab/G#) - too rare and often confused with E
      
      if (root === bVII || root === bIII || root === iv) {
        return true; // Common modal borrowing
      }
    }
    
    // Common borrowed chords in MINOR:
    if (key.minor) {
      const V = this.toPc(tonicPc + 7);     // E in Am (raised leading tone)
      const VII = this.toPc(tonicPc + 11);  // G# in Am (leading tone)
      const IV = this.toPc(tonicPc + 5);    // D in Am (natural minor → harmonic)
      
      if (root === V || root === VII || root === IV) {
        return true; // Harmonic/melodic minor variations
      }
    }
    
    // Secondary dominants (V/X)
    // Example in C major: D7→G, A7→Dm, E7→Am
    const diatonicPcs = scale.map(s => this.toPc(tonicPc + s));
    
    for (const target of diatonicPcs) {
      const secondaryDominant = this.toPc(target + 7); // V of target
      if (root === secondaryDominant) {
        return true; // It's a secondary dominant!
      }
    }
    
    // Chromatic approach chords (passing)
    // Example: C → C# → Dm (chromatic passing)
    if (prevChord) {
      const prevRoot = prevChord.root;
      const distUp = this.toPc(root - prevRoot);
      const distDown = this.toPc(prevRoot - root);
      
      // Half-step approach from either direction
      if (distUp === 1 || distDown === 1) {
        return true; // Chromatic passing chord
      }
    }
    
    // If none of the above, it's probably noise
    return false;
  }

  validateWithCircleOfFifths(timeline, key, features) {
    if (timeline.length < 2) return timeline;
    
    const diatonic = this.getDiatonicInfo(key);
    const validated = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = i > 0 ? timeline[i - 1] : null;
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      
      let dur = 0;
      if (next) dur = next.t - ev.t;
      else if (prev) dur = ev.t - prev.t;
      
      if (ev.chordType && !ev.chordType.startsWith('chromatic')) {
        validated.push(ev);
        continue;
      }
      
      const inScale = diatonic.pcs.includes(ev.root);
      
      if (inScale) {
        validated.push(ev);
        continue;
      }
      
      // v16.28: STRICT chromatic filtering
      // Non-diatonic chords must be:
      // 1. LONG (>0.8s) OR very confident (95+)
      // 2. Make harmonic sense (borrowed/secondary dominant)
      
      const isShort = dur > 0 && dur < 0.8;
      const isWeak = ev.confidence < 95;
      
      if (isShort && isWeak) {
        continue; // Skip short weak chromatic chords
      }
      
      // Check if it's a "reasonable" chromatic chord
      const isReasonable = this.isReasonableChromaticChord(ev.root, key, prev);
      
      if (!isReasonable) {
        // Unreasonable chromatic (like G# in C major)
        console.log(`⚠️ Unreasonable chromatic: ${this.NOTES_SHARP[ev.root]} in ${this.NOTES_SHARP[key.root]}${key.minor?'m':''} (dur=${dur.toFixed(2)}s, conf=${ev.confidence}%)`);
        if (dur < 1.5 || ev.confidence < 90) {
          console.log(`   → FILTERED (too short or weak)`);
          continue; // Skip unless VERY long AND confident
        } else {
          console.log(`   → KEPT (very long and confident)`);
        }
      }
      
      // If we got here, it's either reasonable OR super long/confident
      validated.push({ ...ev, modalContext: 'chromatic' });
    }
    
    return validated;
  }

  applyLightHMM(timeline, key) {
    if (timeline.length < 3) return timeline;
    
    const result = [...timeline];
    
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const next = result[i + 1];
      
      const prevToCurr = this.getTransitionScore(prev.root, curr.root, key);
      const currToNext = this.getTransitionScore(curr.root, next.root, key);
      const prevToNext = this.getTransitionScore(prev.root, next.root, key);
      
      if (prevToNext > prevToCurr + currToNext && curr.confidence < 60) {
        result.splice(i, 1);
        i--;
      }
    }
    
    return result;
  }

  getTransitionScore(fromRoot, toRoot, key) {
    if (fromRoot === toRoot) return 10;
    const interval = this.toPc(toRoot - fromRoot);
    if (interval === 7 || interval === 5) return 8;
    if (interval === 2 || interval === 10) return 5;
    if (interval === 3 || interval === 4 || interval === 8 || interval === 9) return 4;
    if (interval === 6) return 3;
    return 2;
  }

  addExtensions(timeline, features, key, opts) {
    const { chroma } = features;
    
    return timeline.map(ev => {
      if (ev.fi == null || ev.fi < 0 || ev.fi >= chroma.length) return ev;
      if (ev.label.includes('/')) return ev; // Don't modify inversions
      
      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      
      for (let i = i0; i <= i1; i++) {
        for (let p = 0; p < 12; p++) avg[p] += chroma[i][p];
      }
      const count = i1 - i0 + 1;
      for (let p = 0; p < 12; p++) avg[p] /= count;
      
      const root = ev.root;
      const isMinor = ev.type === 'minor';
      
      // v16.28: Check all chord tones properly
      const r = avg[root];                            // 1 (root)
      const m3 = avg[this.toPc(root + 3)];           // m3
      const M3 = avg[this.toPc(root + 4)];           // M3
      const p4 = avg[this.toPc(root + 5)];           // 4th (sus4)
      const dim5 = avg[this.toPc(root + 6)];         // dim5 (b5)
      const p5 = avg[this.toPc(root + 7)];           // 5 (perfect fifth)
      const aug5 = avg[this.toPc(root + 8)];         // aug5 (#5)
      const M6 = avg[this.toPc(root + 9)];           // 6
      const b7 = avg[this.toPc(root + 10)];          // b7 (dominant)
      const M7 = avg[this.toPc(root + 11)];          // M7 (major)
      const M9 = avg[this.toPc(root + 2)];           // 9 (same as 2nd)
      
      let label = ev.label;
      
      // 1. Check for diminished (m3 + dim5)
      if (isMinor && dim5 > 0.12 && dim5 > p5 * 1.3) {
        label = label.replace(/m$/, 'dim');
      }
      
      // 2. Check for augmented (M3 + aug5)
      if (!isMinor && aug5 > 0.12 && aug5 > p5 * 1.3) {
        label = label.replace(/m?$/, 'aug');
      }
      
      // 3. Check for 7th chords - v16.28: More precise detection
      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        // Major 7th (Cmaj7) - need clear M7 without b7
        if (!isMinor && M7 > 0.10 && M7 > b7 * 1.5 && M3 > 0.08) {
          // v16.28: Also check that M7 is significant relative to root
          if (M7 > r * 0.15) {
            label = label.replace(/m$/, '') + 'maj7';
          }
        }
        // Dominant 7th (C7, G7) - only for major chords with clear b7
        else if (!isMinor && b7 > 0.10 && b7 > M7 * 1.2 && M3 > 0.08) {
          // v16.28: b7 must be prominent enough
          if (b7 > r * 0.12) {
            label += '7';
          }
        }
        // Minor 7th (Am7) - minor chord with clear b7
        else if (isMinor && b7 > 0.10 && b7 > M7 * 1.2 && m3 > 0.08) {
          if (b7 > r * 0.12) {
            label += '7';
          }
        }
      }
      
      // 4. Check for sus chords - v16.28: More precise
      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        const thirdPresent = M3 > 0.06 || m3 > 0.06;
        
        // sus4: 4th prominent AND no clear third
        if (p4 > 0.12 && !thirdPresent && p4 > M3 * 1.8 && p4 > m3 * 1.8) {
          label = label.split(/[m]/)[0] + 'sus4';
        }
        // sus2: 9th/2nd prominent AND no clear third
        else if (M9 > 0.12 && !thirdPresent && M9 > M3 * 1.8 && M9 > m3 * 1.8) {
          label = label.split(/[m]/)[0] + 'sus2';
        }
      }
      
      // 5. Add 6 if present (C6, Am6) - v16.28: Stricter to avoid melodic 6ths
      if (!label.includes('7') && !label.includes('6') && !label.includes('sus')) {
        // 6 must be strong AND consistent (not just melodic passing tone)
        if (M6 > 0.12 && M6 > b7 * 1.5 && M6 > M7 * 1.5) {
          // Also verify the 5th is present (proper 6 chord structure)
          if (p5 > 0.10) {
            label += '6';
          }
        }
      }
      
      return { ...ev, label };
    });
  }

  finalizeTimeline(timeline, bpm, features) {
    if (!timeline.length) return [];
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDuration = 0.5 * spb; // v16.28: Longer minimum (was 0.4)
    
    let filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const next = timeline[i + 1];
      const duration = next ? (next.t - ev.t) : minDuration;
      
      const isShort = duration < minDuration;
      const isStrong = ev.confidence >= 90; // v16.28: Higher threshold (was 85)
      const isTheoryBacked = ev.chordType && !ev.chordType.startsWith('chromatic');
      
      if (!isShort || (isStrong && isTheoryBacked)) {
        filtered.push(ev);
      }
    }
    
    const snapped = filtered.map(ev => {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const t = Math.abs(grid - raw) <= 0.3 * spb ? grid : raw;
      return { ...ev, t: Math.max(0, t) };
    });
    
    const merged = [];
    for (const ev of snapped) {
      if (!merged.length || merged[merged.length - 1].label !== ev.label) {
        merged.push(ev);
      }
    }
    
    return merged;
  }

  parseOptions(options) {
    return {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionSensitivity: options.extensionSensitivity || 1.0,
      progressCallback: options.progressCallback || null
    };
  }

  now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  getNoteName(pc, key) {
    pc = this.toPc(pc);
    const flatRoots = [5, 10, 3, 8, 1, 6, 11];
    return flatRoots.includes(key.root) ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }

  buildStats(timeline, key) {
    return {
      totalChords: timeline.length,
      inScale: timeline.filter(e => e.inScale).length,
      inversions: timeline.filter(e => e.label && e.label.includes('/')).length,
      extensions: timeline.filter(e => e.label && /7|9|11|13|sus|dim|aug/.test(e.label)).length,
      secondaryDominants: timeline.filter(e => e.chordType === 'secondary_dominant' || e.chordType === 'secondary_dominant_inv1').length,
      borrowed: timeline.filter(e => e.chordType && e.chordType.startsWith('borrowed')).length,
      chromatic: timeline.filter(e => e.chordType === 'chromatic').length,
      scaleDegrees: timeline.filter(e => e.chordType && e.chordType.startsWith('scale_degree')).length
    };
  }

  // v16.28: Detect if song is "easy rock" (mostly diatonic)
  isEasyRockSong(stats, key) {
    const total = stats.totalChords || 1;
    const inScaleRatio = stats.inScale / total;
    const chromaticRatio = stats.chromatic / total;
    const borrowedRatio = stats.borrowed / total;

    // Conditions for "easy" pop/rock song
    return (
      inScaleRatio >= 0.75 &&
      chromaticRatio <= 0.12 &&
      borrowedRatio <= 0.18
    );
  }

  // v16.28: Force non-diatonic chords to nearest diatonic
  enforceEasyDiatonic(timeline, key) {
    const diatonic = this.getDiatonicInfo(key);
    const diatonicRoots = new Set(diatonic.pcs);

    return timeline.map(ev => {
      if (diatonicRoots.has(ev.root)) return ev;

      // Find nearest diatonic root
      let best = ev.root;
      let bestDist = 12;
      for (const pc of diatonicRoots) {
        const d1 = this.toPc(pc - ev.root);
        const d2 = this.toPc(ev.root - pc);
        const dist = Math.min(d1, d2);
        if (dist < bestDist) {
          bestDist = dist;
          best = pc;
        }
      }

      // Only substitute if very close (1 semitone)
      if (bestDist <= 1) {
        const noteName = this.getNoteName(best, key);
        const isMinor = ev.type === 'minor';
        const baseLabel = noteName + (isMinor ? 'm' : '');
        const label = ev.label.includes('/')
          ? baseLabel + ev.label.substring(ev.label.indexOf('/'))
          : baseLabel;

        console.log(`  🎯 Forced: ${ev.label} → ${label}`);
        return {
          ...ev,
          root: best,
          label,
          inScale: true,
          chordType: 'diatonic_forced'
        };
      }

      return ev;
    });
  }

  // v16.28: Remove isolated chromatic chords between identical neighbors
  smoothOutliers(timeline, key, diatonic) {
    if (timeline.length < 3) return timeline;
    const result = [...timeline];
    const diatonicRoots = new Set(diatonic.pcs);

    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const next = result[i + 1];

      const sameNeighbors = prev.label === next.label;
      const currInScale = diatonicRoots.has(curr.root);
      const neighborConf = Math.min(prev.confidence || 0, next.confidence || 0);

      // If neighbors are same chord, current is chromatic, and current is weaker
      if (
        sameNeighbors &&
        !currInScale &&
        (curr.confidence || 0) + 10 < neighborConf
      ) {
        console.log(`  🧹 Smoothed: ${curr.label} → ${prev.label} (isolated chromatic)`);
        result[i] = {
          ...prev,
          t: curr.t,
          fi: curr.fi,
          chordType: (prev.chordType || '') + '_smoothed'
        };
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // v16.28: PATTERN MEMORY - Learn and apply recurring progressions
  // ═══════════════════════════════════════════════════════════
  
  applyPatternMemory(timeline, key) {
    if (timeline.length < 4) return timeline;

    // 1. Build map of recurring 4-chord patterns
    const patterns = new Map();
    const labels = timeline.map(ev => this.normalizeLabel(ev.label));

    for (let i = 0; i <= labels.length - 4; i++) {
      const pattern = labels.slice(i, i + 4).join('_');
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }

    // 2. Find strong patterns (appear 3+ times)
    const strongPatterns = [...patterns.entries()]
      .filter(([p, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]); // Sort by frequency

    if (!strongPatterns.length) {
      console.log(`  📝 No strong patterns found (need 3+ occurrences)`);
      return timeline;
    }

    console.log(`  📝 Found ${strongPatterns.length} strong patterns:`);
    strongPatterns.slice(0, 3).forEach(([p, c]) => console.log(`     ${p} (×${c})`));

    const result = [...timeline];

    // 3. For each weak chord, try to fix based on strong patterns
    let fixes = 0;
    for (let i = 1; i < result.length - 2; i++) {
      const ev = result[i];
      
      // Only consider weak chords
      if ((ev.confidence || 0) >= 65) continue;

      // Get local 4-chord window
      const localLabels = result.slice(i - 1, i + 3).map(e => this.normalizeLabel(e.label));
      if (localLabels.length !== 4) continue;

      const local = localLabels.join('_');

      // Check against strong patterns
      for (const [pattern, count] of strongPatterns) {
        const pParts = pattern.split('_');
        const lParts = local.split('_');
        
        if (pParts.length !== lParts.length) continue;

        // Count differences
        let diffIndex = -1;
        let diffs = 0;
        for (let k = 0; k < pParts.length; k++) {
          if (pParts[k] !== lParts[k]) {
            diffs++;
            diffIndex = k;
          }
        }

        // Only fix if exactly one difference, and it's the current chord (index 1)
        if (diffs === 1 && diffIndex === 1) {
          const targetLabel = pParts[diffIndex];
          const targetRoot = this.labelToRoot(targetLabel, key);
          
          console.log(`  🎯 Pattern fix: ${ev.label} → ${targetLabel} (from ${pattern}, ×${count})`);
          
          result[i] = { 
            ...ev, 
            label: targetLabel,
            root: targetRoot !== null ? targetRoot : ev.root,
            chordType: (ev.chordType || '') + '_patternFix',
            patternSource: pattern
          };
          fixes++;
          break;
        }
      }
    }

    console.log(`  📝 Applied ${fixes} pattern-based fixes`);
    return result;
  }

  // Normalize label for pattern matching (remove extensions)
  normalizeLabel(label) {
    if (!label) return '';
    // Keep only root + m (minor), remove 7/maj7/sus/dim/aug/6/slash
    return label.replace(/7|maj7|sus[24]|dim|aug|6|\/.*$/, '').trim();
  }

  // Convert label back to root PC
  labelToRoot(label, key) {
    const normalized = this.normalizeLabel(label);
    const rootName = normalized.replace(/m$/, '');
    
    // Try sharp notes first
    let idx = this.NOTES_SHARP.indexOf(rootName);
    if (idx >= 0) return idx;
    
    // Try flat notes
    idx = this.NOTES_FLAT.indexOf(rootName);
    if (idx >= 0) return idx;
    
    return null;
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => this.NOTES_SHARP[this.toPc(tonicPc + deg)] + qualities[i]);
  }

  buildCircleOfFifths(key) {
    const keyName = this.getNoteName(key.root, key) + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(keyName.replace(/m$/, ''), key.minor ? 'minor' : 'major');
    const functions = key.minor ? ['i','ii°','III','iv','v','VI','VII'] : ['I','ii','iii','IV','V','vi','vii°'];
    return chords.map((label, i) => ({ label, function: functions[i] }));
  }

  // v16.28: mixStereo removed - stereo mixing is in processAudio
  // v16.28: resampleLinear removed - use resample directly

  percentile(arr, p) {
    const a = [...arr].sort((x, y) => x - y);
    return a.length ? a[Math.floor(p / 100 * (a.length - 1))] : 0;
  }

  // ═══════════════════════════════════════════════════════════
  // v16.28: HMM ENGINE (parallel to Bass engine)
  // ═══════════════════════════════════════════════════════════
  
  buildChordsHMM(features, key, startFrame) {
    const { chroma, bass, energy, energyP70, secPerFrame } = features;
    const diatonic = this.getDiatonicInfo(key);
    
    // Build diatonic candidates
    const candidates = [];
    for (const dc of diatonic.chords) {
      const name = this.getNoteName(dc.root, key);
      candidates.push({
        root: dc.root,
        label: name + (dc.minor ? 'm' : ''),
        minor: dc.minor,
        intervals: dc.minor ? [0, 3, 7] : [0, 4, 7]
      });
    }
    
    // Add V major in minor key
    if (key.minor) {
      const V = this.toPc(key.root + 7);
      if (!candidates.find(c => c.root === V && !c.minor)) {
        candidates.push({ root: V, label: this.getNoteName(V, key), minor: false, intervals: [0, 4, 7], borrowed: true });
      }
    }
    
    const N = candidates.length;
    const M = chroma.length;
    if (N === 0 || M <= startFrame) return [];
    
    // Calculate emit scores for each frame/candidate
    const emitScores = [];
    for (let i = 0; i < M; i++) {
      const frameScores = [];
      for (let c = 0; c < N; c++) {
        frameScores.push(this.calcEmitScore(chroma[i], bass[i], energy[i], energyP70, candidates[c]));
      }
      emitScores.push(frameScores);
    }
    
    // Viterbi
    const dp = new Array(N).fill(-Infinity);
    const back = Array.from({ length: M }, () => new Array(N).fill(-1));
    
    // Init
    for (let c = 0; c < N; c++) {
      dp[c] = emitScores[startFrame][c];
    }
    
    // Forward
    for (let i = startFrame + 1; i < M; i++) {
      const newDp = new Array(N).fill(-Infinity);
      for (let c = 0; c < N; c++) {
        for (let prev = 0; prev < N; prev++) {
          const trans = this.transitionScore(candidates[prev], candidates[c], key);
          const val = dp[prev] + trans + emitScores[i][c];
          if (val > newDp[c]) {
            newDp[c] = val;
            back[i][c] = prev;
          }
        }
      }
      for (let c = 0; c < N; c++) dp[c] = newDp[c];
    }
    
    // Backtrack
    let best = 0;
    for (let c = 1; c < N; c++) {
      if (dp[c] > dp[best]) best = c;
    }
    
    const path = new Array(M).fill(0);
    path[M - 1] = best;
    for (let i = M - 1; i > startFrame; i--) {
      path[i - 1] = back[i][path[i]] >= 0 ? back[i][path[i]] : path[i];
    }
    
    // Convert to timeline
    const timeline = [];
    let cur = path[startFrame];
    let start = startFrame;
    
    for (let i = startFrame + 1; i < M; i++) {
      if (path[i] !== cur) {
        const cand = candidates[cur];
        timeline.push({
          t: start * secPerFrame,
          fi: start,
          label: cand.label,
          root: cand.root,
          type: cand.minor ? 'minor' : 'major',
          inScale: true,
          confidence: 75,
          chordType: 'hmm',
          engine: 'hmm'
        });
        cur = path[i];
        start = i;
      }
    }
    
    // Final
    const cand = candidates[cur];
    timeline.push({
      t: start * secPerFrame,
      fi: start,
      label: cand.label,
      root: cand.root,
      type: cand.minor ? 'minor' : 'major',
      inScale: true,
      confidence: 75,
      chordType: 'hmm',
      engine: 'hmm'
    });
    
    return timeline;
  }
  
  calcEmitScore(frame, bassNote, energy, energyP70, candidate) {
    if (!frame) return -10;
    
    let score = 0;
    
    // Chord template match
    for (const iv of candidate.intervals) {
      score += (frame[this.toPc(candidate.root + iv)] || 0) * 10;
    }
    
    // Bass match bonus
    if (bassNote >= 0 && bassNote === candidate.root) score += 3;
    
    // Low energy penalty
    if (energy < energyP70 * 0.3) score -= 2;
    
    return score;
  }
  
  transitionScore(from, to, key) {
    if (from.root === to.root && from.minor === to.minor) return 0.5; // Stay bonus
    
    // Circle of fifths
    const interval = this.toPc(to.root - from.root);
    if (interval === 7 || interval === 5) return 0.3; // V-I or IV-I
    if (interval === 2 || interval === 10) return 0.1; // Step
    
    return -0.2; // Other transitions
  }

  // ═══════════════════════════════════════════════════════════
  // v16.28: MERGE ENGINES - Compare and choose best
  // ═══════════════════════════════════════════════════════════
  
  mergeEngines(bassTimeline, hmmTimeline, features, key) {
    if (!bassTimeline.length) return hmmTimeline;
    if (!hmmTimeline.length) return bassTimeline;
    
    const { secPerFrame, chroma } = features;
    const diatonic = this.getDiatonicInfo(key);
    const borrowed = this.getAllowedBorrowedChords(key);
    const merged = [];
    
    // Create unified time grid
    const allTimes = new Set();
    bassTimeline.forEach(ev => allTimes.add(Math.round(ev.t * 10) / 10));
    hmmTimeline.forEach(ev => allTimes.add(Math.round(ev.t * 10) / 10));
    const times = [...allTimes].sort((a, b) => a - b);
    
    for (const t of times) {
      // Find active chord from each engine at time t
      const bassChord = this.findActiveChord(bassTimeline, t);
      const hmmChord = this.findActiveChord(hmmTimeline, t);
      
      let chosen = null;
      
      if (bassChord && hmmChord) {
        if (bassChord.root === hmmChord.root) {
          // 🎯 AGREEMENT! Both engines agree on this root
          const isInScale = diatonic.pcs.includes(bassChord.root);
          const borrowedInfo = borrowed.find(b => b.root === bassChord.root);
          
          if (isInScale) {
            chosen = { ...bassChord, consensus: 'agree_diatonic' };
          } else if (borrowedInfo) {
            // Semi-diatonic (III major, iv minor, etc.) - ALLOW IT!
            console.log(`🎵 Borrowed ${borrowedInfo.name} confirmed by both engines`);
            chosen = { 
              ...bassChord, 
              consensus: 'agree_borrowed',
              chordType: 'borrowed',
              borrowedName: borrowedInfo.name
            };
          } else {
            // Both agree on chromatic - allow with note
            console.log(`⚠️ Chromatic ${this.NOTES_SHARP[bassChord.root]} agreed by both`);
            chosen = { ...bassChord, consensus: 'agree_chromatic' };
          }
        } else {
          // DISAGREEMENT - prefer diatonic, then borrowed, then confidence
          const bassInScale = diatonic.pcs.includes(bassChord.root);
          const hmmInScale = diatonic.pcs.includes(hmmChord.root);
          const bassBorrowed = borrowed.find(b => b.root === bassChord.root);
          const hmmBorrowed = borrowed.find(b => b.root === hmmChord.root);
          
          if (bassInScale && !hmmInScale) {
            chosen = { ...bassChord, consensus: 'bass_diatonic' };
          } else if (hmmInScale && !bassInScale) {
            chosen = { ...hmmChord, consensus: 'hmm_diatonic' };
          } else if (bassBorrowed && !hmmBorrowed) {
            chosen = { ...bassChord, consensus: 'bass_borrowed' };
          } else if (hmmBorrowed && !bassBorrowed) {
            chosen = { ...hmmChord, consensus: 'hmm_borrowed' };
          } else {
            // Both same category - use confidence
            const bassConf = bassChord.confidence || 70;
            const hmmConf = hmmChord.confidence || 70;
            chosen = bassConf >= hmmConf 
              ? { ...bassChord, consensus: 'bass_conf' }
              : { ...hmmChord, consensus: 'hmm_conf' };
          }
        }
      } else {
        chosen = bassChord || hmmChord;
        if (chosen) chosen.consensus = bassChord ? 'bass_only' : 'hmm_only';
      }
      
      // Add if different from last
      if (chosen && (!merged.length || merged[merged.length - 1].label !== chosen.label)) {
        merged.push({ ...chosen, t });
      }
    }
    
    return merged;
  }
  
  findActiveChord(timeline, t) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].t <= t + 0.05) return timeline[i];
    }
    return null;
  }
  
  // "Semi-diatonic" chords - allowed when both engines agree
  getAllowedBorrowedChords(key) {
    const borrowed = [];
    
    if (key.minor) {
      // In minor key:
      // III major - relative major chord, VERY common (e.g., G in Em)
      borrowed.push({ root: this.toPc(key.root + 3), name: 'III', type: 'major' });
      // VII major - subtonic (e.g., D in Em)
      borrowed.push({ root: this.toPc(key.root + 10), name: 'VII', type: 'major' });
      // V major - harmonic minor dominant (e.g., B in Em)
      borrowed.push({ root: this.toPc(key.root + 7), name: 'V', type: 'major' });
      // IV major - borrowed from parallel major
      borrowed.push({ root: this.toPc(key.root + 5), name: 'IV', type: 'major' });
      // I major - Picardy third
      borrowed.push({ root: key.root, name: 'I', type: 'major' });
    } else {
      // In major key:
      // III major - instead of iii minor (e.g., E in C instead of Em)
      borrowed.push({ root: this.toPc(key.root + 4), name: 'III', type: 'major' });
      // bVII major - very common in rock/pop (e.g., Bb in C)
      borrowed.push({ root: this.toPc(key.root + 10), name: 'bVII', type: 'major' });
      // bVI major - dramatic sound (e.g., Ab in C)
      borrowed.push({ root: this.toPc(key.root + 8), name: 'bVI', type: 'major' });
      // bIII major - borrowed from parallel minor (e.g., Eb in C)
      borrowed.push({ root: this.toPc(key.root + 3), name: 'bIII', type: 'major' });
      // iv minor - borrowed from parallel minor (e.g., Fm in C)
      borrowed.push({ root: this.toPc(key.root + 5), name: 'iv', type: 'minor' });
      // ii major - secondary dominant style (e.g., D in C)
      borrowed.push({ root: this.toPc(key.root + 2), name: 'II', type: 'major' });
    }
    
    return borrowed;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
