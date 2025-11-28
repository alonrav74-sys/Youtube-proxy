/**
 * ChordEngine v16.31 - Fixed Early Detection
 *
 * Based on v16.30 with critical fixes:
 * - findMusicStart is now less strict (doesn't require bass+energy together)
 * - Chord detection starts from frame 0 when music is detected early
 * - Removed over-aggressive filtering that killed early chords
 * - Fixed label validation to never produce undefined
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

    console.log('🎵 ChordEngine v16.31 (Fixed Early Detection)');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    // v16.31: More lenient music start detection
    const musicStart = this.findMusicStart(features);
    console.log(`✅ Music starts at ${musicStart.time.toFixed(2)}s (frame ${musicStart.frame})`);

    const tonicResult = this.detectTonicHybrid(features, musicStart.frame);
    console.log(`✅ Tonic: ${this.NOTES_SHARP[tonicResult.root]} (${tonicResult.confidence}%) [${tonicResult.method}]`);

    const modeResult = this.detectModeFromThird(features, tonicResult.root, musicStart.frame);

    const key = {
      root: tonicResult.root,
      minor: modeResult.isMinor,
      confidence: Math.min(tonicResult.confidence, modeResult.confidence) / 100
    };
    console.log(`✅ Mode: ${key.minor ? 'MINOR' : 'MAJOR'} (${modeResult.confidence}%) [third_only]`);

    // v16.31: Start chord detection from actual music start (can be 0)
    let timeline = this.buildChordsStableBass(features, key, musicStart.frame, audio.bpm);
    console.log(`🎸 Bass engine: ${timeline.length} chords`);

    const hmmTimeline = this.buildChordsHMM(features, key, musicStart.frame);
    console.log(`🎹 HMM engine: ${hmmTimeline.length} chords`);

    timeline = this.mergeEngines(timeline, hmmTimeline, features, key);
    console.log(`🤝 Consensus: ${timeline.length} chords`);

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    timeline = this.addExtensions(timeline, features, key, opts);
    timeline = this.finalizeTimeline(timeline, audio.bpm, features);

    const stats = this.buildStats(timeline, key);
    const isEasy = this.isEasyRockSong(stats, key);

    if (isEasy) {
      console.log(`🎸 v16.31: Easy rock song detected - enforcing diatonic`);
      timeline = this.enforceEasyDiatonic(timeline, key);
      timeline = this.applyPatternMemory(timeline, key);
    }

    timeline = this.smoothOutliers(timeline, key, this.getDiatonicInfo(key));

    // v16.31: Less aggressive auto-refine
    timeline = this.autoRefineTimeline(timeline, key, audio.duration);

    // v16.31: Critical - ensure all events have valid labels
    timeline = timeline.filter(ev => {
      if (!ev) return false;
      if (!ev.label || typeof ev.label !== 'string') return false;
      if (!ev.label.trim()) return false;
      if (ev.fi == null) return false;
      return true;
    });

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
      timings,
      profile: 'auto'
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

    const cleaned = this.cleanSignal(mono, sr0);
    const x = this.resample(cleaned, sr0, sr);
    const bpm = this.estimateTempo(x, sr);

    return { x, sr, bpm, duration: x.length / sr };
  }

  cleanSignal(x, sr) {
    const out = new Float32Array(x.length);

    let prev = 0;
    for (let i = 0; i < x.length; i++) {
      const y = x[i] - 0.97 * prev;
      prev = x[i];
      out[i] = y;
    }

    const threshold = 1e-4;
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(out[i]) < threshold) out[i] = 0;
    }

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

    const flux = this.computeSpectralFlux(chroma);
    const fluxSorted = [...flux].sort((a, b) => a - b);
    const fluxP80 = fluxSorted[Math.floor(fluxSorted.length * 0.80)] || 0;

    const energySorted = [...energy].sort((a, b) => a - b);
    const percentile = (p) => energySorted[Math.floor(energySorted.length * p / 100)] || 0;

    return {
      chroma, bass, energy, flux, fluxP80,
      sr, hop,
      secPerFrame: hop / sr,
      numFrames: chroma.length,
      energyP30: percentile(30),
      energyP50: percentile(50),
      energyP70: percentile(70),
      energyP80: percentile(80)
    };
  }

  computeSpectralFlux(chroma) {
    const flux = new Float32Array(chroma.length);
    for (let i = 1; i < chroma.length; i++) {
      let sum = 0;
      const prev = chroma[i - 1];
      const curr = chroma[i];
      for (let p = 0; p < 12; p++) {
        const diff = curr[p] - prev[p];
        if (diff > 0) sum += diff;
      }
      flux[i] = sum;
    }
    return flux;
  }

  getBeatGrid(duration, bpm) {
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const beats = [];
    for (let t = 0; t < duration; t += spb) {
      beats.push(t);
    }
    return beats;
  }

  getChordChangeCandidates(features, bpm, startFrame = 0) {
    const { secPerFrame, bass, flux, fluxP80, numFrames } = features;
    const beats = this.getBeatGrid(numFrames * secPerFrame, bpm);
    const beatFrames = beats.map(t => Math.round(t / secPerFrame));
    const candidates = new Set();

    // v16.31: Always include frame 0 if startFrame is 0
    if (startFrame === 0) {
      candidates.add(0);
    } else {
      candidates.add(startFrame);
    }

    for (const bf of beatFrames) {
      for (let off = -1; off <= 1; off++) {
        const i = bf + off;
        if (i < startFrame || i >= numFrames) continue;

        const strongFlux = flux[i] >= fluxP80;
        const bassChange = (bass[i] >= 0 && i > 0 && bass[i - 1] !== bass[i]);

        if (strongFlux || bassChange) {
          candidates.add(i);
        }
      }
    }

    return [...candidates].sort((a, b) => a - b);
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
  // v16.31: FIXED MUSIC START DETECTION
  // ═══════════════════════════════════════════════════════════

  findMusicStart(features) {
    const { energy, bass, chroma, secPerFrame, energyP50, energyP30 } = features;

    // v16.31: Much more lenient - look for ANY musical activity
    // Not requiring bass AND energy together
    
    let musicFrame = 0;
    
    // Strategy 1: Look for energy above threshold
    for (let i = 0; i < Math.min(energy.length, 50); i++) {
      if (energy[i] >= energyP30) {
        musicFrame = i;
        break;
      }
    }
    
    // Strategy 2: Look for clear chroma activity
    for (let i = 0; i < Math.min(chroma.length, 30); i++) {
      const c = chroma[i];
      let maxChroma = 0;
      for (let p = 0; p < 12; p++) {
        if (c[p] > maxChroma) maxChroma = c[p];
      }
      // If there's clear pitch content
      if (maxChroma > 0.15 && energy[i] >= energyP30 * 0.5) {
        musicFrame = Math.min(musicFrame, i);
        break;
      }
    }

    // v16.31: Cap at 5 seconds max, not 8
    const maxFrame = Math.floor(5.0 / secPerFrame);
    musicFrame = Math.min(musicFrame, maxFrame);

    // v16.31: If we're within first 1 second, just start from 0
    if (musicFrame * secPerFrame < 1.0) {
      musicFrame = 0;
    }

    return { frame: musicFrame, time: musicFrame * secPerFrame };
  }

  // ═══════════════════════════════════════════════════════════
  // TONIC DETECTION
  // ═══════════════════════════════════════════════════════════

  detectTonicHybrid(features, startFrame) {
    const bassTonic = this.detectTonicFromBass(features, startFrame);
    const ksTonic = this.detectTonicKSFromFeatures(features, startFrame);

    console.log(`  Bass says: ${this.NOTES_SHARP[bassTonic.root]} (${bassTonic.confidence}%)`);
    console.log(`  KS says: ${this.NOTES_SHARP[ksTonic.root]} (${ksTonic.confidence}%)`);

    if (bassTonic.confidence >= 75) {
      return {
        root: bassTonic.root,
        confidence: bassTonic.confidence,
        method: 'bass_strong'
      };
    }

    if (ksTonic.root === bassTonic.root) {
      const conf = Math.min(98, Math.max(bassTonic.confidence, ksTonic.confidence) + 5);
      return {
        root: bassTonic.root,
        confidence: conf,
        method: 'bass+KS_agree'
      };
    }

    const combined = bassTonic.confidence * 0.7 + ksTonic.confidence * 0.3;

    return {
      root: bassTonic.root,
      confidence: Math.round(combined),
      method: 'bass_main_KS_hint'
    };
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

    for (let r = 0; r < 12; r++) {
      for (const minor of [false, true]) {
        const profile = minor ? this.KS_MINOR : this.KS_MAJOR;
        let score = 0;
        for (let i = 0; i < 12; i++) {
          score += globalChroma[this.toPc(r + i)] * profile[i];
        }
        if (score > best.score) {
          best = { root: r, minor, score };
        }
      }
    }

    return best;
  }

  detectTonicKSFromFeatures(features, startFrame) {
    const { chroma, energy, energyP50 } = features;

    const globalChroma = new Float32Array(12);
    let totalWeight = 0;

    for (let i = startFrame; i < chroma.length; i++) {
      if (energy[i] < energyP50 * 0.3) continue;
      const w = energy[i];
      for (let p = 0; p < 12; p++) {
        globalChroma[p] += chroma[i][p] * w;
      }
      totalWeight += w;
    }

    if (totalWeight > 0) {
      for (let p = 0; p < 12; p++) globalChroma[p] /= totalWeight;
    }

    const result = this.detectTonicKS(globalChroma);
    const confidence = Math.min(90, Math.max(50, 50 + result.score * 5));

    return { root: result.root, confidence: Math.round(confidence) };
  }

  buildBassTimeline(features, startFrame) {
    const { bass, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    let currentBass = -1;
    let start = startFrame;

    for (let i = startFrame; i < bass.length; i++) {
      const bp = bass[i];
      if (bp < 0 || energy[i] < energyP70 * 0.3) continue;

      if (bp !== currentBass) {
        if (currentBass >= 0) {
          timeline.push({
            note: currentBass,
            start: start * secPerFrame,
            end: i * secPerFrame
          });
        }
        currentBass = bp;
        start = i;
      }
    }

    if (currentBass >= 0) {
      timeline.push({
        note: currentBass,
        start: start * secPerFrame,
        end: bass.length * secPerFrame
      });
    }

    return timeline;
  }

  analyzeCadences(bassTimeline) {
    const scores = new Array(12).fill(0);

    for (let i = 0; i < bassTimeline.length - 1; i++) {
      const from = bassTimeline[i].note;
      const to = bassTimeline[i + 1].note;
      const interval = this.toPc(to - from);

      if (interval === 5) scores[to] += 10;
      if (interval === 7) scores[to] += 8;
    }

    return scores;
  }

  countTransition(timeline, from, to) {
    let count = 0;
    for (let i = 0; i < timeline.length - 1; i++) {
      if (timeline[i].note === from && timeline[i + 1].note === to) {
        count++;
      }
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════════
  // MODE DETECTION (Major/Minor)
  // ═══════════════════════════════════════════════════════════

  detectModeFromThird(features, tonic, startFrame) {
    const { chroma, energy, energyP50, energyP70 } = features;

    let m3Total = 0, M3Total = 0;
    let m6Total = 0, M6Total = 0;
    let m7Total = 0, M7Total = 0;
    let totalWeight = 0;

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
  // CHORD BUILDING - Stable Bass Method
  // ═══════════════════════════════════════════════════════════

  buildChordsStableBass(features, key, startFrame, bpm) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);

    // v16.31: Reduced minimum durations for better early detection
    const MIN_DURATION_SEC = 0.45;  // Was 0.6
    const MIN_DURATION_NO_BASS_CHANGE = 1.0;  // Was 1.2
    const CHROMA_CHANGE_THRESHOLD = 0.35;
    const SIGNIFICANT_THIRD_FIFTH_CHANGE = 0.25;

    let currentBass = -1;
    let currentStart = startFrame;
    let currentChroma = null;

    const changeFrames = this.getChordChangeCandidates(features, bpm, startFrame);
    console.log(`🎵 v16.31: ${changeFrames.length} chord change candidates from frame ${startFrame}`);

    for (const i of changeFrames) {
      if (i >= bass.length) continue;

      const bp = bass[i];
      // v16.31: More lenient energy threshold
      const hasEnergy = energy[i] >= energyP70 * 0.2;

      if (!hasEnergy) continue;
      
      // v16.31: If no bass detected, try to use chroma
      let effectiveBass = bp;
      if (bp < 0) {
        // Try to detect from chroma
        const c = chroma[i];
        let maxPc = 0, maxVal = 0;
        for (let p = 0; p < 12; p++) {
          if (c[p] > maxVal) { maxVal = c[p]; maxPc = p; }
        }
        if (maxVal > 0.12) {
          effectiveBass = maxPc;
        } else {
          continue;
        }
      }

      if (currentBass === -1) {
        currentBass = effectiveBass;
        currentStart = i;
        currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        continue;
      }

      const durationSec = (i - currentStart) * secPerFrame;
      const bassChanged = (effectiveBass !== currentBass);

      let chromaChange = 0;
      let thirdFifthChange = 0;
      if (currentChroma) {
        chromaChange = this.calculateChromaDistance(currentChroma, chroma[i]);
        thirdFifthChange = this.calculateThirdFifthChange(currentChroma, chroma[i], currentBass);
      }

      let shouldCommit = false;

      if (bassChanged) {
        shouldCommit = durationSec >= MIN_DURATION_SEC;
      } else {
        if (durationSec >= MIN_DURATION_NO_BASS_CHANGE && chromaChange >= CHROMA_CHANGE_THRESHOLD) {
          shouldCommit = true;
        } else if (thirdFifthChange >= SIGNIFICANT_THIRD_FIFTH_CHANGE && durationSec >= MIN_DURATION_SEC) {
          shouldCommit = true;
        }
      }

      if (shouldCommit) {
        const chord = this.determineChordTheoryAware(
          chroma, currentStart, i, key, diatonic, currentBass, secPerFrame
        );

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

        currentBass = effectiveBass;
        currentStart = i;
        currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
      }
    }

    // Commit final chord
    if (currentBass >= 0 && chroma.length > currentStart) {
      const chord = this.determineChordTheoryAware(
        chroma, currentStart, chroma.length, key, diatonic, currentBass, secPerFrame
      );
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

  getChordsWithBassNote(bassNote, key) {
    const candidates = [];
    const diatonic = this.getDiatonicInfo(key);

    const bassIsDiatonic = diatonic.pcs.includes(bassNote);

    for (const dc of diatonic.chords) {
      if (dc.root === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: null,
          chordType: 'diatonic_root',
          priority: bassIsDiatonic ? 120 : 100
        });
      }
    }

    for (const dc of diatonic.chords) {
      const third = this.toPc(dc.root + (dc.minor ? 3 : 4));
      if (third === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: bassNote,
          chordType: 'diatonic_inv1',
          priority: bassIsDiatonic ? 70 : 85
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

    if (!key.minor) {
      const M3 = this.toPc(key.root + 4);
      if (bassNote === M3) {
        candidates.push({
          root: M3,
          isMinor: false,
          inversionBass: null,
          chordType: 'secondary_dominant_V/vi',
          priority: 75
        });
      }
    }

    if (candidates.length === 0) {
      candidates.push({
        root: bassNote,
        isMinor: false,
        inversionBass: null,
        chordType: 'chromatic',
        priority: 30
      });
      candidates.push({
        root: bassNote,
        isMinor: true,
        inversionBass: null,
        chordType: 'chromatic',
        priority: 30
      });
    }

    return candidates;
  }

  determineChordTheoryAware(chroma, startFrame, endFrame, key, diatonic, bassNote, secPerFrame) {
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

    const norm = new Float32Array(12);
    for (let p = 0; p < 12; p++) norm[p] = avg[p] / total;

    const durSec = count * (secPerFrame || 0.1);

    // v16.31: Less strict filtering for short segments
    if (durSec < 0.15) {
      let max1 = 0, max2 = 0, max3 = 0;
      for (let p = 0; p < 12; p++) {
        const v = norm[p];
        if (v > max1) { max3 = max2; max2 = max1; max1 = v; }
        else if (v > max2) { max3 = max2; max2 = v; }
        else if (v > max3) { max3 = v; }
      }
      if (max1 + max2 + max3 < 0.70) return null;
    }

    const theoryCandidates = this.getChordsWithBassNote(bassNote, key);
    const candidates = [];

    for (const tc of theoryCandidates) {
      const score = this.scoreChordCandidate(
        avg, tc.root, tc.isMinor, bassNote, 
        tc.chordType.startsWith('diatonic'),
        tc.inversionBass !== undefined && tc.inversionBass !== null ? tc.inversionBass : null
      );
      if (score > 0) {
        candidates.push({
          ...tc,
          score: score + tc.priority * 0.5
        });
      }
    }

    if (candidates.length === 0) {
      for (const isMinor of [false, true]) {
        const score = this.scoreChordCandidate(avg, bassNote, isMinor, bassNote, false, null);
        if (score > 50) {
          const isReasonable = this.isReasonableChromaticChord(bassNote, key, null);
          if (isReasonable || score > 70) {
            candidates.push({
              root: bassNote,
              isMinor,
              inversionBass: null,
              chordType: 'chromatic',
              score: score - 30,
              priority: 20
            });
          }
        }
      }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // v16.31: Less strict filtering
    if (best.score < 40 && durSec < 0.35) return null;

    let finalRoot = best.root;

    if (!key.minor && !diatonic.pcs.includes(best.root)) {
      const toPcLocal = (interval) => (key.root + interval) % 12;

      const forcedSubstitutions = [
        { from: toPcLocal(8),  to: toPcLocal(4) },
        { from: toPcLocal(3),  to: toPcLocal(3) },
        { from: toPcLocal(6),  to: toPcLocal(5) },
        { from: toPcLocal(10), to: toPcLocal(10) }
      ];

      for (const sub of forcedSubstitutions) {
        if (best.root === sub.from) {
          finalRoot = sub.to;
          break;
        }
      }
    }

    const m3 = avg[this.toPc(finalRoot + 3)];
    const M3 = avg[this.toPc(finalRoot + 4)];

    let finalIsMinor = best.isMinor;
    if (m3 > M3 * 1.5) {
      finalIsMinor = true;
    } else if (M3 > m3 * 1.5) {
      finalIsMinor = false;
    }

    const noteName = this.getNoteName(finalRoot, key);
    let label = noteName + (finalIsMinor ? 'm' : '');

    if (best.inversionBass !== null && best.inversionBass !== undefined) {
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
      isInversion: best.inversionBass !== null && best.inversionBass !== undefined,
      inversionBass: best.inversionBass
    };
  }

  scoreChordCandidate(avg, root, isMinor, bassNote, inScale, inversionBass = null) {
    const rootStrength = avg[root];
    if (rootStrength < 0.04) return 0;  // v16.31: Was 0.05

    const m3 = this.toPc(root + 3);
    const M3 = this.toPc(root + 4);
    const fifth = this.toPc(root + 7);

    const m3Strength = avg[m3];
    const M3Strength = avg[M3];

    let actualThird, wrongThird, actuallyMinor;
    if (m3Strength > M3Strength * 1.3) {
      actualThird = m3;
      wrongThird = M3;
      actuallyMinor = true;
    } else if (M3Strength > m3Strength * 1.3) {
      actualThird = M3;
      wrongThird = m3;
      actuallyMinor = false;
    } else {
      actualThird = this.toPc(root + (isMinor ? 3 : 4));
      wrongThird = this.toPc(root + (isMinor ? 4 : 3));
      actuallyMinor = isMinor;
    }

    let score = rootStrength * 40 + avg[actualThird] * 30 + avg[fifth] * 20;
    score -= avg[wrongThird] * 25;

    if (isMinor !== actuallyMinor) {
      score -= 15;
    }

    if (bassNote === root) score += 15;
    else if (bassNote === actualThird) score += 10;
    else if (bassNote === fifth) score += 8;

    if (inversionBass !== null && inversionBass !== root) {
      const bassStrength = avg[inversionBass] || 0;
      if (bassStrength < 0.08) {
        score -= 15;
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

  isReasonableChromaticChord(root, key, prevChord) {
    const tonicPc = key.root;

    if (!key.minor) {
      const bVII = this.toPc(tonicPc + 10);
      const bIII = this.toPc(tonicPc + 3);
      const iv = this.toPc(tonicPc + 5);

      if (root === bVII || root === bIII || root === iv) {
        return true;
      }
    }

    if (key.minor) {
      const V = this.toPc(tonicPc + 7);
      const VII = this.toPc(tonicPc + 11);
      const IV = this.toPc(tonicPc + 5);

      if (root === V || root === VII || root === IV) {
        return true;
      }
    }

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(tonicPc + s));

    for (const target of diatonicPcs) {
      const secondaryDominant = this.toPc(target + 7);
      if (root === secondaryDominant) {
        return true;
      }
    }

    if (prevChord) {
      const prevRoot = prevChord.root;
      const distUp = this.toPc(root - prevRoot);
      const distDown = this.toPc(prevRoot - root);

      if (distUp === 1 || distDown === 1) {
        return true;
      }
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════
  // HMM CHORD BUILDING
  // ═══════════════════════════════════════════════════════════

  buildChordsHMM(features, key, startFrame) {
    const { chroma, bass, energy, energyP70, secPerFrame } = features;
    const diatonic = this.getDiatonicInfo(key);

    const candidates = [];

    for (const dc of diatonic.chords) {
      candidates.push({
        root: dc.root,
        isMinor: dc.minor,
        label: this.getNoteName(dc.root, key) + (dc.minor ? 'm' : ''),
        borrowed: false
      });
    }

    if (!key.minor) {
      const bVII = this.toPc(key.root + 10);
      const iv = this.toPc(key.root + 5);
      candidates.push({ root: bVII, isMinor: false, label: this.getNoteName(bVII, key), borrowed: true });
      candidates.push({ root: iv, isMinor: true, label: this.getNoteName(iv, key) + 'm', borrowed: true });
    } else {
      const V = this.toPc(key.root + 7);
      const IV = this.toPc(key.root + 5);
      candidates.push({ root: V, isMinor: false, label: this.getNoteName(V, key), borrowed: true });
      candidates.push({ root: IV, isMinor: false, label: this.getNoteName(IV, key), borrowed: true });
    }

    const N = candidates.length;
    const M = chroma.length;
    if (M === 0 || N === 0) return [];

    const emitScore = (frameIdx, candIdx) => {
      const cand = candidates[candIdx];
      if (!cand) return -Infinity;
      
      const c = chroma[frameIdx];
      if (!c) return -Infinity;

      const root = cand.root;
      const third = this.toPc(root + (cand.isMinor ? 3 : 4));
      const fifth = this.toPc(root + 7);

      let score = c[root] * 3 + c[third] * 2 + c[fifth] * 1.5;

      if (!cand.borrowed) score += 0.15;
      else score -= 0.10;

      if (bass[frameIdx] === root) score += 0.2;

      // v16.31: Lower energy penalty
      if (energy[frameIdx] < energyP70 * 0.2) score -= 0.15;

      return score;
    };

    const transitionCost = (from, to) => {
      if (from === to) return 0;
      const candFrom = candidates[from];
      const candTo = candidates[to];
      if (!candFrom || !candTo) return 1.0;
      
      const interval = this.toPc(candTo.root - candFrom.root);
      if (interval === 7 || interval === 5) return 0.1;
      if (interval === 2 || interval === 10) return 0.2;
      return 0.3;
    };

    const dp = new Float32Array(N);
    const backptr = [];

    for (let s = 0; s < N; s++) {
      dp[s] = emitScore(startFrame, s);
    }
    backptr.push(new Int32Array(N).fill(-1));

    for (let i = startFrame + 1; i < M; i++) {
      const newdp = new Float32Array(N);
      const newback = new Int32Array(N);

      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestJ = 0;

        for (let j = 0; j < N; j++) {
          const val = dp[j] - transitionCost(j, s);
          if (val > bestVal) {
            bestVal = val;
            bestJ = j;
          }
        }

        newdp[s] = bestVal + emitScore(i, s);
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
            type: cand.isMinor ? 'minor' : 'major',
            inScale: !cand.borrowed,
            confidence: 70,
            chordType: cand.borrowed ? 'borrowed' : 'diatonic'
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
        type: lastCand.isMinor ? 'minor' : 'major',
        inScale: !lastCand.borrowed,
        confidence: 70,
        chordType: lastCand.borrowed ? 'borrowed' : 'diatonic'
      });
    }

    return timeline;
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

      if (hmmMatch && hmmMatch.label === bassEv.label) {
        merged.push({
          ...bassEv,
          confidence: Math.min(100, (bassEv.confidence || 70) + 10),
          chordType: bassEv.chordType + '_consensus'
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

      const isShort = dur > 0 && dur < 0.8;
      const isWeak = ev.confidence < 95;

      if (isShort && isWeak) {
        continue;
      }

      const isReasonable = this.isReasonableChromaticChord(ev.root, key, prev);

      if (!isReasonable) {
        if (dur < 1.5 || ev.confidence < 90) {
          continue;
        }
      }

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

      if (!prev || !curr || !next) continue;

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

      const r = avg[root];
      const m3 = avg[this.toPc(root + 3)];
      const M3 = avg[this.toPc(root + 4)];
      const p4 = avg[this.toPc(root + 5)];
      const dim5 = avg[this.toPc(root + 6)];
      const p5 = avg[this.toPc(root + 7)];
      const aug5 = avg[this.toPc(root + 8)];
      const M6 = avg[this.toPc(root + 9)];
      const b7 = avg[this.toPc(root + 10)];
      const M7 = avg[this.toPc(root + 11)];
      const M9 = avg[this.toPc(root + 2)];

      let label = ev.label;

      if (isMinor && dim5 > 0.12 && dim5 > p5 * 1.3) {
        label = label.replace(/m$/, 'dim');
      }

      if (!isMinor && aug5 > 0.12 && aug5 > p5 * 1.3) {
        label = label.replace(/m?$/, 'aug');
      }

      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        if (!isMinor && M7 > 0.10 && M7 > b7 * 1.5 && M3 > 0.08) {
          if (M7 > r * 0.15) {
            label = label.replace(/m$/, '') + 'maj7';
          }
        }
        else if (!isMinor && b7 > 0.10 && b7 > M7 * 1.2 && M3 > 0.08) {
          if (b7 > r * 0.12) {
            label += '7';
          }
        }
        else if (isMinor && b7 > 0.10 && b7 > M7 * 1.2 && m3 > 0.08) {
          if (b7 > r * 0.12) {
            label += '7';
          }
        }
      }

      if (!label.includes('7') && !label.includes('6') && !label.includes('sus')) {
        if (M6 > 0.12 && M6 > b7 * 1.5 && M6 > M7 * 1.5) {
          if (p5 > 0.10) {
            label += '6';
          }
        }
      }

      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        const thirdPresent = M3 > 0.06 || m3 > 0.06;

        if (p4 > 0.12 && !thirdPresent && p4 > M3 * 1.8 && p4 > m3 * 1.8) {
          label = label.split(/[m]/)[0] + 'sus4';
        }
        else if (M9 > 0.12 && !thirdPresent && M9 > M3 * 1.8 && M9 > m3 * 1.8) {
          label = label.split(/[m]/)[0] + 'sus2';
        }
      }

      return { ...ev, label };
    });
  }

  finalizeTimeline(timeline, bpm, features) {
    if (!timeline.length) return [];

    const spb = 60 / Math.max(60, Math.min(200, bpm));
    // v16.31: Reduced minimum duration
    const minDuration = 0.4 * spb;

    let filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev || !ev.label) continue;
      
      const next = timeline[i + 1];
      const duration = next ? (next.t - ev.t) : minDuration;

      const isShort = duration < minDuration;
      const isStrong = ev.confidence >= 85;  // v16.31: Was 90
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
      if (!ev || !ev.label) continue;
      if (!merged.length || merged[merged.length - 1].label !== ev.label) {
        merged.push(ev);
      }
    }

    return merged;
  }

  // ═══════════════════════════════════════════════════════════
  // STATS & PROFILE DETECTION
  // ═══════════════════════════════════════════════════════════

  buildStats(timeline, key) {
    const diatonic = this.getDiatonicInfo(key);
    
    let inScale = 0, borrowed = 0, chromatic = 0, inversions = 0, extensions = 0, secondaryDominants = 0;

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

      if (ev.modalContext === 'secondary_dominant') secondaryDominants++;
    }

    return {
      totalChords: timeline.length,
      inScale,
      borrowed,
      chromatic,
      inversions,
      extensions,
      secondaryDominants
    };
  }

  isEasyRockSong(stats, key) {
    const total = stats.totalChords || 1;
    const inScaleRatio = stats.inScale / total;
    const chromaticRatio = stats.chromatic / total;
    const extensionsRatio = stats.extensions / total;

    return inScaleRatio >= 0.80 && chromaticRatio <= 0.15 && extensionsRatio <= 0.20;
  }

  enforceEasyDiatonic(timeline, key) {
    const diatonic = this.getDiatonicInfo(key);
    
    return timeline.map(ev => {
      if (!ev || !ev.label) return ev;
      if (diatonic.pcs.includes(ev.root)) return ev;

      let closest = diatonic.pcs[0];
      let minDist = 12;
      for (const pc of diatonic.pcs) {
        const dist = Math.min(
          Math.abs(ev.root - pc),
          12 - Math.abs(ev.root - pc)
        );
        if (dist < minDist) {
          minDist = dist;
          closest = pc;
        }
      }

      const dc = diatonic.chords.find(c => c.root === closest);
      const label = this.getNoteName(closest, key) + (dc && dc.minor ? 'm' : '');

      return {
        ...ev,
        root: closest,
        label,
        chordType: (ev.chordType || '') + '_snapped'
      };
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

  // ═══════════════════════════════════════════════════════════
  // PATTERN MEMORY & AUTO REFINEMENT
  // ═══════════════════════════════════════════════════════════

  applyPatternMemory(timeline, key) {
    if (timeline.length < 4) return timeline;

    const patterns = new Map();
    const labels = timeline.map(ev => ev && ev.label ? this.normalizeLabel(ev.label) : '');

    for (let i = 0; i <= labels.length - 4; i++) {
      const pattern = labels.slice(i, i + 4).join('_');
      if (pattern.includes('_')) {
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }

    const strongPatterns = [...patterns.entries()]
      .filter(([p, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);

    if (!strongPatterns.length) return timeline;

    const result = [...timeline];

    for (let i = 1; i < result.length - 2; i++) {
      const ev = result[i];
      if (!ev || !ev.label) continue;
      if ((ev.confidence || 0) >= 65) continue;

      const localLabels = result.slice(i - 1, i + 3).map(e => e && e.label ? this.normalizeLabel(e.label) : '');
      if (localLabels.length !== 4) continue;

      const local = localLabels.join('_');

      for (const [pattern, count] of strongPatterns) {
        const pParts = pattern.split('_');
        const lParts = local.split('_');

        if (pParts.length !== lParts.length) continue;

        let diffIndex = -1;
        let diffs = 0;
        for (let k = 0; k < pParts.length; k++) {
          if (pParts[k] !== lParts[k]) {
            diffs++;
            diffIndex = k;
          }
        }

        if (diffs === 1 && diffIndex === 1) {
          const targetLabel = pParts[diffIndex];
          const targetRoot = this.labelToRoot(targetLabel, key);

          result[i] = { 
            ...ev, 
            label: targetLabel,
            root: targetRoot !== null ? targetRoot : ev.root,
            chordType: (ev.chordType || '') + '_patternFix'
          };
          break;
        }
      }
    }

    return result;
  }

  normalizeLabel(label) {
    if (!label) return '';
    return label.replace(/7|maj7|sus[24]|dim|aug|6|\/.*$/, '').trim();
  }

  labelToRoot(label, key) {
    const normalized = this.normalizeLabel(label);
    const rootName = normalized.replace(/m$/, '');

    let idx = this.NOTES_SHARP.indexOf(rootName);
    if (idx >= 0) return idx;

    idx = this.NOTES_FLAT.indexOf(rootName);
    if (idx >= 0) return idx;

    return null;
  }

  // v16.31: Less aggressive auto-refine
  autoRefineTimeline(timeline, key, totalDuration) {
    if (!timeline || timeline.length === 0) return timeline;

    this.computeSegmentDurations(timeline, totalDuration);

    const stats = this.buildStats(timeline, key);
    const profile = this.autoComplexityProfileFromStats(stats);
    const isSimple = (profile === 'simple');

    const diatonicInfo = this.getDiatonicInfo(key);
    const diatonicRoots = new Set(diatonicInfo.pcs);
    const hist = this.buildChordHistogramForRefine(timeline);

    // v16.31: Less aggressive filtering
    const maxShortNonDiatonic = isSimple ? 0.55 : 0.40;  // Was 0.70 / 0.45

    const cleaned = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = cleaned[cleaned.length - 1] || null;
      const next = (i + 1 < timeline.length) ? timeline[i + 1] : null;

      if (!ev || !ev.label) continue;

      const base = this.baseLabelForPattern(ev.label);
      const count = hist.get(base) || 0;
      const inScale = diatonicRoots.has(ev.root);
      const dur = ev.__dur != null ? ev.__dur : (ev.duration || 0);

      const prevBase = prev ? this.baseLabelForPattern(prev.label) : null;
      const nextBase = next ? this.baseLabelForPattern(next.label) : null;
      const sandwiched = prev && next && prevBase === nextBase && prevBase !== '';

      const candidateForDrop =
        isSimple &&
        !inScale &&
        dur > 0 &&
        dur < maxShortNonDiatonic &&
        count === 1 &&
        sandwiched;

      if (candidateForDrop) {
        console.log(`  🧹 AUTO: dropped ${ev.label} (short, non-diatonic, single, sandwiched)`);
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

  computeSegmentDurations(timeline, totalDuration) {
    if (!timeline || !timeline.length) return;
    for (let i = 0; i < timeline.length; i++) {
      const cur = timeline[i];
      const next = timeline[i + 1];
      const t0 = cur.t || 0;
      const t1 = next ? (next.t || 0) : (totalDuration || t0);
      cur.__dur = Math.max(0, t1 - t0);
    }
  }

  autoComplexityProfileFromStats(stats) {
    const total = stats.totalChords || 1;
    const inScaleRatio = (stats.inScale || 0) / total;
    const chromaticRatio = (stats.chromatic || 0) / total;
    const borrowedRatio = (stats.borrowed || 0) / total;

    if (inScaleRatio >= 0.85 && chromaticRatio <= 0.10 && borrowedRatio <= 0.15) {
      return 'simple';
    }
    if (inScaleRatio >= 0.70 && chromaticRatio <= 0.20) {
      return 'medium';
    }
    return 'complex';
  }

  buildChordHistogramForRefine(timeline) {
    const map = new Map();
    for (const ev of timeline) {
      if (!ev || !ev.label) continue;
      const base = this.baseLabelForPattern(ev.label);
      if (!base) continue;
      map.set(base, (map.get(base) || 0) + 1);
    }
    return map;
  }

  baseLabelForPattern(label) {
    if (!label) return '';
    return label.replace(/7|maj7|sus[24]|dim|aug|add9|6|\/.*$/g, '').trim();
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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
