/**
 * ChordEngineEnhanced v14.37 - CLEANED
 * ✅ הוסרו כפילויות (parseRoot, getChordDuration)
 * ✅ חיבור מתוקן ל-BassEngine ו-MajorMinorRefiner v5.0
 */

class ChordEngineEnhanced {
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
      extensionMultiplier: options.extensionMultiplier || 1.0,
      validationMultiplier: options.validationMultiplier || 1.0,
      bassSensitivity: options.bassSensitivity || 1.0,
      extensionSensitivity: options.extensionSensitivity || 1.0,
      filterWeakChords: options.filterWeakChords !== false,
      channelData: options.channelData || null,
      sampleRate: options.sampleRate || null,
      tonicRerunThreshold: options.tonicRerunThreshold !== undefined ? options.tonicRerunThreshold : 75,
      progressCallback: typeof options.progressCallback === 'function' ? options.progressCallback : null,
      useBassEngine: options.useBassEngine !== false,
      useMajorMinorRefiner: options.useMajorMinorRefiner !== false,
      minBassConfidence: options.minBassConfidence || 0.50,
      minMMConfidence: options.minMMConfidence || 0.40
    };

    const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const timings = {};
    const startTotal = now();

    const tAudio = now();
    const audioData = this.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    timings.audioProcessing = now() - tAudio;

    if (opts.progressCallback) opts.progressCallback({ stage: 'extracting', progress: 0.1 });

    const tFeat = now();
    const feats = this.extractFeatures(audioData);
    timings.featureExtraction = now() - tFeat;

    if (opts.progressCallback) opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });

    const tKey = now();
    let key = this.detectKeyEnhanced(feats);
    timings.keyDetection = now() - tKey;

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
      opts.progressCallback({ stage: useFullHMM ? 'analyzing_full' : 'analyzing_simple', progress: 0.5 });
    }

    const tHmm = now();
    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, useFullHMM);
    timings.hmmTracking = now() - tHmm;

    if (opts.progressCallback) opts.progressCallback({ stage: 'refining', progress: 0.7 });

    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    
    const tPerfect = now();
    const perfectKey = this.detectTonicPerfect(feats, timeline, audioData.duration);
    timings.perfectKeyDetection = now() - tPerfect;
    
    if (perfectKey.confidence > key.confidence + 0.10 || perfectKey.root !== key.root || perfectKey.minor !== key.minor) {
      if (opts.progressCallback) {
        opts.progressCallback({
          stage: 'key_refined', progress: 0.75,
          oldKey: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''),
          newKey: this.getNoteName(perfectKey.root, perfectKey) + (perfectKey.minor ? 'm' : ''),
          confidence: perfectKey.confidence
        });
      }
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

    // ═══════════════════════════════════════════════════════════════════════════
    // הצלבה עם BassEngine ו-MajorMinorRefiner v5.0
    // ═══════════════════════════════════════════════════════════════════════════
    let bassResults = null, mmResults = null, bassChanges = 0, mmChanges = 0;
    
    if (typeof BassEngine !== 'undefined' && opts.useBassEngine) {
      try {
        const tBass = now();
        const bassEngine = new BassEngine();
        bassResults = bassEngine.analyze(audioBuffer);
        timings.bassAnalysis = now() - tBass;
      } catch (e) { console.warn('BassEngine error:', e); }
    }
    
    if (typeof MajorMinorRefiner !== 'undefined' && opts.useMajorMinorRefiner) {
      try {
        const tMM = now();
        const mmRefiner = new MajorMinorRefiner();
        mmResults = mmRefiner.analyze(timeline, audioBuffer);
        timings.mmAnalysis = now() - tMM;
      } catch (e) { console.warn('MajorMinorRefiner error:', e); }
    }
    
    if (bassResults || mmResults) {
      for (let i = 0; i < timeline.length; i++) {
        const chord = timeline[i];
        chord.originalLabel = chord.label;
        
        if (bassResults) {
          const bassInfo = this.getBassAtTime(bassResults, chord.t);
          if (bassInfo && bassInfo.bassPc >= 0) {
            chord.detectedBass = bassInfo.bassNote;
            chord.bassConfidence = bassInfo.confidence;
            if (bassInfo.confidence >= opts.minBassConfidence) {
              const rootPc = this.parseRoot(chord.label);
              if (rootPc >= 0 && bassInfo.bassPc !== rootPc) {
                const isMinor = /m(?!aj)/.test(chord.label);
                const chordPcs = isMinor ? [rootPc,(rootPc+3)%12,(rootPc+7)%12] : [rootPc,(rootPc+4)%12,(rootPc+7)%12];
                if (chordPcs.includes(bassInfo.bassPc) && !chord.label.includes('/')) {
                  chord.label = chord.label + '/' + this.NOTES_SHARP[bassInfo.bassPc];
                  chord.changedByBass = true;
                  bassChanges++;
                }
              }
            }
          }
        }
        
        if (mmResults && mmResults[i]) {
          const mmInfo = mmResults[i];
          chord.mmDetected = mmInfo.quality;
          chord.mmConfidence = mmInfo.confidence;
          if (mmInfo.quality && mmInfo.confidence >= opts.minMMConfidence) {
            const currentIsMinor = /m(?!aj)/.test(chord.label);
            const shouldBeMinor = mmInfo.quality === 'minor';
            if (currentIsMinor !== shouldBeMinor) {
              chord.label = this.changeChordQuality(chord.label, shouldBeMinor);
              chord.refinedBy = 'MajorMinorRefiner';
              mmChanges++;
            }
          }
        }
      }
    }

    const tonic = this.detectTonicMusically(timeline, key, audioData.duration);

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

    const stats = {
      totalChords: timeline.length,
      structural: timeline.filter(e => e.ornamentType === 'structural').length,
      ornaments: timeline.filter(e => e.ornamentType && e.ornamentType !== 'structural').length,
      inversions: timeline.filter(e => e.label.includes('/')).length,
      modulations, bassChanges, mmChanges,
      predictionAccuracy: this.computePredictionAccuracy(timeline)
    };

    return { chords: timeline, key, tonic, bpm: audioData.bpm, duration: audioData.duration, stats, timings };
  }

  getBassAtTime(bassResults, time) {
    if (!bassResults?.length) return null;
    let closest = null, minDiff = Infinity;
    for (const r of bassResults) {
      const diff = Math.abs(r.t - time);
      if (diff < minDiff) { minDiff = diff; closest = r; }
    }
    return minDiff < 0.15 ? closest : null;
  }
  
  changeChordQuality(label, toMinor) {
    const match = label.match(/^([A-G][#b]?)(m)?(.*?)(\/.+)?$/);
    if (!match) return label;
    const root = match[1], wasMinor = !!match[2];
    let suffix = (match[3] || '').replace(/^maj/, '');
    const bass = match[4] || '';
    if (toMinor && !wasMinor) return root + 'm' + suffix + bass;
    if (!toMinor && wasMinor) return root + suffix + bass;
    return label;
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
    if (channelData && sampleRate) {
      mono = channelData;
      const sr0 = sampleRate, sr = 22050;
      const x = this.resampleLinear(mono, sr0, sr);
      const bpm = this.estimateTempo(x, sr);
      return { x, sr, bpm, duration: x.length / sr, buffer: audioBuffer };
    }
    const channels = audioBuffer.numberOfChannels || 1;
    mono = (channels === 1) ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate || 44100, sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);
    return { x, sr, bpm, duration: x.length / sr, buffer: audioBuffer };
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
    const minLag = Math.floor(0.3 / (hop / sr)), maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const bpm = 60 / (bestLag * (hop / sr));
    return isFinite(bpm) ? Math.max(60, Math.min(200, Math.round(bpm))) : 120;
  }

  extractFeatures(audioData) {
    const { x, sr } = audioData;
    const hop = Math.floor(0.10 * sr), win = 4096;
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
        const pc = ((Math.round(midi) % 12) + 12) % 12;
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
    const introSkipFrames = this.computeDynamicIntroSkip(frameE, hop, sr);
    const percentiles = {
      p30: this.percentile(frameE, 30), p40: this.percentile(frameE, 40),
      p50: this.percentile(frameE, 50), p70: this.percentile(frameE, 70),
      p75: this.percentile(frameE, 75), p80: this.percentile(frameE, 80)
    };
    return { chroma, bassPc, frameE, hop, sr, introSkipFrames, percentiles };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250, win = N;
    const yLP = new Float32Array(win);
    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < win; n++) yLP[n] += mags[b] * Math.cos(omega * n);
      }
    }
    const f0minLag = Math.floor(sr / fmax), f0maxLag = Math.floor(sr / fmin);
    let bestLag = -1, bestR = -1;
    let mean = 0;
    for (let n = 0; n < win; n++) mean += yLP[n];
    mean /= win || 1;
    let denom = 0;
    for (let n = 0; n < win; n++) { const d = yLP[n] - mean; denom += d * d; }
    denom = denom || 1e-9;
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
        return ((Math.round(midiF0) % 12) + 12) % 12;
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

  computeDynamicIntroSkip(frameE, hop, sr) {
    const thr = this.percentile(frameE, 70);
    let stable = 0, i = 0;
    for (; i < frameE.length; i++) {
      if (frameE[i] >= thr) stable++; else stable = 0;
      if (stable * hop / sr >= 0.5) break;
    }
    return Math.min(i, Math.floor((8.0 * sr) / hop));
  }

  detectTonicFromBass(feats) {
    const { bassPc, frameE, introSkipFrames, percentiles } = feats;
    const threshold = (percentiles && percentiles.p80) || this.percentile(frameE, 80);
    const bassHist = new Array(12).fill(0);
    const start = introSkipFrames || 0;
    for (let i = start; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) bassHist[bp] += frameE[i] / threshold;
    }
    let tonicPc = 0, maxVal = 0;
    for (let pc = 0; pc < 12; pc++) if (bassHist[pc] > maxVal) { maxVal = bassHist[pc]; tonicPc = pc; }
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
    let minorBassScore = 0, majorBassScore = 0;
    if (m6_bass > 0.05) minorBassScore += 3.0;
    if (m7_bass > 0.05) minorBassScore += 2.5;
    if (m3_bass > 0.04) minorBassScore += 2.0;
    if (M6_bass > 0.05) majorBassScore += 3.0;
    if (M7_bass > 0.05) majorBassScore += 2.5;
    if (M3_bass > 0.04) majorBassScore += 2.0;
    if (m6_bass > M6_bass * 1.5 && m6_bass > 0.03) minorBassScore += 2.0;
    if (M6_bass > m6_bass * 1.5 && M6_bass > 0.03) majorBassScore += 2.0;
    let minorHint, bassMinorConfidence = 0;
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
      const opening = new Array(12).fill(0), closing = new Array(12).fill(0);
      let openingW = 0, closingW = 0;
      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= thr) {
          const w = frameE[i] / thr, c = chroma[i];
          for (let p = 0; p < 12; p++) agg[p] += c[p] * w;
          totalW += w;
          if (i < start + 5) { for (let p = 0; p < 12; p++) opening[p] += c[p] * w * 3.0; openingW += w * 3.0; }
          if (i >= chroma.length - 5) { for (let p = 0; p < 12; p++) closing[p] += c[p] * w * 3.0; closingW += w * 3.0; }
        }
      }
      if (totalW > 0) for (let p = 0; p < 12; p++) agg[p] /= totalW;
      if (openingW > 0) for (let p = 0; p < 12; p++) opening[p] /= openingW;
      if (closingW > 0) for (let p = 0; p < 12; p++) closing[p] /= closingW;
      const m3 = agg[toPc(root + 3)] || 0, M3 = agg[toPc(root + 4)] || 0;
      const m6 = agg[toPc(root + 8)] || 0, M6 = agg[toPc(root + 9)] || 0;
      const m7 = agg[toPc(root + 10)] || 0, M7 = agg[toPc(root + 11)] || 0;
      let minorScore = 0, majorScore = 0;
      const thirdRatio = (m3 + 0.0001) / (M3 + 0.0001);
      if (thirdRatio >= 1.03) minorScore += 5.0 * Math.min(3.0, thirdRatio - 1.0);
      else if (thirdRatio <= 0.97) majorScore += 5.0 * Math.min(3.0, 1.0 / thirdRatio - 1.0);
      const sixthRatio = (m6 + 0.0001) / (M6 + 0.0001);
      if (sixthRatio >= 1.08) minorScore += 3.0 * Math.min(2.5, sixthRatio - 1.0);
      else if (sixthRatio <= 0.93) majorScore += 3.0 * Math.min(2.5, 1.0 / sixthRatio - 1.0);
      const openingThirdRatio = (opening[toPc(root + 3)] + 0.0001) / (opening[toPc(root + 4)] + 0.0001);
      if (openingThirdRatio > 1.05) minorScore += 4.0; else if (openingThirdRatio < 0.95) majorScore += 4.0;
      const closingThirdRatio = (closing[toPc(root + 3)] + 0.0001) / (closing[toPc(root + 4)] + 0.0001);
      if (closingThirdRatio > 1.05) minorScore += 4.0; else if (closingThirdRatio < 0.95) majorScore += 4.0;
      if (bassTonic.minorHint !== undefined) {
        if (bassTonic.minorHint) minorScore += bassTonic.bassMinorConfidence * 3.0;
        else majorScore += bassTonic.bassMinorConfidence * 3.0;
      }
      const isMinor = minorScore > majorScore;
      const separation = Math.abs(minorScore - majorScore);
      const spread = Math.abs(m3 - M3) + Math.abs(m6 - M6) + Math.abs(m7 - M7);
      let confidence = 0.25 + bassTonic.confidence * 0.25 + separation * 0.15 + spread * 0.8;
      return { root, minor: !!isMinor, confidence: Math.min(1.0, confidence) };
    }
    const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    const agg = new Array(12).fill(0);
    for (let i = 0; i < chroma.length; i++) {
      const pos = i / chroma.length;
      let w = 1.0;
      if (pos < 0.10) w = 5.0; else if (pos > 0.90) w = 3.0;
      const c = chroma[i];
      for (let p = 0; p < 12; p++) agg[p] += c[p] * w;
    }
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;
    let best = { score: -Infinity, root: 0, minor: false };
    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0, scoreMin = 0;
      for (let i = 0; i < 12; i++) { const idx = toPc(r + i); scoreMaj += agg[idx] * KS_MAJOR[i]; scoreMin += agg[idx] * KS_MINOR[i]; }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }
    return { root: best.root, minor: best.minor, confidence: Math.min(1.0, best.score / 10) };
  }

  detectTonicPerfect(feats, timeline, duration) {
    const toPc = n => ((n % 12) + 12) % 12;
    const votes = {};
    for (let pc = 0; pc < 12; pc++) votes[pc] = { major: 0, minor: 0 };
    const bassResult = this.detectTonicFromBass(feats);
    if (bassResult.confidence > 0.15) {
      const bassWeight = 50 * bassResult.confidence;
      if (bassResult.minorHint === true) votes[bassResult.root].minor += bassWeight;
      else if (bassResult.minorHint === false) votes[bassResult.root].major += bassWeight;
      else { votes[bassResult.root].major += bassWeight * 0.5; votes[bassResult.root].minor += bassWeight * 0.5; }
    }
    if (timeline?.length > 0) {
      let firstChord = null;
      for (let i = 0; i < Math.min(5, timeline.length); i++) {
        if (timeline[i]?.label && this.getChordDuration(timeline[i], timeline, duration) >= 0.5) { firstChord = timeline[i]; break; }
      }
      if (firstChord) {
        const root = this.parseRoot(firstChord.label);
        if (root >= 0) {
          if (/m(?!aj)/.test(firstChord.label)) votes[root].minor += 15;
          else votes[root].major += 15;
        }
      }
    }
    if (timeline?.length > 1) {
      const lastChord = timeline[timeline.length - 1];
      if (lastChord?.label) {
        const root = this.parseRoot(lastChord.label);
        if (root >= 0) {
          if (/m(?!aj)/.test(lastChord.label)) votes[root].minor += 15;
          else votes[root].major += 15;
        }
      }
    }
    let bestRoot = 0, bestMode = false, bestScore = -Infinity;
    for (let pc = 0; pc < 12; pc++) {
      if (votes[pc].major > bestScore) { bestScore = votes[pc].major; bestRoot = pc; bestMode = false; }
      if (votes[pc].minor > bestScore) { bestScore = votes[pc].minor; bestRoot = pc; bestMode = true; }
    }
    return { root: bestRoot, minor: bestMode, confidence: Math.min(1.0, bestScore / 115), method: 'perfect_voting' };
  }

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
      candidates.push({ root: toPc(key.root + 10), label: this.getNoteName(toPc(key.root + 10), key), type: 'major', borrowed: true });
      candidates.push({ root: toPc(key.root + 8), label: this.getNoteName(toPc(key.root + 8), key), type: 'major', borrowed: true });
      candidates.push({ root: toPc(key.root + 3), label: this.getNoteName(toPc(key.root + 3), key), type: 'major', borrowed: true });
      candidates.push({ root: toPc(key.root + 5), label: this.getNoteName(toPc(key.root + 5), key) + 'm', type: 'minor', borrowed: true });
    } else {
      candidates.push({ root: toPc(key.root + 7), label: this.getNoteName(toPc(key.root + 7), key), type: 'major', borrowed: true });
      candidates.push({ root: toPc(key.root + 5), label: this.getNoteName(toPc(key.root + 5), key), type: 'major', borrowed: true });
      candidates.push({ root: toPc(key.root + 11), label: this.getNoteName(toPc(key.root + 11), key), type: 'major', borrowed: true });
      candidates.push({ root: key.root, label: this.getNoteName(key.root, key), type: 'major', borrowed: true });
    }
    const diatonicChords = [];
    if (!key.minor) {
      diatonicChords.push({ root: toPc(key.root + 0), mode: 'major' });
      diatonicChords.push({ root: toPc(key.root + 2), mode: 'minor' });
      diatonicChords.push({ root: toPc(key.root + 4), mode: 'minor' });
      diatonicChords.push({ root: toPc(key.root + 5), mode: 'major' });
      diatonicChords.push({ root: toPc(key.root + 7), mode: 'major' });
      diatonicChords.push({ root: toPc(key.root + 9), mode: 'minor' });
      diatonicChords.push({ root: toPc(key.root + 11), mode: 'diminished' });
    } else {
      diatonicChords.push({ root: toPc(key.root + 0), mode: 'minor' });
      diatonicChords.push({ root: toPc(key.root + 2), mode: 'diminished' });
      diatonicChords.push({ root: toPc(key.root + 3), mode: 'major' });
      diatonicChords.push({ root: toPc(key.root + 5), mode: 'minor' });
      diatonicChords.push({ root: toPc(key.root + 7), mode: 'minor' });
      diatonicChords.push({ root: toPc(key.root + 8), mode: 'major' });
      diatonicChords.push({ root: toPc(key.root + 10), mode: 'major' });
    }
    for (const cand of candidates) {
      cand.perfectDiatonic = diatonicChords.some(dc => dc.root === cand.root && (dc.mode === cand.type || dc.mode === 'diminished'));
      if (!cand.borrowed && !cand.perfectDiatonic) cand.borrowed = true;
    }
    const maskVec = (root, intervals) => { const v = new Array(12).fill(0); for (const iv of intervals) v[toPc(root + iv)] = 1; return v; };
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const norm = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s) || 1; };
    const chordTemplates = new Map();
    for (const cand of candidates) {
      const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7];
      const mask = maskVec(cand.root, intervals);
      chordTemplates.set(cand.label, { mask, maskNorm: norm(mask) });
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
      if (!cand.borrowed) score += 0.20; else score -= 0.25;
      const detectedBass = bassPc[i];
      if (detectedBass >= 0) {
        const intervals = cand.type === 'minor' ? [0, 3, 7] : [0, 4, 7];
        const chordPcs = intervals.map(iv => toPc(cand.root + iv));
        if (detectedBass === cand.root) score += 0.15 * bassMultiplier;
        else if (chordPcs.includes(detectedBass)) score += 0.08 * bassMultiplier;
        else score -= 0.20 * bassMultiplier;
      }
      if (frameE[i] < lowE) score -= 0.30;
      return score;
    };
    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0;
      const circle = [0,7,2,9,4,11,6,1,8,3,10,5];
      let circleDist = Math.abs(circle.indexOf(a.root) - circle.indexOf(b.root));
      if (circleDist > 6) circleDist = 12 - circleDist;
      const chromDist = Math.min((b.root - a.root + 12) % 12, (a.root - b.root + 12) % 12);
      let cost = 0.4 + 0.08 * (circleDist * 0.85 + chromDist * 0.15);
      if (a.type !== b.type) cost += 0.05;
      if (a.borrowed && b.borrowed) cost += 0.30;
      else if (a.borrowed || b.borrowed) cost += 0.18;
      if (!a.borrowed && !b.borrowed) cost -= 0.12;
      const localScale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
      const V = toPc(key.root + localScale[4]), IV = toPc(key.root + localScale[3]), II = toPc(key.root + localScale[1]);
      if (a.root === V && b.root === key.root) cost -= 0.15;
      if (a.root === IV && b.root === V) cost -= 0.12;
      if (a.root === II && b.root === V) cost -= 0.12;
      if (a.root === IV && b.root === key.root) cost -= 0.10;
      return Math.max(0.0, cost);
    };
    const N = candidates.length, M = chroma.length;
    if (!M || !N) return [];
    const dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    const BEAM_WIDTH = useFullMode ? 8 : 4;
    for (let s = 0; s < N; s++) dp[s] = emitScore(0, candidates[s]);
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      const prevBeam = dp.map((score, idx) => ({ score, idx })).sort((a, b) => b.score - a.score).slice(0, BEAM_WIDTH);
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
    let bestS = 0, bestVal = -Infinity;
    for (let s = 0; s < N; s++) if (dp[s] > bestVal) { bestVal = dp[s]; bestS = s; }
    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) { const ptr = backptr[i][states[i]]; states[i - 1] = (ptr >= 0) ? ptr : states[i]; }
    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0], start = 0;
    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        const cand = candidates[cur];
        if (cand && cand.label) timeline.push({ t: start * secPerHop, label: cand.label, fi: start });
        cur = states[i]; start = i;
      }
    }
    const finalCand = candidates[cur];
    if (finalCand && finalCand.label) timeline.push({ t: start * secPerHop, label: finalCand.label, fi: start });
    return timeline;
  }

  detectTonicMusically(timeline, key, duration) {
    if (!timeline || timeline.length < 3) return { root: key.root, label: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''), confidence: 50 };
    const candidates = {};
    let totalDuration = 0;
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i], root = this.parseRoot(chord.label);
      if (root < 0) continue;
      const dur = this.getChordDuration(chord, timeline, duration);
      totalDuration += dur;
      if (!candidates[root]) candidates[root] = { duration: 0, openingScore: 0, closingScore: 0, cadenceScore: 0 };
      candidates[root].duration += dur;
    }
    let realStart = 0;
    for (let i = 0; i < timeline.length; i++) if (timeline[i].t >= 1.5) { realStart = i; break; }
    const opening = timeline.slice(realStart, Math.min(realStart + 3, timeline.length));
    for (let i = 0; i < opening.length; i++) {
      const root = this.parseRoot(opening[i].label);
      if (root >= 0 && candidates[root]) candidates[root].openingScore += (i === 0 ? 60 : (3 - i) * 8);
    }
    const closing = timeline.slice(Math.max(0, timeline.length - 3));
    for (let i = 0; i < closing.length; i++) {
      const root = this.parseRoot(closing[i].label);
      if (root >= 0 && candidates[root]) candidates[root].closingScore += (i + 1) * 12;
    }
    let bestRoot = key.root, bestScore = -Infinity;
    for (const rootStr in candidates) {
      const root = parseInt(rootStr, 10), c = candidates[root];
      const score = (c.duration / (totalDuration || 1)) * 40 + c.openingScore + c.closingScore + c.cadenceScore;
      if (score > bestScore) { bestScore = score; bestRoot = root; }
    }
    return { root: bestRoot, label: this.NOTES_SHARP[((bestRoot % 12) + 12) % 12] + (key.minor ? 'm' : ''), confidence: Math.max(30, Math.min(100, bestScore)) };
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline.length) return timeline;
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.50 * spb);
    const energyMedian = this.percentile(feats.frameE, 50);
    const filtered = [];
    const toPc = n => ((n % 12) + 12) % 12;
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i], b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = feats.frameE[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.85;
      const r = this.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);
      const detectedBass = feats.bassPc[a.fi] ?? -1;
      let bassContradicts = false;
      if (r >= 0 && detectedBass >= 0) {
        const isMinor = /m(?!aj)/.test(a.label);
        const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
        const chordPcs = intervals.map(iv => toPc(r + iv));
        bassContradicts = !chordPcs.includes(detectedBass);
      }
      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic || bassContradicts)) continue;
      if (dur < minDur * 0.6 && isWeak) continue;
      filtered.push(a);
    }
    const snapped = [];
    for (const ev of filtered) {
      const raw = ev.t, grid = Math.round(raw / spb) * spb;
      const t = (Math.abs(grid - raw) <= 0.35 * spb) ? grid : raw;
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi });
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
    const getQuality = pc => { for (let i = 0; i < diatonicPcs.length; i++) if (diatonicPcs[i] === toPc(pc)) return qualities[i]; return ''; };
    const snapToDiatonic = pc => { let best = diatonicPcs[0], bestD = 99; for (const d of diatonicPcs) { const dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12); if (dist < bestD) { bestD = dist; best = d; } } return best; };
    const out = [];
    for (const ev of timeline) {
      let label = ev.label;
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        const inKey = r >= 0 && this.inKey(r, key.root, key.minor);
        if (!inKey) {
          const bp = feats.bassPc[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          if (ev.t < Math.min(3.0, 2.0 * spb)) newRoot = key.root;
          label = this.NOTES_SHARP[toPc(newRoot)] + getQuality(newRoot);
        } else label = this.NOTES_SHARP[toPc(r)] + getQuality(r);
      }
      out.push({ ...ev, label });
    }
    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul, extensionSensitivity = 1.0) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));
    const mul = extensionMul / (extensionSensitivity || 1.0);
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }
      const isMinorTriad = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|11|13|6|m7b5|alt|b9|#9|b5|#5).*$/, '');
      if (isMinorTriad) base += 'm';
      const i0 = Math.max(0, ev.fi - 2), i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      for (let i = i0; i <= i1; i++) { const c = feats.chroma[i]; for (let p = 0; p < 12; p++) avg[p] += c[p]; }
      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) avg[p] /= len;
      const s = d => avg[toPc(root + d)] || 0;
      let label = base;
      const thirdStrong = isMinorTriad ? s(3) > 0.13 * mul : s(4) > 0.13 * mul;
      if (!isMinorTriad && !thirdStrong) {
        if (s(5) > 0.22 / mul && s(5) >= s(2) * 0.9 && s(7) > 0.10) label = base.replace(/m$/, '') + 'sus4';
        else if (s(2) > 0.22 / mul && s(2) >= s(5) * 0.9 && s(7) > 0.10) label = base.replace(/m$/, '') + 'sus2';
      }
      if (s(9) > 0.18 / mul && s(9) > s(10) * 1.2 && !/sus/.test(label) && (isMinorTriad ? s(3) : s(4)) > 0.12 / mul) label = base + '6';
      const degree = this.degreeOfChord(label, key);
      const domLike = degree === 5;
      const majContext = !/m$/.test(label) && !/sus/.test(label);
      if (!/6$/.test(label)) {
        if (majContext && s(11) > 0.20 / mul && s(11) > s(10) * 1.2) label = base.replace(/m$/, '') + 'maj7';
        else if (!/sus/.test(label) && (domLike ? s(10) > 0.15 / mul : s(10) > 0.16 / mul && s(0) > 0.10 / mul)) {
          if (!/7$|maj7$/.test(label)) label += '7';
        }
      }
      const dimTriad = (isMinorTriad && s(6) > 0.26 / mul && s(7) < 0.12 * mul && s(3) > 0.14 / mul) || (!isMinorTriad && s(6) > 0.30 / mul && s(7) < 0.10 * mul && s(4) < 0.08 * mul);
      if (dimTriad) label = isMinorTriad && s(10) > 0.18 / mul ? base.replace(/m$/, 'm7b5') : base.replace(/m$/, '') + 'dim';
      if (!isMinorTriad && s(8) > 0.24 / mul && s(7) < 0.10 * mul && s(4) > 0.12 / mul) label = base.replace(/m$/, '') + 'aug';
      if (mode === 'jazz' || mode === 'pro') {
        const has7 = /7$|maj7$/.test(label);
        if (has7 && s(2) > 0.25 / mul && s(0) > 0.10 / mul) label = label.replace(/7$/, '9');
        else if (!/sus/.test(label) && s(2) > 0.25 / mul && (isMinorTriad ? s(3) : s(4)) > 0.10 / mul && !/maj7|7|9|add9/.test(label)) label += 'add9';
      }
      out.push({ ...ev, label });
    }
    return out;
  }

  adjustMinorMajors(timeline, feats, key) {
    if (!key.minor) return timeline;
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) {
      let label = ev.label;
      const r = this.parseRoot(label);
      if (r < 0 || /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label) || !/(^[A-G](?:#|b)?)(m)(?!aj)/.test(label)) { out.push(ev); continue; }
      const rel = toPc(r - key.root);
      if (!(rel === this.MINOR_SCALE[2] || rel === this.MINOR_SCALE[4] || rel === this.MINOR_SCALE[6])) { out.push(ev); continue; }
      const i0 = Math.max(0, ev.fi - 2), i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      for (let i = i0; i <= i1; i++) { const c = feats.chroma[i]; for (let p = 0; p < 12; p++) avg[p] += c[p]; }
      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) avg[p] /= len;
      const M3 = avg[toPc(r + 4)] || 0, m3 = avg[toPc(r + 3)] || 0;
      if (M3 > m3 * 1.25 && M3 > 0.08) label = label.replace(/m(?!aj)/, '');
      out.push({ ...ev, label });
    }
    return out;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if (r < 0) { out.push(ev); continue; }
      const isMinor = /m(?!aj)/.test(ev.label);
      let tones = isMinor ? [0,3,7] : [0,4,7];
      if (/sus2/.test(ev.label)) tones = [0,2,7];
      if (/sus4/.test(ev.label)) tones = [0,5,7];
      if (/7/.test(ev.label) && !/maj7/.test(ev.label)) tones.push(10);
      if (/maj7/.test(ev.label)) tones.push(11);
      const bass = feats.bassPc[ev.fi] ?? -1;
      if (bass < 0 || bass === r) { out.push(ev); continue; }
      const rel = toPc(bass - r);
      if (tones.includes(rel)) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        const bassStrength = c[bass] || 0, rootStrength = c[r] || 0;
        let stable = 0;
        for (let j = Math.max(0, ev.fi - 2); j <= Math.min(feats.bassPc.length - 1, ev.fi + 2); j++) if (feats.bassPc[j] === bass) stable++;
        if (bassStrength > 0.15 / Math.max(1, bassMultiplier) && stable >= 3 && bassStrength > rootStrength * 0.7) {
          const m = ev.label.match(/^([A-G](?:#|b)?)/);
          const rootName = m ? m[1] : '', suffix = ev.label.slice(rootName.length);
          out.push({ ...ev, label: rootName + suffix + '/' + this.getNoteName(bass, key) });
          continue;
        }
      }
      out.push(ev);
    }
    return out;
  }

  validateAndRefine(timeline, key, feats) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;
    for (const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if (r < 0) { out.push(ev); continue; }
      const c = feats.chroma[ev.fi] || new Float32Array(12);
      if (c[toPc(r)] > 0.15 && c[toPc(r + 7)] > 0.15 && c[toPc(r + 4)] < 0.08 && c[toPc(r + 3)] < 0.08 && /m(?!aj)/.test(ev.label)) {
        const m = ev.label.match(/^([A-G](?:#|b)?)/);
        out.push({ ...ev, label: m ? m[1] : '' });
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
      const ev = timeline[i], prev = i > 0 ? timeline[i - 1] : null, next = i < timeline.length - 1 ? timeline[i + 1] : null;
      const dur = next ? (next.t - ev.t) : spb;
      let ornamentType = 'structural';
      if (dur < 0.35 * spb && prev && next) {
        const rPrev = this.parseRoot(prev.label), r = this.parseRoot(ev.label), rNext = this.parseRoot(next.label);
        if (rPrev >= 0 && r >= 0 && rNext >= 0) {
          const d1 = Math.min((r - rPrev + 12) % 12, (rPrev - r + 12) % 12);
          const d2 = Math.min((rNext - r + 12) % 12, (r - rNext + 12) % 12);
          if (d1 <= 2 && d2 <= 2) ornamentType = 'passing';
        }
      }
      if (dur < 0.4 * spb && prev && next && prev.label === next.label && ornamentType === 'structural') ornamentType = 'neighbor';
      out.push({ ...ev, ornamentType });
    }
    return out;
  }

  analyzeModalContext(timeline, key) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i], r = this.parseRoot(ev.label);
      if (r < 0) { out.push({ ...ev, modalContext: null }); continue; }
      const rel = toPc(r - key.root);
      let modalContext = null;
      if (/7$/.test(ev.label) && !/maj7/.test(ev.label)) {
        const targetRoot = toPc(r + 7), next = timeline[i + 1];
        if (next) { const nextRoot = this.parseRoot(next.label); if (nextRoot >= 0 && nextRoot === targetRoot && this.inKey(targetRoot, key.root, key.minor)) modalContext = 'secondary_dominant'; }
      }
      if (!key.minor) {
        if (rel === 8) modalContext = modalContext || 'borrowed_bVI';
        if (rel === 10) modalContext = modalContext || 'borrowed_bVII';
        if (rel === 5 && /m/.test(ev.label)) modalContext = modalContext || 'borrowed_iv';
        if (rel === 3) modalContext = modalContext || 'borrowed_bIII';
      }
      out.push({ ...ev, modalContext });
    }
    return out;
  }

  enrichTimelineWithTheory(timeline, feats, key) {
    const enriched = [], recent = [], MEMORY = 5;
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i], analyzed = { ...chord };
      if (recent.length >= 2) { const prog = this.recognizeProgressionPattern(recent, key); if (prog) analyzed.recognizedProgression = prog.name; }
      enriched.push(analyzed);
      recent.push(analyzed);
      if (recent.length > MEMORY) recent.shift();
    }
    return enriched;
  }

  recognizeProgressionPattern(recentChords, key) {
    if (!recentChords || recentChords.length < 2) return null;
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const degrees = recentChords.map(chord => { const root = this.parseRoot(chord.label); if (root < 0) return null; const rel = toPc(root - key.root); for (let i = 0; i < scale.length; i++) if (toPc(scale[i]) === rel) return i + 1; return null; }).filter(d => d !== null);
    if (degrees.length < 2) return null;
    const progressions = { '1-4-5': { name: 'I-IV-V' }, '1-5-6-4': { name: 'I-V-vi-IV' }, '2-5-1': { name: 'ii-V-I' }, '4-5-1': { name: 'IV-V-I' } };
    for (let len = Math.min(4, degrees.length); len >= 2; len--) { const slice = degrees.slice(-len).join('-'); if (progressions[slice]) return progressions[slice]; }
    return null;
  }

  computePredictionAccuracy(timeline) {
    const withPred = timeline.filter(c => c.predictions && c.predictions.length);
    if (!withPred.length) return 0;
    return Math.round((withPred.filter(c => c.predictionMatch).length / withPred.length) * 100);
  }

  quickModulationCheck(timeline, primaryKey) {
    if (!timeline || timeline.length < 20) return 0;
    const third = Math.floor(timeline.length / 3);
    const sections = [timeline.slice(0, third), timeline.slice(third, 2 * third), timeline.slice(2 * third)];
    let modCount = 0, lastKey = { root: primaryKey.root, minor: primaryKey.minor };
    for (const section of sections) {
      if (!section.length) continue;
      let diatonicCount = 0;
      for (const chord of section) { const root = this.parseRoot(chord.label); if (root >= 0 && this.inKey(root, lastKey.root, lastKey.minor)) diatonicCount++; }
      if (diatonicCount / section.length >= 0.6) continue;
      modCount++;
    }
    return modCount;
  }

  degreeOfChord(label, key) {
    const rootPc = this.parseRoot(label);
    if (rootPc < 0) return null;
    const toPc = n => ((n % 12) + 12) % 12;
    const rel = toPc(rootPc - key.root);
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    for (let d = 0; d < scale.length; d++) if (Math.min((rel - scale[d] + 12) % 12, (scale[d] - rel + 12) % 12) === 0) return d + 1;
    return null;
  }

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
    if (idx >= 0) return idx;
    idx = this.NOTES_FLAT.indexOf(note);
    return idx >= 0 ? idx : -1;
  }

  toPc(n) { return ((n % 12) + 12) % 12; }

  getChordDuration(chord, timeline, totalDuration) {
    const idx = timeline.indexOf(chord);
    if (idx < 0) return 0.5;
    const next = timeline[idx + 1];
    return next ? Math.max(0.1, next.t - chord.t) : Math.max(0.5, totalDuration - chord.t);
  }

  getNoteName(pc, key) {
    const toPc = n => ((n % 12) + 12) % 12;
    pc = toPc(pc);
    const flatMaj = [5,10,3,8,1,6,11], flatMin = [2,7,0,5,10,3,8];
    let useFlats = key.minor ? flatMin.includes(key.root) : flatMaj.includes(key.root);
    if (key.root === 0 && !key.minor && [10,3,8].includes(pc)) useFlats = true;
    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0), right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length), mono = new Float32Array(len);
    for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) {
    if (!samples || fromRate === toRate) return samples;
    const ratio = fromRate / toRate, newLength = Math.max(1, Math.floor(samples.length / ratio));
    const resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) { const srcIndex = i * ratio, i0 = Math.floor(srcIndex), i1 = Math.min(i0 + 1, samples.length - 1), t = srcIndex - i0; resampled[i] = samples[i0] * (1 - t) + samples[i1] * t; }
    return resampled;
  }

  percentile(arr, p) {
    const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[Math.floor((p / 100) * (a.length - 1))];
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => this.NOTES_SHARP[toPc(tonicPc + deg)] + qualities[i]);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ChordEngineEnhanced;
