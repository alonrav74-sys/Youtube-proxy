/**
 * ChordEngine v16.9 - Anti-Flutter (Based on v14.36 Strategy)
 * 
 * Key Changes from v16.8:
 * 1. REMOVED buildChordsStableBass() - back to pure HMM
 * 2. HARD THRESHOLD 0.35 in emitScore (like v14.36)
 * 3. Aggressive filtering: minDur 0.5s, strict energy requirements
 * 4. enforceEarlyDiatonic: 15 seconds window + force tonic first 3s
 * 5. Heavy penalty for low-energy frames (-0.30)
 * 
 * Goal: Stop creating chords from noise/arpeggios
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

    console.log('🎵 ChordEngine v16.9 (Anti-Flutter from v14.36)');

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

    // ✅ BACK TO PURE HMM (like v14.36)
    let timeline = this.chordTrackingHMMHybrid(features, key, opts.bassMultiplier, true);
    console.log(`✅ Initial chords: ${timeline.length}`);

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    timeline = this.finalizeTimeline(timeline, audio.bpm, features);
    timeline = this.enforceEarlyDiatonic(timeline, key, features, audio.bpm);
    timeline = this.addExtensions(timeline, features, key, opts);

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
      energyP40: percentile(40),
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
      const firstChord = this.getFirstStrongChord(features, startFrame);
      
      if (firstChord && firstChord.root === bassTonic.root) {
        return { 
          root: bassTonic.root, 
          confidence: Math.min(95, bassTonic.confidence + 15), 
          method: 'bass+first_triad' 
        };
      } else if (firstChord && firstChord.root === ksTonic.root) {
        return { 
          root: ksTonic.root, 
          confidence: Math.min(95, ksTonic.confidence + 15), 
          method: 'KS+first_triad' 
        };
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

  getFirstStrongChord(features, startFrame) {
    const { chroma, bass, energy, energyP70 } = features;
    
    let framesChecked = 0;
    for (let i = startFrame; i < chroma.length && framesChecked < 10; i++) {
      if (energy[i] >= energyP70 * 0.6) {
        framesChecked++;
        const triad = this.detectTriadFromChroma(chroma[i], bass[i]);
        if (triad && triad.score > 0.3) {
          console.log(`  → First chord: ${this.NOTES_SHARP[triad.root]}${triad.isMinor ? 'm' : ''} (score: ${triad.score.toFixed(2)})`);
          return triad;
        }
      }
    }
    
    return null;
  }

  detectTriadFromChroma(chromaFrame, bassNote) {
    const candidates = [];
    
    for (let root = 0; root < 12; root++) {
      const rootStrength = chromaFrame[root];
      const major3 = chromaFrame[this.toPc(root + 4)];
      const minor3 = chromaFrame[this.toPc(root + 3)];
      const fifth = chromaFrame[this.toPc(root + 7)];
      
      if (rootStrength > 0.08 && major3 > 0.08 && fifth > 0.08) {
        const score = rootStrength * 1.5 + major3 * 1.0 + fifth * 1.0;
        const wrongThird = minor3;
        const finalScore = score - wrongThird * 2.0;
        
        let bassBonus = 0;
        if (bassNote >= 0) {
          if (bassNote === root) bassBonus = 0.3;
          else if (bassNote === this.toPc(root + 4)) bassBonus = 0.15;
          else if (bassNote === this.toPc(root + 7)) bassBonus = 0.10;
        }
        
        candidates.push({ 
          root, 
          isMinor: false, 
          score: finalScore + bassBonus 
        });
      }
      
      if (rootStrength > 0.08 && minor3 > 0.08 && fifth > 0.08) {
        const score = rootStrength * 1.5 + minor3 * 1.0 + fifth * 1.0;
        const wrongThird = major3;
        const finalScore = score - wrongThird * 2.0;
        
        let bassBonus = 0;
        if (bassNote >= 0) {
          if (bassNote === root) bassBonus = 0.3;
          else if (bassNote === this.toPc(root + 3)) bassBonus = 0.15;
          else if (bassNote === this.toPc(root + 7)) bassBonus = 0.10;
        }
        
        candidates.push({ 
          root, 
          isMinor: true, 
          score: finalScore + bassBonus 
        });
      }
    }
    
    if (!candidates.length) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].score > 0.3 ? candidates[0] : null;
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
  // 🎯 PURE HMM TRACKING (like v14.36) - NO STABLE BASS LOGIC
  // ═══════════════════════════════════════════════════════════
  
  chordTrackingHMMHybrid(features, key, bassMultiplier, useFullMode = true) {
    const { chroma, bass, hop, sr, energy } = features;
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    
    const candidates = [];
    
    // Diatonic chords
    for (const r of diatonicPcs) {
      const noteName = this.getNoteName(r, key);
      candidates.push({ root: r, label: noteName, type: 'major', borrowed: false });
      candidates.push({ root: r, label: noteName + 'm', type: 'minor', borrowed: false });
    }
    
    // Borrowed chords
    if (!key.minor) {
      const bVII = this.toPc(key.root + 10);
      const bVI = this.toPc(key.root + 8);
      const bIII = this.toPc(key.root + 3);
      const iv = this.toPc(key.root + 5);
      
      candidates.push({ root: bVII, label: this.getNoteName(bVII, key), type: 'major', borrowed: true });
      candidates.push({ root: bVI, label: this.getNoteName(bVI, key), type: 'major', borrowed: true });
      candidates.push({ root: bIII, label: this.getNoteName(bIII, key), type: 'major', borrowed: true });
      candidates.push({ root: iv, label: this.getNoteName(iv, key) + 'm', type: 'minor', borrowed: true });
    } else {
      const V = this.toPc(key.root + 7);
      const IV = this.toPc(key.root + 5);
      const VII = this.toPc(key.root + 11);
      
      candidates.push({ root: V, label: this.getNoteName(V, key), type: 'major', borrowed: true });
      candidates.push({ root: IV, label: this.getNoteName(IV, key), type: 'major', borrowed: true });
      candidates.push({ root: VII, label: this.getNoteName(VII, key), type: 'major', borrowed: true });
      candidates.push({ root: key.root, label: this.getNoteName(key.root, key), type: 'major', borrowed: true });
    }
    
    // Precompute templates
    const chordTemplates = new Map();
    for (const cand of candidates) {
      const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7];
      const mask = new Array(12).fill(0);
      for (const iv of intervals) mask[this.toPc(cand.root + iv)] = 1;
      
      let maskNorm = 0;
      for (let i = 0; i < 12; i++) maskNorm += mask[i] * mask[i];
      maskNorm = Math.sqrt(maskNorm) || 1;
      
      chordTemplates.set(cand.label, { mask, maskNorm });
    }
    
    const chromaNorms = chroma.map(c => {
      let s = 0;
      for (let i = 0; i < 12; i++) s += c[i] * c[i];
      return Math.sqrt(s) || 1;
    });
    
    const lowE = features.energyP30 || this.percentile(energy, 30);
    
    // ✅ HARD THRESHOLD emitScore (like v14.36)
    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      
      const tmpl = chordTemplates.get(cand.label);
      if (!tmpl) return -Infinity;
      
      let dotProd = 0;
      for (let p = 0; p < 12; p++) dotProd += c[p] * tmpl.mask[p];
      
      let score = dotProd / (chromaNorms[i] * tmpl.maskNorm);
      
      // ✅ HARD THRESHOLD - reject weak chords
      if (score < 0.35) return -Infinity;
      
      if (!cand.borrowed) score += 0.20;
      else score -= 0.25;
      
      if (bass[i] >= 0 && cand.root === bass[i]) score += 0.15 * bassMultiplier;
      
      // ✅ HEAVY PENALTY for low energy (like v14.36)
      if (energy[i] < lowE) score -= 0.30;
      
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
      
      const I = key.root;
      const V = this.toPc(key.root + scale[4]);
      const IV = this.toPc(key.root + scale[3]);
      const II = this.toPc(key.root + scale[1]);
      
      if (a.root === V && b.root === I) cost -= 0.15;
      if (a.root === IV && b.root === V) cost -= 0.12;
      if (a.root === II && b.root === V) cost -= 0.12;
      if (a.root === IV && b.root === I) cost -= 0.10;
      
      if (this.toPc(b.root - a.root) === 7) cost -= 0.08;
      
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
        timeline.push({ t: start * secPerHop, label: candidates[cur].label, fi: start });
        cur = states[i];
        start = i;
      }
    }
    
    timeline.push({ t: start * secPerHop, label: candidates[cur].label, fi: start });
    
    return timeline;
  }

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
      
      const root = this.parseRoot(ev.label);
      if (root < 0) {
        validated.push(ev);
        continue;
      }
      
      const inScale = diatonic.pcs.includes(root);
      
      if (inScale) {
        validated.push(ev);
        continue;
      }
      
      if ((dur > 0 && dur < 0.3) && ev.confidence && ev.confidence < 80) {
        continue;
      }
      
      if (dur >= 0.25) {
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
      
      const prevRoot = this.parseRoot(prev.label);
      const currRoot = this.parseRoot(curr.label);
      const nextRoot = this.parseRoot(next.label);
      
      if (prevRoot < 0 || currRoot < 0 || nextRoot < 0) continue;
      
      const prevToCurr = this.getTransitionScore(prevRoot, currRoot, key);
      const currToNext = this.getTransitionScore(currRoot, nextRoot, key);
      const prevToNext = this.getTransitionScore(prevRoot, nextRoot, key);
      
      if (prevToNext > prevToCurr + currToNext) {
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

  // ✅ AGGRESSIVE FILTERING (like v14.36)
  finalizeTimeline(timeline, bpm, features) {
    if (!timeline.length) return timeline;
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDur = Math.max(0.5, 0.50 * spb); // ✅ 0.5 seconds minimum
    const energyMedian = this.percentile(features.energy, 50);
    
    const filtered = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = features.energy[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.85; // ✅ Stricter
      
      const r = this.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);
      
      // ✅ Aggressive filtering
      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic)) continue;
      if (dur < minDur * 0.6 && isWeak) continue;
      
      filtered.push(a);
    }
    
    const snapped = [];
    for (const ev of filtered) {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const snapTol = 0.35 * spb;
      
      const t = (Math.abs(grid - raw) <= snapTol) ? grid : raw;
      
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi });
      }
    }
    
    return snapped;
  }

  // ✅ AGGRESSIVE INTRO CLEANING (like v14.36)
  enforceEarlyDiatonic(timeline, key, features, bpm) {
    if (!timeline || !timeline.length) return timeline;
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const earlyWindow = Math.max(15.0, 6 * spb); // ✅ 15 seconds!
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    
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
        const dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12);
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
          const bp = features.bass[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          
          // ✅ VERY AGGRESSIVE - force tonic for first 3 seconds
          if (ev.t < Math.min(3.0, 2.0 * spb)) {
            newRoot = key.root;
          }
          
          const q = getQuality(newRoot);
          label = this.NOTES_SHARP[this.toPc(newRoot)] + q;
        } else {
          const q = getQuality(r);
          label = this.NOTES_SHARP[this.toPc(r)] + q;
        }
      }
      out.push({ ...ev, label });
    }
    
    return out;
  }

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
      
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      const isMinor = /m(?!aj)/.test(ev.label);
      
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

  buildStats(timeline, key) {
    return {
      totalChords: timeline.length,
      inScale: timeline.filter(e => {
        const r = this.parseRoot(e.label);
        return r >= 0 && this.inKey(r, key.root, key.minor);
      }).length,
      inversions: timeline.filter(e => e.label && e.label.includes('/')).length,
      extensions: timeline.filter(e => e.label && /7|9|11|13|sus|dim|aug/.test(e.label)).length
    };
  }

  percentile(arr, p) {
    const a = [...arr].sort((a, b) => a - b);
    return a.length ? a[Math.floor(p / 100 * (a.length - 1))] : 0;
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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
