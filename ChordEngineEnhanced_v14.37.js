/**
 * ChordEngineEnhanced v14.37
 * ✅ Dead code removed: validateKeyFromChords, getDiatonicChords, toPc method
 * ✅ Key detection moved to KeyDetector.js
 * ✅ BassEngine interval logic here
 */
class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this._hannCache = {};
    this._keyDetector = (typeof KeyDetector !== 'undefined') ? new KeyDetector() : null;
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
    const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const timings = {};
    const startTotal = now();
    const tAudio = now();
    const audioData = this.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    timings.audioProcessing = now() - tAudio;
    audioData.buffer = audioBuffer;
    if (opts.progressCallback) opts.progressCallback({ stage: 'extracting', progress: 0.1 });
    const tFeat = now();
    const feats = this.extractFeatures(audioData);
    timings.featureExtraction = now() - tFeat;
    if (opts.progressCallback) opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });
    const tKey = now();
    let key = this._keyDetector ? this._keyDetector.detectKeyEnhanced(feats) : this._fallbackDetectKey(feats);
    timings.keyDetection = now() - tKey;
    if (opts.progressCallback) opts.progressCallback({ stage: 'key_detected', progress: 0.4, key: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''), confidence: key.confidence });
    const useFullHMM = key.confidence > 0.80;
    if (opts.progressCallback) opts.progressCallback({ stage: useFullHMM ? 'analyzing_full' : 'analyzing_simple', progress: 0.5 });
    const tHmm = now();
    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, useFullHMM);
    timings.hmmTracking = now() - tHmm;
    if (opts.progressCallback) opts.progressCallback({ stage: 'refining', progress: 0.7 });
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    const tPerfect = now();
    const perfectKey = this._keyDetector ? this._keyDetector.detectTonicPerfect(feats, timeline, audioData.duration, { parseRoot: this.parseRoot.bind(this), getChordDuration: this.getChordDuration.bind(this), getNoteName: this.getNoteName.bind(this) }) : key;
    timings.perfectKeyDetection = now() - tPerfect;
    if (perfectKey.confidence > key.confidence + 0.10 || perfectKey.root !== key.root || perfectKey.minor !== key.minor) {
      if (opts.progressCallback) opts.progressCallback({ stage: 'key_refined', progress: 0.75, oldKey: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''), newKey: this.getNoteName(perfectKey.root, perfectKey) + (perfectKey.minor ? 'm' : ''), confidence: perfectKey.confidence });
      key = perfectKey;
      const tRe = now();
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timings.rerunWithPerfectKey = now() - tRe;
    }
    if (opts.progressCallback) opts.progressCallback({ stage: 'decorating', progress: 0.8 });
    const tPost = now();
    timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);
    timings.postProcessing = now() - tPost;
    // MajorMinorRefiner
    if (typeof MajorMinorRefiner !== 'undefined' && opts.useMajorMinorRefiner !== false) {
      try {
        const tRefine = now();
        const refiner = new MajorMinorRefiner();
        const refinedTimeline = await refiner.refineChordTimeline(audioData.buffer, timeline, { debug: opts.debug || false, minConfidenceToOverride: opts.minConfidenceToOverride || 0.40, decisionThreshold: opts.decisionThreshold || 0.15 });
        for (let i = 0; i < timeline.length; i++) {
          const refined = refinedTimeline[i];
          timeline[i].refinerAnalysis = { detectedQuality: refined?.detectedQuality || 'unclear', qualityConfidence: refined?.qualityConfidence || 0, thirdRatio: refined?.thirdRatio || 1.0, reason: refined?.reason || 'no_change' };
          if (refined?.shouldOverride && refined.refinedLabel !== timeline[i].label) {
            timeline[i].originalLabel = timeline[i].label;
            timeline[i].label = refined.refinedLabel;
            timeline[i].refinedBy = 'MajorMinorRefiner';
            timeline[i].refinerConfidence = refined.qualityConfidence;
          }
        }
        timings.majorMinorRefiner = now() - tRefine;
      } catch (e) { console.warn('MajorMinorRefiner error:', e); }
    }
    // BassEngine v4.3 - interval logic HERE
    if (typeof BassEngine !== 'undefined' && opts.useBassEngine !== false) {
      try {
        const tBass = now();
        const bassEngine = new BassEngine();
        const bassResults = await bassEngine.refineBassInTimeline(audioData.buffer, timeline, key, { minBassConfidence: 0.35, stabilityFrames: 2, debug: opts.debug });
        let inversionCount = 0, seventhCount = 0;
        const toPc = n => ((n % 12) + 12) % 12;
        for (let i = 0; i < timeline.length; i++) {
          const bassData = bassResults[i];
          if (!bassData) continue;
          timeline[i].bassDetected = bassData.bassDetected || 'NO_BASS';
          timeline[i].bassConfidence = bassData.bassConfidence || 0;
          timeline[i].bassFrequency = bassData.bassFrequency || 0;
          timeline[i].changedByBass = false;
          if (!bassData.bassDetected || bassData.bassDetected === 'NO_BASS' || bassData.bassConfidence < 0.35) continue;
          const chordLabel = timeline[i].label;
          const rootMatch = chordLabel.match(/^([A-G][#b]?)/);
          if (!rootMatch) continue;
          let rootNote = rootMatch[1].replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
          const rootPc = this.NOTES_SHARP.indexOf(rootNote);
          if (rootPc < 0) continue;
          let bassNote = bassData.bassDetected.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
          const bassPc = this.NOTES_SHARP.indexOf(bassNote);
          if (bassPc < 0 || bassPc === rootPc) continue;
          const isMinor = /m(?!aj)/.test(chordLabel);
          const has7 = /7/.test(chordLabel);
          const hasMaj7 = /maj7/.test(chordLabel);
          const interval = toPc(bassPc - rootPc);
          let newLabel = chordLabel, changed = false;
          const bassNoteName = this.getNoteName(bassPc, key);
          if (interval === 3 && isMinor) { newLabel = chordLabel.split('/')[0] + '/' + bassNoteName; changed = true; inversionCount++; }
          else if (interval === 4 && !isMinor) { newLabel = chordLabel.split('/')[0] + '/' + bassNoteName; changed = true; inversionCount++; }
          else if (interval === 7) { newLabel = chordLabel.split('/')[0] + '/' + bassNoteName; changed = true; inversionCount++; }
          else if (interval === 10 && !has7 && !hasMaj7) { const m = chordLabel.split('/')[0].match(/^([A-G][#b]?)(m)?(.*)$/); if (m) { newLabel = m[1] + (m[2] || '') + '7' + (m[3] || ''); changed = true; seventhCount++; } }
          else if (interval === 11 && !has7 && !hasMaj7 && !isMinor) { newLabel = chordLabel.split('/')[0] + 'maj7'; changed = true; seventhCount++; }
          if (changed) { timeline[i].originalLabel = timeline[i].originalLabel || chordLabel; timeline[i].label = newLabel; timeline[i].changedByBass = true; }
        }
        timings.bassEngine = now() - tBass;
      } catch (e) { console.warn('BassEngine error:', e); }
    }
    const tonic = this._keyDetector ? this._keyDetector.detectTonicMusically(timeline, key, audioData.duration, { parseRoot: this.parseRoot.bind(this), getChordDuration: this.getChordDuration.bind(this), getNoteName: this.getNoteName.bind(this) }) : { root: key.root, label: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''), confidence: 50 };
    if (tonic.root !== key.root && tonic.confidence >= opts.tonicRerunThreshold) {
      key = { root: tonic.root, minor: key.minor, confidence: Math.max(key.confidence, tonic.confidence / 100) };
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);
    }
    timings.total = now() - startTotal;
    if (opts.progressCallback) opts.progressCallback({ stage: 'complete', progress: 1.0 });
    const modulations = this.quickModulationCheck(timeline, key);
    timeline = timeline.filter(ev => ev && ev.label && typeof ev.label === 'string' && ev.label.trim());
    const stats = { totalChords: timeline.length, structural: timeline.filter(e => e.ornamentType === 'structural').length, ornaments: timeline.filter(e => e.ornamentType && e.ornamentType !== 'structural').length, secondaryDominants: timeline.filter(e => e.modalContext === 'secondary_dominant').length, modalBorrowings: timeline.filter(e => e.modalContext && e.modalContext !== 'secondary_dominant').length, inversions: timeline.filter(e => e.label.includes('/')).length, extensions: timeline.filter(e => /[679]|11|13|sus|dim|aug/.test(e.label)).length, modulations, predictionAccuracy: this.computePredictionAccuracy(timeline) };
    return { chords: timeline, key, tonic, bpm: audioData.bpm, duration: audioData.duration, stats, mode: key.minor ? 'Natural Minor (Aeolian)' : 'Major (Ionian)', timings };
  }

  _fallbackDetectKey(feats) {
    const { chroma } = feats;
    if (!chroma || !chroma.length) return { root: 0, minor: false, confidence: 0.5 };
    const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    const toPc = n => ((n % 12) + 12) % 12;
    const agg = new Array(12).fill(0);
    for (const c of chroma) for (let p = 0; p < 12; p++) agg[p] += c[p];
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;
    let best = { score: -Infinity, root: 0, minor: false };
    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0, scoreMin = 0;
      for (let i = 0; i < 12; i++) { scoreMaj += agg[toPc(r + i)] * KS_MAJOR[i]; scoreMin += agg[toPc(r + i)] * KS_MINOR[i]; }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }
    return { root: best.root, minor: best.minor, confidence: Math.min(1.0, best.score / 10) };
  }

  applyPostProcessing(timeline, key, feats, bpm, opts) {
    timeline = this.enforceEarlyDiatonic(timeline, key, feats, bpm);
    timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier, opts.extensionSensitivity);
    timeline = this.adjustMinorMajors(timeline, feats, key);
    timeline = this.addInversionsUltimate(timeline, feats, key, opts.bassMultiplier);
    timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
    timeline = this.classifyOrnaments(timeline, bpm, feats);
    timeline = this.analyzeModalContext(timeline, key);
    timeline = this.enrichTimelineWithTheory(timeline, feats, key);
    return timeline;
  }

  processAudio(audioBuffer, channelData, sampleRate) {
    let mono;
    if (channelData && sampleRate) { mono = channelData; const sr0 = sampleRate; const sr = 22050; const x = this.resampleLinear(mono, sr0, sr); return { x, sr, bpm: this.estimateTempo(x, sr), duration: x.length / sr }; }
    const channels = audioBuffer.numberOfChannels || 1;
    mono = (channels === 1) ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate || 44100; const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    return { x, sr, bpm: this.estimateTempo(x, sr), duration: x.length / sr };
  }

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr); const frames = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) { let e = 0; for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i]; frames.push(e); }
    if (frames.length < 4) return 120;
    const minLag = Math.floor(0.3 / (hop / sr)); const maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) { let r = 0; for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag]; if (r > bestR) { bestR = r; bestLag = lag; } }
    const bpm = 60 / (bestLag * (hop / sr));
    return isFinite(bpm) ? Math.max(60, Math.min(200, Math.round(bpm))) : 120;
  }

  extractFeatures(audioData) {
    const { x, sr } = audioData; const hop = Math.floor(0.10 * sr); const win = 4096;
    if (!this._hannCache[win]) { const hann = new Float32Array(win); for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1))); this._hannCache[win] = hann; }
    const hann = this._hannCache[win]; const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) frames.push(x.subarray(s, s + win));
    const chroma = [], bassPc = [], frameE = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]; const windowed = new Float32Array(win);
      for (let k = 0; k < win; k++) windowed[k] = frame[k] * hann[k];
      let en = 0; for (let k = 0; k < win; k++) en += windowed[k] * windowed[k]; frameE.push(en);
      const { mags, N } = this.fft(windowed); const c = new Float32Array(12);
      for (let b = 1; b < mags.length; b++) { const f = b * sr / N; if (f < 80 || f > 5000) continue; const midi = 69 + 12 * Math.log2(f / 440); const pc = ((Math.round(midi) % 12) + 12) % 12; c[pc] += mags[b]; }
      const sum = c.reduce((a, b) => a + b, 0); if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;
      chroma.push(c); bassPc.push(this.estimateBassF0(mags, sr, N));
    }
    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) { const v = bassPc[i]; if (v < 0 || frameE[i] < thrE || (bassPc[i - 1] !== v && bassPc[i + 1] !== v)) bassPc[i] = -1; }
    const introSkipFrames = this.computeDynamicIntroSkip(frameE, hop, sr);
    const percentiles = { p30: this.percentile(frameE, 30), p40: this.percentile(frameE, 40), p50: this.percentile(frameE, 50), p70: this.percentile(frameE, 70), p75: this.percentile(frameE, 75), p80: this.percentile(frameE, 80) };
    return { chroma, bassPc, frameE, hop, sr, introSkipFrames, percentiles };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250, win = N; const yLP = new Float32Array(win);
    for (let b = 1; b < mags.length; b++) { const f = b * sr / N; if (f <= fmax) { const omega = 2 * Math.PI * f / sr; for (let n = 0; n < win; n++) yLP[n] += mags[b] * Math.cos(omega * n); } }
    const f0minLag = Math.floor(sr / fmax), f0maxLag = Math.floor(sr / fmin);
    let bestLag = -1, bestR = -1, mean = 0;
    for (let n = 0; n < win; n++) mean += yLP[n]; mean /= win || 1;
    let denom = 0; for (let n = 0; n < win; n++) { const d = yLP[n] - mean; denom += d * d; } denom = denom || 1e-9;
    for (let lag = f0minLag; lag <= f0maxLag; lag++) { let r = 0; for (let n = 0; n < win - lag; n++) { r += (yLP[n] - mean) * (yLP[n + lag] - mean); } r /= denom; if (r > bestR) { bestR = r; bestLag = lag; } }
    if (bestLag > 0) { const f0 = sr / bestLag; if (f0 >= fmin && f0 <= fmax) return ((Math.round(69 + 12 * Math.log2(f0 / 440)) % 12) + 12) % 12; }
    return -1;
  }

  fft(input) {
    let n = input.length, N = 1; while (N < n) N <<= 1;
    const re = new Float32Array(N), im = new Float32Array(N); re.set(input);
    let j = 0;
    for (let i = 0; i < N; i++) { if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } let m = N >> 1; while (m >= 1 && j >= m) { j -= m; m >>= 1; } j += m; }
    for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wlr = Math.cos(ang), wli = Math.sin(ang); for (let i = 0; i < N; i += len) { let wr = 1, wi = 0; for (let k = 0; k < (len >> 1); k++) { const uRe = re[i + k], uIm = im[i + k], vRe = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi, vIm = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr; re[i + k] = uRe + vRe; im[i + k] = uIm + vIm; re[i + k + (len >> 1)] = uRe - vRe; im[i + k + (len >> 1)] = uIm - vIm; const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr; } } }
    const mags = new Float32Array(N >> 1); for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
    return { mags, N };
  }

  computeDynamicIntroSkip(frameE, hop, sr) {
    const thr = this.percentile(frameE, 70); let stable = 0, i = 0;
    for (; i < frameE.length; i++) { if (frameE[i] >= thr) stable++; else stable = 0; if (stable * hop / sr >= 0.5) break; }
    return Math.min(i, Math.floor((8.0 * sr) / hop));
  }

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode = true) {
    const { chroma, bassPc, hop, sr, frameE, percentiles } = feats;
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));
    const candidates = [];
    for (const r of diatonicPcs) { const noteName = this.getNoteName(r, key); candidates.push({ root: r, label: noteName, type: 'major', borrowed: false }); candidates.push({ root: r, label: noteName + 'm', type: 'minor', borrowed: false }); }
    if (!key.minor) { candidates.push({ root: toPc(key.root + 10), label: this.getNoteName(toPc(key.root + 10), key), type: 'major', borrowed: true }); candidates.push({ root: toPc(key.root + 8), label: this.getNoteName(toPc(key.root + 8), key), type: 'major', borrowed: true }); candidates.push({ root: toPc(key.root + 3), label: this.getNoteName(toPc(key.root + 3), key), type: 'major', borrowed: true }); candidates.push({ root: toPc(key.root + 5), label: this.getNoteName(toPc(key.root + 5), key) + 'm', type: 'minor', borrowed: true }); }
    else { candidates.push({ root: toPc(key.root + 7), label: this.getNoteName(toPc(key.root + 7), key), type: 'major', borrowed: true }); candidates.push({ root: toPc(key.root + 5), label: this.getNoteName(toPc(key.root + 5), key), type: 'major', borrowed: true }); candidates.push({ root: toPc(key.root + 11), label: this.getNoteName(toPc(key.root + 11), key), type: 'major', borrowed: true }); candidates.push({ root: key.root, label: this.getNoteName(key.root, key), type: 'major', borrowed: true }); }
    const diatonicChords = [];
    if (!key.minor) { [[0,'major'],[2,'minor'],[4,'minor'],[5,'major'],[7,'major'],[9,'minor'],[11,'diminished']].forEach(([d,m]) => diatonicChords.push({ root: toPc(key.root + d), mode: m })); }
    else { [[0,'minor'],[2,'diminished'],[3,'major'],[5,'minor'],[7,'minor'],[8,'major'],[10,'major']].forEach(([d,m]) => diatonicChords.push({ root: toPc(key.root + d), mode: m })); }
    for (const cand of candidates) { cand.perfectDiatonic = diatonicChords.some(dc => dc.root === cand.root && (dc.mode === cand.type || dc.mode === 'diminished')); if (!cand.borrowed && !cand.perfectDiatonic) cand.borrowed = true; }
    const maskVec = (root, intervals) => { const v = new Array(12).fill(0); for (const iv of intervals) v[toPc(root + iv)] = 1; return v; };
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const norm = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s) || 1; };
    const chordTemplates = new Map();
    for (const cand of candidates) { const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7]; chordTemplates.set(cand.label, { mask: maskVec(cand.root, intervals), maskNorm: norm(maskVec(cand.root, intervals)) }); }
    const chromaNorms = chroma.map(c => norm(c));
    const lowE = percentiles?.p30 || this.percentile(frameE, 30);
    const emitScore = (i, cand) => {
      const c = chroma[i]; if (!c) return -Infinity;
      const tmpl = chordTemplates.get(cand.label); if (!tmpl) return -Infinity;
      let score = dot(c, tmpl.mask) / (chromaNorms[i] * tmpl.maskNorm);
      if (score < 0.35) return -Infinity;
      if (!cand.borrowed) score += 0.20; else score -= 0.25;
      const detectedBass = bassPc[i];
      if (detectedBass >= 0) { const intervals = cand.type === 'minor' ? [0, 3, 7] : [0, 4, 7]; const chordPcs = intervals.map(iv => toPc(cand.root + iv)); if (detectedBass === cand.root) score += 0.15 * bassMultiplier; else if (chordPcs.includes(detectedBass)) score += 0.08 * bassMultiplier; else score -= 0.20 * bassMultiplier; }
      if (frameE[i] < lowE) score -= 0.30;
      return score;
    };
    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0;
      const circle = [0,7,2,9,4,11,6,1,8,3,10,5];
      let circleDist = Math.abs(circle.indexOf(a.root) - circle.indexOf(b.root)); if (circleDist > 6) circleDist = 12 - circleDist;
      const chromDist = Math.min((b.root - a.root + 12) % 12, (a.root - b.root + 12) % 12);
      let cost = 0.4 + 0.08 * (circleDist * 0.85 + chromDist * 0.15);
      if (a.type !== b.type) cost += 0.05;
      if (a.borrowed && b.borrowed) cost += 0.30; else if (a.borrowed || b.borrowed) cost += 0.18;
      if (!a.borrowed && !b.borrowed) cost -= 0.12;
      const localScale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
      const I = key.root, V = toPc(key.root + localScale[4]), IV = toPc(key.root + localScale[3]), II = toPc(key.root + localScale[1]);
      if (a.root === V && b.root === I) cost -= 0.15; if (a.root === IV && b.root === V) cost -= 0.12; if (a.root === II && b.root === V) cost -= 0.12; if (a.root === IV && b.root === I) cost -= 0.10; if (toPc(b.root - a.root) === 7) cost -= 0.08;
      return Math.max(0.0, cost);
    };
    const N = candidates.length, M = chroma.length; if (!M || !N) return [];
    const dp = new Array(N); const backptr = Array.from({ length: M }, () => new Array(N).fill(-1)); const BEAM_WIDTH = useFullMode ? 8 : 4;
    for (let s = 0; s < N; s++) dp[s] = emitScore(0, candidates[s]);
    for (let i = 1; i < M; i++) { const newdp = new Array(N).fill(-Infinity); const prevBeam = dp.map((score, idx) => ({ score, idx })).sort((a, b) => b.score - a.score).slice(0, BEAM_WIDTH); for (let s = 0; s < N; s++) { let bestVal = -Infinity, bestJ = -1; for (const { score: prevScore, idx: j } of prevBeam) { const val = prevScore - transitionCost(candidates[j], candidates[s]); if (val > bestVal) { bestVal = val; bestJ = j; } } newdp[s] = bestVal + emitScore(i, candidates[s]); backptr[i][s] = bestJ; } for (let s = 0; s < N; s++) dp[s] = newdp[s]; }
    let bestS = 0, bestVal = -Infinity; for (let s = 0; s < N; s++) if (dp[s] > bestVal) { bestVal = dp[s]; bestS = s; }
    const states = new Array(M); states[M - 1] = bestS; for (let i = M - 1; i > 0; i--) { const ptr = backptr[i][states[i]]; states[i - 1] = (ptr >= 0) ? ptr : states[i]; }
    const timeline = []; const secPerHop = hop / sr; let cur = states[0], start = 0;
    for (let i = 1; i < M; i++) { if (states[i] !== cur) { const cand = candidates[cur]; if (cand?.label) timeline.push({ t: start * secPerHop, label: cand.label, fi: start }); cur = states[i]; start = i; } }
    const finalCand = candidates[cur]; if (finalCand?.label) timeline.push({ t: start * secPerHop, label: finalCand.label, fi: start });
    return timeline;
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline.length) return timeline;
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120)); const minDur = Math.max(0.5, 0.50 * spb); const energyMedian = this.percentile(feats.frameE, 50); const toPc = n => ((n % 12) + 12) % 12; const filtered = [];
    for (let i = 0; i < timeline.length; i++) { const a = timeline[i], b = timeline[i + 1]; const dur = b ? (b.t - a.t) : minDur; const energy = feats.frameE[a.fi] || 0; const isWeak = energy < energyMedian * 0.85; const r = this.parseRoot(a.label); const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor); const detectedBass = feats.bassPc[a.fi] ?? -1; let bassContradicts = false; if (r >= 0 && detectedBass >= 0) { const isMinor = /m(?!aj)/.test(a.label); const chordPcs = (isMinor ? [0, 3, 7] : [0, 4, 7]).map(iv => toPc(r + iv)); bassContradicts = !chordPcs.includes(detectedBass); } if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic || bassContradicts)) continue; if (dur < minDur * 0.6 && isWeak) continue; filtered.push(a); }
    const snapped = []; for (const ev of filtered) { const raw = ev.t, grid = Math.round(raw / spb) * spb; const t = (Math.abs(grid - raw) <= 0.35 * spb) ? grid : raw; if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi }); }
    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline?.length) return timeline;
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120)); const earlyWindow = Math.max(15.0, 6 * spb); const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE; const diatonicPcs = scale.map(s => toPc(key.root + s)); const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    const getQuality = pc => { for (let i = 0; i < diatonicPcs.length; i++) if (diatonicPcs[i] === toPc(pc)) return qualities[i]; return ''; };
    const snapToDiatonic = pc => { let best = diatonicPcs[0], bestD = 99; for (const d of diatonicPcs) { const dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12); if (dist < bestD) { bestD = dist; best = d; } } return best; };
    const out = [];
    for (const ev of timeline) { let label = ev.label; if (ev.t <= earlyWindow) { const r = this.parseRoot(label); const inKey = r >= 0 && this.inKey(r, key.root, key.minor); if (!inKey) { const bp = feats.bassPc[ev.fi] ?? -1; let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root); if (ev.t < Math.min(3.0, 2.0 * spb)) newRoot = key.root; label = this.NOTES_SHARP[toPc(newRoot)] + getQuality(newRoot); } else { label = this.NOTES_SHARP[toPc(r)] + getQuality(r); } } out.push({ ...ev, label }); }
    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul, extensionSensitivity = 1.0) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));
    const mul = extensionMul / (extensionSensitivity || 1.0); const out = []; const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) {
      const root = this.parseRoot(ev.label); if (root < 0) { out.push(ev); continue; }
      const isMinorTriad = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|11|13|6|m7b5|alt|b9|#9|b5|#5).*$/, ''); if (isMinorTriad) base += 'm';
      const i0 = Math.max(0, ev.fi - 2), i1 = Math.min(feats.chroma.length - 1, ev.fi + 2); const avg = new Float32Array(12);
      for (let i = i0; i <= i1; i++) { const c = feats.chroma[i]; for (let p = 0; p < 12; p++) avg[p] += c[p]; } const len = i1 - i0 + 1 || 1; for (let p = 0; p < 12; p++) avg[p] /= len;
      const s = d => avg[toPc(root + d)] || 0;
      const sR = s(0), sM3 = s(4), sm3 = s(3), s5 = s(7), s_b5 = s(6), s_sharp5 = s(8), s2 = s(2), s4 = s(5), s_b7 = s(10), s7 = s(11), s6 = s(9);
      let label = base;
      const thirdStrong = isMinorTriad ? sm3 > 0.13 * mul : sM3 > 0.13 * mul;
      if (!isMinorTriad && !thirdStrong) { if (s4 > 0.22 / mul && s4 >= s2 * 0.9 && s5 > 0.10) label = base.replace(/m$/, '') + 'sus4'; else if (s2 > 0.22 / mul && s2 >= s4 * 0.9 && s5 > 0.10) label = base.replace(/m$/, '') + 'sus2'; }
      if (s6 > 0.18 / mul && s6 > s_b7 * 1.2 && !/sus/.test(label) && (isMinorTriad ? sm3 : sM3) > 0.12 / mul) label = base + '6';
      const degree = this.degreeOfChord(label, key); const domLike = degree === 5; const majContext = !/m$/.test(label) && !/sus/.test(label);
      if (!/6$/.test(label)) { if (majContext && s7 > 0.20 / mul && s7 > s_b7 * 1.2) label = base.replace(/m$/, '') + 'maj7'; else if (!/sus/.test(label) && (domLike ? s_b7 > 0.15 / mul : s_b7 > 0.16 / mul && sR > 0.10 / mul) && !/7$|maj7$/.test(label)) label += '7'; }
      if ((isMinorTriad && s_b5 > 0.26 / mul && s5 < 0.12 * mul && sm3 > 0.14 / mul) || (!isMinorTriad && s_b5 > 0.30 / mul && s5 < 0.10 * mul && sM3 < 0.08 * mul)) { label = isMinorTriad && s_b7 > 0.18 / mul ? base.replace(/m$/, 'm7b5') : base.replace(/m$/, '') + 'dim'; }
      if (!isMinorTriad && s_sharp5 > 0.24 / mul && s5 < 0.10 * mul && sM3 > 0.12 / mul) label = base.replace(/m$/, '') + 'aug';
      if (mode === 'jazz' || mode === 'pro') { const has7 = /7$|maj7$/.test(label); if (has7 && s2 > 0.25 / mul && sR > 0.10 / mul) label = label.replace(/7$/, '9'); else if (!/sus/.test(label) && s2 > 0.25 / mul && sR > 0.10 / mul && (isMinorTriad ? sm3 : sM3) > 0.10 / mul && !/maj7|7|9|add9/.test(label)) label += 'add9'; }
      out.push({ ...ev, label });
    }
    return out;
  }

  adjustMinorMajors(timeline, feats, key) {
    if (!key.minor) return timeline; const out = []; const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) { let label = ev.label; const r = this.parseRoot(label); if (r < 0 || /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label) || !/(^[A-G](?:#|b)?)(m)(?!aj)/.test(label)) { out.push(ev); continue; } const rel = toPc(r - key.root); if (!(rel === this.MINOR_SCALE[2] || rel === this.MINOR_SCALE[4] || rel === this.MINOR_SCALE[6])) { out.push(ev); continue; } const i0 = Math.max(0, ev.fi - 2), i1 = Math.min(feats.chroma.length - 1, ev.fi + 2); const avg = new Float32Array(12); for (let i = i0; i <= i1; i++) { const c = feats.chroma[i]; for (let p = 0; p < 12; p++) avg[p] += c[p]; } for (let p = 0; p < 12; p++) avg[p] /= (i1 - i0 + 1) || 1; if (avg[toPc(r + 4)] > avg[toPc(r + 3)] * 1.25 && avg[toPc(r + 4)] > 0.08) label = label.replace(/m(?!aj)/, ''); out.push({ ...ev, label }); }
    return out;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
    const out = []; const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) { const r = this.parseRoot(ev.label); if (r < 0) { out.push(ev); continue; } const isMinor = /m(?!aj)/.test(ev.label); let tones = /sus2/.test(ev.label) ? [0,2,7] : /sus4/.test(ev.label) ? [0,5,7] : isMinor ? [0,3,7] : [0,4,7]; if (/7/.test(ev.label) && !/maj7/.test(ev.label)) tones.push(10); if (/maj7/.test(ev.label)) tones.push(11); if (/9|add9/.test(ev.label)) tones.push(2); if (/6/.test(ev.label)) tones.push(9); const bass = feats.bassPc[ev.fi] ?? -1; if (bass < 0 || bass === r) { out.push(ev); continue; } const rel = toPc(bass - r); if (tones.includes(rel)) { const c = feats.chroma[ev.fi] || new Float32Array(12); const bassStrength = c[bass] || 0, rootStrength = c[r] || 0; let stable = 0; for (let j = Math.max(0, ev.fi - 2); j <= Math.min(feats.bassPc.length - 1, ev.fi + 2); j++) if (feats.bassPc[j] === bass) stable++; if (bassStrength > 0.15 / Math.max(1, bassMultiplier) && stable >= 3 && bassStrength > rootStrength * 0.7) { const m = ev.label.match(/^([A-G](?:#|b)?)/); out.push({ ...ev, label: (m ? m[1] : '') + ev.label.slice((m?m[1]:'').length) + '/' + this.getNoteName(bass, key) }); continue; } } out.push(ev); }
    return out;
  }

  validateAndRefine(timeline, key, feats) {
    const out = []; const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) { const r = this.parseRoot(ev.label); if (r < 0) { out.push(ev); continue; } const c = feats.chroma[ev.fi] || new Float32Array(12); if (c[toPc(r)] > 0.15 && c[toPc(r + 7)] > 0.15 && c[toPc(r + 4)] < 0.08 && c[toPc(r + 3)] < 0.08 && /m(?!aj)/.test(ev.label)) { const m = ev.label.match(/^([A-G](?:#|b)?)/); out.push({ ...ev, label: m ? m[1] : '' }); continue; } out.push(ev); }
    return out;
  }

  classifyOrnaments(timeline, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120)); const out = [];
    for (let i = 0; i < timeline.length; i++) { const ev = timeline[i], prev = timeline[i - 1], next = timeline[i + 1]; const dur = next ? (next.t - ev.t) : spb; let ornamentType = 'structural'; if (dur < 0.35 * spb && prev && next) { const rPrev = this.parseRoot(prev.label), r = this.parseRoot(ev.label), rNext = this.parseRoot(next.label); if (rPrev >= 0 && r >= 0 && rNext >= 0) { const d1 = Math.min((r - rPrev + 12) % 12, (rPrev - r + 12) % 12), d2 = Math.min((rNext - r + 12) % 12, (r - rNext + 12) % 12); if (d1 <= 2 && d2 <= 2) ornamentType = 'passing'; } } if (dur < 0.4 * spb && prev && next && prev.label === next.label && ornamentType === 'structural') ornamentType = 'neighbor'; if (prev) { const bassCur = feats.bassPc[ev.fi] ?? -1, bassPrev = feats.bassPc[prev.fi] ?? -1; if (bassCur >= 0 && bassPrev >= 0 && bassCur === bassPrev) { const rCur = this.parseRoot(ev.label), rPrev = this.parseRoot(prev.label); if (rCur >= 0 && rPrev >= 0 && rCur !== rPrev) ornamentType = 'pedal'; } } out.push({ ...ev, ornamentType }); }
    return out;
  }

  analyzeModalContext(timeline, key) {
    const out = []; const toPc = n => ((n % 12) + 12) % 12;
    for (let i = 0; i < timeline.length; i++) { const ev = timeline[i], r = this.parseRoot(ev.label); if (r < 0) { out.push({ ...ev, modalContext: null }); continue; } const rel = toPc(r - key.root); let modalContext = null; if (/7$/.test(ev.label) && !/maj7/.test(ev.label)) { const targetRoot = toPc(r + 7), next = timeline[i + 1]; if (next) { const nextRoot = this.parseRoot(next.label); if (nextRoot >= 0 && nextRoot === targetRoot && this.inKey(targetRoot, key.root, key.minor)) modalContext = 'secondary_dominant'; } } if (!key.minor) { if (rel === 8) modalContext = modalContext || 'borrowed_bVI'; if (rel === 10) modalContext = modalContext || 'borrowed_bVII'; if (rel === 5 && /m/.test(ev.label)) modalContext = modalContext || 'borrowed_iv'; if (rel === 3) modalContext = modalContext || 'borrowed_bIII'; } else { if (rel === 5 && !/m/.test(ev.label)) modalContext = modalContext || 'borrowed_IV_major'; } if (rel === 1 && !/m/.test(ev.label)) modalContext = modalContext || 'neapolitan'; out.push({ ...ev, modalContext }); }
    return out;
  }

  enrichTimelineWithTheory(timeline, feats, key) {
    const enriched = [], recent = [], MEMORY = 5;
    for (let i = 0; i < timeline.length; i++) { const analyzed = { ...timeline[i] }; if (recent.length >= 2) { const prog = this.recognizeProgressionPattern(recent, key); if (prog) analyzed.recognizedProgression = prog.name; } const next = timeline[i + 1]; if (next) { const preds = this.predictNextChord(recent.concat([analyzed]), key); if (preds?.length) { analyzed.predictions = preds; const nextRoot = this.parseRoot(next.label); if (nextRoot >= 0 && preds[0].root === nextRoot) { analyzed.predictionMatch = true; analyzed.predictionConfidence = preds[0].confidence; } } } enriched.push(analyzed); recent.push(analyzed); if (recent.length > MEMORY) recent.shift(); }
    return enriched;
  }

  recognizeProgressionPattern(recentChords, key) {
    if (!recentChords || recentChords.length < 2) return null;
    const toPc = n => ((n % 12) + 12) % 12; const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const degrees = recentChords.map(chord => { const root = this.parseRoot(chord.label); if (root < 0) return null; const rel = toPc(root - key.root); for (let i = 0; i < scale.length; i++) if (toPc(scale[i]) === rel) return i + 1; return null; }).filter(d => d !== null);
    if (degrees.length < 2) return null;
    const progressions = { '1-4-5': { name: 'I-IV-V', next: 1, strength: 0.9 }, '1-5-6-4': { name: 'I-V-vi-IV', next: 1, strength: 0.85 }, '2-5': { name: 'ii-V', next: 1, strength: 0.95 }, '2-5-1': { name: 'ii-V-I', next: null, strength: 1.0 }, '4-5': { name: 'IV-V', next: 1, strength: 0.9 }, '5-1': { name: 'V-I', next: null, strength: 1.0 }, '4-1': { name: 'IV-I', next: null, strength: 0.85 } };
    for (let len = Math.min(5, degrees.length); len >= 2; len--) { const slice = degrees.slice(-len).join('-'); if (progressions[slice]) return { pattern: slice, ...progressions[slice] }; }
    return null;
  }

  predictNextChord(recentChords, key) {
    if (!recentChords?.length) return null;
    const toPc = n => ((n % 12) + 12) % 12; const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const lastRoot = this.parseRoot(recentChords[recentChords.length - 1].label); if (lastRoot < 0) return null;
    const predictions = []; const progression = this.recognizeProgressionPattern(recentChords, key);
    if (progression?.next !== null) { const targetRoot = toPc(key.root + scale[progression.next - 1]); predictions.push({ root: targetRoot, label: this.getNoteName(targetRoot, key), confidence: progression.strength }); }
    const fifthUp = toPc(lastRoot + 7), fifthDown = toPc(lastRoot - 7);
    if (this.inKey(fifthUp, key.root, key.minor)) predictions.push({ root: fifthUp, label: this.getNoteName(fifthUp, key), confidence: 0.7 });
    if (this.inKey(fifthDown, key.root, key.minor)) predictions.push({ root: fifthDown, label: this.getNoteName(fifthDown, key), confidence: 0.6 });
    const map = new Map(); for (const p of predictions) if (!map.has(p.root) || map.get(p.root).confidence < p.confidence) map.set(p.root, p);
    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  computePredictionAccuracy(timeline) { const withPred = timeline.filter(c => c.predictions?.length); if (!withPred.length) return 0; return Math.round((withPred.filter(c => c.predictionMatch).length / withPred.length) * 100); }

  quickModulationCheck(timeline, primaryKey) {
    if (!timeline || timeline.length < 20) return 0;
    const third = Math.floor(timeline.length / 3); const sections = [timeline.slice(0, third), timeline.slice(third, 2 * third), timeline.slice(2 * third)];
    let modCount = 0, lastKey = { root: primaryKey.root, minor: primaryKey.minor };
    for (const section of sections) { if (!section.length) continue; let diatonicCount = 0; for (const chord of section) { const root = this.parseRoot(chord.label); if (root >= 0 && this.inKey(root, lastKey.root, lastKey.minor)) diatonicCount++; } const diatonicRatio = diatonicCount / section.length; if (diatonicRatio >= 0.6) continue; let bestNewKey = null, bestRatio = diatonicRatio; for (let newRoot = 0; newRoot < 12; newRoot++) { for (const newMinor of [false, true]) { let cnt = 0; for (const chord of section) { const root = this.parseRoot(chord.label); if (root >= 0 && this.inKey(root, newRoot, newMinor)) cnt++; } const ratio = cnt / section.length; if (ratio > bestRatio + 0.15) { bestRatio = ratio; bestNewKey = { root: newRoot, minor: newMinor }; } } } if (bestNewKey) { modCount++; lastKey = bestNewKey; } }
    return modCount;
  }

  degreeOfChord(label, key) { const rootPc = this.parseRoot(label); if (rootPc < 0) return null; const toPc = n => ((n % 12) + 12) % 12; const rel = toPc(rootPc - key.root); const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE; let bestDeg = null, bestDist = 999; for (let d = 0; d < scale.length; d++) { const dist = Math.min((rel - scale[d] + 12) % 12, (scale[d] - rel + 12) % 12); if (dist < bestDist) { bestDist = dist; bestDeg = d + 1; } } return bestDeg; }

  inKey(pc, keyRoot, minor) { const toPc = n => ((n % 12) + 12) % 12; const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE; const diatonic = scale.map(iv => toPc(keyRoot + iv)); const note = toPc(pc); if (diatonic.includes(note)) return true; const rel = toPc(pc - keyRoot); if (minor) { if (rel === 7 || rel === 11) return true; } else { if (rel === 2 || rel === 10 || rel === 8) return true; } return false; }

  parseRoot(label) { if (!label || typeof label !== 'string') return -1; const m = label.match(/^([A-G])(#|b)?/); if (!m) return -1; const note = m[1] + (m[2] || ''); let idx = this.NOTES_SHARP.indexOf(note); if (idx >= 0) return idx; idx = this.NOTES_FLAT.indexOf(note); return idx >= 0 ? idx : -1; }

  getNoteName(pc, key) { const toPc = n => ((n % 12) + 12) % 12; pc = toPc(pc); const flatMaj = [5,10,3,8,1,6,11], flatMin = [2,7,0,5,10,3,8]; let useFlats = key.minor ? flatMin.includes(key.root) : flatMaj.includes(key.root); if (key.root === 0 && !key.minor && [10,3,8].includes(pc)) useFlats = true; return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc]; }

  getChordDuration(chord, timeline, totalDuration) { const idx = timeline.indexOf(chord); if (idx < 0) return 0.5; const next = timeline[idx + 1]; return next ? Math.max(0.1, next.t - chord.t) : Math.max(0.5, totalDuration - chord.t); }

  mixStereo(audioBuffer) { const left = audioBuffer.getChannelData(0), right = audioBuffer.getChannelData(1); const len = Math.min(left.length, right.length); const mono = new Float32Array(len); for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]); return mono; }

  resampleLinear(samples, fromRate, toRate) { if (!samples || fromRate === toRate) return samples; const ratio = fromRate / toRate; const newLength = Math.max(1, Math.floor(samples.length / ratio)); const resampled = new Float32Array(newLength); for (let i = 0; i < newLength; i++) { const srcIndex = i * ratio, i0 = Math.floor(srcIndex), i1 = Math.min(i0 + 1, samples.length - 1), t = srcIndex - i0; resampled[i] = samples[i0] * (1 - t) + samples[i1] * t; } return resampled; }

  percentile(arr, p) { const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y); if (!a.length) return 0; return a[Math.floor((p / 100) * (a.length - 1))]; }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = ChordEngineEnhanced; }
