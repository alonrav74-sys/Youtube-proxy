/**
 * ChordEngine v16.43 - Conservative Filtering
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
    const timings = {};
    const t0 = this.now();

    console.log('🎵 ChordEngine v16.43 (Conservative - Fewer but Solid Chords)');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    const musicStart = this.findMusicStart(features);
    console.log(`✅ Music starts at ${musicStart.time.toFixed(2)}s`);

    const tonicResult = this.detectTonicHybrid(features, musicStart.frame);
    console.log(`✅ Tonic: ${this.NOTES_SHARP[tonicResult.root]} (${tonicResult.confidence}%) [${tonicResult.method}]`);

    // ❗ מודליות (מז'ור/מינור) נקבעת אך ורק לפי ה־3 מעל הטוניקה
    const modeResult = this.detectModeFromThird(features, tonicResult.root, musicStart.frame);

    let key = {
      root: tonicResult.root,
      minor: modeResult.isMinor,
      // הביטחון הכללי הוא המינימום בין ביטחון הטוניקה לביטחון המוד
      confidence: Math.min(tonicResult.confidence, modeResult.confidence) / 100
    };
    console.log(`✅ Mode: ${key.minor ? 'MINOR' : 'MAJOR'} (${modeResult.confidence}%) [third_only]`);

    // v16.43: Use HMM engine for PRIMARY timeline (better timing like v14.36)
    // Bass validates chord choices
    let timeline = this.buildChordsHMM(features, key, 0);
    console.log(`🎹 HMM engine: ${timeline.length} chords`);
    
    // Run Bass for validation
    const bassTimeline = this.buildChordsStableBass(features, key, 0, audio.bpm);
    console.log(`🎸 Bass engine: ${bassTimeline.length} chords`);
    
    // v16.43: Use Bass to validate HMM choices (but keep HMM timing!)
    timeline = this.validateHMMWithBass(timeline, bassTimeline, features, key);

    // v16.43: TONIC VALIDATION after timeline (section 6)
    const validatedKey = this.validateTonicFromChords(timeline, key, features);
    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      // Rebuild with new key
      timeline = this.buildChordsHMM(features, key, 0);
      const bassTimeline2 = this.buildChordsStableBass(features, key, 0, audio.bpm);
      timeline = this.validateHMMWithBass(timeline, bassTimeline2, features, key);
      console.log(`🔄 Rebuilt with validated key: ${timeline.length} chords`);
    }

    timeline = this.validateWithCircleOfFifths(timeline, key, features);
    timeline = this.applyLightHMM(timeline, key);
    
    // v16.43: Enhanced slash chord detection (section 6)
    timeline = this.addSlashChordsEnhanced(timeline, features, key);
    
    timeline = this.addExtensions(timeline, features, key, opts);
    timeline = this.finalizeTimeline(timeline, audio.bpm, features, key);

    // v16.43: AUTOMATIC STYLE PROFILE DETECTION
    const stats = this.buildStats(timeline, key);
    const styleProfile = this.detectStyleProfile(stats, audio, key);
    
    // Apply style-specific processing
    if (styleProfile.mode === 'easy_pop') {
      // מצב סופר שמרני – פופ/רוק פשוט
      timeline = this.enforceEasyDiatonic(timeline, key);
      timeline = this.smoothOutliers(timeline, key, this.getDiatonicInfo(key));
    } else if (styleProfile.mode === 'colorful_pop') {
      // פופ עם צבעים - פחות אגרסיבי, משאיר borrowed
      timeline = this.smoothOutliers(timeline, key, this.getDiatonicInfo(key));
      // לא מכפים diatonic, משאירים borrowed/secondary dominants
    } else {
      // jazz_like - מורכב, לא מסננים כרומטיים
      console.log(`🎷 Jazz mode: keeping chromatic chords`);
      // לא מריצים enforceEasyDiatonic או smoothOutliers
    }
    
    // v16.43: Pattern memory V2 (section 6 - fixes anomalies in repeated patterns)
    timeline = this.applyPatternMemoryV2(timeline, key);

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
      styleProfile,  // v16.43: easy_pop / colorful_pop / jazz_like
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
    
    // v16.43: Clean signal before processing
    const cleaned = this.cleanSignal(mono, sr0);
    const x = this.resample(cleaned, sr0, sr);
    const bpm = this.estimateTempo(x, sr);

    return { x, sr, bpm, duration: x.length / sr };
  }

  // v16.43: Clean signal - pre-emphasis + noise gate + smoothing
  cleanSignal(x, sr) {
    const out = new Float32Array(x.length);

    // 1. Pre-emphasis (הדגשת תדרים גבוהים)
    let prev = 0;
    for (let i = 0; i < x.length; i++) {
      const y = x[i] - 0.97 * prev;
      prev = x[i];
      out[i] = y;
    }

    // 2. Noise gate (מסנן רעש חלש)
    const threshold = 1e-4;
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(out[i]) < threshold) out[i] = 0;
    }

    // 3. החלקה קלה (מסיר ספייקים)
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

      // v16.43: Improved chroma with harmonic weighting
      const chromaFrame = new Float32Array(12);
      for (let bin = 1; bin < mags.length; bin++) {
        const freq = bin * sr / N;
        if (freq < 80 || freq > 5000) continue;
        
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = this.toPc(Math.round(midi));
        
        // v16.43: Weight by harmonic clarity
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

    // v16.43: Compute spectral flux for chord change detection
    const flux = this.computeSpectralFlux(chroma);
    const sortedFlux = [...flux].sort((a, b) => a - b);
    const fluxP80 = sortedFlux[Math.floor(0.80 * (sortedFlux.length - 1))] || 0;

    // v16.43: Bass histogram for debug
    const bassHist = new Array(12).fill(0);
    for (const b of bass) {
      if (b >= 0) bassHist[b]++;
    }

    return {
      chroma, bass, bassRaw, energy, globalChroma,
      flux, fluxP80, bassHist, // v16.43: Added bassHist
      hop, sr, numFrames: chroma.length,
      secPerFrame: hop / sr,
      energyP30: percentile(30),
      energyP50: percentile(50),
      energyP70: percentile(70),
      energyP80: percentile(80)
    };
  }

  // v16.43: Spectral flux - detects changes in chroma
  computeSpectralFlux(chroma) {
    const flux = new Float32Array(chroma.length);
    for (let i = 1; i < chroma.length; i++) {
      let sum = 0;
      const prev = chroma[i - 1];
      const curr = chroma[i];
      for (let p = 0; p < 12; p++) {
        const diff = curr[p] - prev[p];
        if (diff > 0) sum += diff; // רק עליות (onset detection)
      }
      flux[i] = sum;
    }
    return flux;
  }

  // v16.43: Beat grid based on BPM
  getBeatGrid(duration, bpm) {
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const beats = [];
    for (let t = 0; t < duration; t += spb) {
      beats.push(t);
    }
    return beats;
  }

  // v16.43: Find candidate frames for chord changes
  getChordChangeCandidates(features, bpm, startFrame = 0) {
    const { secPerFrame, bass, flux, fluxP80, numFrames } = features;
    const beats = this.getBeatGrid(numFrames * secPerFrame, bpm);
    const beatFrames = beats.map(t => Math.round(t / secPerFrame));
    const candidates = new Set();

    // Always include start
    candidates.add(startFrame);

    for (const bf of beatFrames) {
      for (let off = -1; off <= 1; off++) {
        const i = bf + off;
        if (i <= startFrame || i >= numFrames) continue;

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
    // v16.43: Restored from v14.36 - autocorrelation method that works!
    const fmin = 40;
    const fmax = 250;
    const win = N;
    const yLP = new Float32Array(win);

    // Low-pass filter: sum all bass frequencies into one signal
    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < win; n++) {
          yLP[n] += mags[b] * Math.cos(omega * n);
        }
      }
    }

    // Autocorrelation to find F0
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

  // v16.43: Improved - also detect clear pitch without bass (guitar/piano intros)
  findMusicStart(features) {
    const { energy, bass, chroma, secPerFrame, energyP50 } = features;
    
    let musicFrame = 0;
    let stableCount = 0;
    
    for (let i = 0; i < energy.length; i++) {
      const isHighEnergy = energy[i] >= energyP50 * 0.7;
      const hasBass = bass[i] >= 0;
      
      // v16.43: Check for clear musical pitch in chroma (for guitar/piano intros)
      let hasClearPitch = false;
      if (chroma && chroma[i]) {
        const c = chroma[i];
        let maxVal = 0, sum = 0;
        for (let p = 0; p < 12; p++) {
          maxVal = Math.max(maxVal, c[p]);
          sum += c[p];
        }
        hasClearPitch = sum > 0 && maxVal > (sum / 12) * 2.0;
      }
      
      // Accept bass OR clear pitch (not just bass)
      if (isHighEnergy && (hasBass || hasClearPitch)) {
        stableCount++;
        if (stableCount >= 2) {
          musicFrame = Math.max(0, i - 1);
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
  // v16.43: SONG PROFILE ANALYSIS (Dynamic thresholds) - section 6
  // ═══════════════════════════════════════════════════════════

  analyzeSongProfile(features) {
    const { chroma, energy, energyP70 } = features;
    
    let totalVariance = 0;
    let count = 0;
    
    for (let i = 1; i < chroma.length; i++) {
      if (energy[i] < energyP70 * 0.3) continue;
      
      let frameVariance = 0;
      for (let p = 0; p < 12; p++) {
        frameVariance += Math.abs(chroma[i][p] - chroma[i-1][p]);
      }
      totalVariance += frameVariance;
      count++;
    }
    
    const chromaVariance = count > 0 ? totalVariance / count : 0.5;
    
    let sustainFrames = 0;
    let totalFrames = 0;
    
    for (let i = 1; i < energy.length - 1; i++) {
      if (energy[i] >= energyP70 * 0.5) {
        totalFrames++;
        const prevRatio = energy[i] / (energy[i-1] || 1);
        if (prevRatio > 0.8 && prevRatio < 1.2) {
          sustainFrames++;
        }
      }
    }
    
    const sustainLevel = totalFrames > 0 ? sustainFrames / totalFrames : 0.5;
    
    return {
      chromaVariance,
      sustainLevel,
      chromaChangeThreshold: 0.25 + chromaVariance * 0.3,
      matchScoreThreshold: sustainLevel > 0.6 ? 0.12 : 0.18,
      minDurationMultiplier: sustainLevel > 0.5 ? 1.3 : 1.0
    };
  }

  // ═══════════════════════════════════════════════════════════
  // v16.43: TONIC VALIDATION FROM CHORDS - section 6
  // ═══════════════════════════════════════════════════════════

  validateTonicFromChords(timeline, initialKey, features) {
    if (!timeline || timeline.length < 4) return initialKey;

    const rootCounts = new Array(12).fill(0);
    const rootDurations = new Array(12).fill(0);

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev || ev.root == null) continue;

      const next = timeline[i + 1];
      const dur = next ? (next.t - ev.t) : 1.0;

      rootCounts[ev.root]++;
      rootDurations[ev.root] += dur;
    }

    const cadenceTargets = new Array(12).fill(0);

    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      if (!curr || !next || curr.root == null || next.root == null) continue;

      const interval = this.toPc(next.root - curr.root);

      if (interval === 5) cadenceTargets[next.root] += 15; // IV–I
      if (interval === 7) cadenceTargets[next.root] += 10; // V–I

      if (i < timeline.length - 2) {
        const third = timeline[i + 2];
        if (third && third.root != null) {
          const int1 = this.toPc(next.root - curr.root);
          const int2 = this.toPc(third.root - next.root);
          
          // ii-V-I
          if (int1 === 5 && int2 === 5) {
            cadenceTargets[third.root] += 20;
          }
          
          // IV-V-I (F-G-C) - קאדנס קלאסי מאוד חשוב!
          // curr=IV, next=V, third=I → intervals: curr→next=2 (F→G), next→third=5 (G→C)
          if (int1 === 2 && int2 === 5) {
            cadenceTargets[third.root] += 25; // משקל גבוה מאוד!
            console.log(`🎯 IV-V-I in timeline: ${this.NOTES_SHARP[curr.root]}-${this.NOTES_SHARP[next.root]}-${this.NOTES_SHARP[third.root]} → tonic ${this.NOTES_SHARP[third.root]}`);
          }
        }
      }
    }

    const openingRoot = timeline[0]?.root;
    const closingRoot = timeline[timeline.length - 1]?.root;

    // שורש דומיננטי לפי משך
    let dominantRoot = 0;
    let dominantDur = -1;
    for (let r = 0; r < 12; r++) {
      if (rootDurations[r] > dominantDur) {
        dominantDur = rootDurations[r];
        dominantRoot = r;
      }
    }

    const candidates = [];

    for (let tonic = 0; tonic < 12; tonic++) {
      for (const isMinor of [false, true]) {
        const scale = isMinor ? this.MINOR_SCALE : this.MAJOR_SCALE;
        const diatonicPcs = scale.map(s => this.toPc(tonic + s));

        let fittingChords = 0;
        for (const ev of timeline) {
          if (ev && ev.root != null && diatonicPcs.includes(ev.root)) {
            fittingChords++;
          }
        }

        const fitRatio = fittingChords / timeline.length;
        if (fitRatio < 0.65) continue; // מועמדים חלשים – נזרקים

        let score = 0;
        score += rootDurations[tonic] * 5;
        score += rootCounts[tonic] * 3;
        score += cadenceTargets[tonic];

        if (openingRoot === tonic) score += 40;        // ⚡ אקורד ראשון
        if (closingRoot === tonic) score += 25;
        if (dominantRoot === tonic) score += 30;       // השורש ש*הכי* הרבה זמן

        candidates.push({ root: tonic, minor: isMinor, score, fitRatio });
      }
    }

    if (!candidates.length) return initialKey;

    candidates.sort((a, b) => b.score - a.score);
    let best = candidates[0];

    const initialCandidate = candidates.find(
      c => c.root === initialKey.root && c.minor === initialKey.minor
    );
    const initialScore = initialCandidate ? initialCandidate.score : 0;

    // ⛔ הגנה: לא עוברים בקלות מטוניקה ל-IV בשיר מז'ורי פשוט
    const isIVofInitial = this.toPc(best.root - initialKey.root) === 5;
    if (isIVofInitial && !initialKey.minor) {
      const scoreGain = best.score - initialScore;

      // אם האקורד הראשון הוא הטוניקה המקורית – אנחנו *מאוד* שמרנים
      if (openingRoot === initialKey.root) {
        if (scoreGain < 40 || best.fitRatio < 0.90) {
          console.log(
            `⛔ Prevented tonic shift I→IV: keeping ${this.NOTES_SHARP[initialKey.root]} instead of ${this.NOTES_SHARP[best.root]}`
          );
          return initialKey;
        }
      } else {
        // בלי עוגן חזק באקורד הראשון – עדיין צריך יתרון ברור
        if (scoreGain < 25 || best.fitRatio < 0.85) {
          console.log(
            `⛔ Weak IV candidate as tonic – keeping ${this.NOTES_SHARP[initialKey.root]}`
          );
          return initialKey;
        }
      }
    }

    // 🔁 במקרה שהאקורד הראשון הוא כמעט הכי חזק – מעדיפים אותו
    if (openingRoot != null) {
      const openingCandidate = candidates.find(c => c.root === openingRoot);
      if (openingCandidate && openingCandidate.score >= best.score - 10) {
        best = openingCandidate;
      }
    }

    // אם המועמד החדש לא הרבה יותר טוב – נשארים עם המפתח המקורי
    if (best.root === initialKey.root && best.minor === initialKey.minor) {
      return initialKey;
    }

    if (best.score <= initialScore + 15) {
      return initialKey;
    }

    console.log(
      `🔄 Tonic revalidated: ${this.NOTES_SHARP[initialKey.root]}${initialKey.minor ? 'm' : ''} ` +
      `→ ${this.NOTES_SHARP[best.root]}${best.minor ? 'm' : ''}`
    );

    return {
      root: best.root,
      minor: best.minor,
      confidence: Math.min(0.95, (initialKey.confidence || 0.7) + 0.1)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // v16.43: BETTER SLASH CHORD DETECTION - section 6
  // ═══════════════════════════════════════════════════════════

  addSlashChordsEnhanced(timeline, features, key) {
    const { bass, chroma } = features;
    const diatonic = this.getDiatonicInfo(key);
    
    return timeline.map(ev => {
      if (!ev || !ev.label || ev.fi == null) return ev;
      if (ev.label.includes('/')) return ev;
      
      const bassNote = bass[ev.fi];
      if (bassNote < 0 || bassNote === ev.root) return ev;
      
      const isMinor = ev.type === 'minor';
      const third = this.toPc(ev.root + (isMinor ? 3 : 4));
      const fifth = this.toPc(ev.root + 7);
      
      if (bassNote === third || bassNote === fifth) {
        return { ...ev, label: ev.label + '/' + this.getNoteName(bassNote, key) };
      }
      
      for (const dc of diatonic.chords) {
        const dcFifth = this.toPc(dc.root + 7);
        if (bassNote === dcFifth && ev.root !== dc.root) {
          const c = chroma[ev.fi];
          const bassStrength = c ? c[bassNote] : 0;
          if (bassStrength > 0.15) {
            return { ...ev, label: ev.label + '/' + this.getNoteName(bassNote, key), slashType: 'secondary' };
          }
        }
      }
      
      if (!diatonic.pcs.includes(bassNote)) {
        const c = chroma[ev.fi];
        const bassStrength = c ? c[bassNote] : 0;
        if (bassStrength > 0.20) {
          return { ...ev, label: ev.label + '/' + this.getNoteName(bassNote, key), slashType: 'chromatic' };
        }
      }
      
      return ev;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // v16.43: IMPROVED PATTERN MEMORY (3+4 chord patterns) - section 6
  // ═══════════════════════════════════════════════════════════

  applyPatternMemoryV2(timeline, key) {
    if (timeline.length < 4) return timeline;

    const patternHist = new Map();
    const roots = timeline.map(ev => ev ? ev.root : -1);
    
    for (let i = 0; i <= roots.length - 3; i++) {
      if (roots[i] < 0 || roots[i+1] < 0 || roots[i+2] < 0) continue;
      const pattern = [roots[i], roots[i+1], roots[i+2]].join(',');
      patternHist.set(pattern, (patternHist.get(pattern) || 0) + 1);
    }
    
    for (let i = 0; i <= roots.length - 4; i++) {
      if (roots[i] < 0 || roots[i+1] < 0 || roots[i+2] < 0 || roots[i+3] < 0) continue;
      const pattern = [roots[i], roots[i+1], roots[i+2], roots[i+3]].join(',');
      patternHist.set(pattern, (patternHist.get(pattern) || 0) + 1);
    }

    const strongPatterns = [...patternHist.entries()]
      .filter(([p, count]) => count >= 3)
      .map(([p, count]) => ({ pattern: p.split(',').map(Number), count }))
      .sort((a, b) => b.count - a.count);

    if (!strongPatterns.length) return timeline;

    console.log(`🎼 Found ${strongPatterns.length} strong patterns`);

    const result = [...timeline];

    for (let i = 1; i < result.length - 2; i++) {
      const ev = result[i];
      if (!ev || !ev.label) continue;
      if ((ev.confidence || 0) >= 75) continue;

      for (const sp of strongPatterns) {
        const patLen = sp.pattern.length;
        if (i < patLen - 1) continue;

        const surrounding = [];
        for (let j = i - (patLen - 1); j <= i + 1 && j < result.length; j++) {
          if (j < 0) continue;
          surrounding.push(result[j]?.root ?? -1);
        }
        
        if (surrounding.length < patLen) continue;

        for (let offset = 0; offset <= surrounding.length - patLen; offset++) {
          const slice = surrounding.slice(offset, offset + patLen);
          let diffCount = 0;
          let diffIdx = -1;
          let expectedRoot = -1;
          
          for (let k = 0; k < patLen; k++) {
            if (slice[k] !== sp.pattern[k]) {
              diffCount++;
              diffIdx = offset + k;
              expectedRoot = sp.pattern[k];
            }
          }
          
          const currentIdxInSlice = i - (i - (patLen - 1)) - offset;
          if (diffCount === 1 && diffIdx === currentIdxInSlice + offset && expectedRoot >= 0) {
            const diatonic = this.getDiatonicInfo(key);
            if (diatonic.pcs.includes(expectedRoot)) {
              const dc = diatonic.chords.find(c => c.root === expectedRoot);
              const newLabel = this.getNoteName(expectedRoot, key) + (dc?.minor ? 'm' : '');
              console.log(`🔧 Pattern fix at ${i}: ${ev.label} → ${newLabel}`);
              result[i] = { ...ev, root: expectedRoot, label: newLabel, chordType: 'patternFix', type: dc?.minor ? 'minor' : 'major' };
              break;
            }
          }
        }
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // TONIC DETECTION
  // ═══════════════════════════════════════════════════════════
  
  detectTonicHybrid(features, startFrame) {
    // 🔬 v16.43: Capture all detection steps
    this._debugInfo = this._debugInfo || {};
    
    // 1. טוניקה מהבס
    const bassTonic = this.detectTonicFromBass(features, startFrame);

    // 2. KS מקומי
    const ksTonic = this.detectTonicKSFromFeatures(features, startFrame);

    // 3. אקורד ראשון חזק - הכי חשוב בפופ/רוק!
    const firstChord = this.getFirstStrongChord(features, startFrame);

    // 4. אקורד דומיננטי (הכי הרבה פריימים)
    const dominantChord = this.getDominantChordFromChroma(features, startFrame);

    // 🔬 v16.43: Save all sources + bass histogram
    this._debugInfo.bassTonic = { root: bassTonic.root, note: this.NOTES_SHARP[bassTonic.root], confidence: bassTonic.confidence };
    this._debugInfo.ksTonic = { root: ksTonic.root, note: this.NOTES_SHARP[ksTonic.root], confidence: ksTonic.confidence };
    this._debugInfo.firstChord = firstChord ? { root: firstChord.root, note: this.NOTES_SHARP[firstChord.root], isMinor: firstChord.isMinor, score: firstChord.score } : null;
    this._debugInfo.dominantChord = dominantChord ? { root: dominantChord.root, note: this.NOTES_SHARP[dominantChord.root], count: dominantChord.count } : null;
    
    // v16.43: Bass histogram - shows all bass notes detected
    if (features.bassHist) {
      this._debugInfo.bassHist = this.NOTES_SHARP.map((n, i) => ({ note: n, count: features.bassHist[i] }))
        .filter(x => x.count > 0)
        .sort((a, b) => b.count - a.count);
    }

    console.log(`  Bass says: ${this.NOTES_SHARP[bassTonic.root]} (${bassTonic.confidence}%)`);
    console.log(`  KS says:   ${this.NOTES_SHARP[ksTonic.root]} (${ksTonic.confidence}%)`);
    if (firstChord) {
      console.log(`  First chord: ${this.NOTES_SHARP[firstChord.root]}${firstChord.isMinor ? 'm' : ''} (score=${firstChord.score.toFixed(2)})`);
    }
    if (dominantChord) {
      console.log(`  Dominant chord: ${this.NOTES_SHARP[dominantChord.root]} (${dominantChord.count} frames)`);
    }

    // 🗳️ הצבעה בין כל המקורות
    const votes = new Array(12).fill(0);

    // 🔧 v16.43: הבס - משקל גבוה כשה-confidence גבוה מאוד!
    // Bass עם 90%+ confidence הוא מאוד אמין
    if (bassTonic.confidence >= 95) {
      votes[bassTonic.root] += 5; // Very high confidence = 5 votes
    } else if (bassTonic.confidence >= 85) {
      votes[bassTonic.root] += 4;
    } else if (bassTonic.confidence >= 75) {
      votes[bassTonic.root] += 3;
    } else {
      votes[bassTonic.root] += 2;
    }

    // KS
    votes[ksTonic.root] += (ksTonic.confidence >= 75 ? 2 : 1);

    // 🔧 v16.43: אקורד ראשון - פחות משקל אם הבס לא מסכים!
    // שירים רבים מתחילים ב-bVI או IV, לא בטוניקה
    if (firstChord && firstChord.score >= 0.25) {
      // If bass strongly disagrees, reduce first chord weight
      if (bassTonic.confidence >= 90 && bassTonic.root !== firstChord.root) {
        votes[firstChord.root] += 2; // Reduced from 3-4
        console.log(`  ⚠️ First chord conflicts with high-confidence bass - reducing weight`);
      } else {
        votes[firstChord.root] += (firstChord.score >= 0.45 ? 4 : 3);
      }
    }

    // אקורד דומיננטי
    if (dominantChord) {
      votes[dominantChord.root] += 2;
    }

    // 🔬 v16.43: Save votes
    this._debugInfo.votes = this.NOTES_SHARP.map((n, i) => ({ note: n, votes: votes[i] })).filter(v => v.votes > 0);

    // מציאת המנצח לפי הצבעות
    let bestRoot = 0;
    let bestVotes = -1;
    for (let i = 0; i < 12; i++) {
      if (votes[i] > bestVotes) {
        bestVotes = votes[i];
        bestRoot = i;
      }
    }

    // 🧱 הגנה מיוחדת מפני מלכודת I↔IV:
    // אם המנצח הוא IV מעל האקורד הראשון – מעדיפים את האקורד הראשון
    if (firstChord && bestRoot !== firstChord.root) {
      const interval = this.toPc(bestRoot - firstChord.root);
      const firstVotes = votes[firstChord.root] || 0;

      if (interval === 5) { // bestRoot = IV של האקורד הראשון
        if (firstVotes >= bestVotes - 1 || firstChord.score >= 0.35) {
          console.log(
            `  ⛔ IV/I trap detected – using FIRST CHORD ${this.NOTES_SHARP[firstChord.root]} as tonic instead of its IV (${this.NOTES_SHARP[bestRoot]})`
          );
          this._debugInfo.ivTrap = { detected: true, from: this.NOTES_SHARP[bestRoot], to: this.NOTES_SHARP[firstChord.root] };
          bestRoot = firstChord.root;
          bestVotes = Math.max(bestVotes, firstVotes + 1);
        }
      }
    }

    console.log(`  Votes: ${this.NOTES_SHARP.map((n, i) => votes[i] > 0 ? `${n}:${votes[i]}` : '').filter(x => x).join(', ')}`);
    console.log(`  Winner: ${this.NOTES_SHARP[bestRoot]} (${bestVotes} votes)`);

    // 🔬 v16.43: Save winner
    this._debugInfo.winner = { root: bestRoot, note: this.NOTES_SHARP[bestRoot], votes: bestVotes };

    // חישוב confidence לפי כמה מקורות מסכימים
    const agreers = [
      bassTonic.root === bestRoot,
      ksTonic.root === bestRoot,
      firstChord && firstChord.root === bestRoot,
      dominantChord && dominantChord.root === bestRoot
    ].filter(Boolean).length;

    let confidence = 50 + agreers * 12;
    if (firstChord && firstChord.root === bestRoot) confidence += 10;
    confidence = Math.min(98, Math.max(55, confidence));

    return {
      root: bestRoot,
      confidence: Math.round(confidence),
      method: `vote_${agreers}agree`,
      _debug: this._debugInfo // 🔬 Include debug info in result
    };
  }

  // מוצא את האקורד שמופיע הכי הרבה בכרומה
  getDominantChordFromChroma(features, startFrame) {
    const { chroma, energy, energyP70 } = features;
    const rootCounts = new Array(12).fill(0);

    for (let i = startFrame; i < chroma.length; i++) {
      if (energy[i] < energyP70 * 0.5) continue;
      
      // מוצא את השורש הדומיננטי בפריים
      let maxVal = 0, maxRoot = 0;
      for (let p = 0; p < 12; p++) {
        if (chroma[i][p] > maxVal) {
          maxVal = chroma[i][p];
          maxRoot = p;
        }
      }
      if (maxVal > 0.15) {
        rootCounts[maxRoot]++;
      }
    }

    let bestRoot = 0, bestCount = 0;
    for (let i = 0; i < 12; i++) {
      if (rootCounts[i] > bestCount) {
        bestCount = rootCounts[i];
        bestRoot = i;
      }
    }

    return bestCount > 10 ? { root: bestRoot, count: bestCount } : null;
  }

  getFirstStrongChord(features, startFrame) {
    const { chroma, bass, energy, energyP70, secPerFrame } = features;
    
    // 🔬 DEBUG: Show chroma of first frames
    this._debugInfo = this._debugInfo || {};
    this._debugInfo.firstFramesChroma = [];
    
    // בודקים יותר פריימים ועם threshold נמוך יותר
    let framesChecked = 0;
    const candidates = [];
    
    for (let i = startFrame; i < chroma.length && framesChecked < 20; i++) {
      if (energy[i] >= energyP70 * 0.4) {
        framesChecked++;
        
        // 🔬 DEBUG: Log first 5 frames chroma
        if (framesChecked <= 5) {
          const chromaStr = this.NOTES_SHARP.map((n, idx) => 
            `${n}:${chroma[i][idx].toFixed(2)}`
          ).join(' ');
          const timeStr = (i * secPerFrame).toFixed(2);
          console.log(`  Frame ${i} (${timeStr}s): bass=${bass[i]>=0?this.NOTES_SHARP[bass[i]]:'?'} | ${chromaStr}`);
          
          this._debugInfo.firstFramesChroma.push({
            frame: i,
            time: parseFloat(timeStr),
            bass: bass[i] >= 0 ? this.NOTES_SHARP[bass[i]] : null,
            chroma: Object.fromEntries(this.NOTES_SHARP.map((n, idx) => [n, chroma[i][idx]]))
          });
        }
        
        const triad = this.detectTriadFromChroma(chroma[i], bass[i]);
        if (triad && triad.score > 0.2) {
          candidates.push({ ...triad, frame: i });
          if (framesChecked <= 5) {
            console.log(`    → Detected: ${this.NOTES_SHARP[triad.root]}${triad.isMinor?'m':''} (score=${triad.score.toFixed(2)})`);
          }
        }
      }
    }
    
    if (candidates.length === 0) return null;
    
    // מחפשים את האקורד שחוזר הכי הרבה בפריימים הראשונים
    const rootCounts = new Array(12).fill(0);
    for (const c of candidates) {
      rootCounts[c.root]++;
    }
    
    let bestRoot = 0, bestCount = 0;
    for (let i = 0; i < 12; i++) {
      if (rootCounts[i] > bestCount) {
        bestCount = rootCounts[i];
        bestRoot = i;
      }
    }
    
    // מוצאים את האקורד הראשון עם השורש המנצח
    const winner = candidates.find(c => c.root === bestRoot);
    if (winner) {
      console.log(`  → First chord: ${this.NOTES_SHARP[winner.root]}${winner.isMinor ? 'm' : ''} (score: ${winner.score.toFixed(2)}, appeared ${bestCount}x)`);
      return winner;
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

  // KS מקומי: מחשב פרופיל כרומה רק מאזורי אנרגיה גבוהים אחרי תחילת המוזיקה
  detectTonicKSFromFeatures(features, startFrame) {
    const { chroma, energy, energyP70 } = features;
    const local = new Float32Array(12);
    let totalW = 0;

    for (let i = startFrame; i < chroma.length; i++) {
      // רק פריימים עם מספיק אנרגיה – למנוע בלבול מאינטרו שקט או דרופים
      if (energy[i] < energyP70 * 0.6) continue;

      const w = energy[i];
      const frame = chroma[i];

      for (let p = 0; p < 12; p++) {
        local[p] += frame[p] * w;
      }
      totalW += w;
    }

    if (totalW > 0) {
      for (let p = 0; p < 12; p++) {
        local[p] /= totalW;
      }
    }

    // משתמשים באותה פונקציה קיימת של KS, רק על הפרופיל המקומי
    return this.detectTonicKS(local);
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
        // V-I (G-C בסולם C)
        if (curr === this.toPc(tonic + 7) && next === tonic) scores[tonic] += 10;
        // IV-I (F-C בסולם C)
        if (curr === this.toPc(tonic + 5) && next === tonic) scores[tonic] += 8;
        // vii°-I
        if (curr === this.toPc(tonic + 11) && next === tonic) scores[tonic] += 7;
      }
      
      // בדיקת מהלכים של 3 אקורדים
      if (i < bassTimeline.length - 2) {
        const third = bassTimeline[i + 2].bass;
        for (let tonic = 0; tonic < 12; tonic++) {
          // ii-V-I (Dm-G-C בסולם C)
          if (curr === this.toPc(tonic + 2) && next === this.toPc(tonic + 7) && third === tonic) {
            scores[tonic] += 15;
          }
          // IV-V-I (F-G-C בסולם C) - קאדנס קלאסי!
          if (curr === this.toPc(tonic + 5) && next === this.toPc(tonic + 7) && third === tonic) {
            scores[tonic] += 20; // משקל גבוה מאוד!
            console.log(`  🎯 Found IV-V-I cadence → ${this.NOTES_SHARP[tonic]}`);
          }
          // I-IV-V (C-F-G) - מצביע שהראשון הוא I
          if (next === this.toPc(curr + 5) && third === this.toPc(curr + 7)) {
            scores[curr] += 12;
          }
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
  // 🎯 v16.43: STABLE BASS CHORD BUILDING with Beat-Aware Detection
  // ═══════════════════════════════════════════════════════════
  
  buildChordsStableBass(features, key, startFrame, bpm) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);
    
    // v16.43: MUCH STRICTER thresholds to avoid noise
    const MIN_DURATION_SEC = 1.0;  // Was 0.6 - now full second minimum
    const CHROMA_CHANGE_THRESHOLD = 0.45;  // Was 0.35 - need bigger change
    const MIN_CONFIDENCE = 50;  // Minimum confidence to accept chord
    
    let currentBass = -1;
    let currentStart = startFrame;
    let currentChroma = null;
    
    // v16.43: Get chord change candidate frames (beat-aligned + flux + bass changes)
    const changeFrames = this.getChordChangeCandidates(features, bpm, startFrame);
    console.log(`🎵 v16.43: ${changeFrames.length} chord change candidates (beat-aligned)`);
    
    for (const i of changeFrames) {
      if (i >= bass.length) continue;
      
      const bp = bass[i];
      const hasEnergy = energy[i] >= energyP70 * 0.3;
      
      if (!hasEnergy || bp < 0) continue;
      
      if (currentBass === -1) {
        // First chord
        currentBass = bp;
        currentStart = i;
        currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        continue;
      }
      
      // Check if we should commit the current chord
      if (bp !== currentBass) {
        const durationSec = (i - currentStart) * secPerFrame;
        
        let chromaChange = 1.0;
        if (currentChroma) {
          chromaChange = this.calculateChromaDistance(currentChroma, chroma[i]);
        }
        
        const shouldCommit = durationSec >= MIN_DURATION_SEC || chromaChange >= CHROMA_CHANGE_THRESHOLD;
        
        if (shouldCommit) {
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
          
          currentBass = bp;
          currentStart = i;
          currentChroma = this.avgChroma(chroma, i, Math.min(i + 3, chroma.length));
        }
        // Else: ignore transient change not on beat
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
    const candidates = [];
    const diatonic = this.getDiatonicInfo(key);
    
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
    
    // 🎯 NEW: Check if bass is M3 (major third) in major key
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
    
    const borrowed = this.getBorrowedChords(key);
    for (const bc of borrowed) {
      // v16.43: III major gets higher priority (very common in pop!)
      const isThirdMajor = (bc.from === 'III');
      const basePriority = isThirdMajor ? 88 : 65;
      const invPriority = isThirdMajor ? 82 : 60;
      
      if (bc.root === bassNote) {
        candidates.push({
          root: bc.root,
          isMinor: bc.minor,
          inversionBass: null,
          chordType: 'borrowed',
          borrowedFrom: bc.from,
          priority: basePriority
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
          priority: invPriority
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
      // v16.43: III major (E in C) - VERY common in pop! (Hallelujah, etc.)
      borrowed.push({ root: this.toPc(key.root + 4), minor: false, from: 'III' });   // E in C - HIGH PRIORITY
      borrowed.push({ root: this.toPc(key.root + 10), minor: false, from: 'bVII' }); // Bb in C
      borrowed.push({ root: this.toPc(key.root + 3), minor: false, from: 'bIII' });  // Eb in C
      borrowed.push({ root: this.toPc(key.root + 5), minor: true, from: 'iv' });     // Fm in C
      borrowed.push({ root: this.toPc(key.root + 8), minor: false, from: 'bVI' });   // Ab in C
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
      // v16.43: Chromatic fallback - only if VERY clear
      for (const isMinor of [false, true]) {
        const score = this.scoreChordCandidate(avg, bassNote, isMinor, bassNote, false);
        if (score > 60) { // v16.43: Higher threshold (was 40)
          // Check if this chromatic makes sense
          const isReasonable = this.isReasonableChromaticChord(bassNote, key, null);
          if (isReasonable || score > 80) { // Only if reasonable OR super strong
            candidates.push({
              root: bassNote,
              isMinor,
              inversionBass: null,
              chordType: 'chromatic',
              score: score - 30, // v16.43: Bigger penalty (was -20)
              priority: 20        // v16.43: Lower priority (was 30)
            });
          }
        }
      }
    }
    
    if (!candidates.length) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    if (best.score < 45 && durSec < 0.40) return null; // v16.43: Stricter threshold
    
    // v16.43: Enharmonic substitution for unlikely chromatics
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
    
    // v16.43: AUTO-CORRECT quality based on actual third (use finalRoot!)
    const m3 = avg[this.toPc(finalRoot + 3)];
    const M3 = avg[this.toPc(finalRoot + 4)];
    
    let finalIsMinor = best.isMinor;
    
    // v16.43: For III borrowed chord, FORCE major (E in C major is ALWAYS E major, not Em)
    // The chroma might show G stronger than G# because G is also in the scale
    if (best.chordType === 'borrowed' && best.borrowedFrom === 'III') {
      finalIsMinor = false;  // III is ALWAYS major
      console.log(`  🎵 Forcing III to major (${this.NOTES_SHARP[finalRoot]})`);
    } else if (m3 > M3 * 1.5) {
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
    
    // v16.43: AUTO-DETECT which third is actually present!
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
    else if (bassNote === actualThird) score += 10; // v16.43: Slightly lower for first inversion
    else if (bassNote === fifth) score += 8;        // v16.43: Slightly lower for second inversion
    
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

  // v16.43: Check if chromatic chord makes harmonic sense
  isReasonableChromaticChord(root, key, prevChord) {
    const tonicPc = key.root;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    
    // Common borrowed chords in MAJOR:
    if (!key.minor) {
      const bVII = this.toPc(tonicPc + 10); // Bb in C major (common!)
      const bIII = this.toPc(tonicPc + 3);  // Eb in C major (common!)
      const iv = this.toPc(tonicPc + 5);    // Fm in C major (minor iv, common!)
      
      // v16.43: REMOVED bVI (Ab/G#) - too rare and often confused with E
      
      if (root === bVII || root === bIII || root === iv) {
        return true; // Common modal borrowing
      }
    }
    
    // Common borrowed chords in MINOR:
    if (key.minor) {
      const V = this.toPc(tonicPc + 7);     // E in Am (raised leading tone)
      const VII = this.toPc(tonicPc + 11);  // G# in Am (leading tone)
      const IV = this.toPc(tonicPc + 5);    // D in Am (natural minor → harmonic)
      
      if (root === V || root === VII || root === IV) {
        return true; // Harmonic/melodic minor variations
      }
    }
    
    // Secondary dominants (V/X)
    // Example in C major: D7→G, A7→Dm, E7→Am
    const diatonicPcs = scale.map(s => this.toPc(tonicPc + s));
    
    for (const target of diatonicPcs) {
      const secondaryDominant = this.toPc(target + 7); // V of target
      if (root === secondaryDominant) {
        return true; // It's a secondary dominant!
      }
    }
    
    // Chromatic approach chords (passing)
    // Example: C → C# → Dm (chromatic passing)
    if (prevChord) {
      const prevRoot = prevChord.root;
      const distUp = this.toPc(root - prevRoot);
      const distDown = this.toPc(prevRoot - root);
      
      // Half-step approach from either direction
      if (distUp === 1 || distDown === 1) {
        return true; // Chromatic passing chord
      }
    }
    
    // If none of the above, it's probably noise
    return false;
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
      
      if (ev.chordType && !ev.chordType.startsWith('chromatic')) {
        validated.push(ev);
        continue;
      }
      
      const inScale = diatonic.pcs.includes(ev.root);
      
      if (inScale) {
        validated.push(ev);
        continue;
      }
      
      // v16.43: STRICT chromatic filtering
      // Non-diatonic chords must be:
      // 1. LONG (>0.8s) OR very confident (95+)
      // 2. Make harmonic sense (borrowed/secondary dominant)
      
      const isShort = dur > 0 && dur < 0.8;
      const isWeak = ev.confidence < 95;
      
      if (isShort && isWeak) {
        continue; // Skip short weak chromatic chords
      }
      
      // Check if it's a "reasonable" chromatic chord
      const isReasonable = this.isReasonableChromaticChord(ev.root, key, prev);
      
      if (!isReasonable) {
        // Unreasonable chromatic (like G# in C major)
        console.log(`⚠️ Unreasonable chromatic: ${this.NOTES_SHARP[ev.root]} in ${this.NOTES_SHARP[key.root]}${key.minor?'m':''} (dur=${dur.toFixed(2)}s, conf=${ev.confidence}%)`);
        if (dur < 1.5 || ev.confidence < 90) {
          console.log(`   → FILTERED (too short or weak)`);
          continue; // Skip unless VERY long AND confident
        } else {
          console.log(`   → KEPT (very long and confident)`);
        }
      }
      
      // If we got here, it's either reasonable OR super long/confident
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


  // v16.43: Use Bass to validate HMM timeline (HMM is primary for timing)
  validateHMMWithBass(hmmTimeline, bassTimeline, features, key) {
    if (!hmmTimeline.length) return bassTimeline;
    if (!bassTimeline.length) return hmmTimeline;
    
    const result = [];
    const diatonic = this.getDiatonicInfo(key);
    const borrowed = this.getAllowedBorrowedChords(key);
    
    for (const hmmChord of hmmTimeline) {
      // Find corresponding Bass chord at this time
      const bassChord = bassTimeline.find(b => 
        Math.abs(b.t - hmmChord.t) < 0.5 && b.root !== undefined
      );
      
      let finalChord = { ...hmmChord };
      
      if (bassChord && bassChord.root === hmmChord.root) {
        // Both agree - great!
        finalChord.consensus = 'agree';
      } else if (bassChord && bassChord.root !== hmmChord.root) {
        // Disagreement - check which makes more sense
        const hmmInScale = diatonic.pcs.includes(hmmChord.root);
        const bassInScale = diatonic.pcs.includes(bassChord.root);
        const bassBorrowed = borrowed.find(b => b.root === bassChord.root);
        
        // If Bass is diatonic/borrowed and HMM is chromatic, use Bass chord but keep HMM timing
        if ((bassInScale || bassBorrowed) && !hmmInScale) {
          console.log(`🔧 Bass corrects HMM: ${this.NOTES_SHARP[hmmChord.root]} → ${this.NOTES_SHARP[bassChord.root]} at ${hmmChord.t.toFixed(2)}s`);
          finalChord = {
            ...hmmChord,  // Keep HMM timing!
            root: bassChord.root,
            label: bassChord.label,
            type: bassChord.type,
            bassValidated: true
          };
        }
      }
      
      result.push(finalChord);
    }
    
    return result;
  }

  // Keep old functions for backwards compatibility
  validateBassWithHMM(bassTimeline, hmmTimeline, features, key) {
    return this.validateHMMWithBass(hmmTimeline, bassTimeline, features, key);
  }
  
  validateWithBass(hmmTimeline, bassTimeline, features, key) {
    return this.validateHMMWithBass(hmmTimeline, bassTimeline, features, key);
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
      
      // v16.43: Check all chord tones properly
      const r = avg[root];                            // 1 (root)
      const m3 = avg[this.toPc(root + 3)];           // m3
      const M3 = avg[this.toPc(root + 4)];           // M3
      const p4 = avg[this.toPc(root + 5)];           // 4th (sus4)
      const dim5 = avg[this.toPc(root + 6)];         // dim5 (b5)
      const p5 = avg[this.toPc(root + 7)];           // 5 (perfect fifth)
      const aug5 = avg[this.toPc(root + 8)];         // aug5 (#5)
      const M6 = avg[this.toPc(root + 9)];           // 6
      const b7 = avg[this.toPc(root + 10)];          // b7 (dominant)
      const M7 = avg[this.toPc(root + 11)];          // M7 (major)
      const M9 = avg[this.toPc(root + 2)];           // 9 (same as 2nd)
      
      let label = ev.label;
      
      // 1. Check for diminished (m3 + dim5)
      if (isMinor && dim5 > 0.12 && dim5 > p5 * 1.3) {
        label = label.replace(/m$/, 'dim');
      }
      
      // 2. Check for augmented (M3 + aug5)
      if (!isMinor && aug5 > 0.12 && aug5 > p5 * 1.3) {
        label = label.replace(/m?$/, 'aug');
      }
      
      // 3. Check for 7th chords - v16.43: More precise detection
      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        // Major 7th (Cmaj7) - need clear M7 without b7
        if (!isMinor && M7 > 0.10 && M7 > b7 * 1.5 && M3 > 0.08) {
          // v16.43: Also check that M7 is significant relative to root
          if (M7 > r * 0.15) {
            label = label.replace(/m$/, '') + 'maj7';
          }
        }
        // Dominant 7th (C7, G7) - only for major chords with clear b7
        else if (!isMinor && b7 > 0.10 && b7 > M7 * 1.2 && M3 > 0.08) {
          // v16.43: b7 must be prominent enough
          if (b7 > r * 0.12) {
            label += '7';
          }
        }
        // Minor 7th (Am7) - minor chord with clear b7
        else if (isMinor && b7 > 0.10 && b7 > M7 * 1.2 && m3 > 0.08) {
          if (b7 > r * 0.12) {
            label += '7';
          }
        }
      }
      
      // 4. Check for sus chords - v16.43: More precise
      if (!label.includes('7') && !label.includes('dim') && !label.includes('aug')) {
        const thirdPresent = M3 > 0.06 || m3 > 0.06;
        
        // sus4: 4th prominent AND no clear third
        if (p4 > 0.12 && !thirdPresent && p4 > M3 * 1.8 && p4 > m3 * 1.8) {
          label = label.split(/[m]/)[0] + 'sus4';
        }
        // sus2: 9th/2nd prominent AND no clear third
        else if (M9 > 0.12 && !thirdPresent && M9 > M3 * 1.8 && M9 > m3 * 1.8) {
          label = label.split(/[m]/)[0] + 'sus2';
        }
      }
      
      // 5. Add 6 if present (C6, Am6) - v16.43: Stricter to avoid melodic 6ths
      if (!label.includes('7') && !label.includes('6') && !label.includes('sus')) {
        // 6 must be strong AND consistent (not just melodic passing tone)
        if (M6 > 0.12 && M6 > b7 * 1.5 && M6 > M7 * 1.5) {
          // Also verify the 5th is present (proper 6 chord structure)
          if (p5 > 0.10) {
            label += '6';
          }
        }
      }
      
      return { ...ev, label };
    });
  }

  // v16.43: Enhanced filtering from v14.36 with KEY parameter
  finalizeTimeline(timeline, bpm, features, key) {
    if (!timeline.length) return [];
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDur = Math.max(0.5, 0.50 * spb);
    const energyMedian = this.percentile(features.energy, 50);

    const filtered = [];

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const next = timeline[i + 1];
      const dur = next ? (next.t - ev.t) : minDur;
      const energy = features.energy[ev.fi] || 0;
      const isWeak = energy < energyMedian * 0.85;

      // v16.43: Use KEY to determine if diatonic (not relying on ev.inScale)
      const r = ev.root != null ? ev.root : this.parseRoot(ev.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);

      // v14.36 style: aggressive filtering of short/weak chords
      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic)) continue;
      if (dur < minDur * 0.6 && isWeak) continue;

      filtered.push(ev);
    }

    // Snap to beat grid
    const snapped = [];
    for (const ev of filtered) {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const snapTol = 0.35 * spb;
      const t = (Math.abs(grid - raw) <= snapTol) ? grid : raw;
      
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ ...ev, t: Math.max(0, t) });
      }
    }

    return snapped;
  }

  // ═══════════════════════════════════════════════════════════
  // v16.43: ENFORCE EARLY DIATONIC (from v14.36)
  // Forces intro chords to be diatonic, prevents noise chords
  // ═══════════════════════════════════════════════════════════

  enforceEarlyDiatonic(timeline, key, features, bpm) {
    if (!timeline || !timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    
    // v14.36 style: More aggressive intro cleaning
    const earlyWindow = Math.max(15.0, 6 * spb);
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];

    const getQuality = (pc) => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === this.toPc(pc)) return qualities[i];
      }
      return '';
    };

    const snapToDiatonic = (pc) => {
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
      let newEv = { ...ev };
      
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        const inKey = r >= 0 && diatonicPcs.includes(this.toPc(r));
        
        if (!inKey && r >= 0) {
          const bp = features.bass[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r);
          
          // v14.36: FORCE TONIC for first ~3 seconds
          if (ev.t < Math.min(3.0, 2.0 * spb)) {
            newRoot = key.root;
            console.log(`🎯 Forcing tonic at ${ev.t.toFixed(2)}s`);
          }
          
          const q = getQuality(newRoot);
          label = this.NOTES_SHARP[this.toPc(newRoot)] + q;
          newEv.label = label;
          newEv.root = newRoot;
          newEv.forcedDiatonic = true;
        }
      }
      
      out.push(newEv);
    }

    return out;
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

  // v16.43: Check if pitch class is in key (from v14.36)
  inKey(pc, keyRoot, minor) {
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(iv => this.toPc(keyRoot + iv));
    return diatonic.includes(this.toPc(pc));
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

  // v16.43: Detect if song is "easy rock" (mostly diatonic)
  isEasyRockSong(stats, key) {
    const total = stats.totalChords || 1;
    const inScaleRatio = stats.inScale / total;
    const chromaticRatio = stats.chromatic / total;
    const borrowedRatio = stats.borrowed / total;

    // Conditions for "easy" pop/rock song
    return (
      inScaleRatio >= 0.75 &&
      chromaticRatio <= 0.12 &&
      borrowedRatio <= 0.18
    );
  }

  // ═══════════════════════════════════════════════════════════
  // v16.43: AUTOMATIC STYLE PROFILE DETECTION
  // Detects: easy_pop / colorful_pop / jazz_like
  // ═══════════════════════════════════════════════════════════

  detectStyleProfile(stats, audio, key) {
    const total = stats.totalChords || 1;
    const diatonicRatio   = stats.inScale / total;
    const chromaticRatio  = stats.chromatic / total;
    const borrowedRatio   = stats.borrowed / total;
    const extRatio        = stats.extensions / total;

    // צפיפות הרמונית - כמה אקורדים לבר
    const secondsPerBeat = 60 / Math.max(60, Math.min(200, audio.bpm || 120));
    const bars = Math.max(1, audio.duration / (secondsPerBeat * 4));
    const chordsPerBar = total / bars;

    console.log(`🎨 Style analysis: diatonic=${(diatonicRatio*100).toFixed(0)}%, chromatic=${(chromaticRatio*100).toFixed(0)}%, borrowed=${(borrowedRatio*100).toFixed(0)}%, ext=${(extRatio*100).toFixed(0)}%, chords/bar=${chordsPerBar.toFixed(1)}`);

    // 1) שיר קל – פופ/רוק מאוד דיאטוני
    if (
      diatonicRatio >= 0.80 &&
      chromaticRatio <= 0.10 &&
      borrowedRatio  <= 0.18 &&
      extRatio       <= 0.25 &&
      chordsPerBar   <= 2.2
    ) {
      console.log(`🎸 Style: EASY_POP (simple diatonic)`);
      return { mode: 'easy_pop', confidence: 0.9 };
    }

    // 2) שיר צבעוני – פופ עם צבעים / רוק מתקדם קל
    if (
      diatonicRatio >= 0.60 &&
      chromaticRatio <= 0.30 &&
      chordsPerBar   <= 3.5
    ) {
      console.log(`🎹 Style: COLORFUL_POP (some borrowed/chromatic)`);
      return { mode: 'colorful_pop', confidence: 0.8 };
    }

    // 3) מורכב / ג'אזי / הרמוניה כבדה
    console.log(`🎷 Style: JAZZ_LIKE (complex harmony)`);
    return { mode: 'jazz_like', confidence: 0.8 };
  }

  // v16.43: Force non-diatonic chords to nearest diatonic
  enforceEasyDiatonic(timeline, key) {
    const diatonic = this.getDiatonicInfo(key);
    const diatonicRoots = new Set(diatonic.pcs);

    return timeline.map(ev => {
      if (diatonicRoots.has(ev.root)) return ev;

      // Find nearest diatonic root
      let best = ev.root;
      let bestDist = 12;
      for (const pc of diatonicRoots) {
        const d1 = this.toPc(pc - ev.root);
        const d2 = this.toPc(ev.root - pc);
        const dist = Math.min(d1, d2);
        if (dist < bestDist) {
          bestDist = dist;
          best = pc;
        }
      }

      // Only substitute if very close (1 semitone)
      if (bestDist <= 1) {
        const noteName = this.getNoteName(best, key);
        const isMinor = ev.type === 'minor';
        const baseLabel = noteName + (isMinor ? 'm' : '');
        const label = ev.label.includes('/')
          ? baseLabel + ev.label.substring(ev.label.indexOf('/'))
          : baseLabel;

        console.log(`  🎯 Forced: ${ev.label} → ${label}`);
        return {
          ...ev,
          root: best,
          label,
          inScale: true,
          chordType: 'diatonic_forced'
        };
      }

      return ev;
    });
  }

  // v16.43: Remove isolated chromatic chords between identical neighbors
  smoothOutliers(timeline, key, diatonic) {
    if (timeline.length < 3) return timeline;
    const result = [...timeline];
    const diatonicRoots = new Set(diatonic.pcs);

    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const next = result[i + 1];

      const sameNeighbors = prev.label === next.label;
      const currInScale = diatonicRoots.has(curr.root);
      const neighborConf = Math.min(prev.confidence || 0, next.confidence || 0);

      // If neighbors are same chord, current is chromatic, and current is weaker
      if (
        sameNeighbors &&
        !currInScale &&
        (curr.confidence || 0) + 10 < neighborConf
      ) {
        console.log(`  🧹 Smoothed: ${curr.label} → ${prev.label} (isolated chromatic)`);
        result[i] = {
          ...prev,
          t: curr.t,
          fi: curr.fi,
          chordType: (prev.chordType || '') + '_smoothed'
        };
      }
    }

    return result;
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

  // ═══════════════════════════════════════════════════════════
  // v16.43: HMM ENGINE (parallel to Bass engine)
  // ═══════════════════════════════════════════════════════════
  
  buildChordsHMM(features, key, startFrame) {
    const { chroma, bass, energy, energyP70, secPerFrame } = features;
    const diatonic = this.getDiatonicInfo(key);
    
    // Build diatonic candidates
    const candidates = [];
    for (const dc of diatonic.chords) {
      const name = this.getNoteName(dc.root, key);
      candidates.push({
        root: dc.root,
        label: name + (dc.minor ? 'm' : ''),
        minor: dc.minor,
        intervals: dc.minor ? [0, 3, 7] : [0, 4, 7]
      });
    }
    
    // Add V major in minor key
    if (key.minor) {
      const V = this.toPc(key.root + 7);
      if (!candidates.find(c => c.root === V && !c.minor)) {
        candidates.push({ root: V, label: this.getNoteName(V, key), minor: false, intervals: [0, 4, 7], borrowed: true });
      }
    }
    
    const N = candidates.length;
    const M = chroma.length;
    if (N === 0 || M <= startFrame) return [];
    
    // Calculate emit scores for each frame/candidate
    const emitScores = [];
    for (let i = 0; i < M; i++) {
      const frameScores = [];
      for (let c = 0; c < N; c++) {
        frameScores.push(this.calcEmitScore(chroma[i], bass[i], energy[i], energyP70, candidates[c]));
      }
      emitScores.push(frameScores);
    }
    
    // Viterbi
    const dp = new Array(N).fill(-Infinity);
    const back = Array.from({ length: M }, () => new Array(N).fill(-1));
    
    // Init
    for (let c = 0; c < N; c++) {
      dp[c] = emitScores[startFrame][c];
    }
    
    // Forward
    for (let i = startFrame + 1; i < M; i++) {
      const newDp = new Array(N).fill(-Infinity);
      for (let c = 0; c < N; c++) {
        for (let prev = 0; prev < N; prev++) {
          const trans = this.transitionScore(candidates[prev], candidates[c], key);
          const val = dp[prev] + trans + emitScores[i][c];
          if (val > newDp[c]) {
            newDp[c] = val;
            back[i][c] = prev;
          }
        }
      }
      for (let c = 0; c < N; c++) dp[c] = newDp[c];
    }
    
    // Backtrack
    let best = 0;
    for (let c = 1; c < N; c++) {
      if (dp[c] > dp[best]) best = c;
    }
    
    const path = new Array(M).fill(0);
    path[M - 1] = best;
    for (let i = M - 1; i > startFrame; i--) {
      path[i - 1] = back[i][path[i]] >= 0 ? back[i][path[i]] : path[i];
    }
    
    // Convert to timeline
    const timeline = [];
    let cur = path[startFrame];
    let start = startFrame;
    
    for (let i = startFrame + 1; i < M; i++) {
      if (path[i] !== cur) {
        const cand = candidates[cur];
        timeline.push({
          t: start * secPerFrame,
          fi: start,
          label: cand.label,
          root: cand.root,
          type: cand.minor ? 'minor' : 'major',
          bassNote: bass[start] >= 0 ? bass[start] : cand.root, // v16.43: Add bass
          inScale: true,
          confidence: 75,
          chordType: 'hmm',
          engine: 'hmm'
        });
        cur = path[i];
        start = i;
      }
    }
    
    // Final
    const cand = candidates[cur];
    timeline.push({
      t: start * secPerFrame,
      fi: start,
      label: cand.label,
      root: cand.root,
      type: cand.minor ? 'minor' : 'major',
      bassNote: bass[start] >= 0 ? bass[start] : cand.root, // v16.43: Add bass
      inScale: true,
      confidence: 75,
      chordType: 'hmm',
      engine: 'hmm'
    });
    
    return timeline;
  }
  
  calcEmitScore(frame, bassNote, energy, energyP70, candidate) {
    if (!frame) return -10;
    
    let score = 0;
    
    // Chord template match
    for (const iv of candidate.intervals) {
      score += (frame[this.toPc(candidate.root + iv)] || 0) * 10;
    }
    
    // Normalize score
    const templateSize = candidate.intervals.length || 3;
    score = score / templateSize;
    
    // v16.43: Softer threshold - don't reject, just penalize
    if (score < 0.2) score -= 1.0;
    else if (score < 0.35) score -= 0.5;
    
    // Bass match bonus
    if (bassNote >= 0 && bassNote === candidate.root) score += 0.5;
    
    // v16.43: Softer energy penalty
    if (energy < energyP70 * 0.2) score -= 1.0;
    else if (energy < energyP70 * 0.4) score -= 0.3;
    
    // Bonus for diatonic
    if (!candidate.borrowed) score += 0.2;
    
    return score;
  }
  
  transitionScore(from, to, key) {
    if (from.root === to.root && from.minor === to.minor) return 0.5; // Stay bonus
    
    // Circle of fifths
    const interval = this.toPc(to.root - from.root);
    if (interval === 7 || interval === 5) return 0.3; // V-I or IV-I
    if (interval === 2 || interval === 10) return 0.1; // Step
    
    return -0.2; // Other transitions
  }

  // ═══════════════════════════════════════════════════════════
  // v16.43: MERGE ENGINES - Compare and choose best
  // ═══════════════════════════════════════════════════════════
  
  mergeEngines(bassTimeline, hmmTimeline, features, key) {
    if (!bassTimeline.length) return hmmTimeline;
    if (!hmmTimeline.length) return bassTimeline;
    
    const { secPerFrame, chroma } = features;
    const diatonic = this.getDiatonicInfo(key);
    const borrowed = this.getAllowedBorrowedChords(key);
    const merged = [];
    
    // Create unified time grid
    const allTimes = new Set();
    bassTimeline.forEach(ev => allTimes.add(Math.round(ev.t * 10) / 10));
    hmmTimeline.forEach(ev => allTimes.add(Math.round(ev.t * 10) / 10));
    const times = [...allTimes].sort((a, b) => a - b);
    
    for (const t of times) {
      // Find active chord from each engine at time t
      const bassChord = this.findActiveChord(bassTimeline, t);
      const hmmChord = this.findActiveChord(hmmTimeline, t);
      
      let chosen = null;
      
      if (bassChord && hmmChord) {
        if (bassChord.root === hmmChord.root) {
          // 🎯 AGREEMENT! Both engines agree on this root
          const isInScale = diatonic.pcs.includes(bassChord.root);
          const borrowedInfo = borrowed.find(b => b.root === bassChord.root);
          
          if (isInScale) {
            chosen = { ...bassChord, consensus: 'agree_diatonic' };
          } else if (borrowedInfo) {
            // Semi-diatonic (III major, iv minor, etc.) - ALLOW IT!
            console.log(`🎵 Borrowed ${borrowedInfo.name} confirmed by both engines`);
            chosen = { 
              ...bassChord, 
              consensus: 'agree_borrowed',
              chordType: 'borrowed',
              borrowedName: borrowedInfo.name
            };
          } else {
            // Both agree on chromatic - allow with note
            console.log(`⚠️ Chromatic ${this.NOTES_SHARP[bassChord.root]} agreed by both`);
            chosen = { ...bassChord, consensus: 'agree_chromatic' };
          }
        } else {
          // DISAGREEMENT - prefer diatonic, then borrowed, then confidence
          const bassInScale = diatonic.pcs.includes(bassChord.root);
          const hmmInScale = diatonic.pcs.includes(hmmChord.root);
          const bassBorrowed = borrowed.find(b => b.root === bassChord.root);
          const hmmBorrowed = borrowed.find(b => b.root === hmmChord.root);
          
          if (bassInScale && !hmmInScale) {
            chosen = { ...bassChord, consensus: 'bass_diatonic' };
          } else if (hmmInScale && !bassInScale) {
            chosen = { ...hmmChord, consensus: 'hmm_diatonic' };
          } else if (bassBorrowed && !hmmBorrowed) {
            chosen = { ...bassChord, consensus: 'bass_borrowed' };
          } else if (hmmBorrowed && !bassBorrowed) {
            chosen = { ...hmmChord, consensus: 'hmm_borrowed' };
          } else {
            // Both same category - use confidence
            const bassConf = bassChord.confidence || 70;
            const hmmConf = hmmChord.confidence || 70;
            chosen = bassConf >= hmmConf 
              ? { ...bassChord, consensus: 'bass_conf' }
              : { ...hmmChord, consensus: 'hmm_conf' };
          }
        }
      } else {
        chosen = bassChord || hmmChord;
        if (chosen) chosen.consensus = bassChord ? 'bass_only' : 'hmm_only';
      }
      
      // Add if different from last
      if (chosen && (!merged.length || merged[merged.length - 1].label !== chosen.label)) {
        merged.push({ ...chosen, t });
      }
    }
    
    return merged;
  }
  
  findActiveChord(timeline, t) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].t <= t + 0.05) return timeline[i];
    }
    return null;
  }
  
  // "Semi-diatonic" chords - allowed when both engines agree
  getAllowedBorrowedChords(key) {
    const borrowed = [];
    
    if (key.minor) {
      // In minor key:
      // III major - relative major chord, VERY common (e.g., G in Em)
      borrowed.push({ root: this.toPc(key.root + 3), name: 'III', type: 'major' });
      // VII major - subtonic (e.g., D in Em)
      borrowed.push({ root: this.toPc(key.root + 10), name: 'VII', type: 'major' });
      // V major - harmonic minor dominant (e.g., B in Em)
      borrowed.push({ root: this.toPc(key.root + 7), name: 'V', type: 'major' });
      // IV major - borrowed from parallel major
      borrowed.push({ root: this.toPc(key.root + 5), name: 'IV', type: 'major' });
      // I major - Picardy third
      borrowed.push({ root: key.root, name: 'I', type: 'major' });
    } else {
      // In major key:
      // III major - instead of iii minor (e.g., E in C instead of Em)
      borrowed.push({ root: this.toPc(key.root + 4), name: 'III', type: 'major' });
      // bVII major - very common in rock/pop (e.g., Bb in C)
      borrowed.push({ root: this.toPc(key.root + 10), name: 'bVII', type: 'major' });
      // bVI major - dramatic sound (e.g., Ab in C)
      borrowed.push({ root: this.toPc(key.root + 8), name: 'bVI', type: 'major' });
      // bIII major - borrowed from parallel minor (e.g., Eb in C)
      borrowed.push({ root: this.toPc(key.root + 3), name: 'bIII', type: 'major' });
      // iv minor - borrowed from parallel minor (e.g., Fm in C)
      borrowed.push({ root: this.toPc(key.root + 5), name: 'iv', type: 'minor' });
      // ii major - secondary dominant style (e.g., D in C)
      borrowed.push({ root: this.toPc(key.root + 2), name: 'II', type: 'major' });
    }
    
    return borrowed;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
