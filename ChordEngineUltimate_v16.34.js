/**
 * ChordEngine v16.34 - Based on v16.33 + Improvements from feedback
 * 
 * New in v16.34:
 * 1. Tonic validation after timeline - recheck key from chord statistics
 * 2. Better slash-chord detection (V/V on different bass, non-diatonic slash)
 * 3. Dynamic thresholds per song (CHROMA_CHANGE_THRESHOLD, matchScore)
 * 4. Pattern memory for 3-chord and 4-chord patterns (I-V-vi-IV etc)
 * 5. Fixed pattern matching logic (was always skipping due to join bug)
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
  }

  async detect(audioBuffer, options = {}) {
    const opts = this.parseOptions(options);
    const timings = {};
    const t0 = this.now();

    console.log('🎵 ChordEngine v16.34 (+ Tonic Validation & Pattern Memory)');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    // v16.34: Calculate dynamic thresholds per song
    const songProfile = this.analyzeSongProfile(features);
    console.log(`✅ Song profile: chromaVariance=${songProfile.chromaVariance.toFixed(3)}, sustainLevel=${songProfile.sustainLevel.toFixed(2)}`);

    // Initial key detection
    let key = this.detectKeyEnhanced(features);
    console.log(`✅ Initial Key: ${this.NOTES_SHARP[key.root]}${key.minor ? 'm' : ''} (${Math.round(key.confidence * 100)}%)`);

    // Build chords with dynamic thresholds
    let timeline = this.buildChordsStableBass(features, key, 0, audio.bpm, songProfile);
    console.log(`🎸 Bass engine: ${timeline.length} chords`);
    
    const hmmTimeline = this.buildChordsHMM(features, key, 0, songProfile);
    console.log(`🎹 HMM engine: ${hmmTimeline.length} chords`);
    
    timeline = this.mergeEngines(timeline, hmmTimeline, features, key);
    console.log(`🤝 Consensus: ${timeline.length} chords`);

    // v16.34: TONIC VALIDATION - recheck key from chord statistics
    const validatedKey = this.validateTonicFromChords(timeline, key, features);
    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      console.log(`🔄 Tonic revalidated: ${this.NOTES_SHARP[key.root]}${key.minor ? 'm' : ''} → ${this.NOTES_SHARP[validatedKey.root]}${validatedKey.minor ? 'm' : ''}`);
      key = validatedKey;
      // Rebuild with new key
      timeline = this.buildChordsStableBass(features, key, 0, audio.bpm, songProfile);
      const hmmTimeline2 = this.buildChordsHMM(features, key, 0, songProfile);
      timeline = this.mergeEngines(timeline, hmmTimeline2, features, key);
    }

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    
    // v16.34: Better slash chord detection
    timeline = this.addSlashChords(timeline, features, key);
    
    timeline = this.addExtensions(timeline, features, key, opts);
    timeline = this.finalizeTimeline(timeline, audio.bpm, features);

    const stats = this.buildStats(timeline, key);
    const isEasy = this.isEasyRockSong(stats, key);
    
    if (isEasy) {
      console.log(`🎸 Easy rock song detected - enforcing diatonic`);
      timeline = this.enforceEasyDiatonic(timeline, key);
    }
    
    // v16.34: Improved pattern memory (3 and 4 chord patterns)
    timeline = this.applyPatternMemoryV2(timeline, key);
    
    timeline = this.smoothOutliers(timeline, key, this.getDiatonicInfo(key));
    timeline = this.autoRefineTimeline(timeline, key, audio.duration);

    timeline = timeline.filter(ev => 
      ev && ev.label && typeof ev.label === 'string' && ev.label.trim() && ev.fi != null
    );

    timings.total = this.now() - t0;
    console.log(`🎉 Final: ${timeline.length} chords in ${timings.total.toFixed(0)}ms`);

    return {
      chords: timeline,
      key,
      tonic: {
        root: key.root,
        label: this.NOTES_SHARP[key.root] + (key.minor ? 'm' : ''),
        confidence: Math.round(key.confidence * 100)
      },
      mode: {
        isMinor: key.minor,
        confidence: Math.round(key.confidence * 100)
      },
      bpm: audio.bpm,
      duration: audio.duration,
      stats: this.buildStats(timeline, key),
      timings,
      profile: 'auto'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // v16.34: SONG PROFILE ANALYSIS (Dynamic thresholds)
  // ═══════════════════════════════════════════════════════════

  analyzeSongProfile(features) {
    const { chroma, energy, energyP70 } = features;
    
    // Calculate chroma variance (how much the chroma changes between frames)
    let totalVariance = 0;
    let count = 0;
    
    for (let i = 1; i < chroma.length; i++) {
      if (energy[i] < energyP70 * 0.3) continue;
      
      let frameVariance = 0;
      for (let p = 0; p < 12; p++) {
        frameVariance += Math.abs(chroma[i][p] - chroma[i-1][p]);
      }
      totalVariance += frameVariance;
      count++;
    }
    
    const chromaVariance = count > 0 ? totalVariance / count : 0.5;
    
    // Calculate sustain level (how long notes ring)
    let sustainFrames = 0;
    let totalFrames = 0;
    
    for (let i = 1; i < energy.length - 1; i++) {
      if (energy[i] >= energyP70 * 0.5) {
        totalFrames++;
        // Check if energy is sustained (not much change)
        const prevRatio = energy[i] / (energy[i-1] || 1);
        if (prevRatio > 0.8 && prevRatio < 1.2) {
          sustainFrames++;
        }
      }
    }
    
    const sustainLevel = totalFrames > 0 ? sustainFrames / totalFrames : 0.5;
    
    // Dynamic thresholds based on profile
    return {
      chromaVariance,
      sustainLevel,
      // Higher variance = need higher threshold to detect real changes
      chromaChangeThreshold: 0.25 + chromaVariance * 0.3,
      // Higher sustain = can use lower match score (cleaner signal)
      matchScoreThreshold: sustainLevel > 0.6 ? 0.12 : 0.18,
      // Sustain songs need longer minimum duration
      minDurationMultiplier: sustainLevel > 0.5 ? 1.3 : 1.0
    };
  }

  // ═══════════════════════════════════════════════════════════
  // v16.34: TONIC VALIDATION FROM CHORDS
  // ═══════════════════════════════════════════════════════════

  validateTonicFromChords(timeline, initialKey, features) {
    if (!timeline || timeline.length < 4) return initialKey;

    // Count chord roots
    const rootCounts = new Array(12).fill(0);
    const rootDurations = new Array(12).fill(0);
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev || ev.root == null) continue;
      
      const next = timeline[i + 1];
      const dur = next ? (next.t - ev.t) : 1.0;
      
      rootCounts[ev.root]++;
      rootDurations[ev.root] += dur;
    }
    
    // Analyze cadences (V→I, IV→I patterns)
    const cadenceTargets = new Array(12).fill(0);
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      if (!curr || !next || curr.root == null || next.root == null) continue;
      
      const interval = this.toPc(next.root - curr.root);
      
      // V→I (up a fourth / down a fifth)
      if (interval === 5) {
        cadenceTargets[next.root] += 15;
      }
      // IV→I (down a fourth / up a fifth)  
      if (interval === 7) {
        cadenceTargets[next.root] += 10;
      }
      // ii→V→I
      if (i < timeline.length - 2) {
        const third = timeline[i + 2];
        if (third && third.root != null) {
          const int1 = this.toPc(next.root - curr.root);
          const int2 = this.toPc(third.root - next.root);
          if (int1 === 5 && int2 === 5) {
            cadenceTargets[third.root] += 20;
          }
        }
      }
    }
    
    // Check opening and closing chords
    const openingRoot = timeline[0]?.root;
    const closingRoot = timeline[timeline.length - 1]?.root;
    
    // Score each potential tonic
    const candidates = [];
    
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0;
      
      // Duration weight
      score += rootDurations[tonic] * 5;
      
      // Count weight
      score += rootCounts[tonic] * 3;
      
      // Cadence weight
      score += cadenceTargets[tonic];
      
      // Opening bonus
      if (openingRoot === tonic) score += 25;
      
      // Closing bonus
      if (closingRoot === tonic) score += 20;
      
      // Check if most chords fit this key
      for (const isMinor of [false, true]) {
        const scale = isMinor ? this.MINOR_SCALE : this.MAJOR_SCALE;
        const diatonicPcs = scale.map(s => this.toPc(tonic + s));
        
        let fittingChords = 0;
        for (const ev of timeline) {
          if (ev && ev.root != null && diatonicPcs.includes(ev.root)) {
            fittingChords++;
          }
        }
        
        const fitRatio = fittingChords / timeline.length;
        if (fitRatio >= 0.7) {
          candidates.push({
            root: tonic,
            minor: isMinor,
            score: score + fitRatio * 30
          });
        }
      }
    }
    
    if (candidates.length === 0) return initialKey;
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    // Only change if significantly better
    const initialScore = candidates.find(c => c.root === initialKey.root && c.minor === initialKey.minor)?.score || 0;
    
    if (best.score > initialScore + 20) {
      return {
        root: best.root,
        minor: best.minor,
        confidence: Math.min(0.95, initialKey.confidence + 0.1)
      };
    }
    
    return initialKey;
  }

  // ═══════════════════════════════════════════════════════════
  // v16.34: BETTER SLASH CHORD DETECTION
  // ═══════════════════════════════════════════════════════════

  addSlashChords(timeline, features, key) {
    const { bass, chroma } = features;
    const diatonic = this.getDiatonicInfo(key);
    
    return timeline.map(ev => {
      if (!ev || !ev.label || ev.fi == null) return ev;
      if (ev.label.includes('/')) return ev; // Already has slash
      
      const bassNote = bass[ev.fi];
      if (bassNote < 0 || bassNote === ev.root) return ev;
      
      // Check if bass note is chord tone (3rd or 5th)
      const isMinor = ev.type === 'minor';
      const third = this.toPc(ev.root + (isMinor ? 3 : 4));
      const fifth = this.toPc(ev.root + 7);
      
      if (bassNote === third || bassNote === fifth) {
        // Standard inversion
        return {
          ...ev,
          label: ev.label + '/' + this.getNoteName(bassNote, key)
        };
      }
      
      // v16.34: Check for V/V (secondary dominant) pattern
      // If bass is the fifth of another diatonic chord
      for (const dc of diatonic.chords) {
        const dcFifth = this.toPc(dc.root + 7);
        if (bassNote === dcFifth && ev.root !== dc.root) {
          // This could be a V/x situation
          const c = chroma[ev.fi];
          const bassStrength = c ? c[bassNote] : 0;
          if (bassStrength > 0.15) {
            return {
              ...ev,
              label: ev.label + '/' + this.getNoteName(bassNote, key),
              slashType: 'secondary'
            };
          }
        }
      }
      
      // v16.34: Non-diatonic bass slash chord
      if (!diatonic.pcs.includes(bassNote)) {
        const c = chroma[ev.fi];
        const bassStrength = c ? c[bassNote] : 0;
        if (bassStrength > 0.20) {
          return {
            ...ev,
            label: ev.label + '/' + this.getNoteName(bassNote, key),
            slashType: 'chromatic'
          };
        }
      }
      
      return ev;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // v16.34: IMPROVED PATTERN MEMORY (3 and 4 chord patterns)
  // ═══════════════════════════════════════════════════════════

  applyPatternMemoryV2(timeline, key) {
    if (timeline.length < 4) return timeline;

    // Common progressions (relative to tonic)
    const commonProgressions = [
      // 4-chord patterns
      { pattern: [0, 7, 9, 5], name: 'I-V-vi-IV' },    // Pop progression
      { pattern: [0, 5, 7, 0], name: 'I-IV-V-I' },     // Blues/Rock
      { pattern: [9, 5, 0, 7], name: 'vi-IV-I-V' },    // Sensitive progression
      { pattern: [0, 9, 5, 7], name: 'I-vi-IV-V' },    // 50s progression
      // 3-chord patterns
      { pattern: [0, 5, 7], name: 'I-IV-V' },
      { pattern: [0, 7, 5], name: 'I-V-IV' },
      { pattern: [9, 5, 0], name: 'vi-IV-I' },
      { pattern: [5, 7, 0], name: 'IV-V-I' },
      { pattern: [2, 7, 0], name: 'ii-V-I' },
    ];

    // Build pattern histogram from timeline
    const patternHist = new Map();
    const labels = timeline.map(ev => ev ? this.normalizeLabel(ev.label) : '');
    const roots = timeline.map(ev => ev ? ev.root : -1);
    
    // Count 3-chord patterns
    for (let i = 0; i <= roots.length - 3; i++) {
      if (roots[i] < 0 || roots[i+1] < 0 || roots[i+2] < 0) continue;
      const pattern = [roots[i], roots[i+1], roots[i+2]].join(',');
      patternHist.set(pattern, (patternHist.get(pattern) || 0) + 1);
    }
    
    // Count 4-chord patterns
    for (let i = 0; i <= roots.length - 4; i++) {
      if (roots[i] < 0 || roots[i+1] < 0 || roots[i+2] < 0 || roots[i+3] < 0) continue;
      const pattern = [roots[i], roots[i+1], roots[i+2], roots[i+3]].join(',');
      patternHist.set(pattern, (patternHist.get(pattern) || 0) + 1);
    }

    // Find strong patterns (appear 3+ times)
    const strongPatterns = [...patternHist.entries()]
      .filter(([p, count]) => count >= 3)
      .map(([p, count]) => ({ pattern: p.split(',').map(Number), count }))
      .sort((a, b) => b.count - a.count);

    if (!strongPatterns.length) return timeline;

    console.log(`🎼 Found ${strongPatterns.length} strong patterns`);

    const result = [...timeline];

    // Fix anomalies that break patterns
    for (let i = 1; i < result.length - 2; i++) {
      const ev = result[i];
      if (!ev || !ev.label) continue;
      if ((ev.confidence || 0) >= 75) continue; // Don't touch high confidence

      // Check if this chord breaks a known pattern
      for (const sp of strongPatterns) {
        const patLen = sp.pattern.length;
        if (i < patLen - 1) continue;

        // Get surrounding roots
        const surrounding = [];
        for (let j = i - (patLen - 1); j <= i + 1 && j < result.length; j++) {
          if (j < 0) continue;
          surrounding.push(result[j]?.root ?? -1);
        }
        
        if (surrounding.length < patLen) continue;

        // Check if replacing current chord would complete the pattern
        for (let offset = 0; offset <= surrounding.length - patLen; offset++) {
          const slice = surrounding.slice(offset, offset + patLen);
          let diffCount = 0;
          let diffIdx = -1;
          let expectedRoot = -1;
          
          for (let k = 0; k < patLen; k++) {
            if (slice[k] !== sp.pattern[k]) {
              diffCount++;
              diffIdx = offset + k;
              expectedRoot = sp.pattern[k];
            }
          }
          
          // Single difference at current position
          const currentIdxInSlice = i - (i - (patLen - 1)) - offset;
          if (diffCount === 1 && diffIdx === currentIdxInSlice + offset && expectedRoot >= 0) {
            // Check if expected root is diatonic
            const diatonic = this.getDiatonicInfo(key);
            if (diatonic.pcs.includes(expectedRoot)) {
              const dc = diatonic.chords.find(c => c.root === expectedRoot);
              const newLabel = this.getNoteName(expectedRoot, key) + (dc?.minor ? 'm' : '');
              console.log(`🔧 Pattern fix at ${i}: ${ev.label} → ${newLabel} (${sp.pattern.join('-')} x${sp.count})`);
              result[i] = { 
                ...ev, 
                root: expectedRoot, 
                label: newLabel, 
                chordType: 'patternFix',
                type: dc?.minor ? 'minor' : 'major'
              };
              break;
            }
          }
        }
      }
    }

    return result;
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
    const x = this.resample(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);

    return { x, sr, bpm, duration: x.length / sr };
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

    const bpm = 60 / (bestLag * (hop / sr));
    return Math.max(60, Math.min(200, Math.round(bpm)));
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
    const bass = [];
    const energy = [];

    for (let s = 0; s + win <= x.length; s += hop) {
      const frame = x.subarray(s, s + win);
      const windowed = new Float32Array(win);
      for (let k = 0; k < win; k++) windowed[k] = frame[k] * hann[k];

      let en = 0;
      for (let k = 0; k < win; k++) en += windowed[k] * windowed[k];
      energy.push(en);

      const { mags, N } = this.fft(windowed);

      const c = new Float32Array(12);
      for (let b = 1; b < mags.length; b++) {
        const f = b * sr / N;
        if (f < 80 || f > 5000) continue;
        const midi = 69 + 12 * Math.log2(f / 440);
        const pc = this.toPc(Math.round(midi));
        c[pc] += mags[b];
      }
      const sum = c.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;
      chroma.push(c);

      bass.push(this.detectBassNote(mags, sr, N));
    }

    const energyP40 = this.percentile(energy, 40);
    for (let i = 1; i < bass.length - 1; i++) {
      const v = bass[i];
      if (v < 0 || energy[i] < energyP40 || (bass[i - 1] !== v && bass[i + 1] !== v)) {
        bass[i] = -1;
      }
    }

    const energySorted = [...energy].sort((a, b) => a - b);
    const percentile = (p) => energySorted[Math.floor(energySorted.length * p / 100)] || 0;

    return {
      chroma, 
      bass,
      bassPc: bass,
      energy,
      frameE: energy,
      sr, 
      hop,
      secPerFrame: hop / sr,
      numFrames: chroma.length,
      introSkipFrames: 0,
      percentiles: {
        p30: percentile(30),
        p40: percentile(40),
        p50: percentile(50),
        p70: percentile(70),
        p80: percentile(80)
      },
      energyP30: percentile(30),
      energyP50: percentile(50),
      energyP70: percentile(70),
      energyP80: percentile(80)
    };
  }

  detectBassNote(mags, sr, N) {
    const fmin = 40, fmax = 300;
    const yLP = new Float32Array(N);

    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sr / N;
      if (freq > fmax) break;
      if (freq >= fmin) {
        const omega = 2 * Math.PI * freq / sr;
        const weight = freq < 150 ? 1.5 : 1.0;
        for (let n = 0; n < N; n++) yLP[n] += mags[bin] * Math.cos(omega * n) * weight;
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

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) r += (yLP[n] - mean) * (yLP[n + lag] - mean);
      r /= variance;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    if (bestLag > 0 && bestR > 0.30) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        return this.toPc(Math.round(69 + 12 * Math.log2(f0 / 440)));
      }
    }
    return -1;
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

  // ═══════════════════════════════════════════════════════════
  // KEY DETECTION (from v14.36)
  // ═══════════════════════════════════════════════════════════

  detectTonicFromBass(feats) {
    const { bassPc, frameE, introSkipFrames, percentiles } = feats;
    const threshold = (percentiles && percentiles.p80) || this.percentile(frameE, 80);
    const bassHist = new Array(12).fill(0);
    const start = introSkipFrames || 0;

    for (let i = start; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        const w = frameE[i] / threshold;
        bassHist[bp] += w;
      }
    }

    let tonicPc = 0;
    let maxVal = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (bassHist[pc] > maxVal) {
        maxVal = bassHist[pc];
        tonicPc = pc;
      }
    }

    const total = bassHist.reduce((a, b) => a + b, 0) || 1;
    const confidence = maxVal / total;
    const root = tonicPc;
    
    const m3_bass = bassHist[this.toPc(root + 3)] / total;
    const M3_bass = bassHist[this.toPc(root + 4)] / total;
    const m6_bass = bassHist[this.toPc(root + 8)] / total;
    const M6_bass = bassHist[this.toPc(root + 9)] / total;
    const m7_bass = bassHist[this.toPc(root + 10)] / total;
    const M7_bass = bassHist[this.toPc(root + 11)] / total;

    let minorBassScore = 0;
    let majorBassScore = 0;

    if (m6_bass > 0.05) minorBassScore += 3.0;
    if (m7_bass > 0.05) minorBassScore += 2.5;
    if (m3_bass > 0.04) minorBassScore += 2.0;
    
    if (M6_bass > 0.05) majorBassScore += 3.0;
    if (M7_bass > 0.05) majorBassScore += 2.5;
    if (M3_bass > 0.04) majorBassScore += 2.0;

    if (m6_bass > M6_bass * 1.5 && m6_bass > 0.03) minorBassScore += 2.0;
    if (M6_bass > m6_bass * 1.5 && M6_bass > 0.03) majorBassScore += 2.0;

    if (m7_bass > M7_bass * 1.5 && m7_bass > 0.03) minorBassScore += 1.5;
    if (M7_bass > m7_bass * 1.5 && M7_bass > 0.03) majorBassScore += 1.5;

    if (m3_bass > M3_bass * 1.5 && m3_bass > 0.03) minorBassScore += 1.5;
    if (M3_bass > m3_bass * 1.5 && M3_bass > 0.03) majorBassScore += 1.5;

    let minorHint = undefined;
    let bassMinorConfidence = 0;

    if (minorBassScore > 2.0 || majorBassScore > 2.0) {
      minorHint = minorBassScore > majorBassScore;
      bassMinorConfidence = Math.min(1.0, Math.abs(minorBassScore - majorBassScore) / 8.0);
    }

    return { root: tonicPc, confidence, minorHint, bassMinorConfidence };
  }

  detectKeyEnhanced(feats) {
    const { chroma, frameE, introSkipFrames, percentiles } = feats;
    if (!chroma || !chroma.length) return { root: 0, minor: false, confidence: 0.5 };

    const bassTonic = this.detectTonicFromBass(feats);

    if (bassTonic.confidence > 0.25) {
      const root = bassTonic.root;
      const start = introSkipFrames || 0;
      const thr = (percentiles && percentiles.p80) || this.percentile(frameE, 80);

      const agg = new Array(12).fill(0);
      let totalW = 0;

      const opening = new Array(12).fill(0);
      const closing = new Array(12).fill(0);
      let openingW = 0;
      let closingW = 0;

      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= thr) {
          const w = frameE[i] / thr;
          const c = chroma[i];
          
          for (let p = 0; p < 12; p++) agg[p] += c[p] * w;
          totalW += w;

          if (i < start + 5) {
            for (let p = 0; p < 12; p++) opening[p] += c[p] * w * 3.0;
            openingW += w * 3.0;
          }

          if (i >= chroma.length - 5) {
            for (let p = 0; p < 12; p++) closing[p] += c[p] * w * 3.0;
            closingW += w * 3.0;
          }
        }
      }

      if (totalW > 0) for (let p = 0; p < 12; p++) agg[p] /= totalW;
      if (openingW > 0) for (let p = 0; p < 12; p++) opening[p] /= openingW;
      if (closingW > 0) for (let p = 0; p < 12; p++) closing[p] /= closingW;

      const m3 = agg[this.toPc(root + 3)] || 0;
      const M3 = agg[this.toPc(root + 4)] || 0;
      const m6 = agg[this.toPc(root + 8)] || 0;
      const M6 = agg[this.toPc(root + 9)] || 0;
      const m7 = agg[this.toPc(root + 10)] || 0;
      const M7 = agg[this.toPc(root + 11)] || 0;

      const opening_m3 = opening[this.toPc(root + 3)] || 0;
      const opening_M3 = opening[this.toPc(root + 4)] || 0;
      const closing_m3 = closing[this.toPc(root + 3)] || 0;
      const closing_M3 = closing[this.toPc(root + 4)] || 0;

      let minorScore = 0;
      let majorScore = 0;

      const thirdRatio = (m3 + 0.0001) / (M3 + 0.0001);
      if (thirdRatio >= 1.03) minorScore += 5.0 * Math.min(3.0, thirdRatio - 1.0);
      else if (thirdRatio <= 0.97) majorScore += 5.0 * Math.min(3.0, 1.0 / thirdRatio - 1.0);

      const sixthRatio = (m6 + 0.0001) / (M6 + 0.0001);
      if (sixthRatio >= 1.08) minorScore += 3.0 * Math.min(2.5, sixthRatio - 1.0);
      else if (sixthRatio <= 0.93) majorScore += 3.0 * Math.min(2.5, 1.0 / sixthRatio - 1.0);

      const seventhRatio = (m7 + 0.0001) / (M7 + 0.0001);
      if (seventhRatio >= 1.08) minorScore += 2.0 * Math.min(2.0, seventhRatio - 1.0);
      else if (seventhRatio <= 0.93) majorScore += 2.0 * Math.min(2.0, 1.0 / seventhRatio - 1.0);

      const openingThirdRatio = (opening_m3 + 0.0001) / (opening_M3 + 0.0001);
      if (openingThirdRatio > 1.05) minorScore += 4.0;
      else if (openingThirdRatio < 0.95) majorScore += 4.0;

      const closingThirdRatio = (closing_m3 + 0.0001) / (closing_M3 + 0.0001);
      if (closingThirdRatio > 1.05) minorScore += 4.0;
      else if (closingThirdRatio < 0.95) majorScore += 4.0;

      if (bassTonic.minorHint !== undefined) {
        if (bassTonic.minorHint) minorScore += bassTonic.bassMinorConfidence * 3.0;
        else majorScore += bassTonic.bassMinorConfidence * 3.0;
      }

      if (Math.abs(minorScore - majorScore) < 2.0) {
        if (m6 > 0.08 && m6 >= M6) minorScore += 2.0;
        if (m3 > 0.10 && m3 >= M3 * 0.95) minorScore += 1.5;
      }

      const isMinor = minorScore > majorScore;
      const separation = Math.abs(minorScore - majorScore);
      const spread = Math.abs(m3 - M3) + Math.abs(m6 - M6) + Math.abs(m7 - M7);
      let confidence = 0.25 + bassTonic.confidence * 0.25 + separation * 0.15 + spread * 0.8;
      confidence = Math.min(1.0, confidence);

      return { root, minor: !!isMinor, confidence };
    }

    // Fallback: KS algorithm
    const agg = new Array(12).fill(0);

    for (let i = 0; i < chroma.length; i++) {
      const pos = i / chroma.length;
      let w = 1.0;
      if (pos < 0.10) w = 5.0;
      else if (pos > 0.90) w = 3.0;

      const c = chroma[i];
      for (let p = 0; p < 12; p++) agg[p] += c[p] * w;
    }

    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;

    let best = { score: -Infinity, root: 0, minor: false };

    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0;
      let scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        const idx = this.toPc(r + i);
        scoreMaj += agg[idx] * this.KS_MAJOR[i];
        scoreMin += agg[idx] * this.KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }

    const confidence = Math.min(1.0, best.score / 10);
    return { root: best.root, minor: best.minor, confidence };
  }

  // ═══════════════════════════════════════════════════════════
  // CHORD BUILDING (with dynamic thresholds)
  // ═══════════════════════════════════════════════════════════

  buildChordsStableBass(features, key, startFrame, bpm, songProfile = null) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);

    // v16.34: Use dynamic thresholds
    const profile = songProfile || { chromaChangeThreshold: 0.35, minDurationMultiplier: 1.0 };
    
    const MIN_DURATION_SEC = 0.5 * profile.minDurationMultiplier;
    const MIN_DURATION_NO_BASS_CHANGE = 1.0 * profile.minDurationMultiplier;
    const CHROMA_CHANGE_THRESHOLD = profile.chromaChangeThreshold;

    let currentBass = -1;
    let currentStart = startFrame;
    let currentChroma = null;

    const changeFrames = this.getChordChangeCandidates(features, bpm, startFrame);

    for (const i of changeFrames) {
      if (i >= bass.length) continue;

      const bp = bass[i];
      const hasEnergy = energy[i] >= energyP70 * 0.3;

      if (!hasEnergy || bp < 0) continue;

      if (currentBass === -1) {
        currentBass = bp;
        currentStart = i;
        currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        continue;
      }

      const durationSec = (i - currentStart) * secPerFrame;
      const bassChanged = (bp !== currentBass);

      let chromaChange = 0;
      if (currentChroma) {
        chromaChange = this.calculateChromaDistance(currentChroma, chroma[i]);
      }

      let shouldCommit = false;

      if (bassChanged) {
        shouldCommit = durationSec >= MIN_DURATION_SEC;
      } else {
        if (durationSec >= MIN_DURATION_NO_BASS_CHANGE && chromaChange >= CHROMA_CHANGE_THRESHOLD) {
          shouldCommit = true;
        }
      }

      if (shouldCommit) {
        const chord = this.determineChord(chroma, currentStart, i, key, diatonic, currentBass, secPerFrame);

        if (chord && chord.label) {
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
    }

    // Commit final chord
    if (currentBass >= 0 && chroma.length > currentStart) {
      const chord = this.determineChord(chroma, currentStart, chroma.length, key, diatonic, currentBass, secPerFrame);
      if (chord && chord.label) {
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

  getChordChangeCandidates(features, bpm, startFrame) {
    const { secPerFrame, bass, numFrames } = features;
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const candidates = new Set();

    candidates.add(startFrame);

    for (let t = 0; t < numFrames * secPerFrame; t += spb) {
      const frame = Math.round(t / secPerFrame);
      if (frame >= startFrame && frame < numFrames) {
        candidates.add(frame);
      }
    }

    for (let i = startFrame + 1; i < bass.length; i++) {
      if (bass[i] >= 0 && bass[i] !== bass[i - 1]) {
        candidates.add(i);
      }
    }

    return [...candidates].sort((a, b) => a - b);
  }

  calculateChromaDistance(chroma1, chroma2) {
    let diff = 0;
    for (let p = 0; p < 12; p++) {
      diff += Math.abs(chroma1[p] - chroma2[p]);
    }
    return diff / 2;
  }

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

  determineChord(chroma, startFrame, endFrame, key, diatonic, bassNote, secPerFrame) {
    const count = endFrame - startFrame;
    if (count <= 0) return null;

    const avg = new Float32Array(12);
    for (let i = startFrame; i < endFrame && i < chroma.length; i++) {
      for (let p = 0; p < 12; p++) avg[p] += chroma[i][p];
    }
    for (let p = 0; p < 12; p++) avg[p] /= count;

    let total = 0;
    for (let p = 0; p < 12; p++) total += avg[p];
    if (total <= 0) return null;

    const candidates = [];
    
    for (const dc of diatonic.chords) {
      if (dc.root === bassNote) {
        const score = this.scoreChord(avg, dc.root, dc.minor);
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          score: score + 20,
          chordType: 'diatonic'
        });
      }
    }

    for (const dc of diatonic.chords) {
      const third = this.toPc(dc.root + (dc.minor ? 3 : 4));
      const fifth = this.toPc(dc.root + 7);
      
      if (third === bassNote || fifth === bassNote) {
        const score = this.scoreChord(avg, dc.root, dc.minor);
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: bassNote,
          score: score + 10,
          chordType: 'diatonic_inv'
        });
      }
    }

    if (candidates.length === 0) {
      const m3 = avg[this.toPc(bassNote + 3)];
      const M3 = avg[this.toPc(bassNote + 4)];
      const isMinor = m3 > M3;
      const score = this.scoreChord(avg, bassNote, isMinor);
      
      if (score > 30) {
        candidates.push({
          root: bassNote,
          isMinor,
          score,
          chordType: 'chromatic'
        });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    const noteName = this.getNoteName(best.root, key);
    let label = noteName + (best.isMinor ? 'm' : '');
    
    if (best.inversionBass !== undefined) {
      label += '/' + this.getNoteName(best.inversionBass, key);
    }

    return {
      root: best.root,
      label,
      type: best.isMinor ? 'minor' : 'major',
      inScale: diatonic.pcs.includes(best.root),
      confidence: Math.min(100, Math.round(best.score)),
      chordType: best.chordType
    };
  }

  scoreChord(avg, root, isMinor) {
    const r = avg[root] || 0;
    const third = avg[this.toPc(root + (isMinor ? 3 : 4))] || 0;
    const fifth = avg[this.toPc(root + 7)] || 0;
    const wrongThird = avg[this.toPc(root + (isMinor ? 4 : 3))] || 0;
    
    let score = r * 40 + third * 30 + fifth * 20;
    score -= wrongThird * 20;
    
    return score;
  }

  // ═══════════════════════════════════════════════════════════
  // HMM CHORD BUILDING (with dynamic thresholds)
  // ═══════════════════════════════════════════════════════════

  buildChordsHMM(features, key, startFrame, songProfile = null) {
    const { chroma, bass, energy, energyP70, secPerFrame } = features;
    const diatonic = this.getDiatonicInfo(key);

    // v16.34: Use dynamic match score threshold
    const profile = songProfile || { matchScoreThreshold: 0.15 };
    const MATCH_THRESHOLD = profile.matchScoreThreshold;

    const candidates = [];
    for (const dc of diatonic.chords) {
      candidates.push({
        root: dc.root,
        minor: dc.minor,
        label: this.getNoteName(dc.root, key) + (dc.minor ? 'm' : ''),
        borrowed: false,
        intervals: dc.minor ? [0, 3, 7] : [0, 4, 7]
      });
    }

    if (!key.minor) {
      const bVII = this.toPc(key.root + 10);
      const iv = this.toPc(key.root + 5);
      candidates.push({ root: bVII, minor: false, label: this.getNoteName(bVII, key), borrowed: true, intervals: [0, 4, 7] });
      candidates.push({ root: iv, minor: true, label: this.getNoteName(iv, key) + 'm', borrowed: true, intervals: [0, 3, 7] });
    } else {
      const V = this.toPc(key.root + 7);
      const IV = this.toPc(key.root + 5);
      candidates.push({ root: V, minor: false, label: this.getNoteName(V, key), borrowed: true, intervals: [0, 4, 7] });
      candidates.push({ root: IV, minor: false, label: this.getNoteName(IV, key), borrowed: true, intervals: [0, 4, 7] });
    }

    const N = candidates.length;
    const M = chroma.length;
    if (M === 0 || N === 0) return [];

    const dp = new Float32Array(N);
    const backptr = [];

    for (let s = 0; s < N; s++) {
      dp[s] = this.calcEmitScore(chroma[startFrame], bass[startFrame], energy[startFrame], energyP70, candidates[s], MATCH_THRESHOLD);
    }
    backptr.push(new Int32Array(N).fill(-1));

    for (let i = startFrame + 1; i < M; i++) {
      const newdp = new Float32Array(N);
      const newback = new Int32Array(N);

      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestJ = 0;

        for (let j = 0; j < N; j++) {
          const trans = this.transitionScore(candidates[j], candidates[s], key);
          const val = dp[j] + trans;
          if (val > bestVal) {
            bestVal = val;
            bestJ = j;
          }
        }

        newdp[s] = bestVal + this.calcEmitScore(chroma[i], bass[i], energy[i], energyP70, candidates[s], MATCH_THRESHOLD);
        newback[s] = bestJ;
      }

      for (let s = 0; s < N; s++) dp[s] = newdp[s];
      backptr.push(newback);
    }

    let bestS = 0;
    for (let s = 1; s < N; s++) {
      if (dp[s] > dp[bestS]) bestS = s;
    }

    const states = new Int32Array(M - startFrame);
    states[states.length - 1] = bestS;
    for (let i = states.length - 1; i > 0; i--) {
      states[i - 1] = backptr[i][states[i]];
    }

    const timeline = [];
    let cur = states[0];
    let start = startFrame;

    for (let i = 1; i < states.length; i++) {
      if (states[i] !== cur) {
        const cand = candidates[cur];
        if (cand && cand.label) {
          timeline.push({
            t: start * secPerFrame,
            fi: start,
            label: cand.label,
            root: cand.root,
            type: cand.minor ? 'minor' : 'major',
            inScale: !cand.borrowed,
            confidence: 70,
            chordType: 'hmm'
          });
        }
        cur = states[i];
        start = startFrame + i;
      }
    }

    const lastCand = candidates[cur];
    if (lastCand && lastCand.label) {
      timeline.push({
        t: start * secPerFrame,
        fi: start,
        label: lastCand.label,
        root: lastCand.root,
        type: lastCand.minor ? 'minor' : 'major',
        inScale: !lastCand.borrowed,
        confidence: 70,
        chordType: 'hmm'
      });
    }

    return timeline;
  }

  calcEmitScore(frame, bassNote, energy, energyP70, candidate, threshold = 0.15) {
    if (!frame) return -Infinity;
    
    let templateScore = 0;
    for (const iv of candidate.intervals) {
      templateScore += (frame[this.toPc(candidate.root + iv)] || 0);
    }
    
    let frameNorm = 0;
    for (let i = 0; i < 12; i++) frameNorm += frame[i] * frame[i];
    frameNorm = Math.sqrt(frameNorm) || 1;
    
    const matchScore = templateScore / (3 * frameNorm);
    
    if (matchScore < threshold) return -Infinity;
    
    let score = matchScore * 10;
    
    if (bassNote >= 0 && bassNote === candidate.root) score += 3;
    if (energy < energyP70 * 0.3) score -= 1;
    if (candidate.borrowed) score -= 1;
    
    return score;
  }

  transitionScore(from, to, key) {
    if (from.root === to.root && from.minor === to.minor) return 0.5;
    
    const interval = this.toPc(to.root - from.root);
    if (interval === 7 || interval === 5) return 0.3;
    if (interval === 2 || interval === 10) return 0.1;
    
    return -0.2;
  }

  // ═══════════════════════════════════════════════════════════
  // ENGINE MERGING & VALIDATION
  // ═══════════════════════════════════════════════════════════

  mergeEngines(bassTimeline, hmmTimeline, features, key) {
    if (!bassTimeline.length) return hmmTimeline;
    if (!hmmTimeline.length) return bassTimeline;

    const merged = [];
    const tolerance = 0.3;

    for (const bassEv of bassTimeline) {
      if (!bassEv || !bassEv.label) continue;
      
      const hmmMatch = hmmTimeline.find(h => 
        h && h.label && Math.abs(h.t - bassEv.t) < tolerance
      );

      if (hmmMatch && hmmMatch.root === bassEv.root) {
        merged.push({
          ...bassEv,
          confidence: Math.min(100, (bassEv.confidence || 70) + 10),
          chordType: 'consensus'
        });
      } else if (hmmMatch) {
        if ((bassEv.confidence || 70) >= (hmmMatch.confidence || 70)) {
          merged.push(bassEv);
        } else {
          merged.push(hmmMatch);
        }
      } else {
        merged.push(bassEv);
      }
    }

    merged.sort((a, b) => a.t - b.t);

    const deduped = [];
    for (const ev of merged) {
      if (!ev || !ev.label) continue;
      if (!deduped.length || deduped[deduped.length - 1].label !== ev.label) {
        deduped.push(ev);
      }
    }

    return deduped;
  }

  validateWithCircleOfFifths(timeline, key, features) {
    if (timeline.length < 2) return timeline;

    const diatonic = this.getDiatonicInfo(key);
    const validated = [];

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev || !ev.label) continue;
      
      const next = timeline[i + 1];
      const dur = next ? (next.t - ev.t) : 1.0;

      const inScale = diatonic.pcs.includes(ev.root);

      if (inScale) {
        validated.push(ev);
        continue;
      }

      if (dur >= 1.0 || ev.confidence >= 80) {
        validated.push({ ...ev, modalContext: 'chromatic' });
      }
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

      if (!prev || !curr || !next) continue;

      const prevToCurr = this.getTransitionQuality(prev.root, curr.root);
      const currToNext = this.getTransitionQuality(curr.root, next.root);
      const prevToNext = this.getTransitionQuality(prev.root, next.root);

      if (prevToNext > prevToCurr + currToNext && curr.confidence < 60) {
        result.splice(i, 1);
        i--;
      }
    }

    return result;
  }

  getTransitionQuality(fromRoot, toRoot) {
    if (fromRoot === toRoot) return 10;
    const interval = this.toPc(toRoot - fromRoot);
    if (interval === 7 || interval === 5) return 8;
    if (interval === 2 || interval === 10) return 5;
    return 2;
  }

  addExtensions(timeline, features, key, opts) {
    const { chroma } = features;

    return timeline.map(ev => {
      if (!ev || !ev.label) return ev;
      if (ev.fi == null || ev.fi < 0 || ev.fi >= chroma.length) return ev;
      if (ev.label.includes('/')) return ev;

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

      const b7 = avg[this.toPc(root + 10)];
      const M7 = avg[this.toPc(root + 11)];

      let label = ev.label;

      if (!label.includes('7')) {
        if (!isMinor && M7 > 0.12 && M7 > b7 * 1.5) {
          label = label + 'maj7';
        } else if (b7 > 0.12 && b7 > M7 * 1.2) {
          label = label + '7';
        }
      }

      return { ...ev, label };
    });
  }

  finalizeTimeline(timeline, bpm, features) {
    if (!timeline.length) return [];

    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDuration = 0.4 * spb;

    let filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev || !ev.label) continue;
      
      const next = timeline[i + 1];
      const duration = next ? (next.t - ev.t) : minDuration;

      const isShort = duration < minDuration;
      const isStrong = (ev.confidence || 0) >= 80;

      if (!isShort || isStrong) {
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
      if (!ev || !ev.label) continue;
      if (!merged.length || merged[merged.length - 1].label !== ev.label) {
        merged.push(ev);
      }
    }

    return merged;
  }

  // ═══════════════════════════════════════════════════════════
  // STATS & EASY ROCK
  // ═══════════════════════════════════════════════════════════

  buildStats(timeline, key) {
    const diatonic = this.getDiatonicInfo(key);
    
    let inScale = 0, borrowed = 0, chromatic = 0, inversions = 0, extensions = 0;

    for (const ev of timeline) {
      if (!ev || !ev.label) continue;
      
      if (ev.label.includes('/')) inversions++;
      if (/7|9|11|13|6|sus|dim|aug/.test(ev.label)) extensions++;

      if (diatonic.pcs.includes(ev.root)) {
        inScale++;
      } else if (ev.chordType && ev.chordType.includes('borrowed')) {
        borrowed++;
      } else {
        chromatic++;
      }
    }

    return {
      totalChords: timeline.length,
      inScale,
      borrowed,
      chromatic,
      inversions,
      extensions
    };
  }

  isEasyRockSong(stats, key) {
    const total = stats.totalChords || 1;
    const inScaleRatio = stats.inScale / total;
    const chromaticRatio = stats.chromatic / total;

    return inScaleRatio >= 0.75 && chromaticRatio <= 0.20;
  }

  enforceEasyDiatonic(timeline, key) {
    const diatonic = this.getDiatonicInfo(key);
    
    return timeline.map(ev => {
      if (!ev || !ev.label) return ev;
      if (diatonic.pcs.includes(ev.root)) return ev;

      let closest = diatonic.pcs[0];
      let minDist = 12;
      for (const pc of diatonic.pcs) {
        const dist = Math.min(Math.abs(ev.root - pc), 12 - Math.abs(ev.root - pc));
        if (dist < minDist) {
          minDist = dist;
          closest = pc;
        }
      }

      const dc = diatonic.chords.find(c => c.root === closest);
      const label = this.getNoteName(closest, key) + (dc && dc.minor ? 'm' : '');

      return { ...ev, root: closest, label, chordType: 'snapped' };
    });
  }

  smoothOutliers(timeline, key, diatonicInfo) {
    if (timeline.length < 3) return timeline;

    const result = [];

    for (let i = 0; i < timeline.length; i++) {
      const prev = i > 0 ? timeline[i - 1] : null;
      const curr = timeline[i];
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;

      if (!curr || !curr.label) continue;

      if (prev && next && prev.label === next.label && curr.label !== prev.label) {
        const currInScale = diatonicInfo.pcs.includes(curr.root);
        const prevInScale = diatonicInfo.pcs.includes(prev.root);

        if (!currInScale && prevInScale && (curr.confidence || 0) < 80) {
          continue;
        }
      }

      result.push(curr);
    }

    return result;
  }

  autoRefineTimeline(timeline, key, totalDuration) {
    if (!timeline || timeline.length === 0) return timeline;

    for (let i = 0; i < timeline.length; i++) {
      const cur = timeline[i];
      const next = timeline[i + 1];
      cur.__dur = next ? (next.t - cur.t) : (totalDuration - cur.t);
    }

    const diatonicInfo = this.getDiatonicInfo(key);
    const diatonicRoots = new Set(diatonicInfo.pcs);

    const hist = new Map();
    for (const ev of timeline) {
      if (!ev || !ev.label) continue;
      const base = this.normalizeLabel(ev.label);
      hist.set(base, (hist.get(base) || 0) + 1);
    }

    const cleaned = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = cleaned[cleaned.length - 1] || null;
      const next = timeline[i + 1];

      if (!ev || !ev.label) continue;

      const base = this.normalizeLabel(ev.label);
      const count = hist.get(base) || 0;
      const inScale = diatonicRoots.has(ev.root);
      const dur = ev.__dur || 0;

      const prevBase = prev ? this.normalizeLabel(prev.label) : null;
      const nextBase = next ? this.normalizeLabel(next.label) : null;
      const sandwiched = prev && next && prevBase === nextBase;

      if (!inScale && dur < 0.6 && count === 1 && sandwiched) {
        continue;
      }

      cleaned.push(ev);
    }

    const merged = [];
    for (const ev of cleaned) {
      if (!ev || !ev.label) continue;
      const last = merged[merged.length - 1];
      if (last && last.label === ev.label) continue;
      merged.push(ev);
    }

    return merged;
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  getNoteName(pc, key) {
    pc = this.toPc(pc);
    const keyRoot = key.root;
    const keyMinor = !!key.minor;

    const flatMaj = [5, 10, 3, 8, 1, 6, 11];
    const flatMin = [2, 7, 0, 5, 10, 3, 8];

    let useFlats = keyMinor ? flatMin.includes(keyRoot) : flatMaj.includes(keyRoot);

    if (keyRoot === 0 && !keyMinor) {
      if ([10, 3, 8].includes(pc)) useFlats = true;
    }

    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
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

  normalizeLabel(label) {
    if (!label) return '';
    return label.replace(/7|maj7|sus[24]|dim|aug|6|\/.*$/, '').trim();
  }

  percentile(arr, p) {
    if (!arr || !arr.length) return 0;
    const sorted = [...arr].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
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

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    
    return scale.map((deg, i) => {
      const pc = this.toPc(tonicPc + deg);
      return this.NOTES_SHARP[pc] + qualities[i];
    });
  }

  buildCircleOfFifths(key) {
    const keyName = this.getNoteName(key.root, key) + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(keyName.replace(/m$/, ''), key.minor ? 'minor' : 'major');
    const functions = key.minor ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    return chords.map((label, i) => ({ label, function: functions[i] || null }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
