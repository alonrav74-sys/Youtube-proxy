/**
 * ChordEngine v16.14 - Conservative Filtering
 * 
 * Based on v16.8 (which works!) + Conservative filters from v14.36:
 * 1. HIGHER THRESHOLD: 45 (was 35) - only confident chords
 * 2. LONGER DURATION: 0.6s (was 0.5s) - no quick flickers
 * 3. STRICTER CONFIDENCE: 90+ (was 85+) for short chords
 * 4. MORE CHROMA CHANGE: 35% (was 30%) - real changes only
 * 
 * Result: Fewer chords, but each one is SOLID and CONFIDENT
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
    this.currentOpts = opts; // Store for use in subfunctions
    const timings = {};
    const t0 = this.now();

    console.log(`🎵 ChordEngine v16.15 (Auto Profile: ${opts.profile.toUpperCase()})`);

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

    let timeline = this.buildChordsStableBass(features, key, musicStart.frame, audio.bpm);
    console.log(`✅ Initial chords: ${timeline.length}`);

    // v16.15: AUTO PROFILE DETECTION
    let finalOpts = opts;
    let complexity = null;
    
    if (opts.autoDetect) {
      console.log(`\n🤖 Running AUTO complexity detection...`);
      
      // Run initial detection with balanced settings
      let tempTimeline = this.validateWithCircleOfFifths(timeline, key, features, opts);
      tempTimeline = this.applyLightHMM(tempTimeline, key);
      tempTimeline = this.addExtensions(tempTimeline, features, key, opts);
      tempTimeline = this.finalizeTimeline(tempTimeline, audio.bpm, features);
      
      // Analyze complexity
      complexity = this.analyzeSongComplexity(tempTimeline, key, features);
      
      // If suggested profile is different, re-run with new profile
      if (complexity.profile !== 'balanced') {
        console.log(`\n🔄 Re-running with ${complexity.profile.toUpperCase()} profile...`);
        finalOpts = this.parseOptions({ profile: complexity.profile });
        timeline = this.buildChordsStableBass(features, key, musicStart.frame, audio.bpm);
      } else {
        // Use the temp timeline we already have
        timeline = tempTimeline;
      }
    }
    
    // Run detection with final profile
    if (!opts.autoDetect || (complexity && complexity.profile !== 'balanced')) {
      timeline = this.validateWithCircleOfFifths(timeline, key, features, finalOpts);
      timeline = this.applyLightHMM(timeline, key);
      timeline = this.addExtensions(timeline, features, key, finalOpts);
      timeline = this.finalizeTimeline(timeline, audio.bpm, features);
    }

    // v16.15: Enforce tonic at opening if appropriate
    // v16.15: DISABLED - was too aggressive, converting Am to C etc.
    // timeline = this.enforceOpeningTonic(timeline, key, features);
    
    // v16.15b: תיקון ממוקד - רק אם האקורד הראשון הוא V והטוניקה ברורה
    timeline = this.fixFirstChordIfDominant(timeline, key, features);

    // v16.15: AI Layer - Harmonic Memory + Cadence + Meta Score refinement
    timeline = this.applyHarmonicRefinement(timeline, key, features);

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
      complexity: complexity,  // v16.15: Auto-detected complexity
      profile: complexity ? complexity.profile : opts.profile,  // v16.15: Selected profile
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

      // v16.14: Improved chroma with harmonic weighting
      const chromaFrame = new Float32Array(12);
      for (let bin = 1; bin < mags.length; bin++) {
        const freq = bin * sr / N;
        if (freq < 80 || freq > 5000) continue;
        
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = this.toPc(Math.round(midi));
        
        // v16.14: Weight by harmonic clarity
        // Lower harmonics (2nd, 3rd) get more weight than high harmonics
        const octave = Math.floor(midi / 12);
        const harmonicWeight = octave >= 3 && octave <= 6 ? 1.2 : // Sweet spot
                              octave < 3 ? 0.8 : // Too low (muddy)
                              0.7; // Too high (harsh)
        
        // Also weight by magnitude (louder = more confident)
        const magWeight = Math.sqrt(mags[bin]); // Square root to compress dynamic range
        
        chromaFrame[pc] += magWeight * harmonicWeight;
      }
      
      // Normalize
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
    const fmin = 40, fmax = 300; // v16.14: Extended range (was 250)
    const yLP = new Float32Array(N);

    // Low-pass filter for bass frequencies
    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sr / N;
      if (freq > fmax) break;
      if (freq >= fmin) {
        const omega = 2 * Math.PI * freq / sr;
        // Weight lower frequencies more
        const weight = freq < 150 ? 1.5 : 1.0; // v16.14: Boost very low freqs
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

    // Autocorrelation
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) r += (yLP[n] - mean) * (yLP[n + lag] - mean);
      r /= variance;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    // v16.14: Stricter threshold (was 0.25)
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
  // 🎯 STABLE BASS CHORD BUILDING - Prevent Over-Segmentation
  // ═══════════════════════════════════════════════════════════
  
  buildChordsStableBass(features, key, startFrame, bpm) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);
    
    const MIN_DURATION_SEC = 0.6; // v16.14: Longer minimum (was 0.5)
    const CHROMA_CHANGE_THRESHOLD = 0.35; // v16.14: More change required (was 0.30)
    
    let currentBass = -1;
    let currentStart = startFrame;
    let currentChroma = null;
    
    for (let i = startFrame; i < bass.length; i++) {
      const bp = bass[i];
      const hasEnergy = energy[i] >= energyP70 * 0.3;
      
      if (!hasEnergy) continue;
      
      // Bass changed
      if (bp >= 0 && bp !== currentBass) {
        const durationSec = (i - currentStart) * secPerFrame;
        
        // Calculate chroma similarity if we have previous chroma
        let chromaChange = 1.0;
        if (currentChroma) {
          chromaChange = this.calculateChromaDistance(currentChroma, chroma[i]);
        }
        
        // Commit chord if:
        // 1. Duration >= minimum OR
        // 2. Significant chroma change (>30%)
        const shouldCommit = durationSec >= MIN_DURATION_SEC || chromaChange >= CHROMA_CHANGE_THRESHOLD;
        
        if (currentBass >= 0 && i > currentStart && shouldCommit) {
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
              chordType: chord.chordType,
              duration: durationSec
            });
          }
          
          // Update state
          currentBass = bp;
          currentStart = i;
          currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        } else if (currentBass < 0) {
          // First chord
          currentBass = bp;
          currentStart = i;
          currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        }
        // Else: ignore transient bass change
      }
    }
    
    // Final segment
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

  /**
   * Calculate chroma distance (0 = identical, 1 = completely different)
   */
  calculateChromaDistance(chroma1, chroma2) {
    let diff = 0;
    for (let p = 0; p < 12; p++) {
      diff += Math.abs(chroma1[p] - chroma2[p]);
    }
    return diff / 2; // Normalize to [0, 1]
  }

  /**
   * Average chroma over a range
   */
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
    const opts = this.currentOpts || {}; // v16.15: Use stored opts
    const candidates = [];
    const diatonic = this.getDiatonicInfo(key);
    
    // דיאטוניים על הבאס
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
    
    // אינברסיות – עדיין דיאטוני
    for (const dc of diatonic.chords) {
      const third = this.toPc(dc.root + (dc.minor ? 3 : 4));
      if (third === bassNote) {
        candidates.push({
          root: dc.root,
          isMinor: dc.minor,
          inversionBass: bassNote,
          chordType: 'diatonic_inv1',
          priority: 70  // v16.15: היה 85 - מעדיפים שורש על הבאס
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
          priority: 65  // v16.15: היה 80 - מעדיפים שורש על הבאס
        });
      }
    }
    
    // 🔒 SAFE mode: נעצרים כאן – אין borrowed / secondary בכלל
    if (opts.profile === 'safe') {
      return candidates.sort((a, b) => b.priority - a.priority);
    }
    
    // ✅ מכאן: BALANCED / RICH בלבד
    
    // M3 scale-degree במז'ור
    if (!key.minor) {
      const M3 = this.toPc(key.root + 4);
      if (bassNote === M3) {
        candidates.push({
          root: M3,
          isMinor: false,
          inversionBass: null,
          chordType: 'scale_degree_M3',
          priority: 90,
          scaleDegree: 'M3'
        });
      }
    }
    
    if (opts.allowSecondaryDominants) {
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
    }
    
    if (opts.allowBorrowed) {
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
      borrowed.push({ root: this.toPc(key.root + 10), minor: false, from: 'bVII' }); // Bb in C
      // v16.14: REMOVED bVI (Ab/G#) - causes confusion with E
      borrowed.push({ root: this.toPc(key.root + 3), minor: false, from: 'bIII' });  // Eb in C
      borrowed.push({ root: this.toPc(key.root + 5), minor: true, from: 'iv' });     // Fm in C
    } else {
      borrowed.push({ root: this.toPc(key.root + 7), minor: false, from: 'V' });     // E in Am
      borrowed.push({ root: this.toPc(key.root + 5), minor: false, from: 'IV' });    // D in Am
    }
    
    return borrowed;
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
    
    if (candidates.length === 0) {
      // v16.14: Chromatic fallback - only if VERY clear
      for (const isMinor of [false, true]) {
        const score = this.scoreChordCandidate(avg, bassNote, isMinor, bassNote, false);
        if (score > 60) { // v16.14: Higher threshold (was 40)
          // Check if this chromatic makes sense
          const isReasonable = this.isReasonableChromaticChord(bassNote, key, null);
          if (isReasonable || score > 80) { // Only if reasonable OR super strong
            candidates.push({
              root: bassNote,
              isMinor,
              inversionBass: null,
              chordType: 'chromatic',
              score: score - 30, // v16.14: Bigger penalty (was -20)
              priority: 20        // v16.14: Lower priority (was 30)
            });
          }
        }
      }
    }
    
    if (!candidates.length) return null;
    
    // v16.15: בוסט לטריאדה חזקה על הבאס (E→E, לא C/E)
    if (bassNote >= 0) {
      const bassRoot = bassNote;
      const M3pc = this.toPc(bassRoot + 4);
      const m3pc = this.toPc(bassRoot + 3);
      const fifthPc = this.toPc(bassRoot + 7);

      const bassRootEnergy = avg[bassRoot];
      const bassMajorThird = avg[M3pc];
      const bassMinorThird = avg[m3pc];
      const bassFifthEnergy = avg[fifthPc];

      const majorTriadScore = bassRootEnergy * 1.5 + bassMajorThird * 1.2 + bassFifthEnergy;
      const minorTriadScore = bassRootEnergy * 1.5 + bassMinorThird * 1.2 + bassFifthEnergy;

      const strongMajorTriad = majorTriadScore > minorTriadScore * 1.3 && majorTriadScore > 0.12;
      const strongMinorTriad = minorTriadScore > majorTriadScore * 1.3 && minorTriadScore > 0.12;

      for (const c of candidates) {
        // בוסט למועמד ששורש שלו = הבאס, כשהטריאדה עליו חזקה
        if (c.root === bassRoot && !c.isMinor && strongMajorTriad) {
          c.score += 30; // E מזור בהללויה יקפוץ למעלה
        }
        if (c.root === bassRoot && c.isMinor && strongMinorTriad) {
          c.score += 25;
        }

        // v16.15: DISABLED - was too aggressive
        // Original logic: if bass is part of tonic triad, boost tonic inversion
        // Problem: this converted E to C/E and Am to C which is wrong for simple songs
        /*
        if (
          c.inversionBass === bassNote &&
          c.root === key.root
        ) {
          // DISABLED
        }
        */
      }
    }
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    if (best.score < 45 && durSec < 0.40) return null; // v16.14: Stricter threshold
    
    // v16.14: Enharmonic substitution for unlikely chromatics
    // Example: G# in C major → FORCE to E (modal interchange)
    let finalRoot = best.root;
    
    if (!key.minor && !diatonic.pcs.includes(best.root)) {
      // In C major: G#=8 → MUST BE E=4 (not Ab!)
      // In C major: C#=1 → could be Db=1 (neapolitan) 
      // In C major: D#=3 → MUST BE Eb=3 (bIII)
      // In C major: F#=6 → MUST BE F=5
      
      const toPc = (interval) => (key.root + interval) % 12;
      
      const forcedSubstitutions = [
        { from: toPc(8),  to: toPc(4),  name: 'G#→E' },   // G# → E (very common!)
        { from: toPc(3),  to: toPc(3),  name: 'D#→Eb' },  // D#=Eb (bIII)
        { from: toPc(6),  to: toPc(5),  name: 'F#→F' },   // F# → F
        { from: toPc(10), to: toPc(10), name: 'A#→Bb' }   // A#=Bb (bVII)
      ];
      
      for (const sub of forcedSubstitutions) {
        if (best.root === sub.from) {
          finalRoot = sub.to;
          console.log(`🎵 Forced substitution: ${this.NOTES_SHARP[sub.from]} → ${this.NOTES_SHARP[sub.to]} in ${this.NOTES_SHARP[key.root]} major`);
          break;
        }
      }
    }
    
    // v16.14: AUTO-CORRECT quality based on actual third (use finalRoot!)
    const m3 = avg[this.toPc(finalRoot + 3)];
    const M3 = avg[this.toPc(finalRoot + 4)];
    
    let finalIsMinor = best.isMinor;
    if (m3 > M3 * 1.5) {
      finalIsMinor = true;  // Strong minor third → definitely minor
    } else if (M3 > m3 * 1.5) {
      finalIsMinor = false; // Strong major third → definitely major
    }
    // else: keep best.isMinor (ambiguous)
    
    const noteName = this.getNoteName(finalRoot, key);
    let label = noteName + (finalIsMinor ? 'm' : '');
    
    if (best.inversionBass !== null) {
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
      isInversion: best.inversionBass !== null,
      inversionBass: best.inversionBass
    };
  }

  scoreChordCandidate(avg, root, isMinor, bassNote, inScale) {
    const rootStrength = avg[root];
    if (rootStrength < 0.05) return 0;
    
    const m3 = this.toPc(root + 3);  // minor third (E→G)
    const M3 = this.toPc(root + 4);  // major third (E→G#)
    const fifth = this.toPc(root + 7);
    
    // v16.14: AUTO-DETECT which third is actually present!
    const m3Strength = avg[m3];
    const M3Strength = avg[M3];
    
    // Decide which third is REALLY there
    let actualThird, wrongThird, actuallyMinor;
    if (m3Strength > M3Strength * 1.3) {
      // Minor third is stronger → it's a MINOR chord
      actualThird = m3;
      wrongThird = M3;
      actuallyMinor = true;
    } else if (M3Strength > m3Strength * 1.3) {
      // Major third is stronger → it's a MAJOR chord
      actualThird = M3;
      wrongThird = m3;
      actuallyMinor = false;
    } else {
      // Ambiguous → use the candidate's suggestion
      actualThird = this.toPc(root + (isMinor ? 3 : 4));
      wrongThird = this.toPc(root + (isMinor ? 4 : 3));
      actuallyMinor = isMinor;
    }
    
    // Score based on what we HEARD, not what we assumed
    let score = rootStrength * 40 + avg[actualThird] * 30 + avg[fifth] * 20;
    score -= avg[wrongThird] * 25;
    
    // Penalty if candidate type doesn't match what we heard
    if (isMinor !== actuallyMinor) {
      score -= 15; // Wrong quality!
    }
    
    if (bassNote === root) score += 15;
    else if (bassNote === actualThird) score += 12;
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

  // v16.15: Check if chromatic chord makes harmonic sense based on profile
  isReasonableChromaticChord(root, key, prevChord, opts = {}) {
    const tonicPc = key.root;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    
    // SAFE mode: very restrictive
    if (opts.profile === 'safe') {
      if (key.minor) {
        const V = this.toPc(tonicPc + 7); // E in Am
        return root === V; // Only V in minor
      }
      return false; // No borrowed in major for SAFE
    }
    
    // Common borrowed chords in MAJOR (BALANCED/RICH):
    if (!key.minor && opts.allowBorrowed) {
      const bVII = this.toPc(tonicPc + 10); // Bb in C major
      const bIII = this.toPc(tonicPc + 3);  // Eb in C major
      const iv = this.toPc(tonicPc + 5);    // Fm in C major
      
      if (root === bVII || root === bIII || root === iv) {
        return true;
      }
    }
    
    // Common borrowed chords in MINOR:
    if (key.minor) {
      const V = this.toPc(tonicPc + 7);     // E in Am
      const VII = this.toPc(tonicPc + 11);  // G# in Am
      const IV = this.toPc(tonicPc + 5);    // D in Am
      
      if (root === V || root === VII || root === IV) {
        return true;
      }
    }
    
    // Secondary dominants
    if (opts.allowSecondaryDominants) {
      const diatonicPcs = scale.map(s => this.toPc(tonicPc + s));
      
      for (const target of diatonicPcs) {
        const secondaryDominant = this.toPc(target + 7);
        if (root === secondaryDominant) {
          return true;
        }
      }
    }
    
    // Chromatic passing chords
    if (opts.allowChromaticPassing && prevChord) {
      const prevRoot = prevChord.root;
      const distUp = this.toPc(root - prevRoot);
      const distDown = this.toPc(prevRoot - root);
      
      if (distUp === 1 || distDown === 1) {
        return true;
      }
    }
    
    return false;
  }

  validateWithCircleOfFifths(timeline, key, features, opts = {}) {
    if (timeline.length < 2) return timeline;
    
    // v16.15: Use profile settings
    const minDur = opts.minChromaticDuration || 0.8;
    const minConf = opts.minChromaticConfidence || 90;
    
    const diatonic = this.getDiatonicInfo(key);
    const validated = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = i > 0 ? timeline[i - 1] : null;
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      
      let dur = 0;
      if (next) dur = next.t - ev.t;
      else if (prev) dur = ev.t - prev.t;
      
      const inScale = diatonic.pcs.includes(ev.root);
      
      // 🎯 1) דיאטוני אמיתי – תמיד נשאר
      if (inScale) {
        validated.push(ev);
        continue;
      }
      
      // 🎯 1.5) חריגים מקובלים בכל מצב - UNIVERSAL EXCEPTIONS
      const tonic = key.root;
      const universalExceptions = [];
      
      if (!key.minor) {
        // במז'ור:
        universalExceptions.push(
          this.toPc(tonic + 4),   // E in C (V/vi → Am) - הללויה!
          this.toPc(tonic + 2),   // D in C (V/V → G)
          this.toPc(tonic + 9),   // A in C (V/ii → Dm)
          this.toPc(tonic + 10)   // Bb in C (bVII) - רוק קלאסי
        );
      } else {
        // במינור:
        universalExceptions.push(
          this.toPc(tonic + 7),   // V (E in Am) - הרמוני מינור
          this.toPc(tonic + 5)    // IV (D in Am) - נטורל מינור
        );
      }
      
      if (universalExceptions.includes(ev.root)) {
        // דורשים רק שיהיה סביר (לא חייב מאוד חזק)
        if (dur >= 0.4 && ev.confidence >= 75) {
          console.log(`✅ Universal exception: ${this.NOTES_SHARP[ev.root]}`);
          validated.push(ev);
          continue;
        }
      }
      
      // 🎯 2) SAFE PROFILE – חוסם את השאר
      if (opts.profile === 'safe') {
        console.log(`🔒 SAFE: filtered ${this.NOTES_SHARP[ev.root]} (${ev.chordType || 'unknown'})`);
        continue;
      }
      
      // מכאן והלאה: BALANCED / RICH בלבד
      const isShort = dur > 0 && dur < minDur;
      const isWeak = ev.confidence < minConf;
      
      if (isShort && isWeak) {
        continue;
      }
      
      const isReasonable = this.isReasonableChromaticChord(ev.root, key, prev, opts);
      
      if (!isReasonable) {
        console.log(`⚠️ Unreasonable: ${this.NOTES_SHARP[ev.root]} (${ev.chordType || 'unknown'})`);
        if (dur < minDur * 2 || ev.confidence < minConf) {
          console.log(`   → FILTERED`);
          continue;
        } else {
          console.log(`   → KEPT (long+confident)`);
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
      if (ev.fi == null || ev.fi < 0 || ev.fi >= chroma.length) return ev;
      if (ev.label.includes('/')) return ev; // Don't modify inversions
      
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
      
      // 🔒 SAFE MODE: מינימום extensions
      if (opts.extensionMode === 'minimal' || opts.profile === 'safe') {
        // רק 7 על dominant חזק (V במז'ור או במינור)
        const tonic = key.root;
        const V = this.toPc(tonic + 7);
        const isDominant = root === V;
        
        if (isDominant && !label.includes('7')) {
          // דורש b7 חזקה מאוד
          if (b7 > 0.20 && b7 > M7 * 2.5 && p5 > 0.12) {
            label += '7';
          }
        }
        
        return { ...ev, label };
      }
      
      // מכאן BALANCED/RICH - מה שהיה קודם
      
      // 1. Check for diminished (m3 + dim5)
      if (isMinor && dim5 > 0.12 && dim5 > p5 * 1.3) {
        label = label.replace(/m$/, 'dim');
      }
      
      // 2. Check for augmented (M3 + aug5)
      if (!isMinor && aug5 > 0.12 && aug5 > p5 * 1.3) {
        label = label.replace(/m?$/, 'aug');
      }
      
      // 3. Check for 7th chords
      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        // Major 7th (Cmaj7)
        if (!isMinor && M7 > 0.12 && M7 > b7 * 1.8 && M3 > 0.10) {
          label = label.replace(/m$/, '') + 'maj7';
        }
        // Dominant 7th (C7, G7) - only for major chords
        else if (!isMinor && b7 > 0.12 && b7 > M7 * 1.3 && M3 > 0.10) {
          label += '7';
        }
        // Minor 7th (Am7)
        else if (isMinor && b7 > 0.12 && b7 > M7 * 1.3 && m3 > 0.10) {
          label += '7';
        }
      }
      
      // 4. Check for sus chords (only if no 7th yet)
      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        // sus4: no third, but has 4th
        if (p4 > 0.15 && p4 > M3 * 2.0 && p4 > m3 * 2.0 && M3 < 0.08 && m3 < 0.08) {
          label = label.split(/[m]/)[0] + 'sus4';
        }
        // sus2: no third, but has 9th/2nd
        else if (M9 > 0.15 && M9 > M3 * 2.0 && M9 > m3 * 2.0 && M3 < 0.08 && m3 < 0.08) {
          label = label.split(/[m]/)[0] + 'sus2';
        }
      }
      
      // 5. Add 6 if present (C6, Am6)
      if (!label.includes('7') && !label.includes('6') && M6 > 0.14) {
        label += '6';
      }
      
      return { ...ev, label };
    });
  }

  finalizeTimeline(timeline, bpm, features) {
    if (!timeline.length) return [];
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDuration = 0.5 * spb;
    
    let filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const next = timeline[i + 1];
      const duration = next ? (next.t - ev.t) : minDuration;
      
      // 🔹 v16.15: אל תזרוק את האקורד הראשון – הוא העוגן של השיר
      if (i === 0) {
        filtered.push(ev);
        continue;
      }
      
      const isShort = duration < minDuration;
      const isStrong = ev.confidence >= 90;
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

  // v16.15b: תיקון ממוקד - רק אם האקורד הראשון הוא V (דומיננטה) של הטוניקה
  // למשל: סולם C, אקורד ראשון G, אבל שומעים C+E+G → זה C/G
  fixFirstChordIfDominant(timeline, key, features) {
    if (!timeline.length) return timeline;
    
    const first = timeline[0];
    
    // אם כבר טוניקה - לא נוגעים
    if (first.root === key.root) return timeline;
    
    const tonicRoot = key.root;
    const tonicFifth = this.toPc(tonicRoot + 7); // G when tonic is C
    
    // רק אם האקורד הראשון הוא בדיוק V של הטוניקה (G כשהסולם C)
    if (first.root !== tonicFifth) return timeline;
    
    // רק אם זה מז'ור (G, לא Gm)
    if (first.type === 'minor') return timeline;
    
    const chroma = features.chroma || [];
    
    if (first.fi == null || first.fi < 0 || first.fi >= chroma.length) {
      return timeline;
    }
    
    // בדיקת הפריימים הראשונים
    const checkFrames = Math.min(20, chroma.length - first.fi);
    const avg = new Float32Array(12);
    
    for (let i = first.fi; i < first.fi + checkFrames; i++) {
      const c = chroma[i];
      if (!c) continue;
      for (let p = 0; p < 12; p++) avg[p] += c[p];
    }
    for (let p = 0; p < 12; p++) avg[p] /= checkFrames;
    
    // בדיקה: האם יש את כל 3 התווים של טריאדת הטוניקה?
    const tonicThird = key.minor ? this.toPc(tonicRoot + 3) : this.toPc(tonicRoot + 4);
    
    const rootEnergy = avg[tonicRoot];      // C
    const thirdEnergy = avg[tonicThird];    // E
    const fifthEnergy = avg[tonicFifth];    // G
    
    // כל 3 התווים צריכים להיות חזקים
    const threshold = 0.08;
    const allThreePresent = rootEnergy > threshold && thirdEnergy > threshold && fifthEnergy > threshold;
    
    // השורש (C) צריך להיות חזק יחסית - לא רק הבאס (G)
    const rootIsStrong = rootEnergy > fifthEnergy * 0.5;
    
    if (allThreePresent && rootIsStrong) {
      const tonicName = this.getNoteName(tonicRoot, key);
      const bassName = this.getNoteName(tonicFifth, key);
      const newLabel = tonicName + '/' + bassName;
      
      console.log(`🎯 First chord fix: ${first.label} → ${newLabel} (C=${rootEnergy.toFixed(2)}, E=${thirdEnergy.toFixed(2)}, G=${fifthEnergy.toFixed(2)})`);
      
      timeline[0] = {
        ...first,
        root: tonicRoot,
        bassNote: tonicFifth,
        type: key.minor ? 'minor' : 'major',
        label: newLabel,
        inScale: true
      };
    }
    
    return timeline;
  }

  // v16.15: Enforce tonic at opening if the first chord should be tonic (OLD - DISABLED)
  enforceOpeningTonic(timeline, key, features) {
    if (!timeline.length) return timeline;

    const first = timeline[0];

    // אם כבר טוניקה – לא נוגעים
    if (first.root === key.root) return timeline;

    const tonicRoot = key.root;
    const tonicIsMinor = key.minor;
    
    // v16.15 FIX: בדיקה האם האקורד הראשון הוא תו מתוך הטריאדה של הטוניקה
    // אם כן - כנראה זו טוניקה בהיפוך!
    // C major triad = C(0), E(4), G(7)
    // C minor triad = C(0), Eb(3), G(7)
    const tonicThird = tonicIsMinor ? this.toPc(tonicRoot + 3) : this.toPc(tonicRoot + 4);
    const tonicFifth = this.toPc(tonicRoot + 7);
    
    const firstIsTonicThird = first.root === tonicThird; // E when tonic is C
    const firstIsTonicFifth = first.root === tonicFifth; // G when tonic is C
    
    // אם האקורד הראשון הוא V או III של הטוניקה - זה חשוד מאוד
    // כי שירים כמעט תמיד מתחילים מטוניקה
    const isSuspiciousOpening = firstIsTonicFifth || firstIsTonicThird;
    
    if (isSuspiciousOpening) {
      console.log(`🔍 First chord ${this.NOTES_SHARP[first.root]} is ${firstIsTonicFifth ? '5th' : '3rd'} of tonic ${this.NOTES_SHARP[tonicRoot]} - checking for inversion...`);
    }

    const secPerFrame = features.secPerFrame || 0.1;
    const chroma = features.chroma || [];
    
    // v16.15: אם זה V או III ואין מידע על פריימים - נחליף לטוניקה עם באס
    if (first.fi == null || first.fi < 0 || first.fi >= chroma.length) {
      if (isSuspiciousOpening) {
        const tonicName = this.getNoteName(tonicRoot, key);
        const bassName = this.getNoteName(first.root, key);
        const newLabel = (tonicIsMinor ? tonicName + 'm' : tonicName) + '/' + bassName;
        console.log(`🎯 Forcing tonic inversion (no chroma): ${this.NOTES_SHARP[first.root]} → ${newLabel}`);
        timeline[0] = { 
          ...first, 
          root: tonicRoot, 
          bassNote: first.root,
          type: tonicIsMinor ? 'minor' : 'major', 
          label: newLabel, 
          inScale: true 
        };
      }
      return timeline;
    }

    // כמה זמן האקורד הראשון מחזיק
    const next = timeline[1] || null;
    const estDuration = next ? (next.t - first.t) : 2.0;
    // v16.15: הורדנו סף ל-0.5 שניות עבור מקרים חשודים
    const isLongEnough = estDuration >= (isSuspiciousOpening ? 0.5 : 1.0);

    if (!isLongEnough) return timeline;

    // מחשבים ממוצע כרומה על ההתחלה של האקורד הראשון
    const maxFrames = Math.round(2.0 / secPerFrame);
    const endFi = Math.min(
      chroma.length,
      next ? next.fi : first.fi + maxFrames
    );

    const avg = new Float32Array(12);
    let count = 0;
    for (let i = first.fi; i < endFi; i++) {
      const c = chroma[i];
      if (!c) continue;
      for (let p = 0; p < 12; p++) avg[p] += c[p];
      count++;
    }
    if (!count) return timeline;
    for (let p = 0; p < 12; p++) avg[p] /= count;

    const bassNote = first.bassNote != null ? first.bassNote : first.root;

    // v16.15: בדיקה ספציפית - האם יש את כל התווים של טריאדת הטוניקה?
    // C major = C, E, G
    const tonicNotes = [tonicRoot, tonicThird, tonicFifth];
    let tonicNotesPresent = 0;
    for (const note of tonicNotes) {
      if (avg[note] > 0.3) tonicNotesPresent++;
    }
    
    // אם יש לפחות 2 מתוך 3 תווים של הטוניקה - כנראה זו טוניקה
    const likelyTonicInversion = tonicNotesPresent >= 2 && isSuspiciousOpening;
    
    if (likelyTonicInversion) {
      console.log(`🎵 Found ${tonicNotesPresent}/3 tonic notes (${tonicNotes.map(n => this.NOTES_SHARP[n]).join(',')})`);
    }

    // ציון לאקורד הנוכחי
    const currIsMinor = first.type === 'minor';
    const scoreCurrent = this.scoreChordCandidate(
      avg,
      first.root,
      currIsMinor,
      bassNote,
      first.inScale
    );

    // ציון לטוניקה – גם מז'ור וגם מינור, עם הבאס הנוכחי
    const scoreTonicMaj = this.scoreChordCandidate(avg, tonicRoot, false, bassNote, true);
    const scoreTonicMin = this.scoreChordCandidate(avg, tonicRoot, true, bassNote, true);
    const scoreTonic = Math.max(scoreTonicMaj, scoreTonicMin);
    const finalTonicIsMinor = scoreTonicMin > scoreTonicMaj;

    // v16.15: קריטריונים מעודכנים - יותר אגרסיביים כשזה חשוד
    let tonicGoodEnough;
    if (likelyTonicInversion) {
      // אם זה נראה כמו היפוך טוניקה - מאוד מקלים
      tonicGoodEnough = scoreTonic >= scoreCurrent * 0.7 || tonicNotesPresent === 3;
    } else if (isSuspiciousOpening) {
      // V או III בהתחלה - די מקלים
      tonicGoodEnough = scoreTonic >= scoreCurrent * 0.8;
    } else {
      // מקרה רגיל
      tonicGoodEnough = scoreTonic >= scoreCurrent * 0.9 || scoreTonic > scoreCurrent + 10;
    }

    if (!tonicGoodEnough) {
      console.log(`❌ Tonic score (${scoreTonic.toFixed(1)}) not good enough vs current (${scoreCurrent.toFixed(1)})`);
      return timeline;
    }

    // החלפה לטוניקה
    const tonicName = this.getNoteName(tonicRoot, key);
    const newLabelBase = tonicName + (finalTonicIsMinor ? 'm' : '');

    let newLabel = newLabelBase;

    // v16.15: אם הבאס שונה מהטוניקה (היפוך!) - נציין את זה
    if (bassNote !== tonicRoot && bassNote >= 0) {
      const bassName = this.getNoteName(bassNote, key);
      newLabel = newLabelBase + '/' + bassName;
    }

    console.log(
      `🎯 Enforcing tonic at opening: ${this.NOTES_SHARP[first.root]} → ${newLabel} (score: ${scoreTonic.toFixed(1)} vs ${scoreCurrent.toFixed(1)})`
    );

    timeline[0] = {
      ...first,
      root: tonicRoot,
      bassNote: bassNote,
      type: finalTonicIsMinor ? 'minor' : 'major',
      label: newLabel,
      inScale: true
    };

    return timeline;
  }

  // v16.15: Analyze song complexity and suggest profile
  // ═══════════════════════════════════════════════════════════
  // v16.15: AI LAYER - Harmonic Memory + Cadence + Meta Score
  // ═══════════════════════════════════════════════════════════

  // 1. בניית זיכרון הרמוני מכל השיר
  computeHarmonicMemory(timeline, key) {
    const mem = {
      degreeFreq: new Map(),
      transitions: new Map(),
      rootHist: new Array(12).fill(0),
      bassHist: new Array(12).fill(0),
      totalChords: timeline.length
    };

    for (let i = 0; i < timeline.length; i++) {
      const c = timeline[i];
      const deg = this.toPc(c.root - key.root);

      mem.rootHist[c.root]++;
      if (c.bassNote >= 0) mem.bassHist[c.bassNote]++;

      mem.degreeFreq.set(deg, (mem.degreeFreq.get(deg) || 0) + 1);

      if (i > 0) {
        const prev = timeline[i - 1];
        const tr = `${prev.root}->${c.root}`;
        mem.transitions.set(tr, (mem.transitions.get(tr) || 0) + 1);
      }
    }

    return mem;
  }

  // 2. זיהוי וציון קיידנסים
  computeCadenceScore(timeline, key) {
    let score = 0;
    const tonic = key.root;
    const V = this.toPc(tonic + 7);
    const IV = this.toPc(tonic + 5);
    const vi = this.toPc(tonic + 9);
    const ii = this.toPc(tonic + 2);

    for (let i = 1; i < timeline.length; i++) {
      const a = timeline[i - 1].root;
      const b = timeline[i].root;

      // Authentic Cadence: V → I
      if (a === V && b === tonic) score += 3;
      
      // Plagal Cadence: IV → I
      if (a === IV && b === tonic) score += 2;
      
      // Half Cadence: X → V
      if (b === V) score += 1;
      
      // Deceptive Cadence: V → vi
      if (a === V && b === vi) score += 2;
      
      // ii → V (part of ii-V-I)
      if (a === ii && b === V) score += 2;
    }

    return score;
  }

  // 3. זיהוי דפוסי קיידנס ספציפיים
  detectCadencePatterns(timeline, key) {
    const patterns = [];
    const tonic = key.root;
    const V = this.toPc(tonic + 7);
    const IV = this.toPc(tonic + 5);
    const vi = this.toPc(tonic + 9);
    const ii = this.toPc(tonic + 2);

    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i].root;
      const next = timeline[i + 1].root;

      // V → I (Authentic)
      if (curr === V && next === tonic) {
        patterns.push({ type: 'authentic', start: i, end: i + 1 });
      }
      
      // IV → I (Plagal)
      if (curr === IV && next === tonic) {
        patterns.push({ type: 'plagal', start: i, end: i + 1 });
      }

      // ii → V → I
      if (i < timeline.length - 2) {
        const nextNext = timeline[i + 2].root;
        if (curr === ii && next === V && nextNext === tonic) {
          patterns.push({ type: 'ii-V-I', start: i, end: i + 2 });
        }
      }

      // I → V → vi → IV (Pop progression)
      if (i < timeline.length - 3) {
        const c1 = timeline[i].root;
        const c2 = timeline[i + 1].root;
        const c3 = timeline[i + 2].root;
        const c4 = timeline[i + 3].root;
        if (c1 === tonic && c2 === V && c3 === vi && c4 === IV) {
          patterns.push({ type: 'pop', start: i, end: i + 3 });
        }
      }
    }

    return patterns;
  }

  // 4. חישוב Meta Score לאקורד בודד
  computeMetaScore(chord, mem, key, prevChord = null) {
    const deg = this.toPc(chord.root - key.root);
    
    // התאמה לדרגות נפוצות בשיר
    const degreeFreq = mem.degreeFreq.get(deg) || 0;
    const degreeFit = degreeFreq / Math.max(1, mem.totalChords);
    
    // התאמה לבאס
    const bassFit = chord.bassNote >= 0 ? 
      (mem.bassHist[chord.bassNote] || 0) / Math.max(1, mem.totalChords) : 0;
    
    // התאמה למעבר מהאקורד הקודם
    let transitionFit = 0.5; // default
    if (prevChord) {
      const tr = `${prevChord.root}->${chord.root}`;
      const trCount = mem.transitions.get(tr) || 0;
      transitionFit = Math.min(1, trCount / 5);
    }
    
    // קנס על כרומטי
    const chromaticPenalty = chord.chordType === 'chromatic' ? 1 : 0;
    
    // קנס על אינברסיה כשיש שורש טוב יותר
    const inversionPenalty = chord.inversionBass != null ? 0.1 : 0;
    
    const confidence = (chord.confidence || 80) / 100;
    
    const score = 
      0.35 * confidence +
      0.25 * degreeFit +
      0.20 * bassFit +
      0.15 * transitionFit +
      -0.25 * chromaticPenalty +
      -0.10 * inversionPenalty;
    
    return Math.max(0, Math.min(1, score));
  }

  // 5. שכבת תיקון על כל ה-timeline
  applyHarmonicRefinement(timeline, key, features) {
    if (timeline.length < 3) return timeline;
    
    console.log(`🧠 Applying Harmonic AI Refinement...`);
    
    // בניית זיכרון הרמוני
    const mem = this.computeHarmonicMemory(timeline, key);
    const cadenceScore = this.computeCadenceScore(timeline, key);
    const cadencePatterns = this.detectCadencePatterns(timeline, key);
    
    console.log(`   Cadence score: ${cadenceScore}`);
    console.log(`   Cadence patterns found: ${cadencePatterns.length}`);
    
    const diatonic = this.getDiatonicInfo(key);
    const refined = [...timeline];
    let corrections = 0;
    
    for (let i = 0; i < refined.length; i++) {
      const chord = refined[i];
      const prev = i > 0 ? refined[i - 1] : null;
      const next = i < refined.length - 1 ? refined[i + 1] : null;
      
      const metaScore = this.computeMetaScore(chord, mem, key, prev);
      
      // בדיקה: האם האקורד חשוד?
      const isSuspect = 
        metaScore < 0.3 ||
        (chord.confidence < 80 && !diatonic.pcs.includes(chord.root));
      
      if (!isSuspect) continue;
      
      // מציאת חלופה טובה יותר
      let bestAlt = null;
      let bestAltScore = metaScore;
      
      // בודקים אקורדים דיאטוניים כחלופות
      for (const dc of diatonic.chords) {
        const altChord = {
          ...chord,
          root: dc.root,
          type: dc.minor ? 'minor' : 'major',
          isMinor: dc.minor,
          confidence: chord.confidence
        };
        
        const altScore = this.computeMetaScore(altChord, mem, key, prev);
        
        // בדיקת קיידנס: אם החלופה משלימה קיידנס
        if (next && next.root === key.root && dc.root === this.toPc(key.root + 7)) {
          // V → I cadence!
          bestAlt = altChord;
          bestAltScore = altScore + 0.2;
          break;
        }
        
        if (altScore > bestAltScore + 0.15) {
          bestAlt = altChord;
          bestAltScore = altScore;
        }
      }
      
      // החלפה אם מצאנו חלופה טובה משמעותית
      if (bestAlt && bestAltScore > metaScore + 0.15) {
        const oldLabel = chord.label;
        const newLabel = this.getNoteName(bestAlt.root, key) + (bestAlt.isMinor ? 'm' : '');
        
        console.log(`   🔄 Refined: ${oldLabel} → ${newLabel} (meta: ${metaScore.toFixed(2)} → ${bestAltScore.toFixed(2)})`);
        
        refined[i] = {
          ...chord,
          root: bestAlt.root,
          type: bestAlt.type,
          label: newLabel,
          inScale: true,
          refinedBy: 'harmonic_ai'
        };
        corrections++;
      }
    }
    
    console.log(`   ✅ Harmonic refinement: ${corrections} corrections`);
    
    return refined;
  }

  analyzeSongComplexity(timeline, key, features) {
    if (!timeline.length) return 'safe';
    
    const stats = this.buildStats(timeline, key);
    const total = timeline.length;
    
    // Calculate complexity metrics
    const inScaleRatio = stats.inScale / total;
    const chromaticRatio = stats.chromatic / total;
    const borrowedRatio = stats.borrowed / total;
    const secondaryDominantRatio = stats.secondaryDominants / total;
    const extensionRatio = stats.extensions / total;
    
    // Check for "acceptable" borrowed chords (V in minor, bVII in major)
    const acceptableBorrowed = timeline.filter(ev => {
      if (!ev.chordType || !ev.chordType.startsWith('borrowed')) return false;
      // V in minor, bVII/bIII/iv in major are "simple" borrowed
      return ev.borrowedFrom === 'V' || 
             ev.borrowedFrom === 'bVII' || 
             ev.borrowedFrom === 'bIII' ||
             ev.borrowedFrom === 'iv';
    }).length;
    
    // v16.15: Check for UNIVERSAL exceptions (always acceptable)
    const tonic = key.root;
    const universalExceptionRoots = [];
    
    if (!key.minor) {
      universalExceptionRoots.push(
        this.toPc(tonic + 4),   // E in C (V/vi)
        this.toPc(tonic + 2),   // D in C (V/V)
        this.toPc(tonic + 9),   // A in C (V/ii)
        this.toPc(tonic + 10)   // Bb in C (bVII)
      );
    } else {
      universalExceptionRoots.push(
        this.toPc(tonic + 7),   // V in minor
        this.toPc(tonic + 5)    // IV in minor
      );
    }
    
    const universalExceptions = timeline.filter(ev => 
      universalExceptionRoots.includes(ev.root)
    ).length;
    
    const acceptableBorrowedRatio = (acceptableBorrowed + universalExceptions) / total;
    
    // "True chromatic" = not in scale AND not acceptable borrowed AND not universal exception
    const trueChromaticRatio = chromaticRatio + borrowedRatio - acceptableBorrowedRatio;
    
    // Complexity score (0-100)
    let complexityScore = 0;
    
    // MAIN FACTOR: How much is truly out-of-key?
    if (inScaleRatio >= 0.85 && trueChromaticRatio < 0.05) {
      complexityScore += 0;  // Diatonic with acceptable borrowing = SAFE
    } else if (inScaleRatio >= 0.75 && trueChromaticRatio < 0.15) {
      complexityScore += 25; // Some chromatic = BALANCED
    } else {
      complexityScore += 50; // Lots of chromatic = RICH
    }
    
    // Secondary dominants add moderate complexity
    if (secondaryDominantRatio > 0.15) {
      complexityScore += 20; // Many secondary dominants
    } else if (secondaryDominantRatio > 0.05) {
      complexityScore += 10; // Some secondary dominants
    }
    
    // Extensions (if many = jazz/complex)
    // v16.15: Check for COMPLEX extensions specifically
    const complexExtensions = timeline.filter(ev => 
      ev.label && (
        ev.label.includes('maj7') ||
        ev.label.includes('sus') ||
        ev.label.includes('dim') ||
        ev.label.includes('aug') ||
        ev.label.includes('9') ||
        ev.label.includes('11') ||
        ev.label.includes('13') ||
        ev.label.includes('6')
      )
    ).length;
    
    const complexExtensionRatio = complexExtensions / total;
    
    if (complexExtensionRatio > 0.30) {
      complexityScore += 25; // Lots of maj7, sus, etc = jazz/complex
    } else if (complexExtensionRatio > 0.15) {
      complexityScore += 15;
    } else if (extensionRatio > 0.40) {
      complexityScore += 10; // Just basic 7ths
    }
    
    // Average chord duration (very fast changes = complex)
    const durations = [];
    for (let i = 0; i < timeline.length - 1; i++) {
      durations.push(timeline[i + 1].t - timeline[i].t);
    }
    const avgDuration = durations.length ? 
      durations.reduce((a, b) => a + b, 0) / durations.length : 2.0;
    
    if (avgDuration < 0.8) {
      complexityScore += 15; // Very fast = complex
    } else if (avgDuration < 1.5) {
      complexityScore += 5;
    }
    
    // Determine profile based on score
    let suggestedProfile;
    if (complexityScore < 30) {
      suggestedProfile = 'safe';    // Diatonic + acceptable borrowed (Hallelujah!)
    } else if (complexityScore < 65) {
      suggestedProfile = 'balanced'; // Some chromatic/secondary dominants
    } else {
      suggestedProfile = 'rich';     // Complex harmony
    }
    
    console.log(`🎼 Song Complexity Analysis:`);
    console.log(`   In-scale: ${(inScaleRatio * 100).toFixed(0)}%`);
    console.log(`   Acceptable borrowed: ${(acceptableBorrowedRatio * 100).toFixed(0)}%`);
    console.log(`   True chromatic: ${(trueChromaticRatio * 100).toFixed(0)}%`);
    console.log(`   Secondary Dom: ${(secondaryDominantRatio * 100).toFixed(0)}%`);
    console.log(`   Extensions (all): ${(extensionRatio * 100).toFixed(0)}%`);
    console.log(`   Complex ext (maj7/sus/dim/aug): ${(complexExtensionRatio * 100).toFixed(0)}%`);
    console.log(`   Avg duration: ${avgDuration.toFixed(2)}s`);
    console.log(`   📊 Complexity Score: ${complexityScore.toFixed(0)}/100`);
    console.log(`   ✅ Auto-selected profile: ${suggestedProfile.toUpperCase()}`);
    
    return { 
      profile: suggestedProfile, 
      score: complexityScore,
      stats: {
        inScaleRatio,
        trueChromaticRatio,
        acceptableBorrowedRatio,
        secondaryDominantRatio,
        extensionRatio,
        complexExtensionRatio,
        avgDuration
      }
    };
  }

  parseOptions(options) {
    // v16.15: Profile system - safe/balanced/rich/auto
    const profile = options.profile || 'auto'; // Changed default to 'auto'
    
    // Profile presets
    const profiles = {
      safe: {
        allowBorrowed: false,
        allowSecondaryDominants: true,  // Only V/V (common)
        allowChromaticPassing: false,
        minChromaticDuration: 2.0,
        minChromaticConfidence: 95,
        extensionMode: 'minimal',
        bassMultiplier: 1.5
      },
      balanced: {
        allowBorrowed: true,            // bVII, bIII, iv
        allowSecondaryDominants: true,
        allowChromaticPassing: true,
        minChromaticDuration: 0.8,
        minChromaticConfidence: 90,
        extensionMode: 'standard',
        bassMultiplier: 1.2
      },
      rich: {
        allowBorrowed: true,
        allowSecondaryDominants: true,
        allowChromaticPassing: true,
        minChromaticDuration: 0.5,
        minChromaticConfidence: 80,
        extensionMode: 'full',
        bassMultiplier: 1.0
      },
      auto: {
        // Will be determined after initial detection
        allowBorrowed: true,
        allowSecondaryDominants: true,
        allowChromaticPassing: true,
        minChromaticDuration: 0.8,
        minChromaticConfidence: 90,
        extensionMode: 'standard',
        bassMultiplier: 1.2,
        autoDetect: true  // Flag for auto-detection
      }
    };
    
    const preset = profiles[profile] || profiles.auto;
    
    return {
      profile,
      ...preset,
      harmonyMode: options.harmonyMode || 'jazz',
      extensionSensitivity: options.extensionSensitivity || 1.0,
      progressCallback: options.progressCallback || null,
      // Manual overrides
      ...options
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
      chromatic: timeline.filter(e => e.chordType === 'chromatic').length,
      scaleDegrees: timeline.filter(e => e.chordType && e.chordType.startsWith('scale_degree')).length
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
