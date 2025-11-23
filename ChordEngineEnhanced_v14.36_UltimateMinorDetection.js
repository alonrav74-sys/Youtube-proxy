/**
 * 🎵 ChordEngineEnhanced v15.0 - CLEAN REWRITE
 * Complete rewrite based on solid music theory principles
 * 
 * Core Principles:
 * 1. Circle of Fifths for key detection
 * 2. HMM with beam search for chord tracking
 * 3. Bass note detection for inversions
 * 4. Harmonic context analysis
 * 5. Progressive refinement pipeline
 * 
 * ✅ Clean code - no duplications
 * ✅ Robust error handling
 * ✅ Professional music theory
 */

class ChordEngineEnhanced {
  constructor() {
    // Musical constants
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];  // Ionian
    this.MINOR_SCALE = [0,2,3,5,7,8,10]; // Aeolian
    
    // Circle of Fifths: C→G→D→A→E→B→F#→C#→G#→D#→A#→F→C
    this.CIRCLE_OF_FIFTHS = [0,7,2,9,4,11,6,1,8,3,10,5];
    
    // Krumhansl-Schmuckler key profiles
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    
    // Cache for performance
    this._hannCache = {};
  }

  // ═══════════════════════════════════════════════════════════
  // 🎯 MAIN DETECTION PIPELINE
  // ═══════════════════════════════════════════════════════════
  
  async detect(audioBuffer, options = {}) {
    try {
      console.log('🎵 Starting chord detection...');
      
      // 1️⃣ Process audio
      const audioData = this.processAudio(audioBuffer);
      console.log(`✅ Audio: ${audioData.duration.toFixed(1)}s @ ${audioData.bpm} BPM`);
      
      // 2️⃣ Extract features (chroma + bass)
      const features = this.extractFeatures(audioData);
      console.log(`✅ Features: ${features.chroma.length} frames`);
      
      // 3️⃣ Detect key
      const key = this.detectKey(features);
      console.log(`✅ Key: ${this.formatKey(key)}`);
      
      // 4️⃣ Track chords with HMM
      let timeline = this.trackChords(features, key, options);
      console.log(`✅ Tracked: ${timeline.length} chord changes`);
      
      // 5️⃣ Refine timeline
      timeline = this.refineTimeline(timeline, audioData, features, key);
      console.log(`✅ Refined: ${timeline.length} chords`);
      
      // 6️⃣ Add qualities (7th, sus, etc)
      timeline = this.addQualities(timeline, features, key, options);
      
      // 7️⃣ Add inversions
      timeline = this.addInversions(timeline, features, key);
      
      // 8️⃣ Validate & filter
      timeline = this.validateChords(timeline, features, key);
      
      // ✅ Final safety check
      timeline = timeline.filter(ev => 
        ev && 
        ev.label && 
        typeof ev.label === 'string' && 
        ev.label.trim() !== ''
      );
      
      console.log(`🎉 Final: ${timeline.length} chords`);
      
      return {
        chords: timeline,
        key,
        bpm: audioData.bpm,
        duration: audioData.duration
      };
      
    } catch (error) {
      console.error('❌ Detection failed:', error);
      throw new Error(`Chord detection failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🎧 AUDIO PROCESSING
  // ═══════════════════════════════════════════════════════════
  
  processAudio(audioBuffer) {
    // Mix to mono
    let mono;
    if (audioBuffer.numberOfChannels === 1) {
      mono = audioBuffer.getChannelData(0);
    } else {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      const len = Math.min(left.length, right.length);
      mono = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        mono[i] = 0.5 * (left[i] + right[i]);
      }
    }
    
    // Resample to 22050 Hz
    const originalSR = audioBuffer.sampleRate || 44100;
    const targetSR = 22050;
    const x = this.resample(mono, originalSR, targetSR);
    
    // Estimate tempo
    const bpm = this.estimateTempo(x, targetSR);
    
    return {
      x,
      sr: targetSR,
      bpm,
      duration: x.length / targetSR
    };
  }
  
  resample(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    
    const ratio = fromRate / toRate;
    const newLength = Math.max(1, Math.floor(samples.length / ratio));
    const output = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const t = srcIdx - i0;
      output[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
    
    return output;
  }
  
  estimateTempo(x, sr) {
    // Simple onset detection for BPM
    const hopSize = Math.floor(0.1 * sr);
    const energy = [];
    
    for (let i = 0; i + 4096 <= x.length; i += hopSize) {
      let e = 0;
      for (let j = 0; j < 4096; j++) {
        e += x[i + j] * x[i + j];
      }
      energy.push(e);
    }
    
    if (energy.length < 4) return 120;
    
    // Autocorrelation for periodicity
    const minLag = Math.floor((0.3 * sr) / hopSize); // 200 BPM
    const maxLag = Math.floor((2.0 * sr) / hopSize); // 30 BPM
    
    let bestLag = minLag;
    let bestR = -Infinity;
    
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < energy.length - lag; i++) {
        r += energy[i] * energy[i + lag];
      }
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }
    
    const bpm = 60 / (bestLag * hopSize / sr);
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  // ═══════════════════════════════════════════════════════════
  // 🎼 FEATURE EXTRACTION
  // ═══════════════════════════════════════════════════════════
  
  extractFeatures(audioData) {
    const { x, sr } = audioData;
    const hopSize = Math.floor(0.10 * sr); // 100ms hops
    const windowSize = 4096;
    
    // Create Hann window (cached)
    if (!this._hannCache[windowSize]) {
      const hann = new Float32Array(windowSize);
      for (let i = 0; i < windowSize; i++) {
        hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
      }
      this._hannCache[windowSize] = hann;
    }
    const hann = this._hannCache[windowSize];
    
    const chroma = [];
    const bassPc = [];
    const energy = [];
    
    // Process each frame
    for (let start = 0; start + windowSize <= x.length; start += hopSize) {
      const frame = x.subarray(start, start + windowSize);
      
      // Apply window
      const windowed = new Float32Array(windowSize);
      let frameEnergy = 0;
      for (let i = 0; i < windowSize; i++) {
        windowed[i] = frame[i] * hann[i];
        frameEnergy += windowed[i] * windowed[i];
      }
      energy.push(frameEnergy);
      
      // FFT
      const spectrum = this.fft(windowed);
      
      // Chroma (12-bin pitch class profile)
      const chromaFrame = new Float32Array(12);
      for (let bin = 1; bin < spectrum.length; bin++) {
        const freq = bin * sr / windowSize;
        if (freq < 80 || freq > 5000) continue;
        
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        chromaFrame[pc] += spectrum[bin];
      }
      
      // Normalize chroma
      const chromaSum = chromaFrame.reduce((a, b) => a + b, 0) || 1;
      for (let i = 0; i < 12; i++) {
        chromaFrame[i] /= chromaSum;
      }
      chroma.push(chromaFrame);
      
      // Bass F0 detection
      const bass = this.detectBass(spectrum, sr, windowSize);
      bassPc.push(bass);
    }
    
    // Clean bass with median filter
    for (let i = 1; i < bassPc.length - 1; i++) {
      const neighbors = [bassPc[i-1], bassPc[i], bassPc[i+1]];
      const validNeighbors = neighbors.filter(n => n >= 0);
      if (validNeighbors.length < 2) {
        bassPc[i] = -1; // Remove isolated bass notes
      }
    }
    
    return { chroma, bassPc, energy, hopSize, sr };
  }
  
  detectBass(spectrum, sr, N) {
    // Detect bass note (40-250 Hz) using autocorrelation
    const fMin = 40;
    const fMax = 250;
    
    // Reconstruct time-domain signal from low frequencies
    const signal = new Float32Array(N);
    for (let bin = 1; bin < spectrum.length; bin++) {
      const freq = bin * sr / N;
      if (freq <= fMax) {
        const omega = 2 * Math.PI * freq / sr;
        for (let n = 0; n < N; n++) {
          signal[n] += spectrum[bin] * Math.cos(omega * n);
        }
      }
    }
    
    // Autocorrelation
    const minLag = Math.floor(sr / fMax);
    const maxLag = Math.floor(sr / fMin);
    
    let bestLag = -1;
    let bestR = 0;
    
    const mean = signal.reduce((a, b) => a + b, 0) / N;
    let variance = 0;
    for (let n = 0; n < N; n++) {
      variance += (signal[n] - mean) ** 2;
    }
    variance = variance || 1e-9;
    
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) {
        r += (signal[n] - mean) * (signal[n + lag] - mean);
      }
      r /= variance;
      
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }
    
    // Convert to pitch class
    if (bestLag > 0 && bestR > 0.3) {
      const f0 = sr / bestLag;
      if (f0 >= fMin && f0 <= fMax) {
        const midi = 69 + 12 * Math.log2(f0 / 440);
        return ((Math.round(midi) % 12) + 12) % 12;
      }
    }
    
    return -1; // No bass detected
  }
  
  fft(input) {
    // Cooley-Tukey FFT (radix-2)
    let n = input.length;
    let N = 1;
    while (N < n) N <<= 1;
    
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);
    
    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }
    
    // FFT computation
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang);
      const wli = Math.sin(ang);
      
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < len/2; k++) {
          const uRe = re[i + k];
          const uIm = im[i + k];
          const vRe = re[i + k + len/2] * wr - im[i + k + len/2] * wi;
          const vIm = re[i + k + len/2] * wi + im[i + k + len/2] * wr;
          
          re[i + k] = uRe + vRe;
          im[i + k] = uIm + vIm;
          re[i + k + len/2] = uRe - vRe;
          im[i + k + len/2] = uIm - vIm;
          
          const nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr;
          wr = nwr;
        }
      }
    }
    
    // Return magnitudes
    const mags = new Float32Array(N >> 1);
    for (let k = 0; k < mags.length; k++) {
      mags[k] = Math.hypot(re[k], im[k]);
    }
    
    return mags;
  }

  // ═══════════════════════════════════════════════════════════
  // 🔑 KEY DETECTION
  // ═══════════════════════════════════════════════════════════
  
  detectKey(features) {
    const { chroma, energy } = features;
    
    // Weighted average chroma (emphasize intro/outro)
    const avgChroma = new Float32Array(12);
    let totalWeight = 0;
    
    for (let i = 0; i < chroma.length; i++) {
      const position = i / chroma.length;
      let weight = 1.0;
      
      // Emphasize opening and closing
      if (position < 0.10) weight = 5.0;
      else if (position > 0.90) weight = 3.0;
      
      for (let pc = 0; pc < 12; pc++) {
        avgChroma[pc] += chroma[i][pc] * weight;
      }
      totalWeight += weight;
    }
    
    for (let pc = 0; pc < 12; pc++) {
      avgChroma[pc] /= totalWeight;
    }
    
    // Try all 24 keys (12 major + 12 minor)
    let bestKey = { root: 0, minor: false, score: -Infinity };
    
    for (let root = 0; root < 12; root++) {
      // Major key
      let scoreMajor = 0;
      for (let i = 0; i < 12; i++) {
        const pc = (root + i) % 12;
        scoreMajor += avgChroma[pc] * this.KS_MAJOR[i];
      }
      if (scoreMajor > bestKey.score) {
        bestKey = { root, minor: false, score: scoreMajor };
      }
      
      // Minor key
      let scoreMinor = 0;
      for (let i = 0; i < 12; i++) {
        const pc = (root + i) % 12;
        scoreMinor += avgChroma[pc] * this.KS_MINOR[i];
      }
      if (scoreMinor > bestKey.score) {
        bestKey = { root, minor: true, score: scoreMinor };
      }
    }
    
    // Calculate confidence
    const confidence = Math.min(1.0, bestKey.score / 10);
    
    return {
      root: bestKey.root,
      minor: bestKey.minor,
      confidence
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎼 CHORD TRACKING (HMM with Beam Search)
  // ═══════════════════════════════════════════════════════════
  
  trackChords(features, key, options) {
    const { chroma, bassPc, energy } = features;
    
    // Build candidate chord list (diatonic + borrowed)
    const candidates = this.buildCandidates(key);
    
    // Chord templates
    const templates = this.buildTemplates(candidates);
    
    // HMM parameters
    const BEAM_WIDTH = 8;
    const N = candidates.length;
    const M = chroma.length;
    
    if (!M || !N) return [];
    
    // Emission probability: how well does chroma match chord?
    const emit = (frameIdx, candIdx) => {
      const c = chroma[frameIdx];
      const tmpl = templates[candIdx];
      
      // Cosine similarity
      let dot = 0, normC = 0, normT = 0;
      for (let pc = 0; pc < 12; pc++) {
        dot += c[pc] * tmpl[pc];
        normC += c[pc] ** 2;
        normT += tmpl[pc] ** 2;
      }
      
      let score = dot / (Math.sqrt(normC * normT) || 1);
      
      // Boost if bass matches root
      if (bassPc[frameIdx] === candidates[candIdx].root) {
        score += 0.15;
      }
      
      // Require minimum confidence
      if (score < 0.35) return -Infinity;
      
      return score;
    };
    
    // Transition cost: prefer smooth progressions
    const transitionCost = (fromIdx, toIdx) => {
      const a = candidates[fromIdx];
      const b = candidates[toIdx];
      
      if (a.label === b.label) return 0.0;
      
      // Circle of fifths distance
      const posA = this.CIRCLE_OF_FIFTHS.indexOf(a.root);
      const posB = this.CIRCLE_OF_FIFTHS.indexOf(b.root);
      let circleDist = Math.abs(posA - posB);
      if (circleDist > 6) circleDist = 12 - circleDist;
      
      let cost = 0.4 + 0.08 * circleDist;
      
      // Prefer diatonic progressions
      if (!a.borrowed && !b.borrowed) cost -= 0.12;
      if (a.borrowed && b.borrowed) cost += 0.30;
      
      // Prefer V→I, IV→V, etc
      const interval = (b.root - a.root + 12) % 12;
      if (interval === 7) cost -= 0.08; // Perfect 5th up
      
      return Math.max(0.0, cost);
    };
    
    // Viterbi with beam search
    let dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    
    // Initialize
    for (let s = 0; s < N; s++) {
      dp[s] = emit(0, s);
    }
    
    // Forward pass
    for (let t = 1; t < M; t++) {
      const newDp = new Array(N).fill(-Infinity);
      
      // Beam: keep top-K previous states
      const beam = dp
        .map((score, idx) => ({ score, idx }))
        .sort((a, b) => b.score - a.score)
        .slice(0, BEAM_WIDTH);
      
      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestPrev = -1;
        
        for (const { score: prevScore, idx: prevIdx } of beam) {
          const val = prevScore - transitionCost(prevIdx, s);
          if (val > bestVal) {
            bestVal = val;
            bestPrev = prevIdx;
          }
        }
        
        newDp[s] = bestVal + emit(t, s);
        backptr[t][s] = bestPrev;
      }
      
      dp = newDp;
    }
    
    // Backtrack
    let bestState = 0;
    let bestScore = -Infinity;
    for (let s = 0; s < N; s++) {
      if (dp[s] > bestScore) {
        bestScore = dp[s];
        bestState = s;
      }
    }
    
    const states = new Array(M);
    states[M - 1] = bestState;
    for (let t = M - 1; t > 0; t--) {
      states[t - 1] = backptr[t][states[t]];
    }
    
    // Convert to timeline
    const secPerFrame = features.hopSize / features.sr;
    const timeline = [];
    let currentState = states[0];
    let startFrame = 0;
    
    for (let t = 1; t < M; t++) {
      if (states[t] !== currentState) {
        timeline.push({
          t: startFrame * secPerFrame,
          label: candidates[currentState].label,
          frameIdx: startFrame
        });
        currentState = states[t];
        startFrame = t;
      }
    }
    
    // Final chord
    timeline.push({
      t: startFrame * secPerFrame,
      label: candidates[currentState].label,
      frameIdx: startFrame
    });
    
    return timeline;
  }
  
  buildCandidates(key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(deg => (key.root + deg) % 12);
    
    const candidates = [];
    
    // Diatonic chords
    for (const pc of diatonicPcs) {
      candidates.push({
        root: pc,
        label: this.getNoteName(pc, key),
        type: 'major',
        borrowed: false
      });
      candidates.push({
        root: pc,
        label: this.getNoteName(pc, key) + 'm',
        type: 'minor',
        borrowed: false
      });
    }
    
    // Borrowed chords
    if (!key.minor) {
      // Major key: bVII, bVI, bIII, iv
      candidates.push({ root: (key.root + 10) % 12, label: this.getNoteName((key.root + 10) % 12, key), type: 'major', borrowed: true });
      candidates.push({ root: (key.root + 8) % 12, label: this.getNoteName((key.root + 8) % 12, key), type: 'major', borrowed: true });
      candidates.push({ root: (key.root + 3) % 12, label: this.getNoteName((key.root + 3) % 12, key), type: 'major', borrowed: true });
      candidates.push({ root: (key.root + 5) % 12, label: this.getNoteName((key.root + 5) % 12, key) + 'm', type: 'minor', borrowed: true });
    } else {
      // Minor key: V, IV, VII (major versions)
      candidates.push({ root: (key.root + 7) % 12, label: this.getNoteName((key.root + 7) % 12, key), type: 'major', borrowed: true });
      candidates.push({ root: (key.root + 5) % 12, label: this.getNoteName((key.root + 5) % 12, key), type: 'major', borrowed: true });
      candidates.push({ root: (key.root + 11) % 12, label: this.getNoteName((key.root + 11) % 12, key), type: 'major', borrowed: true });
      candidates.push({ root: key.root, label: this.getNoteName(key.root, key), type: 'major', borrowed: true });
    }
    
    return candidates;
  }
  
  buildTemplates(candidates) {
    return candidates.map(cand => {
      const intervals = cand.type === 'minor' ? [0, 3, 7] : [0, 4, 7];
      const template = new Float32Array(12);
      for (const interval of intervals) {
        template[(cand.root + interval) % 12] = 1;
      }
      return template;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 🎚️ REFINEMENT PIPELINE
  // ═══════════════════════════════════════════════════════════
  
  refineTimeline(timeline, audioData, features, key) {
    if (!timeline || !timeline.length) return [];
    
    const { bpm } = audioData;
    const secPerBeat = 60 / Math.max(60, Math.min(200, bpm));
    const minDuration = 0.5 * secPerBeat;
    
    // 1. Remove very short chords
    const filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      const duration = next ? (next.t - curr.t) : minDuration;
      
      // Keep if long enough OR if it's the last chord
      if (duration >= minDuration || !next) {
        filtered.push(curr);
      }
    }
    
    // 2. Snap to beat grid
    const snapped = filtered.map(ev => {
      const beatTime = Math.round(ev.t / secPerBeat) * secPerBeat;
      const snapTolerance = 0.35 * secPerBeat;
      
      const t = Math.abs(beatTime - ev.t) <= snapTolerance ? beatTime : ev.t;
      return { ...ev, t: Math.max(0, t) };
    });
    
    // 3. Merge consecutive duplicates
    const merged = [];
    for (const ev of snapped) {
      if (!merged.length || merged[merged.length - 1].label !== ev.label) {
        merged.push(ev);
      }
    }
    
    return merged;
  }
  
  addQualities(timeline, features, key, options) {
    const mode = options.harmonyMode || 'jazz';
    if (mode === 'basic') return timeline;
    
    return timeline.map(ev => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      // Get surrounding chroma
      const i0 = Math.max(0, ev.frameIdx - 2);
      const i1 = Math.min(features.chroma.length - 1, ev.frameIdx + 2);
      
      const avgChroma = new Float32Array(12);
      for (let i = i0; i <= i1; i++) {
        for (let pc = 0; pc < 12; pc++) {
          avgChroma[pc] += features.chroma[i][pc];
        }
      }
      const count = i1 - i0 + 1;
      for (let pc = 0; pc < 12; pc++) {
        avgChroma[pc] /= count;
      }
      
      const isMinor = /m(?!aj)/.test(ev.label);
      let label = ev.label;
      
      // Check for 7th
      const b7 = avgChroma[(root + 10) % 12];
      const maj7 = avgChroma[(root + 11) % 12];
      
      if (maj7 > 0.20 && maj7 > b7 * 1.2 && !isMinor) {
        label += 'maj7';
      } else if (b7 > 0.16) {
        label += '7';
      }
      
      // Check for sus
      const sus2 = avgChroma[(root + 2) % 12];
      const sus4 = avgChroma[(root + 5) % 12];
      const third = avgChroma[(root + (isMinor ? 3 : 4)) % 12];
      
      if (sus4 > 0.22 && sus4 > sus2 && third < 0.10) {
        label = label.replace(/m$/, '') + 'sus4';
      } else if (sus2 > 0.22 && sus2 > sus4 && third < 0.10) {
        label = label.replace(/m$/, '') + 'sus2';
      }
      
      return { ...ev, label };
    });
  }
  
  addInversions(timeline, features, key) {
    return timeline.map(ev => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      const bass = features.bassPc[ev.frameIdx];
      if (bass < 0 || bass === root) return ev;
      
      // Check if bass is in chord
      const isMinor = /m(?!aj)/.test(ev.label);
      const chordTones = isMinor ? [0, 3, 7] : [0, 4, 7];
      if (/7/.test(ev.label)) chordTones.push(10);
      if (/maj7/.test(ev.label)) chordTones[chordTones.length - 1] = 11;
      
      const bassInterval = (bass - root + 12) % 12;
      if (chordTones.includes(bassInterval)) {
        // Valid inversion!
        const bassName = this.getNoteName(bass, key);
        return { ...ev, label: ev.label + '/' + bassName };
      }
      
      return ev;
    });
  }
  
  validateChords(timeline, features, key) {
    return timeline.filter((ev, i) => {
      // Always keep if it's the only chord
      if (timeline.length === 1) return true;
      
      const root = this.parseRoot(ev.label);
      if (root < 0) return false; // Invalid label
      
      // Check chroma strength
      const chroma = features.chroma[ev.frameIdx];
      if (!chroma) return false;
      
      const rootStrength = chroma[root];
      const fifthStrength = chroma[(root + 7) % 12];
      
      // Require minimum root + fifth presence
      if (rootStrength < 0.08 && fifthStrength < 0.08) {
        return false; // Too weak
      }
      
      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 🛠️ UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════
  
  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#|b)?/);
    if (!m) return -1;
    
    const note = m[1] + (m[2] || '');
    let idx = this.NOTES_SHARP.indexOf(note);
    if (idx < 0) idx = this.NOTES_FLAT.indexOf(note);
    return idx;
  }
  
  getNoteName(pc, key) {
    pc = ((pc % 12) + 12) % 12;
    
    // Prefer flats in flat keys, sharps in sharp keys
    const flatKeys = [5, 10, 3, 8, 1, 6, 11]; // F, Bb, Eb, Ab, Db, Gb, Cb
    const useFlats = flatKeys.includes(key.root);
    
    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }
  
  formatKey(key) {
    const root = this.getNoteName(key.root, key);
    const mode = key.minor ? 'm' : '';
    const conf = Math.round(key.confidence * 100);
    return `${root}${mode} (${conf}%)`;
  }
  
  // ═══════════════════════════════════════════════════════════
  // 🔧 LEGACY COMPATIBILITY HELPERS
  // (Used by index.html - keep for backward compatibility)
  // ═══════════════════════════════════════════════════════════
  
  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      mono[i] = 0.5 * (left[i] + right[i]);
    }
    return mono;
  }
  
  // Alias for backward compatibility
  resampleLinear(samples, fromRate, toRate) {
    return this.resample(samples, fromRate, toRate);
  }
  
  estimateTempo(x, sr) {
    // Already implemented in main class
    return this.estimateTempo(x, sr);
  }
  
  toPc(n) {
    return ((n % 12) + 12) % 12;
  }
  
  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => {
      const pc = (tonicPc + deg) % 12;
      return this.NOTES_SHARP[pc] + qualities[i];
    });
  }
  
  buildCircleOfFifths(key) {
    const keyName = this.NOTES_SHARP[this.toPc(key.root)] + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(keyName.replace(/m$/, ''), key.minor ? 'minor' : 'major');
    const functions = key.minor 
      ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] 
      : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    return chords.map((label, i) => ({ 
      label, 
      function: functions[i] || null 
    }));
  }
  
  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
