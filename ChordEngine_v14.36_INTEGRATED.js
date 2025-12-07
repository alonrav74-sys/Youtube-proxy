/**
 * ChordEngineEnhanced v14.36 - INTEGRATED
 * ✅ BassEngine v4.3 - detection only, logic here
 * ✅ MajorMinorRefiner v4.3 - binary major/minor
 * ✅ Returns _debug for table display
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this._hannCache = {};
  }

  toPc(n) { return ((n % 12) + 12) % 12; }

  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      useBassEngine: options.useBassEngine !== false,
      useMajorMinorRefiner: options.useMajorMinorRefiner !== false,
      minConfidenceToOverride: options.minConfidenceToOverride || 0.40,
      debug: options.debug || false
    };

    // Debug storage
    let refinerResults = [];
    let bassResults = [];

    const audioData = this.processAudio(audioBuffer);
    audioData.buffer = audioBuffer;

    const feats = this.extractFeatures(audioData);
    let key = this.detectKeyEnhanced(feats);

    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);

    // ═══════════════════════════════════════════════════════════════
    // 🎵 MajorMinorRefiner v4.3
    // ═══════════════════════════════════════════════════════════════
    if (typeof MajorMinorRefiner !== 'undefined' && opts.useMajorMinorRefiner) {
      try {
        const refiner = new MajorMinorRefiner();
        refinerResults = await refiner.refineChordTimeline(audioData.buffer, timeline, {
          debug: opts.debug,
          minConfidenceToOverride: opts.minConfidenceToOverride
        });
        
        for (let i = 0; i < timeline.length; i++) {
          const ref = refinerResults[i];
          if (ref?.shouldOverride && ref.refinedLabel !== timeline[i].label) {
            timeline[i].originalLabel = timeline[i].originalLabel || timeline[i].label;
            timeline[i].label = ref.refinedLabel;
            timeline[i].refinedBy = 'MajorMinorRefiner';
          }
        }
      } catch (e) { console.warn('Refiner error:', e); }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎸 BassEngine v4.3 - Detection + Logic HERE
    // ═══════════════════════════════════════════════════════════════
    if (typeof BassEngine !== 'undefined' && opts.useBassEngine) {
      try {
        const bassEngine = new BassEngine();
        bassResults = await bassEngine.refineBassInTimeline(audioData.buffer, timeline, key, {
          minBassConfidence: 0.35,
          stabilityFrames: 2,
          debug: opts.debug
        });
        
        for (let i = 0; i < timeline.length; i++) {
          const bass = bassResults[i];
          if (!bass) continue;
          
          timeline[i].bassDetected = bass.bassDetected || 'NO_BASS';
          timeline[i].bassConfidence = bass.bassConfidence || 0;
          timeline[i].bassFrequency = bass.bassFrequency || 0;
          timeline[i].changedByBass = false;
          
          if (!bass.bassDetected || bass.bassDetected === 'NO_BASS' || bass.bassConfidence < 0.35) continue;
          
          const chordLabel = timeline[i].label;
          const rootMatch = chordLabel.match(/^([A-G][#b]?)/);
          if (!rootMatch) continue;
          
          let rootNote = rootMatch[1].replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
          const rootPc = this.NOTES_SHARP.indexOf(rootNote);
          if (rootPc < 0) continue;
          
          let bassNote = bass.bassDetected.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
          const bassPc = this.NOTES_SHARP.indexOf(bassNote);
          if (bassPc < 0 || bassPc === rootPc) continue;
          
          const isMinor = /m(?!aj)/.test(chordLabel);
          const has7 = /7/.test(chordLabel);
          const hasMaj7 = /maj7/.test(chordLabel);
          const interval = this.toPc(bassPc - rootPc);
          
          let newLabel = chordLabel;
          let changed = false;
          const bassNoteName = this.getNoteName(bassPc, key);
          
          // Interval logic:
          // 3 = minor 3rd → inversion for minor (Am/C)
          // 4 = major 3rd → inversion for major (C/E)
          // 7 = perfect 5th → inversion (C/G)
          // 10 = minor 7th → ADD 7 (Em + D = Em7)
          // 11 = major 7th → ADD maj7
          
          if (interval === 3 && isMinor) {
            newLabel = chordLabel.split('/')[0] + '/' + bassNoteName;
            changed = true;
          } else if (interval === 4 && !isMinor) {
            newLabel = chordLabel.split('/')[0] + '/' + bassNoteName;
            changed = true;
          } else if (interval === 7) {
            newLabel = chordLabel.split('/')[0] + '/' + bassNoteName;
            changed = true;
          } else if (interval === 10 && !has7 && !hasMaj7) {
            const m = chordLabel.split('/')[0].match(/^([A-G][#b]?)(m)?(.*)$/);
            if (m) {
              newLabel = m[1] + (m[2] || '') + '7' + (m[3] || '');
              changed = true;
            }
          } else if (interval === 11 && !has7 && !hasMaj7 && !isMinor) {
            newLabel = chordLabel.split('/')[0] + 'maj7';
            changed = true;
          }
          
          if (changed) {
            timeline[i].originalLabel = timeline[i].originalLabel || chordLabel;
            timeline[i].label = newLabel;
            timeline[i].changedByBass = true;
          }
        }
      } catch (e) { console.warn('BassEngine error:', e); }
    }

    return {
      chords: timeline,
      key,
      bpm: audioData.bpm,
      duration: audioData.duration,
      _debug: { refinerResults, bassResults }
    };
  }

  applyPostProcessing(timeline, key, feats, bpm, opts) {
    timeline = this.enforceEarlyDiatonic(timeline, key, feats, bpm);
    timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier);
    timeline = this.addInversionsUltimate(timeline, feats, key, opts.bassMultiplier);
    return timeline;
  }

  processAudio(audioBuffer) {
    const channels = audioBuffer.numberOfChannels || 1;
    let mono = channels === 1 ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate || 44100;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    return { x, sr, bpm: 120, duration: x.length / sr };
  }

  extractFeatures(audioData) {
    const { x, sr } = audioData;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;
    if (!this._hannCache[win]) {
      const hann = new Float32Array(win);
      for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
      this._hannCache[win] = hann;
    }
    const hann = this._hannCache[win];
    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) frames.push(x.subarray(s, s + win));
    const chroma = [], bassPc = [], frameE = [];
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
        const pc = this.toPc(Math.round(midi));
        c[pc] += mags[b];
      }
      const sum = c.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;
      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }
    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) {
      if (bassPc[i] < 0 || frameE[i] < thrE || (bassPc[i - 1] !== bassPc[i] && bassPc[i + 1] !== bassPc[i])) bassPc[i] = -1;
    }
    const percentiles = { p30: this.percentile(frameE, 30), p50: this.percentile(frameE, 50), p70: this.percentile(frameE, 70) };
    return { chroma, bassPc, frameE, hop, sr, percentiles };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250;
    let bestBin = -1, bestMag = 0;
    for (let b = Math.floor(fmin * N / sr); b <= Math.ceil(fmax * N / sr) && b < mags.length; b++) {
      if (mags[b] > bestMag) { bestMag = mags[b]; bestBin = b; }
    }
    if (bestBin > 0) {
      const f0 = bestBin * sr / N;
      if (f0 >= fmin && f0 <= fmax) return this.toPc(Math.round(69 + 12 * Math.log2(f0 / 440)));
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

  detectKeyEnhanced(feats) {
    const { chroma } = feats;
    if (!chroma || !chroma.length) return { root: 0, minor: false, confidence: 0.5 };
    const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    const agg = new Array(12).fill(0);
    for (const c of chroma) for (let p = 0; p < 12; p++) agg[p] += c[p];
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;
    let best = { score: -Infinity, root: 0, minor: false };
    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0, scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += agg[this.toPc(r + i)] * KS_MAJOR[i];
        scoreMin += agg[this.toPc(r + i)] * KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }
    return { root: best.root, minor: best.minor, confidence: Math.min(1.0, best.score / 10) };
  }

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode) {
    const { chroma, bassPc, hop, sr, frameE, percentiles } = feats;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    const candidates = [];
    for (const r of diatonicPcs) {
      const noteName = this.getNoteName(r, key);
      candidates.push({ root: r, label: noteName, type: 'major', borrowed: false });
      candidates.push({ root: r, label: noteName + 'm', type: 'minor', borrowed: false });
    }
    const maskVec = (root, intervals) => {
      const v = new Array(12).fill(0);
      for (const iv of intervals) v[this.toPc(root + iv)] = 1;
      return v;
    };
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const norm = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s) || 1; };
    const chordTemplates = new Map();
    for (const cand of candidates) {
      const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7];
      chordTemplates.set(cand.label, { mask: maskVec(cand.root, intervals), maskNorm: norm(maskVec(cand.root, intervals)) });
    }
    const chromaNorms = chroma.map(c => norm(c));
    const lowE = percentiles?.p30 || this.percentile(frameE, 30);
    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      const tmpl = chordTemplates.get(cand.label);
      if (!tmpl) return -Infinity;
      let score = dot(c, tmpl.mask) / (chromaNorms[i] * tmpl.maskNorm);
      if (score < 0.35) return -Infinity;
      if (!cand.borrowed) score += 0.20; else score -= 0.25;
      const detectedBass = bassPc[i];
      if (detectedBass >= 0) {
        const intervals = cand.type === 'minor' ? [0, 3, 7] : [0, 4, 7];
        const chordPcs = intervals.map(iv => this.toPc(cand.root + iv));
        if (detectedBass === cand.root) score += 0.15 * bassMultiplier;
        else if (chordPcs.includes(detectedBass)) score += 0.08 * bassMultiplier;
        else score -= 0.20 * bassMultiplier;
      }
      if (frameE[i] < lowE) score -= 0.30;
      return score;
    };
    const N = candidates.length, M = chroma.length;
    if (!M || !N) return [];
    const dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    for (let s = 0; s < N; s++) dp[s] = emitScore(0, candidates[s]);
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity, bestJ = -1;
        for (let j = 0; j < N; j++) {
          const val = dp[j] - (candidates[j].label === candidates[s].label ? 0 : 0.5);
          if (val > bestVal) { bestVal = val; bestJ = j; }
        }
        newdp[s] = bestVal + emitScore(i, candidates[s]);
        backptr[i][s] = bestJ;
      }
      for (let s = 0; s < N; s++) dp[s] = newdp[s];
    }
    let bestS = 0, bestVal = -Infinity;
    for (let s = 0; s < N; s++) if (dp[s] > bestVal) { bestVal = dp[s]; bestS = s; }
    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) {
      const ptr = backptr[i][states[i]];
      states[i - 1] = ptr >= 0 ? ptr : states[i];
    }
    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0], start = 0;
    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        const cand = candidates[cur];
        if (cand?.label) timeline.push({ t: start * secPerHop, label: cand.label, fi: start });
        cur = states[i]; start = i;
      }
    }
    const finalCand = candidates[cur];
    if (finalCand?.label) timeline.push({ t: start * secPerHop, label: finalCand.label, fi: start });
    return timeline;
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline.length) return timeline;
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.50 * spb);
    const filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i], b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      if (dur < minDur && filtered.length > 0) continue;
      filtered.push(a);
    }
    return filtered;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    return timeline;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul) {
    return timeline;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
    return timeline;
  }

  getNoteName(pc, key) {
    pc = this.toPc(pc);
    const flatKeys = [5,10,3,8,1,6,11];
    const useFlats = flatKeys.includes(key.root);
    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0), right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) {
    if (!samples || fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLength = Math.max(1, Math.floor(samples.length / ratio));
    const resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio, i0 = Math.floor(srcIndex), i1 = Math.min(i0 + 1, samples.length - 1), t = srcIndex - i0;
      resampled[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
    return resampled;
  }

  percentile(arr, p) {
    const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[Math.floor((p / 100) * (a.length - 1))];
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ChordEngineEnhanced;
