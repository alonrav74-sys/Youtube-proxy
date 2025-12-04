/**
 * 🎼 ChordHelpers v2.0 - Bass & Major/Minor Analysis
 * 
 * מאחד שני מודולי עזר לזיהוי אקורדים:
 * 🎸 BassEngine - זיהוי תווי בס (20-250Hz)
 * 🎹 MajorMinorRefiner - זיהוי מז'ור/מינור על סמך הצליל
 * 
 * Usage:
 *   const bassEngine = new BassEngine();
 *   const refiner = new MajorMinorRefiner();
 * 
 * @version 2.0
 * @date 2024-12
 */

// ═══════════════════════════════════════════════════════════════════════════
// 🎸 BassEngine - Bass Note Detection
// ═══════════════════════════════════════════════════════════════════════════

class BassEngine {
  constructor() {
    this.NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTE_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  }

  /**
   * Main analysis function
   * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
   * @param {Object} options - Configuration
   * @returns {Array} Bass timeline: [{ tStart, tEnd, midi, noteName, pc, confidence, quality }]
   */
  async analyzeBass(audioBuffer, options = {}) {
    const opts = {
      frameSize: options.frameSize || 4096,           // ~93ms @ 44.1kHz
      hopSize: options.hopSize || 2048,               // 50% overlap
      lowHzMin: options.lowHzMin || 20,               // Lowest bass frequency
      lowHzMax: options.lowHzMax || 250,              // Highest bass frequency (was 200, now 250 for better coverage)
      minSegmentDuration: options.minSegmentDuration || 0.25, // Min segment length (seconds)
      hpsHarmonics: options.hpsHarmonics || 5,        // HPS harmonics (was 4, now 5)
      energyPercentile: options.energyPercentile || 75, // Dynamic threshold (was 80, now 75)
      debug: options.debug || false
    };

    const sampleRate = audioBuffer.sampleRate;
    const mono = this._toMono(audioBuffer);
    const hann = this._hannWindow(opts.frameSize);

    const numFrames = Math.floor((mono.length - opts.frameSize) / opts.hopSize) + 1;
    const times = new Float32Array(numFrames);
    const energies = new Float32Array(numFrames);
    const candidates = new Array(numFrames).fill(null);

    if (opts.debug) {
      console.log(`\n🎸 BassEngine v2.0:`);
      console.log(`   Frames: ${numFrames}, SR: ${sampleRate}Hz`);
      console.log(`   Range: ${opts.lowHzMin}-${opts.lowHzMax}Hz`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Frame-by-frame analysis
    // ═══════════════════════════════════════════════════════
    for (let i = 0; i < numFrames; i++) {
      const offset = i * opts.hopSize;
      const frame = mono.subarray(offset, Math.min(offset + opts.frameSize, mono.length));
      
      // Apply Hann window
      const windowed = new Float32Array(opts.frameSize);
      for (let n = 0; n < frame.length; n++) windowed[n] = frame[n] * hann[n];

      // FFT
      const { real, imag } = this._fft(windowed);
      const mag = new Float32Array(opts.frameSize / 2);
      for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(real[k], imag[k]);

      // Bass frequency range bins
      const binMin = Math.max(1, Math.floor(opts.lowHzMin * opts.frameSize / sampleRate));
      const binMax = Math.min(mag.length - 1, Math.floor(opts.lowHzMax * opts.frameSize / sampleRate));

      // Energy in bass range
      let energyLow = 0;
      for (let k = binMin; k <= binMax; k++) energyLow += mag[k] * mag[k];
      energies[i] = energyLow;

      // ✅ NEW: Zero-crossing rate (noise rejection)
      let zeroCrossings = 0;
      for (let n = 1; n < frame.length; n++) {
        if ((frame[n] >= 0 && frame[n - 1] < 0) || (frame[n] < 0 && frame[n - 1] >= 0)) {
          zeroCrossings++;
        }
      }
      const zcr = zeroCrossings / frame.length;

      // Skip if too noisy (high ZCR = noise/cymbals)
      if (zcr > 0.15) {
        times[i] = offset / sampleRate;
        continue;
      }

      // ✅ IMPROVED: HPS with parabolic interpolation
      const hps = new Float32Array(mag.length);
      let bestBin = -1, bestVal = 0;

      for (let k = binMin; k <= binMax; k++) {
        let prod = mag[k];
        let allHarmonicsPresent = true;
        
        for (let h = 2; h <= opts.hpsHarmonics; h++) {
          const idx = k * h;
          if (idx >= mag.length) {
            allHarmonicsPresent = false;
            break;
          }
          prod *= mag[idx];
        }
        
        // ✅ NEW: Require at least 3 harmonics to be present
        if (allHarmonicsPresent) {
          hps[k] = prod;
          if (prod > bestVal) {
            bestVal = prod;
            bestBin = k;
          }
        }
      }

      if (bestBin > binMin && bestBin < binMax && bestVal > 0) {
        // ✅ NEW: Parabolic interpolation for sub-bin accuracy
        const y0 = hps[bestBin - 1];
        const y1 = hps[bestBin];
        const y2 = hps[bestBin + 1];
        
        const delta = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2);
        const refinedBin = bestBin + Math.max(-0.5, Math.min(0.5, delta));
        
        const f0 = refinedBin * sampleRate / opts.frameSize;
        const midi = this._hzToMidi(f0);
        const pc = ((Math.round(midi) % 12) + 12) % 12;

        // ✅ NEW: Spectral centroid for quality measure
        let centroidNumerator = 0, centroidDenominator = 0;
        for (let k = binMin; k <= binMax; k++) {
          const f = k * sampleRate / opts.frameSize;
          centroidNumerator += f * mag[k];
          centroidDenominator += mag[k];
        }
        const spectralCentroid = centroidDenominator > 0 ? centroidNumerator / centroidDenominator : 0;

        // ✅ NEW: Harmonic consistency - check if harmonics align with f0
        let harmonicStrength = 0;
        for (let h = 1; h <= 3; h++) {
          const expectedBin = Math.round(refinedBin * h);
          if (expectedBin < mag.length) {
            harmonicStrength += mag[expectedBin];
          }
        }

        candidates[i] = {
          f0,
          midi,
          pc,
          noteName: this.NOTE_NAMES_SHARP[pc],
          hps: bestVal,
          energyLow,
          zcr,
          spectralCentroid,
          harmonicStrength,
          quality: this._computeQuality(bestVal, energyLow, zcr, harmonicStrength)
        };
      }

      times[i] = offset / sampleRate;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Dynamic energy thresholding
    // ═══════════════════════════════════════════════════════
    const energyThreshold = this._percentile(energies, opts.energyPercentile / 100);
    
    if (opts.debug) {
      console.log(`   Energy threshold (${opts.energyPercentile}%): ${energyThreshold.toFixed(3)}`);
    }

    let filteredCount = 0;
    for (let i = 0; i < numFrames; i++) {
      if (!candidates[i]) continue;
      
      // ✅ IMPROVED: Filter by energy AND quality
      if (energies[i] < energyThreshold || candidates[i].quality < 0.3) {
        candidates[i] = null;
        filteredCount++;
      }
    }

    if (opts.debug) {
      console.log(`   Filtered ${filteredCount} weak frames`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: Build stable segments
    // ═══════════════════════════════════════════════════════
    const segments = this._buildSegments(
      times,
      candidates,
      opts.hopSize / sampleRate,
      opts.minSegmentDuration
    );

    // ✅ NEW: Merge adjacent similar segments
    const merged = this._mergeAdjacentSegments(segments);

    if (opts.debug) {
      console.log(`   Raw segments: ${segments.length}`);
      console.log(`   After merge: ${merged.length}`);
      console.log(`   ✅ Analysis complete!\n`);
    }

    return merged;
  }

  // ═══════════════════════════════════════════════════════
  // HELPER: Audio processing
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

  // ═══════════════════════════════════════════════════════
  // HELPER: Segment building
  // ═══════════════════════════════════════════════════════

  _buildSegments(times, candidates, frameDuration, minSegmentDuration) {
    const segments = [];
    let current = null;
    const pitchToleranceSemitones = 0.75; // ±3/4 semitone

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const t = times[i];

      if (!c) {
        if (current) {
          current.tEnd = t;
          this._finalizeSegment(current);
          if (current.duration >= minSegmentDuration) segments.push(current);
          current = null;
        }
        continue;
      }

      if (!current) {
        current = {
          tStart: t,
          tEnd: t + frameDuration,
          frames: [c],
          energySum: c.energyLow,
          qualitySum: c.quality
        };
      } else {
        const last = current.frames[current.frames.length - 1];
        if (Math.abs(last.midi - c.midi) <= pitchToleranceSemitones) {
          current.frames.push(c);
          current.energySum += c.energyLow;
          current.qualitySum += c.quality;
          current.tEnd = t + frameDuration;
        } else {
          current.tEnd = t;
          this._finalizeSegment(current);
          if (current.duration >= minSegmentDuration) segments.push(current);
          current = {
            tStart: t,
            tEnd: t + frameDuration,
            frames: [c],
            energySum: c.energyLow,
            qualitySum: c.quality
          };
        }
      }
    }

    if (current) {
      this._finalizeSegment(current);
      if (current.duration >= minSegmentDuration) segments.push(current);
    }

    return segments;
  }

  _finalizeSegment(segment) {
    const frames = segment.frames;
    const n = frames.length;
    if (n === 0) {
      segment.duration = 0;
      segment.confidence = 0;
      return;
    }

    // Energy-weighted average MIDI
    let sumEnergy = 0, sumMidi = 0;
    for (const f of frames) {
      sumEnergy += f.energyLow;
      sumMidi += f.midi * f.energyLow;
    }

    const avgMidi = sumMidi / (sumEnergy || 1);
    const roundedMidi = Math.round(avgMidi);
    const pc = ((roundedMidi % 12) + 12) % 12;

    segment.midi = avgMidi;
    segment.pc = pc;
    segment.noteName = this.NOTE_NAMES_SHARP[pc];
    segment.duration = segment.tEnd - segment.tStart;
    segment.quality = segment.qualitySum / n;

    // ✅ IMPROVED: Confidence combines HPS strength, energy, and quality
    const avgEnergy = segment.energySum / n;
    segment.confidence = Math.min(1.0, segment.quality * this._sigmoid(avgEnergy * 0.0001));
  }

  // ✅ NEW: Merge adjacent segments with same note
  _mergeAdjacentSegments(segments) {
    if (segments.length < 2) return segments;

    const merged = [];
    let current = segments[0];

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      
      // Same note and small gap?
      const gap = next.tStart - current.tEnd;
      if (current.pc === next.pc && gap < 0.2) {
        // Merge
        current.tEnd = next.tEnd;
        current.duration = current.tEnd - current.tStart;
        current.confidence = Math.max(current.confidence, next.confidence);
        current.quality = Math.max(current.quality, next.quality);
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);
    return merged;
  }

  // ═══════════════════════════════════════════════════════
  // HELPER: Math utilities
  // ═══════════════════════════════════════════════════════

  _computeQuality(hps, energy, zcr, harmonicStrength) {
    // Quality score 0-1 based on multiple factors
    const hpsScore = this._sigmoid(hps * 0.00001);
    const energyScore = this._sigmoid(energy * 0.0001);
    const zcrScore = 1 - Math.min(1, zcr / 0.15); // Lower ZCR = higher quality
    const harmonicScore = this._sigmoid(harmonicStrength * 0.001);
    
    return (hpsScore * 0.4 + energyScore * 0.3 + zcrScore * 0.2 + harmonicScore * 0.1);
  }

  _hzToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].filter(x => isFinite(x)).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const idx = Math.floor(p * (sorted.length - 1));
    return sorted[idx];
  }

  _sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  // ═══════════════════════════════════════════════════════
  // PUBLIC: Get note name with accidentals preference
  // ═══════════════════════════════════════════════════════

  getNoteName(pc, useFlats = false) {
    return useFlats ? this.NOTE_NAMES_FLAT[pc] : this.NOTE_NAMES_SHARP[pc];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
}


// ═══════════════════════════════════════════════════════════════════════════
// 🎹 MajorMinorRefiner - Major/Minor Quality Detection
// ═══════════════════════════════════════════════════════════════════════════

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
      decisionThreshold: options.decisionThreshold || 0.20, // Was 0.25, now 0.20
      minConfidenceToOverride: options.minConfidenceToOverride || 0.60, // NEW
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

      // Extract audio segment
      const startSample = Math.max(0, Math.floor(tStart * sr));
      const endSample = Math.min(mono.length, Math.floor(tEnd * sr));
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
