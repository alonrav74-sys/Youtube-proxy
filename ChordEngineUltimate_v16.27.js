/**
 * ChordEngine v16.27 - Back to Basics (v14.36 HMM Core)
 * 
 * Takes the proven HMM from v14.36 and applies it directly.
 * No complex multi-engine merging, no musicStart skipping.
 * Simple, reliable, starts from frame 0.
 */

class ChordEngineUltimate {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this._hannCache = {};
  }

  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionSensitivity: options.extensionSensitivity || 1.0,
      progressCallback: options.progressCallback || null
    };

    console.log('🎵 ChordEngine v16.27 (v14.36 HMM Core)');

    // Step 1: Process audio (like v14.36)
    const audioData = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audioData.duration.toFixed(1)}s @ ${audioData.bpm} BPM`);

    if (opts.progressCallback) opts.progressCallback({ stage: 'extracting', progress: 0.1 });

    // Step 2: Extract features (like v14.36)
    const feats = this.extractFeatures(audioData);
    console.log(`✅ Features: ${feats.chroma.length} frames`);

    if (opts.progressCallback) opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });

    // Step 3: Detect key (like v14.36)
    let key = this.detectKeyEnhanced(feats);
    console.log(`✅ Key: ${this.NOTES_SHARP[key.root]}${key.minor ? 'm' : ''} (${(key.confidence * 100).toFixed(0)}%)`);

    if (opts.progressCallback) opts.progressCallback({ stage: 'analyzing', progress: 0.5 });

    // Step 4: HMM chord tracking - THE CORE (like v14.36)
    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
    console.log(`✅ HMM: ${timeline.length} raw chords`);

    if (opts.progressCallback) opts.progressCallback({ stage: 'refining', progress: 0.7 });

    // Step 5: Finalize and post-process (like v14.36)
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    
    // Validate key from detected chords
    const validatedKey = this.validateKeyFromChords(timeline, key, feats);
    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      console.log(`🔄 Key updated to: ${this.NOTES_SHARP[key.root]}${key.minor ? 'm' : ''}`);
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    }

    if (opts.progressCallback) opts.progressCallback({ stage: 'decorating', progress: 0.8 });

    // Step 6: Post-processing (like v14.36)
    timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);

    // Filter empty labels
    timeline = timeline.filter(ev => ev && ev.label && typeof ev.label === 'string' && ev.label.trim());

    if (opts.progressCallback) opts.progressCallback({ stage: 'complete', progress: 1.0 });

    console.log(`✅ Final: ${timeline.length} chords`);

    return {
      chords: timeline,
      key,
      bpm: audioData.bpm,
      duration: audioData.duration,
      stats: {
        totalChords: timeline.length
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIO PROCESSING (from v14.36)
  // ═══════════════════════════════════════════════════════════

  processAudio(audioBuffer) {
    const channels = audioBuffer.numberOfChannels || 1;
    const mono = (channels === 1) ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate || 44100;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);
    return { x, sr, bpm, duration: x.length / sr };
  }

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

  resampleLinear(samples, fromRate, toRate) {
    if (!samples || fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLength = Math.max(1, Math.floor(samples.length / ratio));
    const resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const i0 = Math.floor(srcIndex);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const t = srcIndex - i0;
      resampled[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
    return resampled;
  }

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const frames = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      frames.push(e);
    }
    if (frames.length < 4) return 120;

    const minLag = Math.floor(0.3 / (hop / sr));
    const maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    const bpm = 60 / (bestLag * (hop / sr));
    return isFinite(bpm) ? Math.max(60, Math.min(200, Math.round(bpm))) : 120;
  }

  // ═══════════════════════════════════════════════════════════
  // FEATURE EXTRACTION (from v14.36)
  // ═══════════════════════════════════════════════════════════

  extractFeatures(audioData) {
    const { x, sr } = audioData;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;

    if (!this._hannCache[win]) {
      const hann = new Float32Array(win);
      for (let i = 0; i < win; i++) {
        hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
      }
      this._hannCache[win] = hann;
    }
    const hann = this._hannCache[win];

    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) {
      frames.push(x.subarray(s, s + win));
    }

    const chroma = [];
    const bassPc = [];
    const frameE = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const windowed = new Float32Array(win);
      for (let k = 0; k < win; k++) windowed[k] = frame[k] * hann[k];

      let en = 0;
      for (let k = 0; k < win; k++) en += windowed[k] * windowed[k];
      frameE.push(en);

      const { mags, N } = this.fft(windowed);
      const c = new Float32Array(12);

      for (let b = 1; b < mags.length; b++) {
        const f = b * sr / N;
        if (f < 80 || f > 5000) continue;
        const midi = 69 + 12 * Math.log2(f / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        c[pc] += mags[b];
      }

      const sum = c.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;

      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }

    // Clean bass
    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) {
      const v = bassPc[i];
      if (v < 0 || frameE[i] < thrE || (bassPc[i - 1] !== v && bassPc[i + 1] !== v)) {
        bassPc[i] = -1;
      }
    }

    const percentiles = {
      p30: this.percentile(frameE, 30),
      p50: this.percentile(frameE, 50),
      p70: this.percentile(frameE, 70),
      p80: this.percentile(frameE, 80)
    };

    return { chroma, bassPc, frameE, hop, sr, percentiles };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250;
    const yLP = new Float32Array(N);

    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < N; n++) yLP[n] += mags[b] * Math.cos(omega * n);
      }
    }

    const f0minLag = Math.floor(sr / fmax);
    const f0maxLag = Math.floor(sr / fmin);
    let bestLag = -1, bestR = -1;

    let mean = 0;
    for (let n = 0; n < N; n++) mean += yLP[n];
    mean /= N || 1;

    let denom = 0;
    for (let n = 0; n < N; n++) denom += (yLP[n] - mean) ** 2;
    denom = denom || 1e-9;

    for (let lag = f0minLag; lag <= f0maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) r += (yLP[n] - mean) * (yLP[n + lag] - mean);
      r /= denom;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    if (bestLag > 0) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        return ((Math.round(69 + 12 * Math.log2(f0 / 440)) % 12) + 12) % 12;
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
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      let m = N >> 1;
      while (m >= 1 && j >= m) { j -= m; m >>= 1; }
      j += m;
    }

    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang), wli = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < (len >> 1); k++) {
          const uRe = re[i + k], uIm = im[i + k];
          const vRe = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi;
          const vIm = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr;
          re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
          re[i + k + (len >> 1)] = uRe - vRe; im[i + k + (len >> 1)] = uIm - vIm;
          const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr;
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

  detectKeyEnhanced(feats) {
    const { chroma, bassPc, frameE, percentiles } = feats;
    if (!chroma || !chroma.length) return { root: 0, minor: false, confidence: 0.5 };

    const toPc = n => ((n % 12) + 12) % 12;
    
    // Detect tonic from bass
    const bassHist = new Array(12).fill(0);
    const threshold = percentiles.p80;
    
    for (let i = 0; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        bassHist[bp] += frameE[i] / threshold;
      }
    }

    let tonicPc = 0, maxVal = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (bassHist[pc] > maxVal) { maxVal = bassHist[pc]; tonicPc = pc; }
    }

    const total = bassHist.reduce((a, b) => a + b, 0) || 1;
    const bassConfidence = maxVal / total;

    if (bassConfidence > 0.25) {
      // Use bass-derived tonic, determine major/minor from chroma
      const root = tonicPc;
      const agg = new Array(12).fill(0);
      let totalW = 0;

      for (let i = 0; i < chroma.length; i++) {
        if (frameE[i] >= percentiles.p70) {
          const w = frameE[i] / percentiles.p70;
          for (let p = 0; p < 12; p++) agg[p] += chroma[i][p] * w;
          totalW += w;
        }
      }
      if (totalW > 0) for (let p = 0; p < 12; p++) agg[p] /= totalW;

      const m3 = agg[toPc(root + 3)] || 0;
      const M3 = agg[toPc(root + 4)] || 0;
      const isMinor = m3 > M3 * 1.05;
      
      return { root, minor: isMinor, confidence: 0.5 + bassConfidence * 0.4 };
    }

    // Fallback: Krumhansl-Schmuckler
    const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

    const agg = new Array(12).fill(0);
    for (let i = 0; i < chroma.length; i++) {
      for (let p = 0; p < 12; p++) agg[p] += chroma[i][p];
    }
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;

    let best = { score: -Infinity, root: 0, minor: false };
    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0, scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += agg[toPc(r + i)] * KS_MAJOR[i];
        scoreMin += agg[toPc(r + i)] * KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }

    return { root: best.root, minor: best.minor, confidence: Math.min(1, best.score / 10) };
  }

  // ═══════════════════════════════════════════════════════════
  // HMM CHORD TRACKING (from v14.36) - THE CORE!
  // ═══════════════════════════════════════════════════════════

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode = true) {
    const { chroma, bassPc, hop, sr, frameE, percentiles } = feats;
    const toPc = n => ((n % 12) + 12) % 12;

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));

    // Build candidates: diatonic + common borrowed
    const candidates = [];

    for (const r of diatonicPcs) {
      const noteName = this.getNoteName(r, key);
      candidates.push({ root: r, label: noteName, type: 'major', borrowed: false });
      candidates.push({ root: r, label: noteName + 'm', type: 'minor', borrowed: false });
    }

    // Add borrowed chords
    if (!key.minor) {
      const bVII = toPc(key.root + 10);
      const bIII = toPc(key.root + 3);
      candidates.push({ root: bVII, label: this.getNoteName(bVII, key), type: 'major', borrowed: true });
      candidates.push({ root: bIII, label: this.getNoteName(bIII, key), type: 'major', borrowed: true });
    } else {
      const V = toPc(key.root + 7);
      const VII = toPc(key.root + 11);
      candidates.push({ root: V, label: this.getNoteName(V, key), type: 'major', borrowed: true });
      candidates.push({ root: VII, label: this.getNoteName(VII, key), type: 'major', borrowed: true });
    }

    // Build chord templates
    const chordTemplates = new Map();
    for (const cand of candidates) {
      const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7];
      const mask = new Array(12).fill(0);
      for (const iv of intervals) mask[toPc(cand.root + iv)] = 1;
      const maskNorm = Math.sqrt(mask.reduce((s, v) => s + v*v, 0)) || 1;
      chordTemplates.set(cand.label, { mask, maskNorm });
    }

    const chromaNorms = chroma.map(c => Math.sqrt(c.reduce((s, v) => s + v*v, 0)) || 1);
    const lowE = percentiles.p30;

    // Emit score function
    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      const tmpl = chordTemplates.get(cand.label);
      if (!tmpl) return -Infinity;

      let dot = 0;
      for (let p = 0; p < 12; p++) dot += c[p] * tmpl.mask[p];
      let score = dot / (chromaNorms[i] * tmpl.maskNorm);

      // Threshold for confidence
      if (score < 0.35) return -Infinity;

      if (!cand.borrowed) score += 0.20;
      else score -= 0.25;

      if (bassPc[i] >= 0 && cand.root === bassPc[i]) score += 0.15 * bassMultiplier;
      if (frameE[i] < lowE) score -= 0.30;

      return score;
    };

    // Transition cost
    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0;

      const circle = [0,7,2,9,4,11,6,1,8,3,10,5];
      const posA = circle.indexOf(a.root);
      const posB = circle.indexOf(b.root);
      let circleDist = Math.abs(posA - posB);
      if (circleDist > 6) circleDist = 12 - circleDist;

      let cost = 0.4 + 0.08 * circleDist;
      if (a.borrowed && b.borrowed) cost += 0.30;
      else if (a.borrowed || b.borrowed) cost += 0.18;
      if (!a.borrowed && !b.borrowed) cost -= 0.12;

      // Common progressions bonus
      const I = key.root;
      const V = toPc(key.root + (key.minor ? 7 : 7));
      const IV = toPc(key.root + 5);
      if (a.root === V && b.root === I) cost -= 0.15;
      if (a.root === IV && b.root === I) cost -= 0.10;

      return Math.max(0, cost);
    };

    const N = candidates.length;
    const M = chroma.length;
    if (!M || !N) return [];

    // Viterbi - START FROM FRAME 0!
    const dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    const BEAM_WIDTH = useFullMode ? 8 : 4;

    // Initialize at frame 0
    for (let s = 0; s < N; s++) dp[s] = emitScore(0, candidates[s]);

    // Forward pass from frame 1
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      const prevBeam = dp.map((score, idx) => ({ score, idx }))
        .sort((a, b) => b.score - a.score).slice(0, BEAM_WIDTH);

      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity, bestJ = -1;
        for (const { score: prevScore, idx: j } of prevBeam) {
          const val = prevScore - transitionCost(candidates[j], candidates[s]);
          if (val > bestVal) { bestVal = val; bestJ = j; }
        }
        newdp[s] = bestVal + emitScore(i, candidates[s]);
        backptr[i][s] = bestJ;
      }
      for (let s = 0; s < N; s++) dp[s] = newdp[s];
    }

    // Find best end state
    let bestS = 0, bestVal = -Infinity;
    for (let s = 0; s < N; s++) {
      if (dp[s] > bestVal) { bestVal = dp[s]; bestS = s; }
    }

    // Backtrack
    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) {
      states[i - 1] = backptr[i][states[i]];
    }

    // Convert to timeline - START FROM FRAME 0!
    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0];
    let start = 0;

    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        timeline.push({ t: start * secPerHop, label: candidates[cur].label, fi: start });
        cur = states[i];
        start = i;
      }
    }
    timeline.push({ t: start * secPerHop, label: candidates[cur].label, fi: start });

    console.log(`🎹 HMM: First chord = ${timeline[0]?.label} at t=${timeline[0]?.t.toFixed(2)}s`);

    return timeline;
  }

  // ═══════════════════════════════════════════════════════════
  // POST-PROCESSING (from v14.36)
  // ═══════════════════════════════════════════════════════════

  applyPostProcessing(timeline, key, feats, bpm, opts) {
    timeline = this.enforceEarlyDiatonic(timeline, key, feats, bpm);
    timeline = this.decorateQualities(timeline, feats, key, opts.harmonyMode);
    timeline = this.addInversions(timeline, feats, key, opts.bassMultiplier);
    return timeline;
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.50 * spb);
    const energyMedian = this.percentile(feats.frameE, 50);

    const filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = feats.frameE[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.85;

      const r = this.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);

      // Keep first chord always, filter weak short non-diatonic
      if (i === 0) { filtered.push(a); continue; }
      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic)) continue;
      if (dur < minDur * 0.6 && isWeak) continue;

      filtered.push(a);
    }

    // Snap to grid and merge consecutive same chords
    const snapped = [];
    for (const ev of filtered) {
      const grid = Math.round(ev.t / spb) * spb;
      const t = Math.abs(grid - ev.t) <= 0.35 * spb ? grid : ev.t;
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi });
      }
    }

    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline || !timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const earlyWindow = Math.max(15.0, 6 * spb);
    const toPc = n => ((n % 12) + 12) % 12;

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));
    const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];

    const getQuality = pc => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === toPc(pc)) return qualities[i];
      }
      return '';
    };

    const out = [];
    for (const ev of timeline) {
      let label = ev.label;
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        if (r >= 0 && !this.inKey(r, key.root, key.minor)) {
          // Force to tonic in very early part
          if (ev.t < 3.0) {
            label = this.NOTES_SHARP[toPc(key.root)] + getQuality(key.root);
          }
        }
      }
      out.push({ ...ev, label });
    }

    return out;
  }

  decorateQualities(timeline, feats, key, mode) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));

    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }

      const isMinorTriad = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|7|maj7|add9|9|sus|dim|aug).*$/, '');
      if (isMinorTriad) base += 'm';

      // Average chroma around this chord
      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      for (let i = i0; i <= i1; i++) {
        for (let p = 0; p < 12; p++) avg[p] += feats.chroma[i][p];
      }
      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) avg[p] /= len;

      const s = d => avg[toPc(root + d)] || 0;
      let label = base;

      // 7th detection
      const b7 = s(10), M7 = s(11);
      if (b7 > 0.16 && b7 > M7) {
        label = base + '7';
      } else if (M7 > 0.20 && M7 > b7 * 1.2 && !isMinorTriad) {
        label = base.replace(/m$/, '') + 'maj7';
      }

      out.push({ ...ev, label });
    }

    return out;
  }

  addInversions(timeline, feats, key, bassMultiplier) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if (r < 0) { out.push(ev); continue; }

      const isMinor = /m(?!aj)/.test(ev.label);
      const tones = isMinor ? [0,3,7] : [0,4,7];
      if (/7/.test(ev.label)) tones.push(10);
      if (/maj7/.test(ev.label)) tones.push(11);

      const bass = feats.bassPc[ev.fi] ?? -1;
      if (bass < 0 || bass === r) { out.push(ev); continue; }

      const rel = toPc(bass - r);
      if (tones.includes(rel)) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        if (c[bass] > c[r] * 0.7) {
          const slash = this.getNoteName(bass, key);
          out.push({ ...ev, label: ev.label + '/' + slash });
          continue;
        }
      }

      out.push(ev);
    }

    return out;
  }

  validateKeyFromChords(timeline, currentKey, feats) {
    if (!timeline || timeline.length < 3) return currentKey;

    const toPc = n => ((n % 12) + 12) % 12;
    const chordRoots = timeline.map(c => this.parseRoot(c.label)).filter(r => r >= 0);
    if (!chordRoots.length) return currentKey;

    // Check if chords fit current key
    let matchCount = 0;
    for (const root of chordRoots) {
      if (this.inKey(root, currentKey.root, currentKey.minor)) matchCount++;
    }

    if (matchCount / chordRoots.length >= 0.6) return currentKey;

    // Try to find better key
    let bestKey = currentKey, bestRatio = matchCount / chordRoots.length;
    for (let r = 0; r < 12; r++) {
      for (const minor of [false, true]) {
        let cnt = 0;
        for (const root of chordRoots) {
          if (this.inKey(root, r, minor)) cnt++;
        }
        const ratio = cnt / chordRoots.length;
        if (ratio > bestRatio + 0.15) {
          bestRatio = ratio;
          bestKey = { root: r, minor, confidence: Math.min(0.95, ratio) };
        }
      }
    }

    return bestKey;
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════

  inKey(pc, keyRoot, minor) {
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(iv => toPc(keyRoot + iv));
    return diatonic.includes(toPc(pc));
  }

  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#|b)?/);
    if (!m) return -1;
    const note = m[1] + (m[2] || '');
    let idx = this.NOTES_SHARP.indexOf(note);
    if (idx < 0) idx = this.NOTES_FLAT.indexOf(note);
    return idx;
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  getNoteName(pc, key) {
    pc = this.toPc(pc);
    const flatKeys = [5,10,3,8,1,6,11]; // F, Bb, Eb, Ab, Db, Gb, Cb
    const useFlats = flatKeys.includes(key.root);
    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }

  percentile(arr, p) {
    const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[Math.floor((p / 100) * (a.length - 1))];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
