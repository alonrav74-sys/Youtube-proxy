/**
 * ChordEngine v16.3 - CLEAN & PRECISE
 * 
 * 🔧 תיקונים:
 * 1. ✅ פחות אקורדים מהירים - רק שינויים מובהקים
 * 2. ✅ ניקוי רעש בהתחלה - דילוג על אקורד ראשון אם לא בסולם
 * 3. ✅ טוניקה לפי באס ראשון - C בבאס = C major, לא Am
 * 4. ✅ E בסולם C = E major (V/vi) - לא Em! בדיקת ה-3 לעומק
 * 5. ✅ מיזוג אקורדים דומים רצופים
 */

class ChordEngineUltimate {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    
    // 🎯 חדש: Secondary dominants - אקורדים מז'וריים נפוצים על דרגות מינוריות
    // בסולם מז'ור: iii הופך ל-III (V/vi), ii הופך ל-II (V/V), vi הופך ל-VI (V/ii)
    this.SECONDARY_DOMINANTS_MAJOR = {
      4: true,   // E in C = V/vi (מאוד נפוץ!)
      2: true,   // D in C = V/V
      9: true,   // A in C = V/ii
      11: true,  // B in C = V/iii (פחות נפוץ)
    };
    
    this._hannCache = {};
  }

  async detect(audioBuffer, options = {}) {
    const opts = this.parseOptions(options);
    const t0 = this.now();

    console.log('🎵 ChordEngine v16.3 - Clean & Precise');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    const musicStart = this.findMusicStartClean(features);
    console.log(`✅ Music starts at ${musicStart.time.toFixed(2)}s`);

    const tonicResult = this.detectTonicWithFirstBass(features, musicStart.frame);
    console.log(`✅ Tonic: ${this.NOTES_SHARP[tonicResult.root]} (${tonicResult.confidence}%) [${tonicResult.method}]`);

    const modeResult = this.detectModeHybrid(features, tonicResult, musicStart.frame);
    
    const key = {
      root: tonicResult.root,
      minor: modeResult.isMinor,
      confidence: Math.min(tonicResult.confidence, modeResult.confidence) / 100
    };
    console.log(`✅ Mode: ${key.minor ? 'MINOR' : 'MAJOR'} (${modeResult.confidence}%)`);

    let timeline = this.buildChordsClean(features, key, musicStart.frame, audio.bpm);
    console.log(`✅ Initial chords: ${timeline.length}`);

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    timeline = this.addExtensions(timeline, features, key, opts);
    timeline = this.addInversions(timeline, features, key);
    timeline = this.finalizeTimelineClean(timeline, audio.bpm, features, key, musicStart.frame);

    timeline = timeline.filter(ev => 
      ev && ev.label && typeof ev.label === 'string' && ev.label.trim() && ev.fi != null
    );

    const totalTime = this.now() - t0;
    console.log(`🎉 Final: ${timeline.length} chords in ${totalTime.toFixed(0)}ms`);

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
      timings: { total: totalTime }
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

    if (bestLag > 0 && bestR > 0.3) {
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
  // MUSIC START - ניקוי רעש
  // ═══════════════════════════════════════════════════════════
  
  findMusicStartClean(features) {
    const { energy, bass, chroma, secPerFrame, energyP50 } = features;
    
    let musicFrame = 0;
    let stableCount = 0;
    const requiredStable = 4;
    
    for (let i = 0; i < energy.length; i++) {
      const isHighEnergy = energy[i] >= energyP50;
      const hasBass = bass[i] >= 0;
      
      const c = chroma[i];
      let maxChroma = 0;
      for (let p = 0; p < 12; p++) if (c[p] > maxChroma) maxChroma = c[p];
      const hasHarmonicContent = maxChroma > 0.15;
      
      if (isHighEnergy && (hasBass || hasHarmonicContent)) {
        stableCount++;
        if (stableCount >= requiredStable) {
          musicFrame = Math.max(0, i - requiredStable + 1);
          break;
        }
      } else {
        stableCount = 0;
      }
    }
    
    const maxFrame = Math.floor(10.0 / secPerFrame);
    musicFrame = Math.min(musicFrame, maxFrame);
    
    return { frame: musicFrame, time: musicFrame * secPerFrame };
  }

  // ═══════════════════════════════════════════════════════════
  // TONIC DETECTION - באס ראשון קובע
  // ═══════════════════════════════════════════════════════════
  
  detectTonicWithFirstBass(features, startFrame) {
    const { bass, energy, energyP70, numFrames } = features;
    
    let firstStableBass = -1;
    
    for (let i = startFrame; i < Math.min(startFrame + 50, numFrames); i++) {
      if (bass[i] >= 0 && energy[i] >= energyP70 * 0.5) {
        let stableCount = 0;
        for (let j = i; j < Math.min(i + 5, numFrames); j++) {
          if (bass[j] === bass[i]) stableCount++;
        }
        if (stableCount >= 3) {
          firstStableBass = bass[i];
          break;
        }
      }
    }
    
    const bassTonic = this.detectTonicFromBass(features, startFrame);
    const ksTonic = this.detectTonicKS(features.globalChroma);
    
    if (firstStableBass >= 0) {
      const bassTonicDiff = this.toPc(bassTonic.root - firstStableBass);
      
      if (bassTonicDiff === 3 || bassTonicDiff === 9) {
        console.log(`🎯 First bass ${this.NOTES_SHARP[firstStableBass]} - using as tonic`);
        return {
          root: firstStableBass,
          confidence: Math.max(bassTonic.confidence, 85),
          method: 'first_bass_priority'
        };
      }
    }
    
    if (bassTonic.root === ksTonic.root) {
      return { root: bassTonic.root, confidence: Math.min(99, bassTonic.confidence + 10), method: 'bass+KS_agree' };
    }
    
    const isRelative = (this.toPc(bassTonic.root - ksTonic.root) === 3 || this.toPc(ksTonic.root - bassTonic.root) === 3);
    
    if (isRelative && firstStableBass >= 0) {
      if (firstStableBass === bassTonic.root) {
        return { root: bassTonic.root, confidence: bassTonic.confidence, method: 'bass_with_first_bass' };
      } else if (firstStableBass === ksTonic.root) {
        return { root: ksTonic.root, confidence: ksTonic.confidence, method: 'KS_with_first_bass' };
      }
    }
    
    if (bassTonic.confidence > ksTonic.confidence) {
      return { root: bassTonic.root, confidence: bassTonic.confidence, method: 'bass_dominant' };
    }
    return { root: ksTonic.root, confidence: ksTonic.confidence, method: 'KS_dominant' };
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
        return { ...modeFromThird, confidence: Math.min(98, modeFromThird.confidence + 10), method: 'third+KS_agree' };
      }
    }
    
    return modeFromThird;
  }

  detectModeFromThird(features, tonic, startFrame) {
    const { chroma, energy, energyP70, energyP50 } = features;
    
    let m3Total = 0, M3Total = 0, totalWeight = 0;
    
    const m3pc = this.toPc(tonic + 3);
    const M3pc = this.toPc(tonic + 4);
    
    for (let i = startFrame; i < chroma.length; i++) {
      if (energy[i] < energyP50 * 0.3) continue;
      
      const w = Math.min(3.0, energy[i] / energyP70);
      const c = chroma[i];
      const arpeggioBonus = c[tonic] > 0.15 ? 1.5 : 1.0;
      
      m3Total += c[m3pc] * w * arpeggioBonus;
      M3Total += c[M3pc] * w * arpeggioBonus;
      totalWeight += w;
    }
    
    if (totalWeight > 0) {
      m3Total /= totalWeight;
      M3Total /= totalWeight;
    }
    
    const thirdRatio = (m3Total + 0.0001) / (M3Total + 0.0001);
    
    let minorScore = 0, majorScore = 0;
    
    if (thirdRatio > 1.1) minorScore += 50 * Math.min(3, thirdRatio - 1);
    else if (thirdRatio < 0.9) majorScore += 50 * Math.min(3, 1 / thirdRatio - 1);
    
    if (m3Total > 0.12 && m3Total > M3Total) minorScore += 15;
    if (M3Total > 0.12 && M3Total > m3Total) majorScore += 15;
    
    const isMinor = minorScore > majorScore;
    const confidence = Math.min(100, Math.max(60, 60 + Math.abs(minorScore - majorScore)));
    
    return { isMinor, confidence: Math.round(confidence), m3: m3Total, M3: M3Total, ratio: thirdRatio };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD CHORDS - עם זיהוי secondary dominants
  // ═══════════════════════════════════════════════════════════
  
  buildChordsClean(features, key, startFrame, bpm) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minFramesBetweenChords = Math.floor((spb * 0.6) / secPerFrame); // 60% של פעימה
    
    let currentBass = -1;
    let currentStart = startFrame;
    let lastChordFrame = -999;
    
    for (let i = startFrame; i < bass.length; i++) {
      if (energy[i] < energyP70 * 0.4) continue;
      
      const bp = bass[i];
      
      if (bp >= 0 && bp !== currentBass) {
        if (i - lastChordFrame < minFramesBetweenChords && timeline.length > 0) {
          continue;
        }
        
        if (currentBass >= 0 && i > currentStart) {
          const segmentLength = i - currentStart;
          
          if (segmentLength >= minFramesBetweenChords) {
            // 🎯 חדש: קריאה עם בדיקת secondary dominants
            const chord = this.determineChordWithSecondaryDominants(
              chroma, currentStart, i, key, diatonic, currentBass
            );
            
            if (chord && chord.confidence >= 45) {
              timeline.push({
                t: currentStart * secPerFrame,
                fi: currentStart,
                label: chord.label,
                root: chord.root,
                type: chord.type,
                bassNote: currentBass,
                inScale: chord.inScale,
                confidence: chord.confidence,
                modalContext: chord.modalContext
              });
              lastChordFrame = currentStart;
            }
          }
        }
        currentBass = bp;
        currentStart = i;
      }
    }
    
    // Last segment
    if (currentBass >= 0 && chroma.length > currentStart) {
      const segmentLength = chroma.length - currentStart;
      if (segmentLength >= minFramesBetweenChords) {
        const chord = this.determineChordWithSecondaryDominants(
          chroma, currentStart, chroma.length, key, diatonic, currentBass
        );
        if (chord && chord.confidence >= 45) {
          timeline.push({
            t: currentStart * secPerFrame,
            fi: currentStart,
            label: chord.label,
            root: chord.root,
            type: chord.type,
            bassNote: currentBass,
            inScale: chord.inScale,
            confidence: chord.confidence,
            modalContext: chord.modalContext
          });
        }
      }
    }
    
    return timeline;
  }

  // 🎯 חדש: זיהוי אקורד עם תמיכה ב-secondary dominants
  determineChordWithSecondaryDominants(chroma, startFrame, endFrame, key, diatonic, bassNote) {
    const avg = this.getAvgChroma(chroma, startFrame, endFrame);
    
    // 🎯 קודם כל: בדוק את ה-3 של האקורד לעומק!
    const m3strength = avg[this.toPc(bassNote + 3)];
    const M3strength = avg[this.toPc(bassNote + 4)];
    const p5strength = avg[this.toPc(bassNote + 7)];
    const rootStrength = avg[bassNote];
    
    // האם יש ראיות ברורות למז'ור?
    const clearlyMajor = M3strength > m3strength * 1.3 && M3strength > 0.08;
    const clearlyMinor = m3strength > M3strength * 1.3 && m3strength > 0.08;
    
    const candidates = [];
    
    // בדוק אם זה דרגה דיאטונית
    const relativeToKey = this.toPc(bassNote - key.root);
    const diatonicChord = diatonic.chords.find(dc => dc.root === bassNote);
    
    // 🎯 חדש: בדיקת secondary dominant
    // בסולם מז'ור: iii (E בסולם C) בדרך כלל מינורי, אבל E major = V/vi נפוץ מאוד!
    if (!key.minor && this.isSecondaryDominantDegree(relativeToKey)) {
      if (clearlyMajor) {
        // זה secondary dominant!
        const score = rootStrength * 40 + M3strength * 35 + p5strength * 20;
        candidates.push({
          root: bassNote,
          isMinor: false, // מז'ור!
          inScale: false,
          score: score + 15, // בונוס ל-secondary dominant
          modalContext: this.getSecondaryDominantName(relativeToKey)
        });
        console.log(`🎯 Secondary dominant detected: ${this.NOTES_SHARP[bassNote]} (${this.getSecondaryDominantName(relativeToKey)})`);
      }
    }
    
    // דיאטוני רגיל
    if (diatonicChord) {
      // אבל! אם יש ראיות ברורות למז'ור על דרגה מינורית - תן עדיפות למז'ור
      if (diatonicChord.minor && clearlyMajor) {
        // זה כנראה secondary dominant או borrowed
        const majorScore = rootStrength * 40 + M3strength * 35 + p5strength * 20;
        candidates.push({
          root: bassNote,
          isMinor: false,
          inScale: false,
          score: majorScore + 10,
          modalContext: 'secondary_or_borrowed'
        });
      }
      
      // האפשרות הדיאטונית הרגילה
      const expectedMinor = diatonicChord.minor;
      const thirdStrength = expectedMinor ? m3strength : M3strength;
      const wrongThirdStrength = expectedMinor ? M3strength : m3strength;
      
      let score = rootStrength * 40 + thirdStrength * 30 + p5strength * 20;
      score -= wrongThirdStrength * 15;
      
      candidates.push({
        root: bassNote,
        isMinor: expectedMinor,
        inScale: true,
        score: score + 10
      });
    }
    
    // כרומטי
    if (!diatonicChord || candidates.length === 0) {
      for (const isMinor of [false, true]) {
        const thirdStrength = isMinor ? m3strength : M3strength;
        const score = rootStrength * 40 + thirdStrength * 30 + p5strength * 20;
        if (score > 15) {
          candidates.push({
            root: bassNote,
            isMinor,
            inScale: false,
            score
          });
        }
      }
    }
    
    if (!candidates.length) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    // Build label
    const noteName = this.getNoteName(best.root, key);
    let label = noteName;
    
    // Check dim/aug
    const b5 = avg[this.toPc(best.root + 6)];
    const s5 = avg[this.toPc(best.root + 8)];
    
    if (best.isMinor && b5 > p5strength * 1.3 && b5 > 0.07) {
      label += 'dim';
    } else if (!best.isMinor && s5 > p5strength * 1.3 && s5 > 0.07) {
      label += 'aug';
    } else if (best.isMinor) {
      label += 'm';
    }
    
    return {
      root: best.root,
      label,
      type: best.isMinor ? 'minor' : 'major',
      inScale: best.inScale,
      confidence: Math.min(100, Math.round(best.score)),
      modalContext: best.modalContext
    };
  }

  // 🎯 חדש: האם זו דרגה שנפוץ לה להיות secondary dominant?
  isSecondaryDominantDegree(relativeToKey) {
    // בסולם מז'ור:
    // E (דרגה 4 = iii) -> V/vi (מאוד נפוץ!)
    // D (דרגה 2 = ii) -> V/V (נפוץ)
    // A (דרגה 9 = vi) -> V/ii (נפוץ)
    // B (דרגה 11 = vii) -> V/iii
    return [2, 4, 9, 11].includes(relativeToKey);
  }

  // 🎯 חדש: שם ה-secondary dominant
  getSecondaryDominantName(relativeToKey) {
    const names = {
      4: 'V/vi',   // E in C
      2: 'V/V',    // D in C
      9: 'V/ii',   // A in C
      11: 'V/iii', // B in C
      6: 'V/IV',   // F# in C (פחות נפוץ)
    };
    return names[relativeToKey] || 'secondary';
  }

  getAvgChroma(chroma, startFrame, endFrame) {
    const avg = new Float32Array(12);
    const count = endFrame - startFrame;
    for (let i = startFrame; i < endFrame && i < chroma.length; i++) {
      for (let p = 0; p < 12; p++) avg[p] += chroma[i][p];
    }
    if (count > 0) for (let p = 0; p < 12; p++) avg[p] /= count;
    return avg;
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
    
    for (const ev of timeline) {
      const inScale = diatonic.pcs.includes(ev.root);
      
      if (inScale || ev.modalContext) {
        // דיאטוני או כבר מזוהה כ-secondary dominant
        validated.push(ev);
      } else {
        const borrowedType = this.identifyBorrowedChord(ev.root, ev.type === 'minor', key);
        
        if (borrowedType) {
          if (ev.confidence >= 45) {
            validated.push({ ...ev, modalContext: borrowedType });
          } else {
            validated.push(this.snapToDiatonic(ev, diatonic, key));
          }
        } else {
          if (ev.confidence >= 60) {
            validated.push({ ...ev, modalContext: 'chromatic' });
          } else {
            validated.push(this.snapToDiatonic(ev, diatonic, key));
          }
        }
      }
    }
    
    return validated;
  }

  identifyBorrowedChord(root, isMinor, key) {
    const rel = this.toPc(root - key.root);
    
    if (!key.minor) {
      if (rel === 10 && !isMinor) return 'bVII';
      if (rel === 8 && !isMinor) return 'bVI';
      if (rel === 3 && !isMinor) return 'bIII';
      if (rel === 5 && isMinor) return 'iv';
      if (rel === 1 && !isMinor) return 'bII';
    } else {
      if (rel === 7 && !isMinor) return 'V';
      if (rel === 5 && !isMinor) return 'IV';
      if (rel === 11 && !isMinor) return 'VII';
    }
    
    return null;
  }

  snapToDiatonic(ev, diatonic, key) {
    let best = diatonic.chords[0];
    let bestDist = 99;
    
    for (const dc of diatonic.chords) {
      const dist = Math.min(Math.abs(ev.root - dc.root), 12 - Math.abs(ev.root - dc.root));
      if (dist < bestDist) { bestDist = dist; best = dc; }
    }
    
    const label = this.getNoteName(best.root, key) + (best.minor ? 'm' : '');
    return { ...ev, root: best.root, label, type: best.minor ? 'minor' : 'major', inScale: true, snapped: true };
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
      
      if (prevToNext > prevToCurr + currToNext && curr.confidence < 55) {
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
      
      if (ev.type === 'dim' || ev.type === 'aug') return ev;
      
      const b7 = avg[this.toPc(root + 10)];
      const M7 = avg[this.toPc(root + 11)];
      const third = avg[this.toPc(root + (isMinor ? 3 : 4))];
      
      let label = ev.label;
      
      if (!isMinor && M7 > 0.12 && M7 > b7 * 1.5 && third > 0.10 && b7 < 0.08) {
        label = label.replace(/m$/, '') + 'maj7';
      } else if (b7 > 0.10 && b7 > M7) {
        if (!label.includes('7')) label += '7';
      }
      
      return { ...ev, label };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // INVERSIONS
  // ═══════════════════════════════════════════════════════════
  
  addInversions(timeline, features, key) {
    return timeline.map(ev => {
      if (ev.fi == null || ev.fi < 0) return ev;
      
      const root = ev.root;
      const actualBass = ev.bassNote;
      
      if (actualBass >= 0 && actualBass !== root) {
        const isMinor = ev.type === 'minor';
        
        const chordTones = isMinor ? [0, 3, 7] : [0, 4, 7];
        if (ev.label.includes('7')) chordTones.push(10);
        if (ev.label.includes('maj7')) chordTones[chordTones.length - 1] = 11;
        
        const bassInterval = this.toPc(actualBass - root);
        
        if (chordTones.includes(bassInterval)) {
          const bassName = this.getNoteName(actualBass, key);
          return { ...ev, label: ev.label + '/' + bassName, isInversion: true };
        }
      }
      
      return ev;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FINALIZE - ניקוי רעש וmoזג
  // ═══════════════════════════════════════════════════════════
  
  finalizeTimelineClean(timeline, bpm, features, key, musicStartFrame) {
    if (!timeline.length) return [];
    
    const { secPerFrame } = features;
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDuration = 0.5 * spb; // מינימום חצי פעימה
    
    // 🎯 תיקון #2: הסר אקורד ראשון אם הוא רעש (לא בסולם ומוקדם מדי)
    let filtered = [...timeline];
    
    if (filtered.length > 0) {
      const first = filtered[0];
      const musicStartTime = musicStartFrame * secPerFrame;
      
      // אם האקורד הראשון מאוד קרוב להתחלה ולא בסולם - כנראה רעש
      if (first.t < musicStartTime + 1.0 && !first.inScale && first.confidence < 70) {
        console.log(`🎯 Removing noise chord at start: ${first.label}`);
        filtered.shift();
      }
    }
    
    // הסר אקורדים קצרים מדי
    const withDurations = [];
    for (let i = 0; i < filtered.length; i++) {
      const ev = filtered[i];
      const next = filtered[i + 1];
      const duration = next ? (next.t - ev.t) : minDuration;
      
      if (duration >= minDuration || ev.confidence >= 70) {
        withDurations.push(ev);
      }
    }
    
    // Snap to grid
    const snapped = withDurations.map(ev => {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const t = Math.abs(grid - raw) <= 0.3 * spb ? grid : raw;
      return { ...ev, t: Math.max(0, t) };
    });
    
    // 🎯 תיקון #1: מיזוג אקורדים זהים רצופים
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
      borrowed: timeline.filter(e => e.modalContext && !e.modalContext.includes('V/')).length,
      secondaryDominants: timeline.filter(e => e.modalContext && e.modalContext.includes('V/')).length,
      inversions: timeline.filter(e => e.label && e.label.includes('/')).length,
      extensions: timeline.filter(e => e.label && /7|9|11|13|sus|dim|aug/.test(e.label)).length,
      chromatic: timeline.filter(e => e.modalContext === 'chromatic').length
    };
  }

  // Legacy compatibility
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
