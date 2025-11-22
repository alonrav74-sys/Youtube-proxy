/**
 * ChordDetectionCore.js - Core Audio Processing & Chord Detection
 * 
 * התפקידים:
 * ✅ עיבוד אודיו (FFT, Chroma extraction)
 * ✅ זיהוי בס (Bass F0 detection)
 * ✅ זיהוי מפתח (Key detection)
 * ✅ HMM Chord Tracking (ליבת זיהוי אקורדים)
 * 
 * משתמש ב: ChordEnhancer.js לעיבוד פוסט
 */

class ChordDetectionCore {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this._hannCache = {};
  }

  // ============================================================================
  // AUDIO PROCESSING
  // ============================================================================

  processAudio(audioBuffer, channelData, sampleRate) {
    let mono;
    if (channelData && sampleRate) {
      mono = channelData;
      const sr0 = sampleRate;
      const sr = 22050;
      const x = this.resampleLinear(mono, sr0, sr);
      const bpm = this.estimateTempo(x, sr);
      return { x, sr, bpm, duration: x.length / sr };
    }

    const channels = audioBuffer.numberOfChannels || 1;
    mono = (channels === 1) ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate || 44100;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);
    return { x, sr, bpm, duration: x.length / sr };
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
    let bestLag = minLag;
    let bestR = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) {
        r += frames[i] * frames[i + lag];
      }
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }

    const bpm = 60 / (bestLag * (hop / sr));
    if (!isFinite(bpm)) return 120;
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

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
      for (let k = 0; k < win; k++) {
        windowed[k] = frame[k] * hann[k];
      }

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
      if (sum > 0) {
        for (let k = 0; k < 12; k++) c[k] /= sum;
      }

      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }

    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) {
      const v = bassPc[i];
      if (v < 0 || frameE[i] < thrE || (bassPc[i - 1] !== v && bassPc[i + 1] !== v)) {
        bassPc[i] = -1;
      }
    }

    const introSkipFrames = this.computeDynamicIntroSkip(frameE, hop, sr);
    const percentiles = {
      p30: this.percentile(frameE, 30),
      p40: this.percentile(frameE, 40),
      p50: this.percentile(frameE, 50),
      p70: this.percentile(frameE, 70),
      p75: this.percentile(frameE, 75),
      p80: this.percentile(frameE, 80)
    };

    return { chroma, bassPc, frameE, hop, sr, introSkipFrames, percentiles };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40;
    const fmax = 250;
    const win = N;
    const yLP = new Float32Array(win);

    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < win; n++) {
          yLP[n] += mags[b] * Math.cos(omega * n);
        }
      }
    }

    const f0minLag = Math.floor(sr / fmax);
    const f0maxLag = Math.floor(sr / fmin);
    let bestLag = -1;
    let bestR = -1;

    let mean = 0;
    for (let n = 0; n < win; n++) mean += yLP[n];
    mean /= win || 1;

    let denom = 0;
    for (let n = 0; n < win; n++) {
      const d = yLP[n] - mean;
      denom += d * d;
    }
    denom = denom || 1e-9;

    for (let lag = f0minLag; lag <= f0maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < win - lag; n++) {
        const a = yLP[n] - mean;
        const b = yLP[n + lag] - mean;
        r += a * b;
      }
      r /= denom;
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }

    if (bestLag > 0) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        const midiF0 = 69 + 12 * Math.log2(f0 / 440);
        return ((Math.round(midiF0) % 12) + 12) % 12;
      }
    }

    return -1;
  }

  fft(input) {
    let n = input.length;
    let N = 1;
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
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang);
      const wli = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wr = 1;
        let wi = 0;
        for (let k = 0; k < (len >> 1); k++) {
          const uRe = re[i + k];
          const uIm = im[i + k];
          const vRe = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi;
          const vIm = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr;

          re[i + k] = uRe + vRe;
          im[i + k] = uIm + vIm;
          re[i + k + (len >> 1)] = uRe - vRe;
          im[i + k + (len >> 1)] = uIm - vIm;

          const nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr;
          wr = nwr;
        }
      }
    }

    const mags = new Float32Array(N >> 1);
    for (let k = 0; k < mags.length; k++) {
      mags[k] = Math.hypot(re[k], im[k]);
    }

    return { mags, N };
  }

  computeDynamicIntroSkip(frameE, hop, sr) {
    const thr = this.percentile(frameE, 70);
    let stable = 0;
    let i = 0;

    for (; i < frameE.length; i++) {
      if (frameE[i] >= thr) stable++;
      else stable = 0;
      if (stable * hop / sr >= 0.5) break;
    }

    const hardCapSec = 8.0;
    const hardCapFrames = Math.floor((hardCapSec * sr) / hop);
    return Math.min(i, hardCapFrames);
  }

  // ============================================================================
  // KEY DETECTION
  // ============================================================================

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
    
    const toPc = n => ((n % 12) + 12) % 12;
    
    const m3_bass = bassHist[toPc(root + 3)] / total;
    const M3_bass = bassHist[toPc(root + 4)] / total;
    const m6_bass = bassHist[toPc(root + 8)] / total;
    const M6_bass = bassHist[toPc(root + 9)] / total;
    const m7_bass = bassHist[toPc(root + 10)] / total;
    const M7_bass = bassHist[toPc(root + 11)] / total;

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
    const toPc = n => ((n % 12) + 12) % 12;

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

      const m3 = agg[toPc(root + 3)] || 0;
      const M3 = agg[toPc(root + 4)] || 0;
      const m6 = agg[toPc(root + 8)] || 0;
      const M6 = agg[toPc(root + 9)] || 0;
      const m7 = agg[toPc(root + 10)] || 0;
      const M7 = agg[toPc(root + 11)] || 0;

      const opening_m3 = opening[toPc(root + 3)] || 0;
      const opening_M3 = opening[toPc(root + 4)] || 0;
      const closing_m3 = closing[toPc(root + 3)] || 0;
      const closing_M3 = closing[toPc(root + 4)] || 0;

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

    const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

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
        const idx = toPc(r + i);
        scoreMaj += agg[idx] * KS_MAJOR[i];
        scoreMin += agg[idx] * KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }

    const confidence = Math.min(1.0, best.score / 10);
    return { root: best.root, minor: best.minor, confidence };
  }

  // ============================================================================
  // HMM CHORD TRACKING (🔧 FIXED)
  // ============================================================================

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode = true) {
    const { chroma, bassPc, hop, sr, frameE, percentiles } = feats;
    const toPc = n => ((n % 12) + 12) % 12;

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));

    const candidates = [];

    for (const r of diatonicPcs) {
      const noteName = this.getNoteName(r, key);
      candidates.push({ root: r, label: noteName, type: 'major', borrowed: false });
      candidates.push({ root: r, label: noteName + 'm', type: 'minor', borrowed: false });
    }

    if (!key.minor) {
      const bVII = toPc(key.root + 10);
      const bVI = toPc(key.root + 8);
      const bIII = toPc(key.root + 3);
      const iv = toPc(key.root + 5);

      candidates.push({ root: bVII, label: this.getNoteName(bVII, key), type: 'major', borrowed: true });
      candidates.push({ root: bVI, label: this.getNoteName(bVI, key), type: 'major', borrowed: true });
      candidates.push({ root: bIII, label: this.getNoteName(bIII, key), type: 'major', borrowed: true });
      candidates.push({ root: iv, label: this.getNoteName(iv, key) + 'm', type: 'minor', borrowed: true });
    } else {
      const V = toPc(key.root + 7);
      const IV = toPc(key.root + 5);
      const VII = toPc(key.root + 11);

      candidates.push({ root: V, label: this.getNoteName(V, key), type: 'major', borrowed: true });
      candidates.push({ root: IV, label: this.getNoteName(IV, key), type: 'major', borrowed: true });
      candidates.push({ root: VII, label: this.getNoteName(VII, key), type: 'major', borrowed: true });
      candidates.push({ root: key.root, label: this.getNoteName(key.root, key), type: 'major', borrowed: true });
    }

    const maskVec = (root, intervals) => {
      const v = new Array(12).fill(0);
      for (const iv of intervals) v[toPc(root + iv)] = 1;
      return v;
    };

    const dot = (a, b) => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += a[i] * b[i];
      return s;
    };

    const norm = (a) => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += a[i] * a[i];
      return Math.sqrt(s) || 1;
    };

    const chordTemplates = new Map();
    for (const cand of candidates) {
      const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7];
      const mask = maskVec(cand.root, intervals);
      const maskNorm = norm(mask);
      chordTemplates.set(cand.label, { mask, maskNorm });
    }

    const chromaNorms = chroma.map(c => norm(c));
    const lowE = (percentiles && percentiles.p30) || this.percentile(frameE, 30);

    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      const tmpl = chordTemplates.get(cand.label);
      if (!tmpl) return -Infinity;

      let score = dot(c, tmpl.mask) / (chromaNorms[i] * tmpl.maskNorm);

      if (score < 0.35) return -Infinity;

      if (!cand.borrowed) score += 0.20;
      else score -= 0.25;

      if (bassPc[i] >= 0 && cand.root === bassPc[i]) score += 0.15 * bassMultiplier;
      
      if (frameE[i] < lowE) score -= 0.30;

      return score;
    };

    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0;

      const circle = [0,7,2,9,4,11,6,1,8,3,10,5];
      const posA = circle.indexOf(a.root);
      const posB = circle.indexOf(b.root);

      let circleDist = Math.abs(posA - posB);
      if (circleDist > 6) circleDist = 12 - circleDist;

      const chromDist = Math.min((b.root - a.root + 12) % 12, (a.root - b.root + 12) % 12);

      let dist = circleDist * 0.85 + chromDist * 0.15;
      let cost = 0.4 + 0.08 * dist;

      if (a.type !== b.type) cost += 0.05;

      if (a.borrowed && b.borrowed) cost += 0.30;
      else if (a.borrowed || b.borrowed) cost += 0.18;

      if (!a.borrowed && !b.borrowed) cost -= 0.12;

      const localScale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
      const I = key.root;
      const V = toPc(key.root + localScale[4]);
      const IV = toPc(key.root + localScale[3]);
      const II = toPc(key.root + localScale[1]);

      if (a.root === V && b.root === I) cost -= 0.15;
      if (a.root === IV && b.root === V) cost -= 0.12;
      if (a.root === II && b.root === V) cost -= 0.12;
      if (a.root === IV && b.root === I) cost -= 0.10;

      if (toPc(b.root - a.root) === 7) cost -= 0.08;

      return Math.max(0.0, cost);
    };

    const N = candidates.length;
    const M = chroma.length;
    if (!M || !N) return [];

    const dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    const BEAM_WIDTH = useFullMode ? 8 : 4;

    for (let s = 0; s < N; s++) dp[s] = emitScore(0, candidates[s]);

    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);

      const prevBeam = dp
        .map((score, idx) => ({ score, idx }))
        .sort((a, b) => b.score - a.score)
        .slice(0, BEAM_WIDTH);

      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestJ = -1;

        for (const { score: prevScore, idx: j } of prevBeam) {
          const val = prevScore - transitionCost(candidates[j], candidates[s]);
          if (val > bestVal) {
            bestVal = val;
            bestJ = j;
          }
        }

        newdp[s] = bestVal + emitScore(i, candidates[s]);
        backptr[i][s] = bestJ;
      }

      for (let s = 0; s < N; s++) dp[s] = newdp[s];
    }

    let bestS = 0;
    let bestVal = -Infinity;
    for (let s = 0; s < N; s++) {
      if (dp[s] > bestVal) {
        bestVal = dp[s];
        bestS = s;
      }
    }

    // 🔧 FIXED: Safe backtracking
    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) {
      const prevState = backptr[i][states[i]];
      states[i - 1] = (prevState >= 0 && prevState < N) ? prevState : 0;
    }

    // 🔧 FIXED: Safe timeline creation
    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0];
    let start = 0;

    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        if (cur >= 0 && cur < N && candidates[cur] && candidates[cur].label) {
          timeline.push({ t: start * secPerHop, label: candidates[cur].label, fi: start });
        }
        cur = states[i];
        start = i;
      }
    }

    if (cur >= 0 && cur < N && candidates[cur] && candidates[cur].label) {
      timeline.push({ t: start * secPerHop, label: candidates[cur].label, fi: start });
    }

    return timeline;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#{1}|b{1})?/);
    if (!m) return -1;
    const note = m[1] + (m[2] || '');
    const sharpIndex = this.NOTES_SHARP.indexOf(note);
    if (sharpIndex >= 0) return sharpIndex;
    const flatIndex = this.NOTES_FLAT.indexOf(note);
    if (flatIndex >= 0) return flatIndex;
    return -1;
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  getNoteName(pc, key) {
    const toPc = n => ((n % 12) + 12) % 12;
    pc = toPc(pc);
    const keyRoot = key.root;
    const keyMinor = !!key.minor;

    const sharpMaj = [7,2,9,4,11,6,1];
    const sharpMin = [4,11,6,1,8,3,10];
    const flatMaj = [5,10,3,8,1,6,11];
    const flatMin = [2,7,0,5,10,3,8];

    let useFlats = false;

    if (keyMinor) {
      useFlats = flatMin.includes(keyRoot);
    } else {
      useFlats = flatMaj.includes(keyRoot);
    }

    if (keyRoot === 0 && !keyMinor) {
      if ([10,3,8].includes(pc)) useFlats = true;
    }

    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
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

  percentile(arr, p) {
    const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    const idx = Math.floor((p / 100) * (a.length - 1));
    return a[idx];
  }

  inKey(pc, keyRoot, minor) {
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(iv => toPc(keyRoot + iv));
    const note = toPc(pc);

    if (diatonic.includes(note)) return true;

    if (minor) {
      const rel = toPc(pc - keyRoot);
      if (rel === 7 || rel === 11) return true;
    } else {
      const rel = toPc(pc - keyRoot);
      if (rel === 2 || rel === 10 || rel === 8) return true;
    }

    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordDetectionCore;
}

console.log('✅ ChordDetectionCore.js loaded - Core detection engine ready');
