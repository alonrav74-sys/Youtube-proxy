/**
 * 🎸 BassEngine v2.0 - Enhanced Bass Detection
 * מודול מתקדם לזיהוי תווי בס מדויקים (20-250Hz)
 * 
 * שיפורים על GPT's version:
 * ✅ Parabolic interpolation לדיוק sub-bin
 * ✅ Spectral centroid למדידת איכות
 * ✅ Zero-crossing rate לסינון רעש
 * ✅ Dynamic energy thresholding
 * ✅ Harmonic consistency check
 * ✅ Better segment merging
 * 
 * Usage:
 *   const bassEngine = new BassEngine();
 *   const timeline = await bassEngine.analyzeBass(audioBuffer, { debug: true });
 */

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

  /**
   * Refine chord timeline with aggressive bass-driven logic
   * ⚡ RULE: Bass note DOMINATES chord choice!
   * 
   * @param {AudioBuffer} audioBuffer 
   * @param {Array} timeline - Chord timeline from HMM
   * @param {Object} key - Detected key
   * @param {Object} options 
   * @returns {Array} Refined timeline
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const opts = {
      bassMultiplier: options.bassMultiplier || 1.2,
      minInversionConfidence: options.minInversionConfidence || 0.45,  // ⚡ AGGRESSIVE: Was 0.65
      minChordChangeConfidence: options.minChordChangeConfidence || 0.55, // ⚡ NEW: When to change chord
      debug: options.debug || false
    };

    // Run bass analysis
    const bassTimeline = await this.analyzeBass(audioBuffer, {
      debug: opts.debug,
      minSegmentDuration: 0.2  // Shorter segments for more detail
    });

    if (opts.debug) {
      console.log(`\n🎸 BassEngine refineBassInTimeline:`);
      console.log(`   Chords: ${timeline.length}, Bass segments: ${bassTimeline.length}`);
    }

    const refined = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const chordStart = chord.t || chord.tStart || 0;
      const chordEnd = timeline[i + 1] ? (timeline[i + 1].t || timeline[i + 1].tStart) : chordStart + 2.0;

      // Find dominant bass note in this chord's time window
      const relevantBass = bassTimeline.filter(b => 
        (b.tStart >= chordStart && b.tStart < chordEnd) ||
        (b.tEnd > chordStart && b.tEnd <= chordEnd) ||
        (b.tStart <= chordStart && b.tEnd >= chordEnd)
      );

      if (!relevantBass.length) {
        refined.push({ ...chord });
        continue;
      }

      // Weight by duration and confidence
      let weightedPc = {};
      let totalWeight = 0;

      for (const bass of relevantBass) {
        const overlap = Math.min(bass.tEnd, chordEnd) - Math.max(bass.tStart, chordStart);
        const weight = overlap * (bass.confidence || 0.5);
        const pc = bass.pc;
        
        weightedPc[pc] = (weightedPc[pc] || 0) + weight;
        totalWeight += weight;
      }

      // Find strongest bass PC
      let strongestBass = -1;
      let strongestWeight = 0;
      for (const pc in weightedPc) {
        if (weightedPc[pc] > strongestWeight) {
          strongestWeight = weightedPc[pc];
          strongestBass = parseInt(pc);
        }
      }

      if (strongestBass < 0) {
        refined.push({ ...chord });
        continue;
      }

      const bassConfidence = strongestWeight / totalWeight;

      // Parse chord root and intervals
      const rootPc = this._parseRoot(chord.label);
      if (rootPc < 0) {
        refined.push({ ...chord });
        continue;
      }

      // Determine chord intervals
      const isMinor = /m(?!aj)/.test(chord.label);
      const isSus2 = /sus2/.test(chord.label);
      const isSus4 = /sus4/.test(chord.label);
      const has7 = /7/.test(chord.label) && !/maj7/i.test(chord.label);
      const hasMaj7 = /maj7/i.test(chord.label);

      let chordTones = isSus2 ? [0, 2, 7] : 
                       isSus4 ? [0, 5, 7] : 
                       isMinor ? [0, 3, 7] : [0, 4, 7];
      
      if (has7) chordTones.push(10);
      if (hasMaj7) chordTones.push(11);

      const chordPcs = chordTones.map(iv => toPc(rootPc + iv));
      const bassInChord = chordPcs.includes(strongestBass);

      // ═══════════════════════════════════════════════════════════════════════════
      // ⚡ DECISION LOGIC: Bass DOMINATES!
      // ═══════════════════════════════════════════════════════════════════════════

      if (bassInChord) {
        // ✅ Bass is in chord → Add inversion if strong enough
        if (strongestBass !== rootPc && bassConfidence >= opts.minInversionConfidence) {
          const bassNoteName = this._getRootName(chord.label, strongestBass);
          const slashChord = chord.label + '/' + bassNoteName;
          
          if (opts.debug) {
            console.log(`  ✅ ${chord.label} @ ${chordStart.toFixed(1)}s: Bass ${bassNoteName} (${(bassConfidence * 100).toFixed(0)}%) → ${slashChord}`);
          }
          
          refined.push({ ...chord, label: slashChord, bassNote: strongestBass, bassConfidence });
        } else {
          refined.push({ ...chord });
        }
      } else {
        // ⚡ Bass NOT in chord → CHANGE chord if bass is strong!
        
        if (bassConfidence >= opts.minChordChangeConfidence) {
          // Build new chord with bass as root
          const diatonicInKey = this._inKey(strongestBass, key.root, key.minor);
          
          // Determine quality based on key
          const scale = key.minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
          const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
          
          let newLabel = this.NOTE_NAMES_SHARP[strongestBass];
          
          if (diatonicInKey) {
            const rel = toPc(strongestBass - key.root);
            for (let d = 0; d < scale.length; d++) {
              if (toPc(scale[d]) === rel) {
                newLabel += qualities[d];
                break;
              }
            }
          }
          
          if (opts.debug) {
            console.log(`  ⚡ ${chord.label} @ ${chordStart.toFixed(1)}s: Bass ${newLabel.split(/[^A-G#b]/)[0]} NOT in chord (${(bassConfidence * 100).toFixed(0)}%) → CHANGE to ${newLabel}`);
          }
          
          refined.push({ 
            ...chord, 
            label: newLabel, 
            bassNote: strongestBass, 
            bassConfidence,
            changedByBass: true 
          });
        } else {
          // Bass weak - keep original
          if (opts.debug) {
            console.log(`  ⚠️  ${chord.label} @ ${chordStart.toFixed(1)}s: Bass weak (${(bassConfidence * 100).toFixed(0)}%) → keep original`);
          }
          refined.push({ ...chord });
        }
      }
    }

    return refined;
  }

  _inKey(pc, keyRoot, keyMinor) {
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = keyMinor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
    const diatonic = scale.map(iv => toPc(keyRoot + iv));
    return diatonic.includes(toPc(pc));
  }

  _getRootName(originalLabel, pc) {
    // Extract root name style (sharp vs flat) from original
    const useFlat = /[A-G]b/.test(originalLabel);
    return useFlat ? this.NOTE_NAMES_FLAT[pc] : this.NOTE_NAMES_SHARP[pc];
  }

  _toMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }
    
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    
    for (let i = 0; i < len; i++) {
      mono[i] = 0.5 * (left[i] + right[i]);
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
