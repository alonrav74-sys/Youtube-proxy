/**
 * ChordEngineEnhanced_v14.32_FineTuned - Clean Production Version
 * בלי console, בלי דיבוג, בלי כפילויות מיותרות.
 * כולל תיקוני fine-tune:
 * 1) העדפת אקורדים דיאטוניים ב-emitScore
 * 2) עדכון transitionCost לטיפול חכם יותר בבורואינג
 * 3) חלון דיאטוני מוקדם מוגדל ב-enforceEarlyDiatonic
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];

    this._hannCache = {};
  }

  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      validationMultiplier: options.validationMultiplier || 1.0,
      bassSensitivity: options.bassSensitivity || 1.0,
      extensionSensitivity: options.extensionSensitivity || 1.0,
      filterWeakChords: options.filterWeakChords !== false,
      channelData: options.channelData || null,
      sampleRate: options.sampleRate || null,
      tonicRerunThreshold: options.tonicRerunThreshold !== undefined ? options.tonicRerunThreshold : 75,
      progressCallback: typeof options.progressCallback === 'function' ? options.progressCallback : null
    };

    const timings = {};
    const startTotal = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const tAudioStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const audioData = this.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    timings.audioProcessing = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tAudioStart;

    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'extracting', progress: 0.1 });
    }

    const tFeatStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const feats = this.extractFeatures(audioData);
    timings.featureExtraction = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tFeatStart;

    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });
    }

    const tKeyStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let key = this.detectKeyEnhanced(feats, audioData.duration);
    timings.keyDetection = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tKeyStart;

    if (opts.progressCallback) {
      opts.progressCallback({
        stage: 'key_detected',
        progress: 0.4,
        key: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''),
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

    const tHmmStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, useFullHMM);
    timings.hmmTracking = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tHmmStart;

    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'refining', progress: 0.7 });
    }

    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);

    const validatedKey = this.validateKeyFromChords(timeline, key, feats);

    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      const tRerun = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timings.rerunKeyValidation = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tRerun;
    }

    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'decorating', progress: 0.8 });
    }

    const tPostStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    timeline = this.enforceEarlyDiatonic(timeline, key, feats, audioData.bpm);
    timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier, opts.extensionSensitivity);
    timeline = this.adjustMinorMajors(timeline, feats, key);
    timeline = this.addInversionsUltimate(timeline, feats, key, opts.bassMultiplier);
    timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
    timeline = this.classifyOrnaments(timeline, audioData.bpm, feats);
    timeline = this.analyzeModalContext(timeline, key);

    timings.postProcessing = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tPostStart;

    const tonic = this.detectTonicMusically(timeline, key, audioData.duration);

    if (
      tonic.root !== key.root &&
      tonic.confidence >= opts.tonicRerunThreshold
    ) {
      key = { root: tonic.root, minor: key.minor, confidence: key.confidence || tonic.confidence / 100 };

      const tRerun2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timeline = this.enforceEarlyDiatonic(timeline, key, feats, audioData.bpm);
      timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier, opts.extensionSensitivity);
      timeline = this.adjustMinorMajors(timeline, feats, key);
      timeline = this.addInversionsUltimate(timeline, feats, key, opts.bassMultiplier);
      timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
      timeline = this.classifyOrnaments(timeline, audioData.bpm, feats);
      timeline = this.analyzeModalContext(timeline, key);
      timings.rerunTonic = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tRerun2;
    }

    timings.total = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startTotal;

    if (opts.progressCallback) {
      opts.progressCallback({ stage: 'complete', progress: 1.0 });
    }

    const modulations = this.quickModulationCheck(timeline, key);

    const stats = {
      totalChords: timeline.length,
      structural: timeline.filter(e => e.ornamentType === 'structural').length,
      ornaments: timeline.filter(e => e.ornamentType && e.ornamentType !== 'structural').length,
      secondaryDominants: timeline.filter(e => e.modalContext === 'secondary_dominant').length,
      modalBorrowings: timeline.filter(e =>
        e.modalContext && e.modalContext !== 'secondary_dominant'
      ).length,
      inversions: timeline.filter(e => e.label.includes('/')).length,
      extensions: timeline.filter(e => /[679]|11|13|sus|dim|aug/.test(e.label)).length,
      modulations
    };

    return {
      chords: timeline,
      key,
      tonic,
      bpm: audioData.bpm,
      duration: audioData.duration,
      stats,
      mode: this.detectMode(key),
      timings
    };
  }

  detectMode(key) {
    return key.minor ? 'Natural Minor (Aeolian)' : 'Major (Ionian)';
  }

  quickModulationCheck(timeline, primaryKey) {
    if (!timeline || timeline.length < 20) return 0;

    const third = Math.floor(timeline.length / 3);
    const sections = [
      timeline.slice(0, third),
      timeline.slice(third, 2 * third),
      timeline.slice(2 * third)
    ];

    let modCount = 0;
    let lastKey = { root: primaryKey.root, minor: primaryKey.minor };

    for (const section of sections) {
      if (!section.length) continue;

      let diatonicCount = 0;
      for (const chord of section) {
        const root = this.parseRoot(chord.label);
        if (root >= 0 && this.inKey(root, lastKey.root, lastKey.minor)) {
          diatonicCount++;
        }
      }

      const diatonicRatio = diatonicCount / section.length;
      if (diatonicRatio >= 0.6) continue;

      let bestNewKey = null;
      let bestRatio = diatonicRatio;

      for (let newRoot = 0; newRoot < 12; newRoot++) {
        for (const newMinor of [false, true]) {
          let newDiatonic = 0;
          for (const chord of section) {
            const root = this.parseRoot(chord.label);
            if (root >= 0 && this.inKey(root, newRoot, newMinor)) {
              newDiatonic++;
            }
          }
          const ratio = newDiatonic / section.length;
          if (ratio > bestRatio + 0.15) {
            bestRatio = ratio;
            bestNewKey = { root: newRoot, minor: newMinor };
          }
        }
      }

      if (bestNewKey) {
        modCount++;
        lastKey = bestNewKey;
      }
    }

    return modCount;
  }

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
    mono = (channels === 1)
      ? audioBuffer.getChannelData(0)
      : this.mixStereo(audioBuffer);

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
    return Math.max(60, Math.min(200, Math.round(bpm || 120)));
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
      for (let k = 0; k < win; k++) {
        en += windowed[k] * windowed[k];
      }
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

      let sum = 0;
      for (let k = 0; k < 12; k++) sum += c[k];
      if (sum > 0) {
        for (let k = 0; k < 12; k++) {
          c[k] /= sum;
        }
      }

      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }

    const thrE = this.percentile(frameE, 40);

    for (let i = 1; i < bassPc.length - 1; i++) {
      const v = bassPc[i];
      if (
        v < 0 ||
        frameE[i] < thrE ||
        (bassPc[i - 1] !== v && bassPc[i + 1] !== v)
      ) {
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

    return {
      chroma,
      bassPc,
      frameE,
      hop,
      sr,
      introSkipFrames,
      percentiles
    };
  }

  estimateBassF0(mags, sr, N) {
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
    const f0maxLag = Math.floor(sr / 40);
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
      if (f0 >= 40 && f0 <= fmax) {
        const midiF0 = 69 + 12 * Math.log2(f0 / 440);
        return this.toPc(Math.round(midiF0));
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
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
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

  detectTonicFromBass(feats) {
    const { bassPc, frameE, introSkipFrames, percentiles } = feats;

    const threshold =
      (percentiles && percentiles.p80) ||
      this.percentile(frameE, 80);

    const bassHist = new Array(12).fill(0);

    const start = introSkipFrames || 0;
    for (let i = start; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        const weight = frameE[i] / threshold;
        bassHist[bp] += weight;
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

    return { root: tonicPc, confidence };
  }

  detectKeyEnhanced(feats) {
    const { chroma, frameE, introSkipFrames, percentiles } = feats;

    const bassTonic = this.detectTonicFromBass(feats);

    if (bassTonic.confidence > 0.30 && chroma.length) {
      const root = bassTonic.root;
      const start = introSkipFrames || 0;
      const thr = (percentiles && percentiles.p80) || this.percentile(frameE, 80);

      const agg = new Array(12).fill(0);
      let totalW = 0;

      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= thr) {
          const w = frameE[i] / thr;
          const c = chroma[i];
          for (let p = 0; p < 12; p++) {
            agg[p] += c[p] * w;
          }
          totalW += w;
        }
      }

      if (totalW > 0) {
        for (let p = 0; p < 12; p++) {
          agg[p] /= totalW;
        }
      }

      const m3 = agg[this.toPc(root + 3)] || 0;
      const M3 = agg[this.toPc(root + 4)] || 0;
      const isMinor = m3 > M3 * 1.10;
      const spread = Math.abs(m3 - M3);

      const confidence = Math.min(
        1.0,
        0.4 + bassTonic.confidence * 0.3 + spread * 0.8
      );

      return {
        root,
        minor: !!isMinor,
        confidence
      };
    }

    const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const agg = new Array(12).fill(0);

    for (let i = 0; i < chroma.length; i++) {
      const pos = i / chroma.length;
      let w = 1.0;
      if (pos < 0.10) w = 5.0;
      else if (pos > 0.90) w = 3.0;

      const c = chroma[i];
      for (let p = 0; p < 12; p++) {
        agg[p] += c[p] * w;
      }
    }

    let sum = 0;
    for (let p = 0; p < 12; p++) sum += agg[p];
    sum = sum || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;

    let best = { score: -Infinity, root: 0, minor: false };

    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0;
      let scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        const idx = this.toPc(r + i);
        scoreMaj += agg[idx] * KS_MAJOR[i];
        scoreMin += agg[idx] * KS_MINOR[i];
      }
      if (scoreMaj > best.score) {
        best = { score: scoreMaj, root: r, minor: false };
      }
      if (scoreMin > best.score) {
        best = { score: scoreMin, root: r, minor: true };
      }
    }

    let confidence = Math.min(1.0, best.score / 10);

    const firstPc = this.estimateFirstChordPc(feats);
    if (firstPc >= 0) {
      if (this.inKey(firstPc, best.root, best.minor)) {
        confidence = Math.min(1.0, confidence + 0.15);
      } else {
        confidence = Math.min(1.0, confidence + 0.05);
      }
    }

    return {
      root: best.root,
      minor: best.minor,
      confidence
    };
  }

  estimateFirstChordPc(feats) {
    const { chroma, frameE, sr, hop, introSkipFrames } = feats;
    if (!chroma || !chroma.length) return -1;

    const skip = introSkipFrames || 0;
    const windowSec = 2.0;
    const framesInSec = Math.max(1, Math.round(sr / hop));
    const end = Math.min(chroma.length, skip + Math.round(windowSec * framesInSec));

    const thr = this.percentile(frameE, 80);
    const agg = new Array(12).fill(0);
    let used = 0;

    for (let i = skip; i < end; i++) {
      if (frameE[i] >= thr) {
        const c = chroma[i];
        for (let p = 0; p < 12; p++) {
          agg[p] += c[p];
        }
        used++;
      }
    }

    if (!used) return -1;

    let best = 0;
    let bestVal = -Infinity;
    for (let p = 0; p < 12; p++) {
      if (agg[p] > bestVal) {
        bestVal = agg[p];
        best = p;
      }
    }

    return best;
  }

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode = true) {
    const { chroma, bassPc, hop, sr, frameE, percentiles } = feats;

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));

    const candidates = [];

    for (const r of diatonicPcs) {
      const noteName = this.getNoteName(r, key);
      candidates.push({ root: r, label: noteName, type: 'major', borrowed: false });
      candidates.push({ root: r, label: noteName + 'm', type: 'minor', borrowed: false });
    }

    if (!key.minor) {
      const bVII = this.toPc(key.root + 10);
      const bVI = this.toPc(key.root + 8);
      const bIII = this.toPc(key.root + 3);
      const iv = this.toPc(key.root + 5);
      const bII = this.toPc(key.root + 1);
      const II = this.toPc(key.root + 2);

      candidates.push({ root: bVII, label: this.getNoteName(bVII, key), type: 'major', borrowed: true });
      candidates.push({ root: bVI, label: this.getNoteName(bVI, key), type: 'major', borrowed: true });
      candidates.push({ root: bIII, label: this.getNoteName(bIII, key), type: 'major', borrowed: true });
      candidates.push({ root: iv, label: this.getNoteName(iv, key) + 'm', type: 'minor', borrowed: true });
      candidates.push({ root: bII, label: this.getNoteName(bII, key), type: 'major', borrowed: true });
      candidates.push({ root: II, label: this.getNoteName(II, key), type: 'major', borrowed: true });
    } else {
      const V = this.toPc(key.root + 7);
      const IV = this.toPc(key.root + 5);
      const VI = this.toPc(key.root + 9);
      const VII = this.toPc(key.root + 11);
      const bVII = this.toPc(key.root + 10);
      const bVI = this.toPc(key.root + 8);
      const II = this.toPc(key.root + 2);

      candidates.push({ root: V, label: this.getNoteName(V, key), type: 'major', borrowed: true });
      candidates.push({ root: IV, label: this.getNoteName(IV, key), type: 'major', borrowed: true });
      candidates.push({ root: VI, label: this.getNoteName(VI, key), type: 'major', borrowed: true });
      candidates.push({ root: VII, label: this.getNoteName(VII, key), type: 'major', borrowed: true });
      candidates.push({ root: bVII, label: this.getNoteName(bVII, key), type: 'major', borrowed: true });
      candidates.push({ root: bVI, label: this.getNoteName(bVI, key), type: 'major', borrowed: true });
      candidates.push({ root: key.root, label: this.getNoteName(key.root, key), type: 'major', borrowed: true });
      candidates.push({ root: II, label: this.getNoteName(II, key), type: 'major', borrowed: true });
    }

    const maskVec = (root, intervals) => {
      const v = new Array(12).fill(0);
      for (const iv of intervals) {
        v[this.toPc(root + iv)] = 1;
      }
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
      const intervals = cand.type === 'minor' ? [0, 3, 7] : [0, 4, 7];
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
      const dp = dot(c, tmpl.mask);
      let score = dp / (chromaNorms[i] * tmpl.maskNorm);

      // תיקון #1: העדפת דיאטוני והענשת borrowed
      if (!cand.borrowed) {
        score += 0.20;
      } else {
        score -= 0.25;
      }

      if (bassPc[i] >= 0 && cand.root === bassPc[i]) {
        score += 0.15 * bassMultiplier;
      }

      if (frameE[i] < lowE) {
        score -= 0.10;
      }

      return score;
    };

    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0;

      const circle = [0,7,2,9,4,11,6,1,8,3,10,5];
      const posA = circle.indexOf(a.root);
      const posB = circle.indexOf(b.root);
      let circleDist = Math.abs(posA - posB);
      if (circleDist > 6) circleDist = 12 - circleDist;

      const chromDist = Math.min(
        (b.root - a.root + 12) % 12,
        (a.root - b.root + 12) % 12
      );

      // תיקון #2: שקלול חדש וענישה/בונוס לבורואינג
      let dist = circleDist * 0.85 + chromDist * 0.15;
      let cost = 0.4 + 0.08 * dist;

      if (a.type !== b.type) cost += 0.05;

      if (a.borrowed && b.borrowed) {
        cost += 0.30;
      } else if (a.borrowed || b.borrowed) {
        cost += 0.18;
      }

      if (!a.borrowed && !b.borrowed) {
        cost -= 0.12;
      }

      const scaleLocal = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
      const I = key.root;
      const V = this.toPc(key.root + scaleLocal[4]);
      const IV = this.toPc(key.root + scaleLocal[3]);
      const II = this.toPc(key.root + scaleLocal[1]);

      if (a.root === V && b.root === I) cost -= 0.15;
      else if (a.root === IV && b.root === V) cost -= 0.12;
      else if (a.root === II && b.root === V) cost -= 0.12;
      else if (a.root === IV && b.root === I) cost -= 0.10;

      if (this.toPc(b.root - a.root) === 7) {
        cost -= 0.08;
      }

      return Math.max(0.0, cost);
    };

    const N = candidates.length;
    const M = chroma.length;
    const dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    const BEAM_WIDTH = useFullMode ? 8 : 4;

    for (let s = 0; s < N; s++) {
      dp[s] = emitScore(0, candidates[s]);
    }

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

  validateKeyFromChords(timeline, currentKey, feats) {
    if (!timeline || timeline.length < 3) return currentKey;

    const chordRoots = [];
    for (const chord of timeline) {
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        const isMinor = /m(?!aj)/.test(chord.label);
        const isDim = /dim/.test(chord.label);
        chordRoots.push({ root, isMinor, isDim });
      }
    }
    if (!chordRoots.length) return currentKey;

    const candidates = [];

    for (let keyRoot = 0; keyRoot < 12; keyRoot++) {
      for (const keyMinor of [false, true]) {
        const scale = keyMinor ? this.MINOR_SCALE : this.MAJOR_SCALE;
        const qualities = keyMinor
          ? ['m','dim','','m','m','','']
          : ['','m','m','','','m','dim'];

        const diatonicChords = scale.map((deg, i) => ({
          root: this.toPc(keyRoot + deg),
          quality: qualities[i]
        }));

        let matchCount = 0;
        for (const sChord of chordRoots) {
          const found = diatonicChords.some(dc => {
            if (dc.root !== sChord.root) return false;
            if (sChord.isDim) return dc.quality === 'dim';
            if (sChord.isMinor) return dc.quality === 'm';
            return dc.quality === '';
          });
          if (found) matchCount++;
        }

        const ratio = matchCount / chordRoots.length;
        if (ratio >= 0.6) {
          let score = ratio * 100;

          const firstRoot = chordRoots[0].root;
          if (firstRoot === keyRoot) score += 25;

          const lastRoot = chordRoots[chordRoots.length - 1].root;
          if (lastRoot === keyRoot) score += 15;

          for (let i = 0; i < timeline.length - 1; i++) {
            const r1 = this.parseRoot(timeline[i].label);
            const r2 = this.parseRoot(timeline[i + 1].label);
            if (r1 < 0 || r2 < 0) continue;
            const interval = this.toPc(r2 - r1);
            if ((interval === 5 || interval === 7) && r2 === keyRoot) {
              score += 5;
            }
          }

          candidates.push({ root: keyRoot, minor: keyMinor, score });
        }
      }
    }

    if (!candidates.length) return currentKey;

    let best = candidates[0];
    for (const c of candidates) {
      if (c.score > best.score) best = c;
    }

    const currentScore = candidates.find(
      c => c.root === currentKey.root && c.minor === currentKey.minor
    );
    if (currentScore && best.score <= currentScore.score + 15) {
      return currentKey;
    }

    return {
      root: best.root,
      minor: best.minor,
      confidence: Math.min(0.99, 0.6 + best.score / 200)
    };
  }

  detectTonicMusically(timeline, key, duration) {
    if (!timeline || timeline.length < 3) {
      return {
        root: key.root,
        label: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''),
        confidence: 50
      };
    }

    const candidates = {};
    let totalDuration = 0;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;

      const dur = this.getChordDuration(chord, timeline, duration);
      totalDuration += dur;

      if (!candidates[root]) {
        candidates[root] = {
          duration: 0,
          openingScore: 0,
          closingScore: 0,
          cadenceScore: 0
        };
      }
      candidates[root].duration += dur;
    }

    const opening = timeline.slice(0, Math.min(3, timeline.length));
    for (let i = 0; i < opening.length; i++) {
      const root = this.parseRoot(opening[i].label);
      if (root >= 0 && candidates[root]) {
        const w = i === 0 ? 40 : (3 - i) * 5;
        candidates[root].openingScore += w;
      }
    }

    const closing = timeline.slice(Math.max(0, timeline.length - 3));
    for (let i = 0; i < closing.length; i++) {
      const root = this.parseRoot(closing[i].label);
      if (root >= 0 && candidates[root]) {
        candidates[root].closingScore += (i + 1) * 8;
      }
    }

    for (let i = 0; i < timeline.length - 1; i++) {
      const r1 = this.parseRoot(timeline[i].label);
      const r2 = this.parseRoot(timeline[i + 1].label);
      if (r1 < 0 || r2 < 0) continue;
      const interval = this.toPc(r2 - r1);
      if ((interval === 5 || interval === 7) && candidates[r2]) {
        const dur = this.getChordDuration(timeline[i + 1], timeline, duration);
        candidates[r2].cadenceScore += 3 * dur;
      }
    }

    let bestRoot = key.root;
    let bestScore = -Infinity;

    for (const rootStr in candidates) {
      const root = parseInt(rootStr, 10);
      const c = candidates[root];
      const durScore = (c.duration / (totalDuration || 1)) * 40;
      const score = durScore + c.openingScore + c.closingScore + c.cadenceScore;
      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
      }
    }

    const confidence = Math.max(30, Math.min(100, bestScore));
    return {
      root: bestRoot,
      label: this.NOTES_SHARP[bestRoot] + (key.minor ? 'm' : ''),
      confidence
    };
  }

  getChordDuration(chord, timeline, totalDuration) {
    const idx = timeline.indexOf(chord);
    if (idx < 0) return 0.5;
    const next = timeline[idx + 1];
    if (next) return Math.max(0.1, next.t - chord.t);
    return Math.max(0.5, totalDuration - chord.t);
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.45 * spb);
    const energyMedian = this.percentile(feats.frameE, 50);

    const filtered = [];

    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = feats.frameE[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.8;

      const r = this.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);

      if (
        dur < minDur &&
        filtered.length > 0 &&
        (isWeak || !isDiatonic)
      ) {
        continue;
      }

      filtered.push(a);
    }

    const snapped = [];
    for (const ev of filtered) {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const snapTol = 0.35 * spb;

      const t =
        Math.abs(grid - raw) <= snapTol
          ? grid
          : raw;

      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi });
      }
    }

    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline || !timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    // תיקון #3: חלון דיאטוני מוקדם גדול יותר
    const earlyWindow = Math.max(10.0, 4 * spb);

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    const qualities = key.minor
      ? ['m','dim','','m','m','','']
      : ['','m','m','','','m','dim'];

    const getQuality = pc => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === this.toPc(pc)) return qualities[i];
      }
      return '';
    };

    const snapToDiatonic = pc => {
      let best = diatonicPcs[0];
      let bestD = 99;
      for (const d of diatonicPcs) {
        const dist = Math.min(
          (pc - d + 12) % 12,
          (d - pc + 12) % 12
        );
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
        const inKey = r >= 0 && this.inKey(r, key.root, key.minor);
        if (!inKey) {
          const bp = feats.bassPc[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          if (ev.t < Math.min(2.0, 1.5 * spb)) {
            newRoot = key.root;
          }
          const q = getQuality(newRoot);
          label = this.NOTES_SHARP[newRoot] + q;
        } else {
          const q = getQuality(r);
          label = this.NOTES_SHARP[r] + q;
        }
      }
      out.push({ ...ev, label });
    }

    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul, extensionSensitivity = 1.0) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));

    const mul = extensionMul / (extensionSensitivity || 1.0);
    const out = [];

    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) {
        out.push(ev);
        continue;
      }

      const isMinorTriad = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|11|13|6|m7b5|alt|b9|#9|b5|#5).*$/, '');
      if (isMinorTriad) base += 'm';

      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);

      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) {
          avg[p] += c[p];
        }
      }

      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) {
        avg[p] /= len;
      }

      const s = d => avg[this.toPc(root + d)] || 0;

      const sR = s(0);
      const sM3 = s(4);
      const sm3 = s(3);
      const s5 = s(7);
      const s_b5 = s(6);
      const s_sharp5 = s(8);
      const s2 = s(2);
      const s4 = s(5);
      const s_b7 = s(10);
      const s7 = s(11);
      const s6 = s(9);

      let label = base;

      const thirdStrong = isMinorTriad
        ? sm3 > 0.13 * mul
        : sM3 > 0.13 * mul;

      const sus2Strong = s2 > 0.22 / mul && s2 >= s4 * 0.9 && s5 > 0.10;
      const sus4Strong = s4 > 0.22 / mul && s4 >= s2 * 0.9 && s5 > 0.10;

      if (!isMinorTriad && !thirdStrong) {
        if (sus4Strong) label = base.replace(/m$/, '') + 'sus4';
        else if (sus2Strong) label = base.replace(/m$/, '') + 'sus2';
      }

      const sixthStrong = s6 > 0.18 / mul && s6 > s_b7 * 1.2;
      if (sixthStrong && !/sus/.test(label) && (isMinorTriad ? sm3 : sM3) > 0.12 / mul) {
        label = base + '6';
      }

      const domDegree = this.degreeOfChord(label, key);
      const domLike = domDegree === 4;
      const majContext = !/m$/.test(label) && !/sus/.test(label);
      const b7Strong = s_b7 > 0.16 / mul && sR > 0.10 / mul;
      const maj7Strong = majContext && s7 > 0.20 / mul && s7 > s_b7 * 1.2;

      if (!/6$/.test(label)) {
        if (maj7Strong) {
          label = base.replace(/m$/, '') + 'maj7';
        } else if (!/sus/.test(label) && (domLike ? s_b7 > 0.15 / mul : b7Strong)) {
          if (!/7$|maj7$/.test(label)) label += '7';
        }
      }

      const dimTriad =
        (isMinorTriad && s_b5 > 0.26 / mul && s5 < 0.12 * mul && sm3 > 0.14 / mul) ||
        (!isMinorTriad && s_b5 > 0.30 / mul && s5 < 0.10 * mul && sM3 < 0.08 * mul);

      if (dimTriad) {
        if (isMinorTriad && s_b7 > 0.18 / mul) {
          label = base.replace(/m$/, 'm7b5');
        } else {
          label = base.replace(/m$/, '') + 'dim';
        }
      }

      const augTriad =
        !isMinorTriad &&
        s_sharp5 > 0.24 / mul &&
        s5 < 0.10 * mul &&
        sM3 > 0.12 / mul;

      if (augTriad) {
        label = base.replace(/m$/, '') + 'aug';
      }

      if (mode === 'jazz' || mode === 'pro') {
        const has7 = /7$|maj7$/.test(label);
        const nineStrong = s2 > 0.25 / mul && sR > 0.10 / mul;

        if (has7 && nineStrong) {
          label = label.replace(/7$/, '9');
        } else if (
          !/sus/.test(label) &&
          nineStrong &&
          (isMinorTriad ? sm3 : sM3) > 0.10 / mul &&
          !/maj7|7|9|add9/.test(label)
        ) {
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

      if (
        r < 0 ||
        /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label) ||
        !/(^[A-G](?:#|b)?)(m)(?!aj)/.test(label)
      ) {
        out.push(ev);
        continue;
      }

      const rel = this.toPc(r - key.root);
      if (
        !(
          rel === this.MINOR_SCALE[2] ||
          rel === this.MINOR_SCALE[4] ||
          rel === this.MINOR_SCALE[6]
        )
      ) {
        out.push(ev);
        continue;
      }

      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);

      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) {
          avg[p] += c[p];
        }
      }

      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) {
        avg[p] /= len;
      }

      const M3 = avg[this.toPc(r + 4)] || 0;
      const m3 = avg[this.toPc(r + 3)] || 0;

      if (M3 > m3 * 1.25 && M3 > 0.08) {
        label = label.replace(/m(?!aj)/, '');
      }

      out.push({ ...ev, label });
    }

    return out;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
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
      const has9 = /9|add9/.test(ev.label);
      const has6 = /6/.test(ev.label);

      let tones = isSus2
        ? [0, 2, 7]
        : isSus4
        ? [0, 5, 7]
        : isMinor
        ? [0, 3, 7]
        : [0, 4, 7];

      if (has7 && !hasMaj7) tones.push(10);
      if (hasMaj7) tones.push(11);
      if (has9) tones.push(2);
      if (has6) tones.push(9);

      const bass = feats.bassPc[ev.fi] ?? -1;
      if (bass < 0 || bass === r) {
        out.push(ev);
        continue;
      }

      const rel = this.toPc(bass - r);
      const inChord = tones.includes(rel);

      if (inChord) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        const bassStrength = c[bass] || 0;
        const rootStrength = c[r] || 0;
        const bassStrong = bassStrength > rootStrength * 0.7;

        let stable = 0;
        for (let j = Math.max(0, ev.fi - 2); j <= Math.min(feats.bassPc.length - 1, ev.fi + 2); j++) {
          if (feats.bassPc[j] === bass) stable++;
        }

        if (
          bassStrength > 0.15 / Math.max(1, bassMultiplier) &&
          stable >= 3 &&
          bassStrong
        ) {
          const m = ev.label.match(/^([A-G](?:#|b)?)/);
          const rootName = m ? m[1] : '';
          const suffix = ev.label.slice(rootName.length);
          const slash = this.getNoteName(bass, key);
          out.push({ ...ev, label: rootName + suffix + '/' + slash });
          continue;
        }
      }

      out.push(ev);
    }

    return out;
  }

  validateAndRefine(timeline, key, feats) {
    const out = [];

    for (const ev of timeline) {
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

      if (
        sR > 0.15 &&
        s5 > 0.15 &&
        sM3 < 0.08 &&
        sm3 < 0.08 &&
        /m(?!aj)/.test(ev.label)
      ) {
        const m = ev.label.match(/^([A-G](?:#|b)?)/);
        const base = m ? m[1] : '';
        out.push({ ...ev, label: base });
        continue;
      }

      out.push(ev);
    }

    return out;
  }

  classifyOrnaments(timeline, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
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
          const d1 = Math.min((r - rPrev + 12) % 12, (rPrev - r + 12) % 12);
          const d2 = Math.min((rNext - r + 12) % 12, (r - rNext + 12) % 12);
          if (d1 <= 2 && d2 <= 2) {
            ornamentType = 'passing';
          }
        }
      }

      if (
        dur < 0.4 * spb &&
        prev &&
        next &&
        prev.label === next.label &&
        ornamentType === 'structural'
      ) {
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
        const next = timeline[i + 1];
        if (next) {
          const nextRoot = this.parseRoot(next.label);
          if (
            nextRoot >= 0 &&
            nextRoot === targetRoot &&
            this.inKey(targetRoot, key.root, key.minor)
          ) {
            modalContext = 'secondary_dominant';
          }
        }
      }

      if (!key.minor) {
        if (rel === 8) modalContext = modalContext || 'borrowed_bVI';
        if (rel === 10) modalContext = modalContext || 'borrowed_bVII';
        if (rel === 5 && /m/.test(ev.label)) modalContext = modalContext || 'borrowed_iv';
        if (rel === 3) modalContext = modalContext || 'borrowed_bIII';
      } else {
        if (rel === 5 && !/m/.test(ev.label)) modalContext = modalContext || 'borrowed_IV_major';
      }

      if (rel === 1 && !/m/.test(ev.label)) {
        modalContext = modalContext || 'neapolitan';
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
      const dist = Math.min(
        (rel - scale[d] + 12) % 12,
        (scale[d] - rel + 12) % 12
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestDeg = d + 1;
      }
    }

    return bestDeg;
  }

  inKey(pc, keyRoot, minor) {
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(iv => this.toPc(keyRoot + iv));
    const note = this.toPc(pc);

    if (diatonic.includes(note)) return true;

    if (minor) {
      const rel = this.toPc(pc - keyRoot);
      if (rel === 7 || rel === 11) return true;
    } else {
      const rel = this.toPc(pc - keyRoot);
      if (rel === 2 || rel === 10 || rel === 8) return true;
    }

    return false;
  }

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
    pc = this.toPc(pc);
    const keyRoot = key.root;
    const keyMinor = !!key.minor;

    const sharpMaj = [7,2,9,4,11,6,1];
    const sharpMin = [4,11,6,1,8,3,10];
    const flatMaj  = [5,10,3,8,1,6,11];
    const flatMin  = [2,7,0,5,10,3,8];

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

  getChordLabel(root, quality, key) {
    return this.getNoteName(root, key) + (quality || '');
  }

  nameSharp(pc) {
    return this.NOTES_SHARP[this.toPc(pc)];
  }

  nameFlat(pc) {
    return this.NOTES_FLAT[this.toPc(pc)];
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
    const a = (arr || [])
      .filter(v => Number.isFinite(v))
      .sort((x, y) => x - y);
    if (!a.length) return 0;
    const idx = Math.floor((p / 100) * (a.length - 1));
    return a[idx];
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor'
      ? ['m','dim','','m','m','','']
      : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => {
      const pc = this.toPc(tonicPc + deg);
      return this.NOTES_SHARP[pc] + qualities[i];
    });
  }

  buildCircleOfFifths(key) {
    const keyName = this.getNoteName(key.root, key) + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(
      keyName.replace(/m$/, ''),
      key.minor ? 'minor' : 'major'
    );
    const functions = key.minor
      ? ['i','ii°','III','iv','v','VI','VII']
      : ['I','ii','iii','IV','V','vi','vii°'];
    return chords.map((label, i) => ({
      label,
      function: functions[i] || null
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
