/**
 * ChordEngine v16.6 - Theory-Aware Inversion Detection
 * 
 * Based on v16.5 + Critical Fix:
 * When bass note is NOT in scale, check if it's a third/fifth of:
 * 1. Diatonic chord (G/B, Am/E, etc.)
 * 2. Secondary dominant (E/G# in C major = V/vi)
 * 3. Common borrowed chord
 * 
 * Only if none match → consider chromatic chord (rare)
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

    console.log('🎵 ChordEngine v16.6 (Theory-Aware Inversions)');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    const musicStart = this.findMusicStart(features);
    console.log(`✅ Music starts at ${musicStart.time.toFixed(2)}s`);

    const tonicResult = this.detectTonicHybrid(features, musicStart.frame);
    console.log(`✅ Tonic: ${this.NOTES_SHARP[tonicResult.root]} (${tonicResult.confidence}%) [${tonicResult.method}]`);

    const modeResult = this.detectModeHybrid(features, tonicResult, musicStart.frame);
    
    const key = {
      root: tonicResult.root,
      minor: modeResult.isMinor,
      confidence: Math.min(tonicResult.confidence, modeResult.confidence) / 100
    };
    console.log(`✅ Mode: ${key.minor ? 'MINOR' : 'MAJOR'} (${modeResult.confidence}%)`);

    let timeline = this.buildChordsTheoryAware(features, key, musicStart.frame, audio.bpm);
    console.log(`✅ Initial chords: ${timeline.length}`);

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    timeline = this.addExtensions(timeline, features, key, opts);
    timeline = this.finalizeTimeline(timeline, audio.bpm, features);

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

      const chromaFrame = new Float32Array(12);
      for (let bin = 1; bin < mags.length; bin++) {
        const freq = bin * sr / N;
        if (freq < 80 || freq > 5000) continue;
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = this.toPc(Math.round(midi));
        chromaFrame[pc] += mags[bin];
      }
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

    return {
      chroma, bass, bassRaw, energy, globalChroma,
      hop, sr, numFrames: chroma.length,
      secPerFrame: hop / sr,
      energyP30: percentile(30),
      energyP50: percentile(50),
      energyP70: percentile(70),
      energyP80: percentile(80)
    };
  }

  detectBassNote(mags, sr, N) {
    const fmin = 40, fmax = 250;
    const yLP = new Float32Array(N);

    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sr / N;
      if (freq > fmax) break;
      if (freq >= fmin) {
        const omega = 2 * Math.PI * freq / sr;
        for (let n = 0; n < N; n++) yLP[n] += mags[bin] * Math.cos(omega * n);
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

    if (bestLag > 0 && bestR > 0.25) {
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
  // MUSIC START DETECTION
  // ═══════════════════════════════════════════════════════════
  
  findMusicStart(features) {
    const { energy, bass, secPerFrame, energyP50 } = features;
    
    let musicFrame = 0;
    let stableCount = 0;
    
    for (let i = 0; i < energy.length; i++) {
      const isHighEnergy = energy[i] >= energyP50;
      const hasBass = bass[i] >= 0;
      
      if (isHighEnergy && hasBass) {
        stableCount++;
        if (stableCount >= 3) {
          musicFrame = Math.max(0, i - 2);
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
    const bassTonic = this.detectTonicFromBass(features, startFrame);
    const ksTonic = this.detectTonicKS(features.globalChroma);
    
    if (bassTonic.root === ksTonic.root) {
      return { root: bassTonic.root, confidence: Math.min(99, bassTonic.confidence + 10), method: 'bass+KS_agree' };
    }
    
    const isRelative = (
      this.toPc(bassTonic.root - ksTonic.root) === 3 ||
      this.toPc(ksTonic.root - bassTonic.root) === 3
    );
    
    if (isRelative) {
      const firstChordRoot = this.getFirstStrongChordRoot(features, startFrame);
      
      if (firstChordRoot === bassTonic.root) {
        return { root: bassTonic.root, confidence: bassTonic.confidence, method: 'bass+first_chord' };
      } else if (firstChordRoot === ksTonic.root) {
        return { root: ksTonic.root, confidence: ksTonic.confidence, method: 'KS+first_chord' };
      }
      
      if (bassTonic.confidence + 10 >= ksTonic.confidence) {
        return { root: bassTonic.root, confidence: bassTonic.confidence, method: 'bass_relative_preferred' };
      }
      return { root: ksTonic.root, confidence: ksTonic.confidence, method: 'KS_relative_stronger' };
    }
    
    if (bassTonic.confidence > ksTonic.confidence) {
      return { root: bassTonic.root, confidence: bassTonic.confidence - 5, method: 'bass_only' };
    }
    return { root: ksTonic.root, confidence: ksTonic.confidence - 5, method: 'KS_only' };
  }

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

  getFirstStrongChordRoot(features, startFrame) {
    const { chroma, energy, energyP70 } = features;
    
    for (let i = startFrame; i < Math.min(startFrame + 30, chroma.length); i++) {
      if (energy[i] >= energyP70 * 0.7) {
        let maxPc = 0, maxVal = 0;
        for (let pc = 0; pc < 12; pc++) {
          if (chroma[i][pc] > maxVal) { maxVal = chroma[i][pc]; maxPc = pc; }
        }
        return maxPc;
      }
    }
    return 0;
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

  // ═══════════════════════════════════════════════════════════
  // MODE DETECTION
  // ═══════════════════════════════════════════════════════════
  
  detectModeHybrid(features, tonicResult, startFrame) {
    const modeFromThird = this.detectModeFromThird(features, tonicResult.root, startFrame);
    
    if (modeFromThird.confidence >= 75) {
      return modeFromThird;
    }
    
    const ksTonic = this.detectTonicKS(features.globalChroma);
    
    if (ksTonic.root === tonicResult.root) {
      const ksVote = ksTonic.minor ? 1 : 0;
      const thirdVote = modeFromThird.isMinor ? 1 : 0;
      
      if (ksVote === thirdVote) {
        return {
          ...modeFromThird,
          confidence: Math.min(98, modeFromThird.confidence + 10),
          method: 'third+KS_agree'
        };
      } else {
        if (modeFromThird.confidence >= 65) {
          return { ...modeFromThird, method: 'third_dominant' };
        }
        return {
          isMinor: ksTonic.minor,
          confidence: Math.round(ksTonic.confidence * 0.8),
          m3: modeFromThird.m3,
          M3: modeFromThird.M3,
          ratio: modeFromThird.ratio,
          method: 'KS_fallback'
        };
      }
    }
    
    return modeFromThird;
  }

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
  // 🎯 THEORY-AWARE CHORD BUILDING - The Core Fix
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Get all possible chords that could have this bass note
   * Returns array of { root, isMinor, inversionBass, chordType, priority }
   */
  getChordsWithBassNote(bassNote, key) {
    const candidates = [];
    const diatonic = this.getDiatonicInfo(key);
    
    // 1. Bass is root of diatonic chord
    for (const dc of diatonic.chords) {
      if (dc.root === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: null,
          chordType: 'diatonic_root',
          priority: 100
        });
      }
    }
    
    // 2. Bass is third of diatonic chord (first inversion)
    for (const dc of diatonic.chords) {
      const third = this.toPc(dc.root + (dc.minor ? 3 : 4));
      if (third === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: bassNote,
          chordType: 'diatonic_inv1',
          priority: 85
        });
      }
    }
    
    // 3. Bass is fifth of diatonic chord (second inversion)
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
    
    // 4. Secondary dominants - V/x chords
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
      // Bass is third of secondary dominant (e.g., G# as third of E in C major)
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
    
    // 5. Borrowed chords
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
      borrowed.push({ root: this.toPc(key.root + 10), minor: false, from: 'bVII' });
      borrowed.push({ root: this.toPc(key.root + 8), minor: false, from: 'bVI' });
      borrowed.push({ root: this.toPc(key.root + 3), minor: false, from: 'bIII' });
      borrowed.push({ root: this.toPc(key.root + 5), minor: true, from: 'iv' });
    } else {
      borrowed.push({ root: this.toPc(key.root + 7), minor: false, from: 'V' });
      borrowed.push({ root: this.toPc(key.root + 5), minor: false, from: 'IV' });
    }
    
    return borrowed;
  }

  buildChordsTheoryAware(features, key, startFrame, bpm) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);
    
    let currentBass = -1;
    let currentStart = startFrame;
    
    for (let i = startFrame; i < bass.length; i++) {
      const bp = bass[i];
      const hasEnergy = energy[i] >= energyP70 * 0.3;
      
      if (!hasEnergy) continue;
      
      if (bp >= 0 && bp !== currentBass) {
        if (currentBass >= 0 && i > currentStart) {
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
              chordType: chord.chordType
            });
          }
        }
        currentBass = bp;
        currentStart = i;
      }
    }
    
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
    
    // 🎯 THEORY-AWARE: Get all possible chords for this bass note
    const theoryCandidates = this.getChordsWithBassNote(bassNote, key);
    const candidates = [];
    
    for (const tc of theoryCandidates) {
      const score = this.scoreChordCandidate(avg, tc.root, tc.isMinor, bassNote, tc.chordType.startsWith('diatonic'));
      if (score > 0) {
        candidates.push({
          ...tc,
          score: score + tc.priority * 0.5
        });
      }
    }
    
    // Chromatic fallback (rare)
    if (candidates.length === 0) {
      for (const isMinor of [false, true]) {
        const score = this.scoreChordCandidate(avg, bassNote, isMinor, bassNote, false);
        if (score > 40) {
          candidates.push({
            root: bassNote,
            isMinor,
            inversionBass: null,
            chordType: 'chromatic',
            score: score - 20,
            priority: 30
          });
        }
      }
    }
    
    if (!candidates.length) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    if (best.score < 35 && durSec < 0.35) return null;
    
    const noteName = this.getNoteName(best.root, key);
    let label = noteName + (best.isMinor ? 'm' : '');
    
    if (best.inversionBass !== null) {
      const bassName = this.getNoteName(best.inversionBass, key);
      label += '/' + bassName;
    }
    
    const inScale = diatonic.pcs.includes(best.root);
    
    return {
      root: best.root,
      label,
      type: best.isMinor ? 'minor' : 'major',
      inScale: inScale || best.chordType.startsWith('diatonic'),
      confidence: Math.min(100, Math.round(best.score)),
      chordType: best.chordType,
      isInversion: best.inversionBass !== null,
      inversionBass: best.inversionBass
    };
  }

  scoreChordCandidate(avg, root, isMinor, bassNote, inScale) {
    const rootStrength = avg[root];
    if (rootStrength < 0.05) return 0;
    
    const third = this.toPc(root + (isMinor ? 3 : 4));
    const fifth = this.toPc(root + 7);
    const wrongThird = this.toPc(root + (isMinor ? 4 : 3));
    
    let score = rootStrength * 40 + avg[third] * 30 + avg[fifth] * 20;
    score -= avg[wrongThird] * 25;
    
    if (bassNote === root) score += 15;
    else if (bassNote === third) score += 12;
    else if (bassNote === fifth) score += 10;
    
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

  // ═══════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════
  
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
      
      if ((dur > 0 && dur < 0.3) && ev.confidence < 80) {
        continue;
      }
      
      if (ev.confidence >= 70 && dur >= 0.25) {
        validated.push({ ...ev, modalContext: 'chromatic' });
      }
    }
    
    return validated;
  }

  // ═══════════════════════════════════════════════════════════
  // LIGHT HMM
  // ═══════════════════════════════════════════════════════════
  
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

  // ═══════════════════════════════════════════════════════════
  // EXTENSIONS
  // ═══════════════════════════════════════════════════════════
  
  addExtensions(timeline, features, key, opts) {
    const { chroma } = features;
    
    return timeline.map(ev => {
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
      const third = avg[this.toPc(root + (isMinor ? 3 : 4))];
      const sus2 = avg[this.toPc(root + 2)];
      const sus4 = avg[this.toPc(root + 5)];
      
      let label = ev.label;
      
      if (!isMinor && M7 > 0.12 && M7 > b7 * 1.5 && third > 0.10 && b7 < 0.08) {
        label = label.replace(/m$/, '') + 'maj7';
      } else if (b7 > 0.10 && b7 > M7) {
        if (!label.includes('7')) label += '7';
      }
      
      if (!isMinor && !label.includes('7') && !label.includes('maj7')) {
        if (sus4 > 0.15 && sus4 > third * 1.5 && third < 0.08) {
          label = ev.label.split(/[7m]/)[0] + 'sus4';
        } else if (sus2 > 0.15 && sus2 > third * 1.5 && third < 0.08) {
          label = ev.label.split(/[7m]/)[0] + 'sus2';
        }
      }
      
      return { ...ev, label };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FINALIZE
  // ═══════════════════════════════════════════════════════════
  
  finalizeTimeline(timeline, bpm, features) {
    if (!timeline.length) return [];
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDuration = 0.4 * spb;
    
    let filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const next = timeline[i + 1];
      const duration = next ? (next.t - ev.t) : minDuration;
      
      const isShort = duration < minDuration;
      const isStrong = ev.confidence >= 85;
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

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════
  
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
      chromatic: timeline.filter(e => e.chordType === 'chromatic').length
    };
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

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) {
    return this.resample(samples, fromRate, toRate);
  }

  percentile(arr, p) {
    const a = [...arr].sort((x, y) => x - y);
    return a.length ? a[Math.floor(p / 100 * (a.length - 1))] : 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
