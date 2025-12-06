/**
 * 🎸 BassEngine v2.1 - SAVES DETECTION DATA
 * ⚡ FIX: Now ALWAYS saves what it detected!
 * 
 * Fields added to EVERY chord:
 * - _bassDetected: PC number
 * - _bassNoteName: Note name  
 * - _bassSuggested: Suggested chord label
 * - _bassConfidence: 0-1 score
 * - _bassApplied: true/false
 * - _bassReason: inversion/chord_change/weak/etc
 */

class BassEngine {
  constructor() {
    this.NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTE_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  }

  async analyzeBass(audioBuffer, options = {}) {
    const opts = {
      frameSize: options.frameSize || 4096,
      hopSize: options.hopSize || 2048,
      lowHzMin: options.lowHzMin || 20,
      lowHzMax: options.lowHzMax || 250,
      minSegmentDuration: options.minSegmentDuration || 0.25,
      hpsHarmonics: options.hpsHarmonics || 5,
      energyPercentile: options.energyPercentile || 75,
      debug: options.debug || false
    };

    const sampleRate = audioBuffer.sampleRate;
    const mono = this._toMono(audioBuffer);
    const hann = this._hannWindow(opts.frameSize);
    const numFrames = Math.floor((mono.length - opts.frameSize) / opts.hopSize) + 1;
    const times = new Float32Array(numFrames);
    const energies = new Float32Array(numFrames);
    const candidates = new Array(numFrames).fill(null);

    for (let i = 0; i < numFrames; i++) {
      const offset = i * opts.hopSize;
      const frame = mono.subarray(offset, Math.min(offset + opts.frameSize, mono.length));
      
      const windowed = new Float32Array(opts.frameSize);
      for (let n = 0; n < frame.length; n++) windowed[n] = frame[n] * hann[n];

      const { real, imag } = this._fft(windowed);
      const mag = new Float32Array(opts.frameSize / 2);
      for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(real[k], imag[k]);

      const binMin = Math.max(1, Math.floor(opts.lowHzMin * opts.frameSize / sampleRate));
      const binMax = Math.min(mag.length - 1, Math.floor(opts.lowHzMax * opts.frameSize / sampleRate));

      let energyLow = 0;
      for (let k = binMin; k <= binMax; k++) energyLow += mag[k] * mag[k];
      energies[i] = energyLow;

      let zeroCrossings = 0;
      for (let n = 1; n < frame.length; n++) {
        if ((frame[n] >= 0 && frame[n - 1] < 0) || (frame[n] < 0 && frame[n - 1] >= 0)) zeroCrossings++;
      }
      const zcr = zeroCrossings / frame.length;
      if (zcr > 0.15) {
        times[i] = offset / sampleRate;
        continue;
      }

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
        if (allHarmonicsPresent) {
          hps[k] = prod;
          if (prod > bestVal) {
            bestVal = prod;
            bestBin = k;
          }
        }
      }

      if (bestBin > binMin && bestBin < binMax && bestVal > 0) {
        const y0 = hps[bestBin - 1];
        const y1 = hps[bestBin];
        const y2 = hps[bestBin + 1];
        const delta = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2);
        const refinedBin = bestBin + Math.max(-0.5, Math.min(0.5, delta));
        const f0 = refinedBin * sampleRate / opts.frameSize;
        const midi = this._hzToMidi(f0);
        const pc = ((Math.round(midi) % 12) + 12) % 12;

        let harmonicStrength = 0;
        for (let h = 1; h <= 3; h++) {
          const expectedBin = Math.round(refinedBin * h);
          if (expectedBin < mag.length) harmonicStrength += mag[expectedBin];
        }

        candidates[i] = {
          f0, midi, pc,
          noteName: this.NOTE_NAMES_SHARP[pc],
          hps: bestVal,
          energyLow,
          zcr,
          harmonicStrength,
          quality: this._computeQuality(bestVal, energyLow, zcr, harmonicStrength)
        };
      }
      times[i] = offset / sampleRate;
    }

    const energyThreshold = this._percentile(energies, opts.energyPercentile / 100);
    let filteredCount = 0;
    for (let i = 0; i < numFrames; i++) {
      if (!candidates[i]) continue;
      if (energies[i] < energyThreshold || candidates[i].quality < 0.3) {
        candidates[i] = null;
        filteredCount++;
      }
    }

    const segments = this._buildSegments(times, candidates, opts.hopSize / sampleRate, opts.minSegmentDuration);
    const merged = this._mergeAdjacentSegments(segments);
    return merged;
  }

  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const opts = {
      bassMultiplier: options.bassMultiplier || 1.2,
      minInversionConfidence: options.minInversionConfidence || 0.45,
      minChordChangeConfidence: options.minChordChangeConfidence || 0.55,
      debug: options.debug || false
    };

    const bassTimeline = await this.analyzeBass(audioBuffer, { debug: opts.debug, minSegmentDuration: 0.2 });
    const refined = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const chordStart = chord.t || chord.tStart || 0;
      const chordEnd = timeline[i + 1] ? (timeline[i + 1].t || timeline[i + 1].tStart) : chordStart + 2.0;

      const relevantBass = bassTimeline.filter(b => 
        (b.tStart >= chordStart && b.tStart < chordEnd) ||
        (b.tEnd > chordStart && b.tEnd <= chordEnd) ||
        (b.tStart <= chordStart && b.tEnd >= chordEnd)
      );

      if (!relevantBass.length) {
        refined.push({ ...chord });
        continue;
      }

      let weightedPc = {};
      let totalWeight = 0;
      for (const bass of relevantBass) {
        const overlap = Math.min(bass.tEnd, chordEnd) - Math.max(bass.tStart, chordStart);
        const weight = overlap * (bass.confidence || 0.5);
        weightedPc[bass.pc] = (weightedPc[bass.pc] || 0) + weight;
        totalWeight += weight;
      }

      let strongestBass = -1, strongestWeight = 0;
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
      const rootPc = this._parseRoot(chord.label);
      if (rootPc < 0) {
        refined.push({ ...chord });
        continue;
      }

      const isMinor = /m(?!aj)/.test(chord.label);
      const isSus2 = /sus2/.test(chord.label);
      const isSus4 = /sus4/.test(chord.label);
      const has7 = /7/.test(chord.label) && !/maj7/i.test(chord.label);
      const hasMaj7 = /maj7/i.test(chord.label);

      let chordTones = isSus2 ? [0,2,7] : isSus4 ? [0,5,7] : isMinor ? [0,3,7] : [0,4,7];
      if (has7) chordTones.push(10);
      if (hasMaj7) chordTones.push(11);

      const chordPcs = chordTones.map(iv => toPc(rootPc + iv));
      const bassInChord = chordPcs.includes(strongestBass);

      if (bassInChord) {
        if (strongestBass !== rootPc && bassConfidence >= opts.minInversionConfidence) {
          const bassNoteName = this._getRootName(chord.label, strongestBass);
          const slashChord = chord.label + '/' + bassNoteName;
          
          refined.push({ 
            ...chord, 
            label: slashChord,
            _bassDetected: strongestBass,
            _bassNoteName: bassNoteName,
            _bassSuggested: slashChord,
            _bassConfidence: bassConfidence,
            _bassApplied: true,
            _bassReason: 'inversion',
            bassNote: strongestBass,
            bassConfidence,
            bassAdded: true
          });
        } else {
          refined.push({ 
            ...chord,
            _bassDetected: strongestBass,
            _bassNoteName: this._getRootName(chord.label, strongestBass),
            _bassSuggested: chord.label,
            _bassConfidence: bassConfidence,
            _bassApplied: false,
            _bassReason: `weak_${(bassConfidence*100).toFixed(0)}%`
          });
        }
      } else {
        if (bassConfidence >= opts.minChordChangeConfidence) {
          const scale = key.minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
          const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
          
          let newLabel = this.NOTE_NAMES_SHARP[strongestBass];
          const diatonicInKey = this._inKey(strongestBass, key.root, key.minor);
          
          if (diatonicInKey) {
            const rel = toPc(strongestBass - key.root);
            for (let d = 0; d < scale.length; d++) {
              if (toPc(scale[d]) === rel) {
                newLabel += qualities[d];
                break;
              }
            }
          }
          
          refined.push({ 
            ...chord, 
            label: newLabel,
            _bassDetected: strongestBass,
            _bassNoteName: this.NOTE_NAMES_SHARP[strongestBass],
            _bassSuggested: newLabel,
            _bassConfidence: bassConfidence,
            _bassApplied: true,
            _bassReason: 'chord_change',
            bassNote: strongestBass,
            bassConfidence,
            changedByBass: true
          });
        } else {
          refined.push({ 
            ...chord,
            _bassDetected: strongestBass,
            _bassNoteName: this.NOTE_NAMES_SHARP[strongestBass],
            _bassSuggested: chord.label,
            _bassConfidence: bassConfidence,
            _bassApplied: false,
            _bassReason: `not_in_chord_weak_${(bassConfidence*100).toFixed(0)}%`
          });
        }
      }
    }

    return refined;
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

  _inKey(pc, keyRoot, keyMinor) {
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = keyMinor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
    const diatonic = scale.map(iv => toPc(keyRoot + iv));
    return diatonic.includes(toPc(pc));
  }

  _getRootName(originalLabel, pc) {
    const useFlat = /[A-G]b/.test(originalLabel);
    return useFlat ? this.NOTE_NAMES_FLAT[pc] : this.NOTE_NAMES_SHARP[pc];
  }

  _toMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    return mono;
  }

  _hannWindow(N) {
    const win = new Float32Array(N);
    for (let n = 0; n < N; n++) win[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
    return win;
  }

  _fft(signal) {
    const N = signal.length;
    if ((N & (N - 1)) !== 0) throw new Error('FFT must be power of 2');
    const real = new Float32Array(N), imag = new Float32Array(N);
    for (let i = 0; i < N; i++) { real[i] = signal[i]; imag[i] = 0; }
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
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, theta = -2 * Math.PI / size;
      const wpr = Math.cos(theta), wpi = Math.sin(theta);
      for (let start = 0; start < N; start += size) {
        let wr = 1, wi = 0;
        for (let k = 0; k < half; k++) {
          const evenIndex = start + k, oddIndex = evenIndex + half;
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

  _buildSegments(times, candidates, frameDuration, minSegmentDuration) {
    const segments = [];
    let current = null;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i], t = times[i];
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
        current = { tStart: t, tEnd: t + frameDuration, frames: [c], energySum: c.energyLow, qualitySum: c.quality };
      } else {
        const last = current.frames[current.frames.length - 1];
        if (Math.abs(last.midi - c.midi) <= 0.75) {
          current.frames.push(c);
          current.energySum += c.energyLow;
          current.qualitySum += c.quality;
          current.tEnd = t + frameDuration;
        } else {
          current.tEnd = t;
          this._finalizeSegment(current);
          if (current.duration >= minSegmentDuration) segments.push(current);
          current = { tStart: t, tEnd: t + frameDuration, frames: [c], energySum: c.energyLow, qualitySum: c.quality };
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
    const n = segment.frames.length;
    if (n === 0) { segment.duration = 0; segment.confidence = 0; return; }
    let sumEnergy = 0, sumMidi = 0;
    for (const f of segment.frames) {
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
    const avgEnergy = segment.energySum / n;
    segment.confidence = Math.min(1.0, segment.quality * this._sigmoid(avgEnergy * 0.0001));
  }

  _mergeAdjacentSegments(segments) {
    if (segments.length < 2) return segments;
    const merged = [];
    let current = segments[0];
    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      const gap = next.tStart - current.tEnd;
      if (current.pc === next.pc && gap < 0.2) {
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

  _computeQuality(hps, energy, zcr, harmonicStrength) {
    return (
      this._sigmoid(hps * 0.00001) * 0.4 +
      this._sigmoid(energy * 0.0001) * 0.3 +
      (1 - Math.min(1, zcr / 0.15)) * 0.2 +
      this._sigmoid(harmonicStrength * 0.001) * 0.1
    );
  }

  _hzToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].filter(x => isFinite(x)).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    return sorted[Math.floor(p * (sorted.length - 1))];
  }
  _sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  getNoteName(pc, useFlats = false) {
    return useFlats ? this.NOTE_NAMES_FLAT[pc] : this.NOTE_NAMES_SHARP[pc];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
}
