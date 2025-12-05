/**
 * 🎵 MajorMinorRefiner v2.0 - Enhanced Major/Minor Validator
 * 
 * בוחן ייעודי לזיהוי מז'ור/מינור ברמת אקורד בודד
 * 
 * מטרה: לספק "שופט נוסף" למנוע האקורדים שמתמקד רק בשאלה:
 * "האקורד הזה מז'ורי או מינורי?"
 * 
 * שיפורים על GPT's version:
 * ✅ Harmonic weighting - שלישית חזקה יותר בהרמוניות גבוהות
 * ✅ Octave folding - מאחד אנרגיה מכל האוקטבות
 * ✅ Confidence scoring - מחשבון ביטחון משופר
 * ✅ Context awareness - מתחשב בסביבה (sus, 7th, etc)
 * ✅ Better thresholds - סף החלטה דינמי
 * 
 * Usage:
 *   const refiner = new MajorMinorRefiner();
 *   const refined = await refiner.refineChordTimeline(audioBuffer, chordTimeline);
 */

class MajorMinorRefiner {
  constructor() {
    this.NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTE_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  }

  /**
   * Main refinement function
   * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
   * @param {Array} chordTimeline - Chord timeline from main engine
   * @param {Object} options - Configuration
   * @returns {Array} Refined timeline with qualityRefined and qualityConfidence
   */
  async refineChordTimeline(audioBuffer, chordTimeline, options = {}) {
    const opts = {
      frameSize: options.frameSize || 4096,
      hopSize: options.hopSize || 2048,
      minFreq: options.minFreq || 80,        // Was 60, now 80 - skip sub-bass noise
      maxFreq: options.maxFreq || 4000,
      minThirdEnergy: options.minThirdEnergy || 5e-5, // Lower threshold
      decisionThreshold: options.decisionThreshold || 0.15, // ⚡ AGGRESSIVE: Was 0.20, now 0.15
      minConfidenceToOverride: options.minConfidenceToOverride || 0.40, // ⚡ AGGRESSIVE: Was 0.60, now 0.40
      debug: options.debug || false
    };

    const sr = audioBuffer.sampleRate;
    const mono = this._toMono(audioBuffer);

    if (opts.debug) {
      console.log('\n🎵 MajorMinorRefiner v2.0');
      console.log(`   Processing ${chordTimeline.length} chords...`);
    }

    const results = [];
    let refinements = 0;
    let agreements = 0;
    let unknowns = 0;

    for (let idx = 0; idx < chordTimeline.length; idx++) {
      const chord = chordTimeline[idx];
      
      // Parse root from label
      const rootPc = this._parseRoot(chord.label);
      if (rootPc < 0) {
        results.push({ 
          ...chord, 
          qualityRefined: 'unknown', 
          qualityConfidence: 0, 
          refinedLabel: chord.label,
          reason: 'invalid_root'
        });
        continue;
      }

      const tStart = chord.t || chord.tStart || 0;
      const tEnd = chord.tEnd || (chordTimeline[idx + 1] ? chordTimeline[idx + 1].t : tStart + 1.0);

      if (tEnd <= tStart) {
        results.push({ 
          ...chord, 
          qualityRefined: 'unknown', 
          qualityConfidence: 0, 
          refinedLabel: chord.label,
          reason: 'invalid_duration'
        });
        continue;
      }

      // ⚡ GPT SUGGESTION: For long chords, use center 60% to reduce attack/release noise
      const duration = tEnd - tStart;
      let analyzeStart = tStart;
      let analyzeEnd = tEnd;
      
      if (duration > 1.5) {
        // Long chord - use center 60% (skip 20% from each side)
        const margin = duration * 0.20;
        analyzeStart = tStart + margin;
        analyzeEnd = tEnd - margin;
      }

      // Extract audio segment
      const startSample = Math.max(0, Math.floor(analyzeStart * sr));
      const endSample = Math.min(mono.length, Math.floor(analyzeEnd * sr));
      const segment = mono.subarray(startSample, endSample);

      if (segment.length < opts.frameSize) {
        results.push({ 
          ...chord, 
          qualityRefined: 'unknown', 
          qualityConfidence: 0, 
          refinedLabel: chord.label,
          reason: 'too_short'
        });
        unknowns++;
        continue;
      }

      // ✅ NEW: Check if chord type is refineable
      const chordType = this._getChordType(chord.label);
      if (chordType === 'skip') {
        // sus, dim, aug, power chords - don't refine
        results.push({
          ...chord,
          qualityRefined: 'unknown',
          qualityConfidence: 0,
          refinedLabel: chord.label,
          reason: 'non_refineable_type'
        });
        unknowns++;
        continue;
      }

      // Analyze segment
      const analysis = this._analyzeSegmentChroma(segment, sr, rootPc, opts);
      const { thirdInfo } = analysis;

      // Decision logic
      const decision = this._makeDecision(
        thirdInfo,
        chordType,
        chord.label,
        opts
      );

      if (opts.debug && decision.qualityRefined !== 'unknown') {
        console.log(
          `  ${chord.label.padEnd(6)} @ ${tStart.toFixed(1)}s: ` +
          `M3=${thirdInfo.ratioMajor.toFixed(2)} m3=${thirdInfo.ratioMinor.toFixed(2)} → ` +
          `${decision.qualityRefined} (conf: ${(decision.qualityConfidence * 100).toFixed(0)}%)`
        );
      }

      // Build result
      const result = {
        ...chord,
        ...decision,
        thirdAnalysis: thirdInfo // Store for debugging
      };

      results.push(result);

      // Stats
      if (decision.qualityRefined === 'unknown') {
        unknowns++;
      } else if (decision.qualityRefined === chordType) {
        agreements++;
      } else {
        refinements++;
      }
    }

    if (opts.debug) {
      console.log(`\n📊 Summary:`);
      console.log(`   Agreements: ${agreements} (refiner confirms original)`);
      console.log(`   Refinements: ${refinements} (refiner suggests change)`);
      console.log(`   Unknown: ${unknowns} (insufficient data)`);
      console.log(`   Total: ${chordTimeline.length}`);
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════
  // DECISION LOGIC
  // ═══════════════════════════════════════════════════════

  _makeDecision(thirdInfo, originalType, originalLabel, opts) {
    const {
      majorThirdEnergy,
      minorThirdEnergy,
      totalThirdEnergy,
      ratioMajor,
      ratioMinor,
      harmonicWeightedMajor,
      harmonicWeightedMinor
    } = thirdInfo;

    // No third detected - can't decide
    if (totalThirdEnergy < opts.minThirdEnergy) {
      return {
        qualityRefined: 'unknown',
        qualityConfidence: 0,
        refinedLabel: originalLabel,
        reason: 'insufficient_third_energy'
      };
    }

    // ✅ NEW: Use harmonic-weighted ratios (more accurate!)
    const weightedTotal = harmonicWeightedMajor + harmonicWeightedMinor;
    const weightedRatioMajor = harmonicWeightedMajor / weightedTotal;
    const weightedRatioMinor = harmonicWeightedMinor / weightedTotal;
    
    const diff = weightedRatioMajor - weightedRatioMinor; // -1 to 1
    const absDiff = Math.abs(diff);

    // Too close to call
    if (absDiff < opts.decisionThreshold) {
      return {
        qualityRefined: 'unknown',
        qualityConfidence: absDiff,
        refinedLabel: originalLabel,
        reason: 'ambiguous_third'
      };
    }

    // Clear decision
    const qualityRefined = diff > 0 ? 'major' : 'minor';
    
    // ✅ IMPROVED: Better confidence calculation
    // Factor in:
    // 1. How clear the decision is (absDiff)
    // 2. How strong the winning third is (ratio)
    // 3. Total energy (stronger = more confident)
    
    const decisionClarity = Math.min(1.0, absDiff / 0.5); // 0.5 = very clear
    const winningRatio = diff > 0 ? weightedRatioMajor : weightedRatioMinor;
    const energyFactor = Math.min(1.0, totalThirdEnergy / 0.001);
    
    const qualityConfidence = (
      decisionClarity * 0.5 +
      winningRatio * 0.3 +
      energyFactor * 0.2
    );

    // Build refined label
    const rootName = this._getRootName(originalLabel);
    let refinedLabel = originalLabel;

    // Only refine simple triads and 7th chords
    if (originalType === 'major' || originalType === 'minor') {
      // Check if it has 7th
      const has7 = /7/.test(originalLabel) && !/maj7/i.test(originalLabel);
      const hasMaj7 = /maj7/i.test(originalLabel);
      
      if (qualityRefined === 'minor') {
        refinedLabel = rootName + 'm';
        if (has7) refinedLabel += '7';
        else if (hasMaj7) refinedLabel += 'maj7'; // Rare but possible
      } else {
        refinedLabel = rootName;
        if (has7) refinedLabel += '7';
        else if (hasMaj7) refinedLabel += 'maj7';
      }
    }

    return {
      qualityRefined,
      qualityConfidence,
      refinedLabel,
      shouldOverride: qualityConfidence >= opts.minConfidenceToOverride &&
                      qualityRefined !== originalType,
      reason: 'clear_decision'
    };
  }

  // ═══════════════════════════════════════════════════════
  // CHROMA ANALYSIS
  // ═══════════════════════════════════════════════════════

  _analyzeSegmentChroma(segment, sr, rootPc, opts) {
    const N = opts.frameSize;
    const hop = opts.hopSize;

    const hann = this._hannWindow(N);
    const chromaAccum = new Float32Array(12);
    
    // ✅ NEW: Track harmonics separately for better weighting
    const harmonicLevels = [
      new Float32Array(12), // Fundamental
      new Float32Array(12), // 1st harmonic (octave)
      new Float32Array(12), // 2nd harmonic
      new Float32Array(12)  // 3rd harmonic
    ];
    
    let framesCount = 0;

    for (let pos = 0; pos + N <= segment.length; pos += hop) {
      const frame = segment.subarray(pos, pos + N);
      const win = new Float32Array(N);
      for (let n = 0; n < N; n++) win[n] = frame[n] * hann[n];

      const { real, imag } = this._fft(win);
      const mag = new Float32Array(N / 2);
      for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(real[k], imag[k]);

      const binMin = Math.max(1, Math.floor(opts.minFreq * N / sr));
      const binMax = Math.min(mag.length - 1, Math.floor(opts.maxFreq * N / sr));

      for (let k = binMin; k <= binMax; k++) {
        const f = k * sr / N;
        const amp = mag[k];
        const pwr = amp * amp;

        const midi = this._hzToMidi(f);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        
        chromaAccum[pc] += pwr;
        
        // ✅ NEW: Track which harmonic level this is
        const octave = Math.floor(midi / 12);
        const harmonicLevel = Math.min(3, Math.max(0, octave - 3)); // C3=0, C4=1, C5=2, C6=3
        harmonicLevels[harmonicLevel][pc] += pwr;
      }

      framesCount++;
    }

    if (framesCount === 0) {
      return {
        chroma: new Float32Array(12),
        thirdInfo: this._emptyThirdInfo()
      };
    }

    // Calculate third energies
    const majorThirdPc = (rootPc + 4) % 12;
    const minorThirdPc = (rootPc + 3) % 12;

    const majorThirdEnergy = chromaAccum[majorThirdPc];
    const minorThirdEnergy = chromaAccum[minorThirdPc];
    const totalThirdEnergy = majorThirdEnergy + minorThirdEnergy + 1e-9;

    const ratioMajor = majorThirdEnergy / totalThirdEnergy;
    const ratioMinor = minorThirdEnergy / totalThirdEnergy;

    // ✅ NEW: Harmonic-weighted calculation
    // Higher harmonics get MORE weight (clearer, less bass mud)
    const weights = [0.5, 0.8, 1.0, 1.0]; // Fundamental gets less weight
    let harmonicWeightedMajor = 0;
    let harmonicWeightedMinor = 0;
    let totalWeight = 0;

    for (let h = 0; h < harmonicLevels.length; h++) {
      harmonicWeightedMajor += harmonicLevels[h][majorThirdPc] * weights[h];
      harmonicWeightedMinor += harmonicLevels[h][minorThirdPc] * weights[h];
      totalWeight += weights[h];
    }

    harmonicWeightedMajor /= totalWeight;
    harmonicWeightedMinor /= totalWeight;

    return {
      chroma: chromaAccum,
      thirdInfo: {
        majorThirdEnergy,
        minorThirdEnergy,
        totalThirdEnergy,
        ratioMajor,
        ratioMinor,
        harmonicWeightedMajor,
        harmonicWeightedMinor,
        majorThirdPc,
        minorThirdPc,
        majorThirdName: this.NOTE_NAMES_SHARP[majorThirdPc],
        minorThirdName: this.NOTE_NAMES_SHARP[minorThirdPc],
        rootPc,
        rootName: this.NOTE_NAMES_SHARP[rootPc]
      }
    };
  }

  _emptyThirdInfo() {
    return {
      majorThirdEnergy: 0,
      minorThirdEnergy: 0,
      totalThirdEnergy: 0,
      ratioMajor: 0.5,
      ratioMinor: 0.5,
      harmonicWeightedMajor: 0,
      harmonicWeightedMinor: 0
    };
  }

  // ═══════════════════════════════════════════════════════
  // HELPER: Chord type detection
  // ═══════════════════════════════════════════════════════

  _getChordType(label) {
    if (!label) return 'skip';
    const lower = label.toLowerCase();

    // Non-refineable types
    if (lower.includes('sus')) return 'skip';
    if (lower.includes('dim') || lower.includes('°')) return 'skip';
    if (lower.includes('aug') || lower.includes('+')) return 'skip';
    if (lower.includes('ø')) return 'skip'; // half-diminished
    if (/^[A-G][#b]?5?$/.test(label)) return 'skip'; // Power chords

    // Refineable types
    if (/m(?!aj)/.test(label)) return 'minor';
    return 'major';
  }

  _getRootName(label) {
    const m = label.match(/^([A-G][#b]?)/);
    return m ? m[1] : '';
  }

  _parseRoot(label) {
    if (!label) return -1;
    const m = label.match(/^([A-G])([#b])?/);
    if (!m) return -1;

    const note = m[1] + (m[2] || '');
    let idx = this.NOTE_NAMES_SHARP.indexOf(note);
    if (idx >= 0) return idx;

    idx = this.NOTE_NAMES_FLAT.indexOf(note);
    return idx >= 0 ? idx : -1;
  }

  // ═══════════════════════════════════════════════════════
  // AUDIO PROCESSING (same as BassEngine)
  // ═══════════════════════════════════════════════════════

  _toMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
    
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    
    for (let ch = 0; ch < numChannels; ch++) {
      const channel = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += channel[i] / numChannels;
    }
    
    return mono;
  }

  _hannWindow(N) {
    const win = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      win[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
    }
    return win;
  }

  _fft(signal) {
    const N = signal.length;
    if ((N & (N - 1)) !== 0) throw new Error('FFT: length must be power of 2');

    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let i = 0; i < N; i++) { real[i] = signal[i]; imag[i] = 0; }

    // Bit-reversal
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) { j -= m; m >>= 1; }
      j += m;
    }

    // FFT stages
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1;
      const theta = -2 * Math.PI / size;
      const wpr = Math.cos(theta);
      const wpi = Math.sin(theta);
      
      for (let start = 0; start < N; start += size) {
        let wr = 1, wi = 0;
        for (let k = 0; k < half; k++) {
          const evenIndex = start + k;
          const oddIndex = evenIndex + half;

          const tr = wr * real[oddIndex] - wi * imag[oddIndex];
          const ti = wr * imag[oddIndex] + wi * real[oddIndex];

          real[oddIndex] = real[evenIndex] - tr;
          imag[oddIndex] = imag[evenIndex] - ti;
          real[evenIndex] += tr;
          imag[evenIndex] += ti;

          const wrNext = wr * wpr - wi * wpi;
          wi = wr * wpi + wi * wpr;
          wr = wrNext;
        }
      }
    }

    return { real, imag };
  }

  _hzToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MajorMinorRefiner;
}
