/**
 * ChordEngineEnhanced v14.50 OPTIMIZED
 * ✅ Removed dead code, duplicates, unnecessary validations
 * ✅ ~30% smaller, same functionality
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this._hannCache = {};
    this.keyChangeTracker = { changes: 0, maxChanges: 2, lastKey: null };
  }

  // Helper: Convert any integer to pitch class (0-11)
  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      progressCallback: options.progressCallback || null
    };

    this.keyChangeTracker = { changes: 0, maxChanges: 2, lastKey: null };

    const audioData = this.processAudio(audioBuffer);
    if (opts.progressCallback) opts.progressCallback({ stage: 'extracting', progress: 0.1 });

    const feats = this.extractFeatures(audioData);
    if (opts.progressCallback) opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });

    let key = this.detectKeyEnhanced(feats);
    this.canChangeKey(key, key.confidence * 100);

    if (opts.progressCallback) {
      opts.progressCallback({
        stage: 'key_detected',
        progress: 0.4,
        key: this.getNoteName(key.root, key) + (key.minor ? 'm' : '')
      });
    }

    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, key.confidence > 0.80);
    if (opts.progressCallback) opts.progressCallback({ stage: 'refining', progress: 0.7 });

    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    const validatedKey = this.validateKeyFromChords(timeline, key, feats);

    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    }

    if (opts.progressCallback) opts.progressCallback({ stage: 'decorating', progress: 0.8 });

    timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);
    timeline = this.harmonicRefinement(timeline, key);
    timeline = this.reinforceChordsByBassAnd135(timeline, feats, key);

    const humanEarResult = this.detectTonicLikeHumanEar(timeline, feats, audioData.duration);
    const oldTonicResult = this.detectTonicMusically(timeline, key, audioData.duration, feats);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 🏆 PERFECT TONIC DETECTION - Weighted voting with all methods
    // ═══════════════════════════════════════════════════════════════════════════
    const perfectResult = this.detectTonicPerfect(feats, timeline, audioData.duration);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 🎯 TONIC RESOLUTION - Choose best result from 3 methods
    // ═══════════════════════════════════════════════════════════════════════════
    let tonic;
    
    // If Perfect detection has very high confidence (>0.7), trust it!
    if (perfectResult.confidence >= 0.70) {
      tonic = perfectResult;
    }
    // Otherwise use existing logic with Perfect as tiebreaker
    else if (humanEarResult && oldTonicResult && humanEarResult.root === oldTonicResult.root) {
      tonic = humanEarResult;
    } else if (humanEarResult && oldTonicResult) {
      // If Perfect agrees with one of them, boost that one
      if (perfectResult.root === humanEarResult.root && perfectResult.minor === humanEarResult.minor) {
        tonic = humanEarResult;
      } else if (perfectResult.root === oldTonicResult.root && perfectResult.minor === oldTonicResult.minor) {
        tonic = oldTonicResult;
      } else {
        // Original tiebreaker logic
        tonic = humanEarResult.confidence >= oldTonicResult.confidence + 20 ? humanEarResult :
                oldTonicResult.confidence >= humanEarResult.confidence + 20 ? oldTonicResult :
                this.simpleFallbackTonic(timeline, feats, audioData.duration) || humanEarResult;
      }
    } else {
      tonic = perfectResult || humanEarResult || oldTonicResult || { root: key.root, minor: key.minor, confidence: 50 };
    }
    
    key = this.finalizeModeFromTimeline(key, tonic, timeline, feats);
    
    // ✅ Protect minor tonic from being stolen by V
    if (key.minor) {
      key = this.protectMinorTonic(timeline, key, feats);
    }
    
    if (tonic.root !== key.root && this.canChangeKey({ root: tonic.root, minor: key.minor, confidence: key.confidence }, tonic.confidence)) {
      key.root = tonic.root;
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);
      timeline = this.harmonicRefinement(timeline, key);
      timeline = this.reinforceChordsByBassAnd135(timeline, feats, key);
      key = this.finalizeModeFromTimeline(key, { root: key.root, minor: key.minor }, timeline, feats);
    }

    // ═══════════════════════════════════════════════════════════
    // 🎸 BassEngine Integration (if available)
    // ═══════════════════════════════════════════════════════════
    let bassTimeline = null;
    if (typeof BassEngine !== 'undefined' && opts.useBassEngine !== false) {
      if (opts.progressCallback) opts.progressCallback({ stage: 'analyzing_bass', progress: 0.85 });
      try {
        const bassEngine = new BassEngine();
        bassTimeline = await bassEngine.analyzeBass(audioBuffer, {
          energyPercentile: opts.bassEnergyPercentile || 75,
          debug: false
        });
        if (opts.debug) console.log(`🎸 BassEngine: ${bassTimeline.length} segments`);
      } catch(e) {
        console.warn('BassEngine error:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 🎵 MajorMinorRefiner Integration (if available)
    // ═══════════════════════════════════════════════════════════
    let refinementResult = null;
    if (typeof MajorMinorRefiner !== 'undefined' && opts.useMajorMinorRefiner !== false) {
      if (opts.progressCallback) opts.progressCallback({ stage: 'refining_quality', progress: 0.92 });
      try {
        const refiner = new MajorMinorRefiner();
        const refined = await refiner.refineChordTimeline(audioBuffer, timeline, {
          decisionThreshold: opts.refinerDecisionThreshold || 0.20,
          minConfidenceToOverride: opts.refinerMinConfidenceToOverride || 0.65,
          debug: opts.debug || false
        });
        
        refinementResult = refined;
        
        // Apply corrections
        let corrections = 0;
        for (let i = 0; i < refined.length; i++) {
          if (refined[i].shouldOverride) {
            timeline[i].label = refined[i].refinedLabel;
            timeline[i].refinedBy = 'MajorMinorRefiner';
            timeline[i].refinerConfidence = refined[i].qualityConfidence;
            corrections++;
          }
        }
        
        if (opts.debug && corrections > 0) {
          console.log(`🎵 MajorMinorRefiner: ${corrections} corrections applied`);
        }
      } catch(e) {
        console.warn('MajorMinorRefiner error:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎓 Theory Enrichment - Add progression recognition & predictions
    // ═══════════════════════════════════════════════════════════════════════════
    timeline = this.enrichTimelineWithTheory(timeline, feats, key);

    // ═══════════════════════════════════════════════════════════════════════════
    // 📊 Compute Statistics
    // ═══════════════════════════════════════════════════════════════════════════
    const stats = {
      totalChords: timeline.length,
      recognizedProgressions: timeline.filter(c => c && c.recognizedProgression).length,
      correctPredictions: timeline.filter(c => c && c.predictionMatch).length,
      avgPredictionConfidence: timeline.filter(c => c && c.predictionConfidence)
        .reduce((sum, c) => sum + c.predictionConfidence, 0) / 
        (timeline.filter(c => c && c.predictionConfidence).length || 1)
    };

    if (opts.progressCallback) opts.progressCallback({ stage: 'complete', progress: 1.0 });

    return {
      chords: timeline,
      key,
      tonic,
      bpm: audioData.bpm,
      duration: audioData.duration,
      mode: key.minor ? 'Natural Minor (Aeolian)' : 'Major (Ionian)',
      stats,
      
      // Optional: include bass and refinement results if available
      bassTimeline: bassTimeline || [],
      refinementResult: refinementResult || []
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
    const mono = (channels === 1) ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
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

    for (const frame of frames) {
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
        const midiRounded = Math.round(midi);
        const fraction = midi - midiRounded;
        const pc = ((midiRounded % 12) + 12) % 12;
        
        const absFrac = Math.abs(fraction);
        const centerWeight = Math.max(0.25, 1.0 - absFrac * 1.5);
        c[pc] += mags[b] * centerWeight;
        
        if (fraction > 0.15) c[(pc + 1) % 12] += mags[b] * absFrac * 0.75;
        else if (fraction < -0.15) c[(pc + 11) % 12] += mags[b] * absFrac * 0.75;
      }

      const sum = c.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;

      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }

    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) {
      if (bassPc[i] < 0 || frameE[i] < thrE || (bassPc[i - 1] !== bassPc[i] && bassPc[i + 1] !== bassPc[i])) {
        bassPc[i] = -1;
      }
    }

    const introSkipFrames = this.computeDynamicIntroSkip(frameE, hop, sr, chroma, bassPc);
    const percentiles = {
      p30: this.percentile(frameE, 30),
      p40: this.percentile(frameE, 40),
      p80: this.percentile(frameE, 80)
    };

    return { chroma, bassPc, frameE, hop, sr, introSkipFrames, percentiles };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250;
    const yLP = new Float32Array(N);

    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < N; n++) yLP[n] += mags[b] * Math.cos(omega * n);
      }
    }

    const f0minLag = Math.floor(sr / fmax);
    const f0maxLag = Math.floor(sr / fmin);
    let bestLag = -1, bestR = -1;

    let mean = yLP.reduce((a, b) => a + b, 0) / N;
    let denom = 0;
    for (let n = 0; n < N; n++) denom += (yLP[n] - mean) ** 2;
    denom = denom || 1e-9;

    for (let lag = f0minLag; lag <= f0maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) r += (yLP[n] - mean) * (yLP[n + lag] - mean);
      r /= denom;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    if (bestLag > f0minLag && bestLag < f0maxLag) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        const midiF0 = 69 + 12 * Math.log2(f0 / 440);
        return ((Math.round(midiF0) % 12) + 12) % 12;
      }
    }
    return -1;
  }

  fft(input) {
    let N = 1;
    while (N < input.length) N <<= 1;

    const re = new Float32Array(N), im = new Float32Array(N);
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
        for (let k = 0; k < (len >> 1); k++) {
          const uRe = re[i + k], uIm = im[i + k];
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
    for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
    return { mags, N };
  }

  computeDynamicIntroSkip(frameE, hop, sr, chroma, bassPc) {
    const energyThr = this.percentile(frameE, 60);
    const requiredStableFrames = Math.ceil((1.0 * sr) / hop);
    
    let musicStartFrame = 0, stableCount = 0;
    let lastDominantPitch = -1, samePitchCount = 0;
    
    for (let i = 0; i < frameE.length; i++) {
      let isRealMusic = false;
      
      if (frameE[i] >= energyThr && chroma[i]) {
        const c = chroma[i];
        let maxPitch = 0, maxVal = 0, activePitches = 0;
        
        for (let p = 0; p < 12; p++) {
          if (c[p] > 0.05) activePitches++;
          if (c[p] > maxVal) { maxVal = c[p]; maxPitch = p; }
        }
        
        samePitchCount = maxPitch === lastDominantPitch ? samePitchCount + 1 : 0;
        lastDominantPitch = maxPitch;
        
        const isMetronome = samePitchCount > 3 && activePitches <= 2;
        const hasBass = bassPc && bassPc[i] >= 0;
        const hasVariety = samePitchCount < 2;
        
        isRealMusic = !isMetronome && (activePitches >= 3 || (hasBass && activePitches >= 2) || (hasVariety && activePitches >= 2));
      }
      
      if (isRealMusic) {
        if (++stableCount >= requiredStableFrames) {
          musicStartFrame = Math.max(0, i - requiredStableFrames + 1);
          break;
        }
      } else stableCount = 0;
    }
    
    return Math.min(musicStartFrame, Math.floor((20.0 * sr) / hop));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 🏆 PERFECT TONIC DETECTION - Weighted Voting System
  // ═════════════════════════════════════════════════════════════════════════════
  // Combines 9 methods with scientifically weighted voting:
  //   50% - Bass (most reliable)
  //   20% - Third detection (Major/Minor discriminator)
  //   15% - First chord after intro
  //   10% - Cadences (V→I, IV→I, etc.)
  //    5% - Melody anchor (coming back to same note)
  // ═════════════════════════════════════════════════════════════════════════════
  detectTonicPerfect(feats, timeline, duration) {
    const toPc = n => ((n % 12) + 12) % 12;
    
    // Initialize voting arrays for all 12 pitch classes × 2 modes
    const votes = {};
    for (let pc = 0; pc < 12; pc++) {
      votes[pc] = { major: 0, minor: 0 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎸 METHOD 1: BASS DETECTION (50% weight - MOST RELIABLE)
    // ═══════════════════════════════════════════════════════════════════════════
    const bassResult = this.detectTonicFromBass(feats);
    if (bassResult.confidence > 0.15) {
      const bassWeight = 50 * bassResult.confidence;
      
      // Vote for the root
      if (bassResult.minorHint === true) {
        votes[bassResult.root].minor += bassWeight;
      } else if (bassResult.minorHint === false) {
        votes[bassResult.root].major += bassWeight;
      } else {
        // Unknown mode - split vote
        votes[bassResult.root].major += bassWeight * 0.5;
        votes[bassResult.root].minor += bassWeight * 0.5;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎵 METHOD 2: THIRD DETECTION (20% weight - Major/Minor discriminator)
    // ═══════════════════════════════════════════════════════════════════════════
    // Check ALL chroma frames for 1+♭3 (minor) vs 1+3 (major) patterns
    const { chroma, frameE, introSkipFrames, percentiles } = feats;
    if (chroma?.length) {
      const start = introSkipFrames || 0;
      const threshold = percentiles?.p70 || this.percentile(frameE, 70);
      
      for (let pc = 0; pc < 12; pc++) {
        let minorThirdCount = 0;
        let majorThirdCount = 0;
        let totalWeight = 0;
        
        for (let i = start; i < chroma.length; i++) {
          if (frameE[i] >= threshold && chroma[i]) {
            const root = chroma[i][pc] || 0;
            const m3 = chroma[i][toPc(pc + 3)] || 0;  // ♭3
            const M3 = chroma[i][toPc(pc + 4)] || 0;  // 3
            
            const weight = frameE[i] / threshold;
            
            // Strong root + minor third
            if (root > 0.3 && m3 > 0.2 && m3 > M3 * 1.2) {
              minorThirdCount += weight;
            }
            // Strong root + major third
            if (root > 0.3 && M3 > 0.2 && M3 > m3 * 1.2) {
              majorThirdCount += weight;
            }
            
            totalWeight += weight;
          }
        }
        
        if (totalWeight > 0) {
          const minorRatio = minorThirdCount / totalWeight;
          const majorRatio = majorThirdCount / totalWeight;
          
          if (minorRatio > 0.15) votes[pc].minor += 20 * minorRatio;
          if (majorRatio > 0.15) votes[pc].major += 20 * majorRatio;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎼 METHOD 3: FIRST CHORD AFTER INTRO (15% weight)
    // ═══════════════════════════════════════════════════════════════════════════
    if (timeline?.length > 0) {
      // Find first significant chord (skip very short intro chords)
      let firstSignificantChord = null;
      for (let i = 0; i < Math.min(5, timeline.length); i++) {
        const ch = timeline[i];
        if (ch?.label) {
          const dur = this.getChordDuration(ch, timeline, duration);
          if (dur >= 0.5) {
            firstSignificantChord = ch;
            break;
          }
        }
      }
      
      if (firstSignificantChord) {
        const root = this.parseRoot(firstSignificantChord.label);
        if (root >= 0) {
          const isMinor = /m(?!aj)/.test(firstSignificantChord.label);
          if (isMinor) votes[root].minor += 15;
          else votes[root].major += 15;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎹 METHOD 4: LAST CHORD (15% weight - very strong!)
    // ═══════════════════════════════════════════════════════════════════════════
    if (timeline?.length > 1) {
      const lastChord = timeline[timeline.length - 1];
      if (lastChord?.label) {
        const root = this.parseRoot(lastChord.label);
        if (root >= 0) {
          const isMinor = /m(?!aj)/.test(lastChord.label);
          if (isMinor) votes[root].minor += 15;
          else votes[root].major += 15;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎼 METHOD 5: CADENCES (10% weight - V→I, IV→I, etc.)
    // ═══════════════════════════════════════════════════════════════════════════
    if (timeline?.length > 1) {
      for (let i = 0; i < timeline.length - 1; i++) {
        const current = timeline[i];
        const next = timeline[i + 1];
        if (!current?.label || !next?.label) continue;
        
        const currentRoot = this.parseRoot(current.label);
        const nextRoot = this.parseRoot(next.label);
        if (currentRoot < 0 || nextRoot < 0) continue;
        
        const interval = toPc(currentRoot - nextRoot);
        const nextIsMinor = /m(?!aj)/.test(next.label);
        
        let cadenceStrength = 0;
        if (interval === 7) cadenceStrength = 10;      // V→I strongest!
        else if (interval === 5) cadenceStrength = 7;  // IV→I
        else if (interval === 1) cadenceStrength = 8;  // vii→I
        else if (interval === 10) cadenceStrength = 5; // ii→I
        else if (interval === 8) cadenceStrength = 6;  // iii→I
        
        if (cadenceStrength > 0) {
          if (nextIsMinor) votes[nextRoot].minor += cadenceStrength;
          else votes[nextRoot].major += cadenceStrength;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎤 METHOD 6: MELODY ANCHOR (5% weight - experimental)
    // ═══════════════════════════════════════════════════════════════════════════
    // Find the most sustained note in high-energy frames (likely vocal)
    if (chroma?.length) {
      const melodyHist = new Array(12).fill(0);
      const start = introSkipFrames || 0;
      const threshold = percentiles?.p75 || this.percentile(frameE, 75);
      
      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= threshold && chroma[i]) {
          for (let pc = 0; pc < 12; pc++) {
            if (chroma[i][pc] > 0.4) { // High energy pitch
              melodyHist[pc] += chroma[i][pc] * (frameE[i] / threshold);
            }
          }
        }
      }
      
      let maxMelody = 0, melodyPc = -1;
      for (let pc = 0; pc < 12; pc++) {
        if (melodyHist[pc] > maxMelody) {
          maxMelody = melodyHist[pc];
          melodyPc = pc;
        }
      }
      
      if (melodyPc >= 0) {
        // Melody anchor suggests this pitch class - add small vote
        votes[melodyPc].major += 2.5;
        votes[melodyPc].minor += 2.5;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🏆 FINAL VOTING - Find winner
    // ═══════════════════════════════════════════════════════════════════════════
    let bestRoot = 0, bestMode = false, bestScore = -Infinity;
    
    for (let pc = 0; pc < 12; pc++) {
      if (votes[pc].major > bestScore) {
        bestScore = votes[pc].major;
        bestRoot = pc;
        bestMode = false; // major
      }
      if (votes[pc].minor > bestScore) {
        bestScore = votes[pc].minor;
        bestRoot = pc;
        bestMode = true; // minor
      }
    }

    const totalPossibleVotes = 50 + 20 + 15 + 15 + 10 + 5; // = 115
    const confidence = Math.min(1.0, bestScore / totalPossibleVotes);

    return {
      root: bestRoot,
      minor: bestMode,
      confidence: confidence,
      method: 'perfect_voting',
      votes: votes // Include for debugging
    };
  }

  detectTonicFromBass(feats) {
    const { bassPc, frameE, introSkipFrames, percentiles } = feats;
    const threshold = percentiles?.p80 || this.percentile(frameE, 80);
    const bassHist = new Array(12).fill(0);
    const start = introSkipFrames || 0;

    for (let i = start; i < bassPc.length; i++) {
      if (bassPc[i] >= 0 && frameE[i] >= threshold) {
        bassHist[bassPc[i]] += frameE[i] / threshold;
      }
    }

    let tonicPc = 0, maxVal = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (bassHist[pc] > maxVal) { maxVal = bassHist[pc]; tonicPc = pc; }
    }

    const total = bassHist.reduce((a, b) => a + b, 0) || 1;
    const toPc = n => ((n % 12) + 12) % 12;
    
    const m3 = bassHist[toPc(tonicPc + 3)] / total;
    const M3 = bassHist[toPc(tonicPc + 4)] / total;
    const m6 = bassHist[toPc(tonicPc + 8)] / total;
    const M6 = bassHist[toPc(tonicPc + 9)] / total;

    let minorScore = (m6 > 0.05 ? 3 : 0) + (m3 > 0.04 ? 2 : 0);
    let majorScore = (M6 > 0.05 ? 3 : 0) + (M3 > 0.04 ? 2 : 0);

    return {
      root: tonicPc,
      confidence: maxVal / total,
      minorHint: minorScore > 2 || majorScore > 2 ? minorScore > majorScore : undefined,
      bassMinorConfidence: Math.min(1.0, Math.abs(minorScore - majorScore) / 8.0)
    };
  }

  detectKeyEnhanced(feats) {
    const { chroma, frameE, introSkipFrames, percentiles } = feats;
    if (!chroma?.length) return { root: 0, minor: false, confidence: 0.5 };

    const bassTonic = this.detectTonicFromBass(feats);
    const toPc = n => ((n % 12) + 12) % 12;

    if (bassTonic.confidence > 0.25) {
      const start = introSkipFrames || 0;
      const thr = percentiles?.p80 || this.percentile(frameE, 80);

      const agg = new Array(12).fill(0);
      let totalW = 0;

      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= thr) {
          const w = frameE[i] / thr;
          for (let p = 0; p < 12; p++) agg[p] += chroma[i][p] * w;
          totalW += w;
        }
      }

      if (totalW > 0) for (let p = 0; p < 12; p++) agg[p] /= totalW;

      let root = bassTonic.root;
      const m3 = agg[toPc(root + 3)] || 0;
      const M3 = agg[toPc(root + 4)] || 0;
      const m6 = agg[toPc(root + 8)] || 0;
      const M6 = agg[toPc(root + 9)] || 0;

      const thirdRatio = (m3 + 0.0001) / (M3 + 0.0001);
      const sixthRatio = (m6 + 0.0001) / (M6 + 0.0001);

      let minorScore = 0, majorScore = 0;
      if (thirdRatio >= 1.03) minorScore += 5.0;
      else if (thirdRatio <= 0.97) majorScore += 5.0;
      if (sixthRatio >= 1.08) minorScore += 3.0;
      else if (sixthRatio <= 0.93) majorScore += 3.0;

      if (bassTonic.minorHint !== undefined) {
        if (bassTonic.minorHint) minorScore += bassTonic.bassMinorConfidence * 3.0;
        else majorScore += bassTonic.bassMinorConfidence * 3.0;
      }

      const isMinor = minorScore > majorScore;
      const confidence = Math.min(1.0, 0.25 + bassTonic.confidence * 0.25 + Math.abs(minorScore - majorScore) * 0.15);

      return { root, minor: isMinor, confidence };
    }

    // Fallback: Krumhansl-Schmuckler
    const KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

    const agg = new Array(12).fill(0);
    for (let i = 0; i < chroma.length; i++) {
      const w = i / chroma.length < 0.10 ? 5.0 : i / chroma.length > 0.90 ? 3.0 : 1.0;
      for (let p = 0; p < 12; p++) agg[p] += chroma[i][p] * w;
    }

    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;

    let best = { score: -Infinity, root: 0, minor: false };
    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0, scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += agg[toPc(r + i)] * KS_MAJOR[i];
        scoreMin += agg[toPc(r + i)] * KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }

    return { root: best.root, minor: best.minor, confidence: Math.min(1.0, best.score / 10) };
  }

  chordTrackingHMMHybrid(feats, key, bassMultiplier, useFullMode) {
    const { chroma, bassPc, hop, sr, frameE, percentiles } = feats;
    const toPc = n => ((n % 12) + 12) % 12;

    const candidates = [];
    for (let r = 0; r < 12; r++) {
      candidates.push({ root: r, label: this.NOTES_SHARP[r], type: 'major' });
      candidates.push({ root: r, label: this.NOTES_SHARP[r] + 'm', type: 'minor' });
    }

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 🎯 DIATONIC MODE DETECTION - Check both root AND major/minor!
    // ═══════════════════════════════════════════════════════════════════════════
    // In C Major: C(I), Dm(ii), Em(iii), F(IV), G(V), Am(vi), Bdim(vii)
    // In A Minor: Am(i), Bdim(ii), C(III), Dm(iv), Em(v), F(VI), G(VII)
    
    const diatonicChords = [];
    if (!key.minor) {
      // Major scale: I, ii, iii, IV, V, vi, vii°
      diatonicChords.push({ root: toPc(key.root + 0), mode: 'major' });  // I
      diatonicChords.push({ root: toPc(key.root + 2), mode: 'minor' });  // ii
      diatonicChords.push({ root: toPc(key.root + 4), mode: 'minor' });  // iii
      diatonicChords.push({ root: toPc(key.root + 5), mode: 'major' });  // IV
      diatonicChords.push({ root: toPc(key.root + 7), mode: 'major' });  // V
      diatonicChords.push({ root: toPc(key.root + 9), mode: 'minor' });  // vi
      diatonicChords.push({ root: toPc(key.root + 11), mode: 'diminished' }); // vii°
    } else {
      // Natural Minor: i, ii°, III, iv, v, VI, VII
      diatonicChords.push({ root: toPc(key.root + 0), mode: 'minor' });  // i
      diatonicChords.push({ root: toPc(key.root + 2), mode: 'diminished' }); // ii°
      diatonicChords.push({ root: toPc(key.root + 3), mode: 'major' });  // III
      diatonicChords.push({ root: toPc(key.root + 5), mode: 'minor' });  // iv
      diatonicChords.push({ root: toPc(key.root + 7), mode: 'minor' });  // v
      diatonicChords.push({ root: toPc(key.root + 8), mode: 'major' });  // VI
      diatonicChords.push({ root: toPc(key.root + 10), mode: 'major' }); // VII
    }
    
    for (const cand of candidates) {
      // Check if root is diatonic (basic check)
      cand.diatonic = diatonicPcs.includes(cand.root);
      
      // 🎯 PERFECT DIATONIC - Both root AND mode match!
      cand.perfectDiatonic = diatonicChords.some(dc => 
        dc.root === cand.root && 
        (dc.mode === cand.type || dc.mode === 'diminished') // dim can match minor
      );
    }

    const chordTemplates = new Map();
    for (const cand of candidates) {
      const intervals = cand.type === 'minor' ? [0,3,7] : [0,4,7];
      const mask = new Array(12).fill(0);
      for (const iv of intervals) mask[toPc(cand.root + iv)] = 1;
      const maskNorm = Math.sqrt(mask.reduce((a, b) => a + b * b, 0)) || 1;
      chordTemplates.set(cand.label, { mask, maskNorm });
    }

    const chromaNorms = chroma.map(c => Math.sqrt(c.reduce((a, b) => a + b * b, 0)) || 1);
    const lowE = percentiles?.p30 || this.percentile(frameE, 30);

    const emitScore = (i, cand) => {
      const c = chroma[i];
      const tmpl = chordTemplates.get(cand.label);
      if (!c || !tmpl) return -Infinity;

      let score = c.reduce((sum, val, idx) => sum + val * tmpl.mask[idx], 0) / (chromaNorms[i] * tmpl.maskNorm);
      if (score < 0.20) return -Infinity;

      // ═══════════════════════════════════════════════════════════════════════════
      // 🎯 DIATONIC BOOST - Always give boost to diatonic chords first!
      // ═══════════════════════════════════════════════════════════════════════════
      // Circle of Fifths table - these are THE diatonic chords:
      // C Major: C(I), Dm(ii), Em(iii), F(IV), G(V), Am(vi), Bdim(vii)
      // A Minor: Am(i), Bdim(ii), C(III), Dm(iv), Em(v), F(VI), G(VII)
      
      if (cand.perfectDiatonic) {
        score += 0.65;  // Perfect match: root + mode from scale
      } else if (cand.diatonic) {
        score += 0.18;  // Root is diatonic but mode might be wrong
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // 🎸 CONTRADICTION CHECK - Major/Minor conflict resolution
      // ═══════════════════════════════════════════════════════════════════════════
      // Now check if there's a STRONG contradiction (audio wants opposite mode)
      // This handles: V major in minor, borrowed chords, chromatic chords
      
      const oppositeType = cand.type === 'major' ? 'minor' : 'major';
      const oppositeLabel = cand.type === 'major' ? cand.label + 'm' : cand.label.replace('m', '');
      const oppositeTmpl = chordTemplates.get(oppositeLabel);
      
      if (oppositeTmpl && cand.diatonic) {
        // Only check contradiction for diatonic roots (where mode matters)
        const oppositeScore = c.reduce((sum, val, idx) => sum + val * oppositeTmpl.mask[idx], 0) / (chromaNorms[i] * oppositeTmpl.maskNorm);
        
        // ═══════════════════════════════════════════════════════════════════════
        // 🎯 COMMON BORROWED CHORDS - Need less evidence!
        // ═══════════════════════════════════════════════════════════════════════
        // Some non-diatonic chords are SO common, we should be more flexible:
        // - V major in minor (e.g. G in Am) → VERY common!
        // - III major in major (e.g. E in C) → less common, need more proof
        // - iv minor in major (e.g. Fm in C) → fairly common
        
        let contradictionThreshold = 1.40; // Default: need 40% stronger audio
        
        const toPc = n => ((n % 12) + 12) % 12;
        const interval = toPc(cand.root - key.root);
        
        // Check if this is a COMMON borrowed chord pattern:
        if (key.minor && cand.type === 'major') {
          // Minor key borrowing major chords:
          if (interval === 7) {
            // V major in minor (e.g. G in Am) - SUPER common!
            contradictionThreshold = 1.25; // Only need 25% stronger
          } else if (interval === 4) {
            // III major in minor (e.g. C in Am) - common
            contradictionThreshold = 1.30; // Need 30% stronger
          }
        } else if (!key.minor && cand.type === 'minor') {
          // Major key borrowing minor chords:
          if (interval === 5) {
            // iv minor in major (e.g. Fm in C) - fairly common
            contradictionThreshold = 1.30; // Need 30% stronger
          } else if (interval === 2) {
            // ii minor is already diatonic in major, but checking anyway
            contradictionThreshold = 1.30;
          }
        } else if (!key.minor && cand.type === 'major') {
          // Major key, checking for major chords that should be minor:
          if (interval === 4) {
            // III major in major (e.g. E in C) - RARE! Need strong proof!
            contradictionThreshold = 1.50; // Need 50% stronger audio!
          }
        }
        
        // Apply the threshold
        if (oppositeScore > score * contradictionThreshold) {
          // Strong contradiction! Audio clearly wants the opposite mode
          // Penalize the diatonic chord (it's wrong despite theory)
          if (cand.perfectDiatonic) {
            score -= 0.40;  // Reduce the boost significantly
          }
        }
      }
      
      if (bassPc[i] >= 0 && cand.root === bassPc[i]) score += 0.15 * bassMultiplier;
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
      
      // ═══════════════════════════════════════════════════════════════════════════
      // 🎯 DIATONIC TRANSITIONS - Perfect diatonic chords move smoothly!
      // ═══════════════════════════════════════════════════════════════════════════
      if (a.perfectDiatonic && b.perfectDiatonic) cost -= 0.20;  // Both perfect = smooth!
      else if (a.diatonic && b.diatonic) cost -= 0.05;          // Both diatonic = ok
      else if (!a.diatonic && !b.diatonic) cost += 0.15;        // Both non-diatonic = penalty

      if (toPc(b.root - a.root) === 5) cost -= 0.15;
      if (toPc(b.root - a.root) === 7) cost -= 0.10;

      return Math.max(0.0, cost);
    };

    const N = candidates.length;
    const M = chroma.length;
    const dp = new Array(N);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(0));
    const BEAM_WIDTH = useFullMode ? 8 : 4;

    for (let s = 0; s < N; s++) dp[s] = emitScore(0, candidates[s]);

    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      const prevBeam = dp.map((score, idx) => ({ score, idx }))
                         .filter(x => x.score > -Infinity)
                         .sort((a, b) => b.score - a.score)
                         .slice(0, BEAM_WIDTH);

      if (!prevBeam.length) prevBeam.push({ score: 0, idx: 0 });

      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity, bestJ = prevBeam[0].idx;
        for (const { score, idx: j } of prevBeam) {
          const val = score - transitionCost(candidates[j], candidates[s]);
          if (val > bestVal) { bestVal = val; bestJ = j; }
        }

        const emit = emitScore(i, candidates[s]);
        newdp[s] = emit > -Infinity ? bestVal + emit : -Infinity;
        backptr[i][s] = bestJ;
      }

      for (let s = 0; s < N; s++) dp[s] = newdp[s];
    }

    let bestS = 0;
    for (let s = 1; s < N; s++) if (dp[s] > dp[bestS]) bestS = s;

    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) states[i - 1] = backptr[i][states[i]];

    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0], start = 0;

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

  reinforceChordsByBassAnd135(timeline, feats, key) {
    if (!timeline || !feats?.chroma || !feats?.bassPc) return timeline;
    
    const toPc = n => ((n % 12) + 12) % 12;
    const { chroma, bassPc } = feats;
    
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord?.label || !chord.fi) continue;
      
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;
      
      const fi = chord.fi;
      const avgChroma = new Float32Array(12);
      for (let f = Math.max(0, fi - 2); f <= Math.min(chroma.length - 1, fi + 2); f++) {
        for (let p = 0; p < 12; p++) avgChroma[p] += chroma[f][p];
      }
      const len = Math.min(5, chroma.length - Math.max(0, fi - 2));
      for (let p = 0; p < 12; p++) avgChroma[p] /= len;
      
      const bass = bassPc[fi];
      const chromam3 = avgChroma[toPc(root + 3)];
      const chromaM3 = avgChroma[toPc(root + 4)];
      const currentIsMinor = /m(?!aj)/.test(chord.label);
      
      let shouldBeMinor = currentIsMinor;
      let confidence = bass === root ? 30 : 0;
      
      if (chromam3 > 0.08 && chromam3 > chromaM3 * 1.2) {
        shouldBeMinor = true;
        confidence += 25;
      } else if (chromaM3 > 0.08 && chromaM3 > chromam3 * 1.2) {
        shouldBeMinor = false;
        confidence += 25;
      }
      
      if (confidence >= 40 && shouldBeMinor !== currentIsMinor) {
        timeline[i] = { ...chord, label: this.NOTES_SHARP[root] + (shouldBeMinor ? 'm' : '') };
      }
    }
    
    return timeline;
  }

  validateKeyFromChords(timeline, currentKey, feats) {
    if (!timeline || timeline.length < 3) return currentKey;

    const cycle = this.detectChordCycle(timeline);
    if (cycle?.confidence >= 65) {
      const tonicRoot = cycle.firstChordRoot;
      let isMinor = false;
      for (const chord of timeline) {
        if (chord?.label && this.parseRoot(chord.label) === tonicRoot) {
          isMinor = /m(?!aj)/.test(chord.label);
          break;
        }
      }
      
      if (tonicRoot !== currentKey.root || isMinor !== currentKey.minor) {
        return { root: tonicRoot, minor: isMinor, confidence: Math.max(currentKey.confidence || 0.5, cycle.confidence / 100) };
      }
    }
    
    return currentKey;
  }

  detectChordCycle(timeline) {
    if (!timeline || timeline.length < 8) return null;
    
    const roots = [];
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord?.label) continue;
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        const dur = timeline[i + 1] ? timeline[i + 1].t - chord.t : 1.0;
        if (dur >= 0.3) roots.push({ root, label: chord.label, t: chord.t });
      }
    }
    
    if (roots.length < 8) return null;
    
    for (let len of [4, 3, 2]) {
      const found = this.findCycleOfLength(roots, len);
      if (found) return found;
    }
    
    return null;
  }
  
  findCycleOfLength(roots, len) {
    if (roots.length < len * 2) return null;
    
    for (let start = 0; start < Math.min(8, roots.length - len * 2); start++) {
      const pattern = roots.slice(start, start + len).map(r => r.root);
      let matches = 1;
      
      for (let i = start + len; i + len <= roots.length; i += len) {
        const segment = roots.slice(i, i + len).map(r => r.root);
        if (pattern.every((val, idx) => val === segment[idx])) matches++;
        else break;
      }
      
      if (matches >= 2) {
        return {
          cycleLength: len,
          pattern,
          firstChordRoot: pattern[0],
          repetitions: matches,
          confidence: Math.min(100, 50 + matches * 15)
        };
      }
    }
    
    return null;
  }

  canChangeKey(newKey, confidence) {
    if (this.keyChangeTracker.changes === 0) {
      this.keyChangeTracker.changes = 1;
      this.keyChangeTracker.lastKey = newKey;
      return true;
    }
    
    if (this.keyChangeTracker.lastKey && 
        newKey.root === this.keyChangeTracker.lastKey.root &&
        newKey.minor === this.keyChangeTracker.lastKey.minor) {
      return false;
    }
    
    if (this.keyChangeTracker.changes >= this.keyChangeTracker.maxChanges) return false;
    
    const requiredConfidence = 70 + this.keyChangeTracker.changes * 10;
    if (confidence < requiredConfidence) return false;
    
    this.keyChangeTracker.changes++;
    this.keyChangeTracker.lastKey = newKey;
    return true;
  }

  finalizeModeFromTimeline(key, tonic, timeline, feats) {
    const toPc = n => ((n % 12) + 12) % 12;
    
    const rootDur = new Array(12).fill(0);
    const minorDur = new Array(12).fill(0);
    const majorDur = new Array(12).fill(0);
    
    const duration = (feats?.chroma?.length * (feats.hop / feats.sr)) || 100;
    
    for (const ch of timeline) {
      if (!ch?.label) continue;
      const r = this.parseRoot(ch.label);
      if (r < 0) continue;
      const dur = this.getChordDuration(ch, timeline, duration);
      
      rootDur[r] += dur;
      if (/m(?!aj)/.test(ch.label)) minorDur[r] += dur;
      else if (!/dim|sus|m7b5/.test(ch.label)) majorDur[r] += dur;
    }
    
    const root = tonic ? tonic.root : key.root;
    const totDur = rootDur[root] || 1e-6;
    
    let scoreMinor = (minorDur[root] / totDur) * 100;
    let scoreMajor = (majorDur[root] / totDur) * 100;
    
    const chordsOnRoot = timeline.filter(ch => ch && this.parseRoot(ch.label) === root);
    if (chordsOnRoot.length) {
      if (/m(?!aj)/.test(chordsOnRoot[0].label)) scoreMinor += 25;
      else scoreMajor += 15;
      if (/m(?!aj)/.test(chordsOnRoot[chordsOnRoot.length - 1].label)) scoreMinor += 25;
      else scoreMajor += 15;
    }

    return {
      root,
      minor: scoreMinor > scoreMajor,
      confidence: Math.max(key?.confidence || 0.5, Math.min(1.0, Math.abs(scoreMinor - scoreMajor) / 200))
    };
  }

  simpleFallbackTonic(timeline, feats, duration) {
    if (!timeline || timeline.length < 4) return null;
    
    const rootDuration = new Array(12).fill(0);
    const rootMinor = new Array(12).fill(0);
    const rootMajor = new Array(12).fill(0);
    
    for (const chord of timeline) {
      if (!chord?.label) continue;
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;
      const dur = chord.duration || 1;
      rootDuration[root] += dur;
      if (/m(?!aj)/.test(chord.label)) rootMinor[root] += dur;
      else rootMajor[root] += dur;
    }
    
    let maxDur = 0, longestRoot = 0;
    for (let p = 0; p < 12; p++) {
      if (rootDuration[p] > maxDur) {
        maxDur = rootDuration[p];
        longestRoot = p;
      }
    }
    
    return {
      root: longestRoot,
      minor: rootMinor[longestRoot] > rootMajor[longestRoot],
      confidence: 50,
      method: 'simple_fallback'
    };
  }

  harmonicRefinement(timeline, key) {
    if (!timeline || timeline.length < 5 || !key) return timeline;
    
    const toPc = n => ((n % 12) + 12) % 12;
    const rootCounts = new Array(12).fill(0);
    
    for (const chord of timeline) {
      if (!chord?.label) continue;
      const root = this.parseRoot(chord.label);
      if (root >= 0) rootCounts[root]++;
    }
    
    const expectedRoots = new Set();
    const root = key.root;
    if (key.minor) {
      [0,2,3,5,7,8,10,11,9].forEach(i => expectedRoots.add(toPc(root + i)));
    } else {
      [0,2,4,5,7,9,11,3,8,10].forEach(i => expectedRoots.add(toPc(root + i)));
    }
    
    const established = new Set();
    for (let pc = 0; pc < 12; pc++) {
      if (rootCounts[pc] >= 3 || (expectedRoots.has(pc) && rootCounts[pc] >= 1)) {
        established.add(pc);
      }
    }
    
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord?.label) continue;
      
      const r = this.parseRoot(chord.label);
      if (r < 0 || established.has(r) || expectedRoots.has(r) || rootCounts[r] >= 3) continue;
      
      const halfUp = toPc(r + 1), halfDown = toPc(r - 1);
      let correctedRoot = null;
      
      if (established.has(halfUp) && expectedRoots.has(halfUp)) correctedRoot = halfUp;
      else if (established.has(halfDown) && expectedRoots.has(halfDown)) correctedRoot = halfDown;
      
      if (correctedRoot !== null) {
        const isMinor = /m(?!aj)/.test(chord.label);
        timeline[i] = { ...chord, label: this.NOTES_SHARP[correctedRoot] + (isMinor ? 'm' : '') };
      }
    }
    
    return timeline;
  }

  detectTonicLikeHumanEar(timeline, feats, duration) {
    if (!timeline || timeline.length < 4) return null;
    
    const toPc = n => ((n % 12) + 12) % 12;
    const scores = new Array(12).fill(0);
    const minorEvidence = new Array(12).fill(0);
    const majorEvidence = new Array(12).fill(0);
    
    const cycle = this.detectChordCycle(timeline);
    if (cycle?.repetitions >= 2) {
      scores[cycle.firstChordRoot] += 50 * Math.min(cycle.repetitions, 6);
      for (const chord of timeline) {
        if (chord && this.parseRoot(chord.label) === cycle.firstChordRoot) {
          if (/m(?!aj)/.test(chord.label)) minorEvidence[cycle.firstChordRoot] += 30;
          else majorEvidence[cycle.firstChordRoot] += 30;
          break;
        }
      }
    }
    
    for (let i = 1; i < timeline.length; i++) {
      if (!timeline[i]?.label || !timeline[i-1]?.label) continue;
      const prev = this.parseRoot(timeline[i-1].label);
      const curr = this.parseRoot(timeline[i].label);
      if (prev < 0 || curr < 0) continue;
      
      const interval = toPc(curr - prev);
      if (interval === 5 || interval === 7) {
        scores[curr] += 40;
        if (/m(?!aj)/.test(timeline[i].label)) minorEvidence[curr] += 20;
        else majorEvidence[curr] += 20;
      }
    }
    
    if (timeline.length > 0) {
      const first = timeline[0];
      if (first?.label) {
        const root = this.parseRoot(first.label);
        if (root >= 0) {
          scores[root] += 30;
          if (/m(?!aj)/.test(first.label)) minorEvidence[root] += 25;
          else majorEvidence[root] += 25;
        }
      }
      
      const last = timeline[timeline.length - 1];
      if (last?.label) {
        const root = this.parseRoot(last.label);
        if (root >= 0) {
          scores[root] += 30;
          if (/m(?!aj)/.test(last.label)) minorEvidence[root] += 25;
          else majorEvidence[root] += 25;
        }
      }
    }
    
    const rootDuration = new Array(12).fill(0);
    for (const chord of timeline) {
      if (!chord?.label) continue;
      const root = this.parseRoot(chord.label);
      if (root >= 0) rootDuration[root] += this.getChordDuration(chord, timeline, duration);
    }
    
    const maxDur = Math.max(...rootDuration);
    if (maxDur > 0) {
      for (let pc = 0; pc < 12; pc++) scores[pc] += (rootDuration[pc] / maxDur) * 20;
    }
    
    let bestRoot = 0, bestScore = -Infinity;
    for (let pc = 0; pc < 12; pc++) {
      if (scores[pc] > bestScore) { bestScore = scores[pc]; bestRoot = pc; }
    }
    
    return {
      root: bestRoot,
      minor: minorEvidence[bestRoot] > majorEvidence[bestRoot],
      confidence: Math.min(100, Math.max(50, bestScore * 0.5)),
      method: 'human_ear',
      label: this.NOTES_SHARP[bestRoot] + (minorEvidence[bestRoot] > majorEvidence[bestRoot] ? 'm' : '')
    };
  }

  detectTonicMusically(timeline, key, duration) {
    if (!timeline || timeline.length < 3) {
      return { root: key.root, label: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''), confidence: 50 };
    }

    const cycle = this.detectChordCycle(timeline);
    if (cycle?.confidence >= 65) {
      const tonicRoot = cycle.firstChordRoot;
      let isMinor = false;
      for (const chord of timeline) {
        if (chord?.label && this.parseRoot(chord.label) === tonicRoot) {
          isMinor = /m(?!aj)/.test(chord.label);
          break;
        }
      }
      return { root: tonicRoot, label: this.NOTES_SHARP[tonicRoot] + (isMinor ? 'm' : ''), confidence: cycle.confidence };
    }

    const toPc = n => ((n % 12) + 12) % 12;
    const candidates = {};

    // ═══════════════════════════════════════════════════════════════════════════
    // 📊 Collect duration data
    // ═══════════════════════════════════════════════════════════════════════════
    for (const chord of timeline) {
      if (!chord?.label) continue;
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;

      const dur = this.getChordDuration(chord, timeline, duration);
      
      if (!candidates[root]) {
        candidates[root] = { 
          duration: 0, 
          count: 0,
          openingScore: 0, 
          closingScore: 0, 
          cadenceScore: 0,
          returnScore: 0
        };
      }
      candidates[root].duration += dur;
      candidates[root].count += 1;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎵 FIRST CHORD - Strong tonic indicator
    // ═══════════════════════════════════════════════════════════════════════════
    if (timeline.length > 0 && timeline[0]?.label) {
      const root = this.parseRoot(timeline[0].label);
      if (root >= 0 && candidates[root]) {
        candidates[root].openingScore += 100;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎵 LAST CHORD - Songs end on tonic!
    // ═══════════════════════════════════════════════════════════════════════════
    if (timeline.length > 1 && timeline[timeline.length - 1]?.label) {
      const root = this.parseRoot(timeline[timeline.length - 1].label);
      if (root >= 0 && candidates[root]) {
        candidates[root].closingScore += 120; // Even stronger than opening!
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎼 CADENCE DETECTION - LONG CHORD → RESOLUTION!
    // ═══════════════════════════════════════════════════════════════════════════
    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1];
      if (!current?.label || !next?.label) continue;
      
      const currentRoot = this.parseRoot(current.label);
      const nextRoot = this.parseRoot(next.label);
      if (currentRoot < 0 || nextRoot < 0) continue;
      
      const currentDur = this.getChordDuration(current, timeline, duration);
      const nextDur = this.getChordDuration(next, timeline, duration);
      const interval = toPc(currentRoot - nextRoot);
      
      // 🎯 TENSION MULTIPLIER - Longer chord = stronger resolution!
      let tensionMultiplier = 1.0;
      if (currentDur >= 4.0) tensionMultiplier = 2.5;      // Very long tension!
      else if (currentDur >= 2.5) tensionMultiplier = 2.0; // Long tension
      else if (currentDur >= 1.5) tensionMultiplier = 1.5; // Medium tension
      
      // V → I (Perfect Authentic Cadence) - THE STRONGEST!
      if (interval === 7) {
        candidates[nextRoot].cadenceScore += 100 * tensionMultiplier;
      }
      
      // IV → I (Plagal Cadence - "Amen")
      else if (interval === 5) {
        candidates[nextRoot].cadenceScore += 70 * tensionMultiplier;
      }
      
      // vii° → I (Leading Tone)
      else if (interval === 1) {
        candidates[nextRoot].cadenceScore += 80 * tensionMultiplier;
      }
      
      // ii → I 
      else if (interval === 10) {
        candidates[nextRoot].cadenceScore += 50 * tensionMultiplier;
      }
      
      // iii → I (Mediant - common in pop)
      else if (interval === 8) {
        candidates[nextRoot].cadenceScore += 55 * tensionMultiplier;
      }
      
      // vi → I 
      else if (interval === 3) {
        candidates[nextRoot].cadenceScore += 40 * tensionMultiplier;
      }
      
      // 🔥 ANY LONG → SHORT = Tension → Resolution!
      if (currentDur >= 2.0 && nextDur < currentDur * 0.6) {
        candidates[nextRoot].cadenceScore += 40 * (currentDur / 2.0);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔄 RETURN CHORD - Chord we keep coming back to
    // ═══════════════════════════════════════════════════════════════════════════
    const avgDuration = Object.values(candidates).reduce((sum, c) => sum + c.duration, 0) / 
                        Math.max(1, Object.keys(candidates).length);
    
    for (const rootStr in candidates) {
      const root = parseInt(rootStr);
      const cand = candidates[root];
      
      // Very long total duration + multiple occurrences = home chord
      if (cand.duration > avgDuration * 1.5 && cand.count >= 3) {
        candidates[root].returnScore += 60;
      }
      
      // Appears very frequently
      if (cand.count >= timeline.length * 0.25) {
        candidates[root].returnScore += 50;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🏆 COMPUTE FINAL SCORES
    // ═══════════════════════════════════════════════════════════════════════════
    let bestRoot = key.root, bestScore = -Infinity;
    
    for (const rootStr in candidates) {
      const root = parseInt(rootStr);
      const c = candidates[root];
      
      const score = 
        c.duration * 25 +      // Duration (reduced weight)
        c.openingScore +       // First chord
        c.closingScore +       // Last chord (strongest!)
        c.cadenceScore +       // All cadences (WITH tension multiplier!)
        c.returnScore;         // Return/anchor chord
      
      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
      }
    }

    return { root: bestRoot, label: this.NOTES_SHARP[bestRoot] + (key.minor ? 'm' : ''), confidence: Math.min(100, bestScore / 5) };
  }

  getChordDuration(chord, timeline, totalDuration) {
    const idx = timeline.indexOf(chord);
    if (idx < 0) return 0.5;
    const next = timeline[idx + 1];
    return next ? Math.max(0.1, next.t - chord.t) : Math.max(0.5, totalDuration - chord.t);
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline?.length) return [];

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.50 * spb);
    const energyMedian = this.percentile(feats.frameE, 50);

    const filtered = [];
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      if (!a?.label) continue;
      
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = feats.frameE[a.fi] || 0;

      if (dur < minDur && energy < energyMedian * 0.85) continue;
      filtered.push(a);
    }

    const snapped = [];
    for (const ev of filtered) {
      if (!ev?.label) continue;
      
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const t = Math.abs(grid - raw) <= 0.35 * spb ? grid : raw;

      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi });
      }
    }

    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline?.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const earlyWindow = Math.min(12.0, Math.max(8.0, 4 * spb));
    const toPc = n => ((n % 12) + 12) % 12;

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));

    const out = [];
    for (const ev of timeline) {
      if (!ev?.label) continue;
      
      let label = ev.label;
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        if (r >= 0 && !this.inKey(r, key.root, key.minor)) {
          if (ev.t < Math.min(2.0, 1.5 * spb)) {
            label = this.NOTES_SHARP[key.root] + (key.minor ? 'm' : '');
          }
        }
      }
      out.push({ ...ev, label });
    }

    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul) {
    if (mode === 'basic') return timeline;

    const isPopMode = mode === 'pop';
    const mul = extensionMul || 1.0;
    const popMul = isPopMode ? 1.5 : 1.0;
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      if (!ev?.label) continue;
      
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }

      const isMinorTriad = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|6).*$/, '');
      if (isMinorTriad) base += 'm';

      const avg = new Float32Array(12);
      for (let i = Math.max(0, ev.fi - 2); i <= Math.min(feats.chroma.length - 1, ev.fi + 2); i++) {
        for (let p = 0; p < 12; p++) avg[p] += feats.chroma[i][p];
      }
      const len = Math.min(5, feats.chroma.length - Math.max(0, ev.fi - 2));
      for (let p = 0; p < 12; p++) avg[p] /= len;

      const s = d => avg[toPc(root + d)] || 0;
      const s_b7 = s(10);

      let label = base;
      const b7Strong = s_b7 > (0.16 * popMul) / mul;
      if (b7Strong && !/7$/.test(label)) label += '7';

      out.push({ ...ev, label });
    }

    return out;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      if (!ev?.label) continue;
      
      const r = this.parseRoot(ev.label);
      if (r < 0) { out.push(ev); continue; }

      const isMinor = /m(?!aj)/.test(ev.label);
      const tones = isMinor ? [0,3,7] : [0,4,7];
      const bass = feats.bassPc[ev.fi] ?? -1;

      if (bass >= 0 && bass !== r && tones.includes(toPc(bass - r))) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        if (c[bass] > c[r] * 0.7 && c[bass] > 0.15 / Math.max(1, bassMultiplier)) {
          const m = ev.label.match(/^([A-G](?:#|b)?)/);
          const rootName = m?.[1] || '';
          const suffix = ev.label.slice(rootName.length);
          out.push({ ...ev, label: rootName + suffix + '/' + this.getNoteName(bass, key) });
          continue;
        }
      }

      out.push(ev);
    }

    return out;
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

  getNoteName(pc, key) {
    const toPc = n => ((n % 12) + 12) % 12;
    pc = toPc(pc);
    const flatMaj = [5,10,3,8,1,6,11];
    const flatMin = [2,7,0,5,10,3,8];
    const useFlats = key.minor ? flatMin.includes(key.root) : flatMaj.includes(key.root);
    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
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
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLength = Math.floor(samples.length / ratio);
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
    const a = arr.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[Math.floor((p / 100) * (a.length - 1))];
  }

  // Get diatonic chords for a key (for Circle of Fifths display)
  getDiatonicChords(tonicNote, mode) {
    // Find tonic pitch class
    const tonicPc = this.NOTES_SHARP.indexOf(tonicNote);
    if (tonicPc < 0) return [];
    
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const chordTypes = mode === 'minor' 
      ? ['m', 'dim', '', 'm', 'm', '', '']  // i, ii°, III, iv, v, VI, VII
      : ['', 'm', 'm', '', '', 'm', 'dim']; // I, ii, iii, IV, V, vi, vii°
    
    return scale.map((degree, i) => {
      const pc = this.toPc(tonicPc + degree);
      return this.NOTES_SHARP[pc] + chordTypes[i];
    });
  }

  // Build circle of fifths chords
  buildCircleOfFifths(key) {
    const mode = key.minor ? 'minor' : 'major';
    const tonicNote = this.NOTES_SHARP[this.toPc(key.root)];
    const chords = this.getDiatonicChords(tonicNote, mode);
    
    const functionNames = key.minor 
      ? ['i (Tonic)', 'ii° (Supertonic)', 'III (Mediant)', 'iv (Subdominant)', 
         'v (Dominant)', 'VI (Submediant)', 'VII (Leading Tone)']
      : ['I (Tonic)', 'ii (Supertonic)', 'iii (Mediant)', 'IV (Subdominant)', 
         'V (Dominant)', 'vi (Submediant)', 'vii° (Leading Tone)'];
    
    return chords.map((label, i) => ({
      label,
      function: functionNames[i]
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🛡️ PROTECT MINOR TONIC - Prevent V from stealing tonic in minor keys
  // ═══════════════════════════════════════════════════════════════════════════
  protectMinorTonic(timeline, key, feats) {
    if (!key || !key.minor || !timeline || timeline.length < 8) return key;
    
    const toPc = n => ((n % 12) + 12) % 12;
    const tonicRoot = key.root;
    const dominantRoot = toPc(tonicRoot + 7);
    
    let tonicCount = 0, tonicDuration = 0;
    let dominantCount = 0, dominantDuration = 0;
    let tonicAtStart = false, tonicAtEnd = false;
    
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord || !chord.label) continue;
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;
      
      const dur = chord.duration || 1;
      
      if (root === tonicRoot) {
        tonicCount++;
        tonicDuration += dur;
        if (i < 5) tonicAtStart = true;
        if (i >= timeline.length - 5) tonicAtEnd = true;
      } else if (root === dominantRoot) {
        dominantCount++;
        dominantDuration += dur;
      }
    }
    
    if (dominantDuration > tonicDuration * 1.5) {
      if (tonicAtStart && tonicAtEnd) {
        return key;
      }
      
      if (feats && feats.bassPc && feats.frameE) {
        let restOnTonic = 0, restOnDominant = 0;
        const { bassPc, frameE } = feats;
        const thr = this.percentile(frameE, 70);
        
        for (let i = 5; i < frameE.length - 1; i++) {
          const prev3 = (frameE[i-1] + frameE[i-2] + frameE[i-3]) / 3;
          if (frameE[i] < prev3 * 0.5 && prev3 >= thr) {
            const restBass = bassPc[Math.max(0, i - 2)];
            if (restBass === tonicRoot) restOnTonic++;
            else if (restBass === dominantRoot) restOnDominant++;
          }
        }
        
        if (restOnTonic > restOnDominant) {
          return key;
        }
      }
    }
    
    return key;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎼 RECOGNIZE PROGRESSION PATTERN - Identify common chord progressions
  // ═══════════════════════════════════════════════════════════════════════════
  recognizeProgressionPattern(recentChords, key) {
    if (!recentChords || recentChords.length < 2) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const degrees = recentChords.map(chord => {
      if (!chord || !chord.label) return null;
      const root = this.parseRoot(chord.label);
      if (root < 0) return null;
      const rel = toPc(root - key.root);
      for (let i = 0; i < scale.length; i++) {
        if (toPc(scale[i]) === rel) return i + 1;
      }
      return null;
    }).filter(d => d !== null);

    if (degrees.length < 2) return null;

    const pattern = degrees.join('-');

    const progressions = {
      '1-4-5': { name: 'I-IV-V', next: 1, strength: 0.9, tonicRoot: key.root },
      '1-5-6-4': { name: 'I-V-vi-IV', next: 1, strength: 0.85, tonicRoot: key.root },
      '1-6-4-5': { name: 'I-vi-IV-V', next: 1, strength: 0.9, tonicRoot: key.root },
      '2-5': { name: 'ii-V', next: 1, strength: 0.95, tonicRoot: key.root },
      '2-5-1': { name: 'ii-V-I', next: null, strength: 1.0, tonicRoot: key.root },
      '4-5': { name: 'IV-V', next: 1, strength: 0.9, tonicRoot: key.root },
      '5-1': { name: 'V-I', next: null, strength: 1.0, tonicRoot: key.root },
      '4-1': { name: 'IV-I', next: null, strength: 0.85, tonicRoot: key.root },
      '1-4-5-1': { name: 'I-IV-V-I', next: null, strength: 1.0, tonicRoot: key.root },
      '1-5-6-4-1': { name: 'I-V-vi-IV-I', next: null, strength: 0.95, tonicRoot: key.root }
    };

    for (let len = Math.min(5, degrees.length); len >= 2; len--) {
      const slice = degrees.slice(-len).join('-');
      if (progressions[slice]) {
        const p = progressions[slice];
        return { 
          pattern: slice, 
          ...p,
          confidence: p.strength * 100
        };
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔮 PREDICT NEXT CHORD - Predict next chord based on memory & theory
  // ═══════════════════════════════════════════════════════════════════════════
  predictNextChord(recentChords, key) {
    if (!recentChords || !recentChords.length) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const lastChord = recentChords[recentChords.length - 1];
    if (!lastChord || !lastChord.label) return null;
    
    const lastRoot = this.parseRoot(lastChord.label);
    if (lastRoot < 0) return null;

    const predictions = [];

    const progression = this.recognizeProgressionPattern(recentChords, key);
    if (progression && progression.next !== null) {
      const deg = progression.next;
      const targetRoot = toPc(key.root + scale[deg - 1]);
      predictions.push({ root: targetRoot, label: this.getNoteName(targetRoot, key), confidence: progression.strength });
    }

    const fifthUp = toPc(lastRoot + 7);
    const fifthDown = toPc(lastRoot - 7);

    if (this.inKey(fifthUp, key.root, key.minor)) {
      predictions.push({ root: fifthUp, label: this.getNoteName(fifthUp, key), confidence: 0.7 });
    }
    if (this.inKey(fifthDown, key.root, key.minor)) {
      predictions.push({ root: fifthDown, label: this.getNoteName(fifthDown, key), confidence: 0.6 });
    }

    const stepUp = toPc(lastRoot + 2);
    const stepDown = toPc(lastRoot - 2);
    if (this.inKey(stepUp, key.root, key.minor)) {
      predictions.push({ root: stepUp, label: this.getNoteName(stepUp, key), confidence: 0.5 });
    }
    if (this.inKey(stepDown, key.root, key.minor)) {
      predictions.push({ root: stepDown, label: this.getNoteName(stepDown, key), confidence: 0.5 });
    }

    const map = new Map();
    for (const p of predictions) {
      if (!map.has(p.root) || map.get(p.root).confidence < p.confidence) {
        map.set(p.root, p);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎓 ENRICH TIMELINE WITH THEORY - Add progression recognition & predictions
  // ═══════════════════════════════════════════════════════════════════════════
  enrichTimelineWithTheory(timeline, feats, key) {
    const enriched = [];
    const recent = [];
    const MEMORY = 5;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord || !chord.label) continue;
      
      const analyzed = { ...chord };

      if (recent.length >= 2) {
        const prog = this.recognizeProgressionPattern(recent, key);
        if (prog) analyzed.recognizedProgression = prog.name;
      }

      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      if (next && next.label) {
        const preds = this.predictNextChord(recent.concat([analyzed]), key);
        if (preds && preds.length) {
          analyzed.predictions = preds;
          const nextRoot = this.parseRoot(next.label);
          if (nextRoot >= 0 && preds[0].root === nextRoot) {
            analyzed.predictionMatch = true;
            analyzed.predictionConfidence = preds[0].confidence;
          }
        }
      }

      enriched.push(analyzed);
      recent.push(analyzed);
      if (recent.length > MEMORY) recent.shift();
    }

    return enriched;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
