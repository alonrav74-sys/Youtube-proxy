/**
 * BassEngine v4.2 - SMART BASS LOGIC
 * 
 * 🔧 לוגיקה נכונה:
 * - בס = 3rd → slash chord (C/E, Am/C)
 * - בס = 5th → slash chord (C/G, Am/E)  
 * - בס = 7th → מוסיף 7! (Em + D = Em7, לא Em/D)
 * - בס = root → לא משנה
 * - בס אחר → לא משנה (או מציע אקורד חדש)
 */

class BassEngine {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  /**
   * Main method: Analyze bass for entire timeline
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const opts = {
      minBassConfidence: options.minBassConfidence || 0.40,
      minBassStrength: options.minBassStrength || 0.06,
      stabilityFrames: options.stabilityFrames || 2,
      debug: options.debug || false
    };

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;

    const refined = [];

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const nextChord = timeline[i + 1];
      
      const startTime = chord.t;
      const endTime = nextChord ? nextChord.t : duration;
      const chordDuration = endTime - startTime;

      // Skip very short chords
      if (chordDuration < 0.25) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: 0,
          changedByBass: false,
          reason: 'too_short'
        });
        continue;
      }

      // Parse chord
      const chordRoot = this.parseRoot(chord.label);
      if (chordRoot === null) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: 0,
          changedByBass: false,
          reason: 'cannot_parse'
        });
        continue;
      }

      // Extract audio segment
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // Detect bass note
      const bassResult = this.detectBassFFT(segment, sampleRate, opts);

      // No clear bass detected
      if (bassResult.note === null || bassResult.confidence < opts.minBassConfidence) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: bassResult.confidence || 0,
          changedByBass: false,
          reason: 'unclear_bass'
        });
        continue;
      }

      const detectedBass = bassResult.note;
      const bassNoteName = this.NOTES[detectedBass];

      // Bass matches chord root - no change needed
      if (detectedBass === chordRoot) {
        refined.push({
          ...chord,
          bassDetected: bassNoteName,
          bassConfidence: bassResult.confidence,
          changedByBass: false,
          reason: 'bass_matches_root'
        });
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎯 SMART BASS LOGIC
      // ═══════════════════════════════════════════════════════════════
      
      const isMinor = /m(?!aj)/.test(chord.label);
      const has7 = /7/.test(chord.label);
      const hasMaj7 = /maj7/.test(chord.label);
      
      // Calculate interval from root to bass
      const interval = this.toPc(detectedBass - chordRoot);
      
      let newLabel = chord.label;
      let changedByBass = false;
      let reason = 'bass_not_in_chord';

      // ═══════════════════════════════════════════════════════════════
      // 🎹 INTERVAL LOGIC
      // ═══════════════════════════════════════════════════════════════

      if (interval === 3 && isMinor) {
        // Minor 3rd of minor chord → 1st inversion (Am/C)
        newLabel = this.addSlashBass(chord.label, bassNoteName);
        changedByBass = true;
        reason = 'inversion_m3';
      }
      else if (interval === 4 && !isMinor) {
        // Major 3rd of major chord → 1st inversion (C/E)
        newLabel = this.addSlashBass(chord.label, bassNoteName);
        changedByBass = true;
        reason = 'inversion_M3';
      }
      else if (interval === 7) {
        // Perfect 5th → 2nd inversion (C/G, Am/E)
        newLabel = this.addSlashBass(chord.label, bassNoteName);
        changedByBass = true;
        reason = 'inversion_5th';
      }
      else if (interval === 10 && !has7 && !hasMaj7) {
        // 🎯 Minor 7th (10 semitones) → ADD 7 to chord!
        // Em + D bass = Em7 (not Em/D!)
        // C + Bb bass = C7 (not C/Bb!)
        newLabel = this.add7ToChord(chord.label);
        changedByBass = true;
        reason = 'added_7th';
        
        if (opts.debug) {
          console.log(`🎸 ${chord.label} + bass ${bassNoteName} (m7) → ${newLabel}`);
        }
      }
      else if (interval === 11 && !has7 && !hasMaj7 && !isMinor) {
        // Major 7th (11 semitones) on major chord → add maj7
        // C + B bass = Cmaj7
        newLabel = this.addMaj7ToChord(chord.label);
        changedByBass = true;
        reason = 'added_maj7';
      }
      else if (interval === 2) {
        // 2nd (9th) → could be add9 or sus2, skip for now
        reason = 'bass_is_2nd';
      }
      else if (interval === 5) {
        // 4th → could be sus4, skip for now
        reason = 'bass_is_4th';
      }
      else {
        // Bass not clearly in chord
        reason = 'bass_not_in_chord';
      }

      refined.push({
        ...chord,
        label: newLabel,
        bassDetected: bassNoteName,
        bassConfidence: bassResult.confidence,
        bassFrequency: bassResult.frequency,
        changedByBass,
        reason
      });

      if (opts.debug && changedByBass) {
        console.log(`🎸 ${chord.label} → ${newLabel} (bass: ${bassNoteName}, interval: ${interval}, reason: ${reason})`);
      }
    }

    return refined;
  }

  /**
   * Add slash bass to chord (for inversions)
   */
  addSlashBass(label, bassNote) {
    // Remove existing slash if any
    const baseLabel = label.split('/')[0];
    return baseLabel + '/' + bassNote;
  }

  /**
   * Add 7 to chord (Em → Em7, C → C7)
   */
  add7ToChord(label) {
    // Remove existing slash
    const baseLabel = label.split('/')[0];
    
    // Don't add if already has 7
    if (/7/.test(baseLabel)) return baseLabel;
    
    // Find where to insert 7
    const match = baseLabel.match(/^([A-G][#b]?)(m)?(.*)$/);
    if (!match) return baseLabel + '7';
    
    const root = match[1];
    const minor = match[2] || '';
    const suffix = match[3] || '';
    
    return root + minor + '7' + suffix;
  }

  /**
   * Add maj7 to chord (C → Cmaj7)
   */
  addMaj7ToChord(label) {
    const baseLabel = label.split('/')[0];
    if (/7/.test(baseLabel)) return baseLabel;
    
    const match = baseLabel.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return baseLabel + 'maj7';
    
    return match[1] + 'maj7' + match[2];
  }

  /**
   * Detect bass using FFT - find lowest strong peak
   */
  detectBassFFT(segment, sampleRate, opts) {
    if (!segment || segment.length < 2048) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    const bassFreqMin = 35;
    const bassFreqMax = 300;
    const fftSize = 4096;
    const hopSize = 2048;
    
    const detections = [];

    for (let start = 0; start + fftSize <= segment.length; start += hopSize) {
      const frame = segment.slice(start, start + fftSize);
      const result = this.detectBassInFrame(frame, sampleRate, fftSize, bassFreqMin, bassFreqMax);
      if (result.note !== null) {
        detections.push(result);
      }
    }

    if (detections.length < opts.stabilityFrames) {
      // Not enough stable detections
      if (detections.length > 0) {
        // Return best single detection
        const best = detections.reduce((a, b) => b.confidence > a.confidence ? b : a);
        return best;
      }
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Find most common note
    const noteCounts = {};
    for (const d of detections) {
      noteCounts[d.note] = (noteCounts[d.note] || 0) + 1;
    }

    let bestNote = null;
    let maxCount = 0;
    for (const note in noteCounts) {
      if (noteCounts[note] > maxCount) {
        maxCount = noteCounts[note];
        bestNote = parseInt(note);
      }
    }

    // Average confidence for this note
    const sameNote = detections.filter(d => d.note === bestNote);
    const avgConf = sameNote.reduce((s, d) => s + d.confidence, 0) / sameNote.length;
    const avgFreq = sameNote.reduce((s, d) => s + d.frequency, 0) / sameNote.length;

    // Stability factor
    const stability = maxCount / detections.length;

    return {
      note: bestNote,
      confidence: avgConf * (0.5 + stability * 0.5),
      frequency: avgFreq
    };
  }

  /**
   * Detect bass in single frame
   */
  detectBassInFrame(frame, sampleRate, fftSize, fMin, fMax) {
    const N = frame.length;
    
    // Hann window
    const windowed = new Float32Array(N);
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      windowed[i] = frame[i] * w;
      energy += windowed[i] * windowed[i];
    }
    energy = Math.sqrt(energy / N);

    if (energy < 0.005) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    // FFT
    const { mags } = this.fft(windowed, fftSize);

    // Find bins for bass range
    const binMin = Math.floor(fMin * fftSize / sampleRate);
    const binMax = Math.ceil(fMax * fftSize / sampleRate);

    // Find strongest peak in bass range
    let maxMag = 0;
    let maxBin = -1;

    for (let b = binMin; b <= binMax && b < mags.length; b++) {
      if (mags[b] > maxMag) {
        maxMag = mags[b];
        maxBin = b;
      }
    }

    if (maxBin < 0) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Quadratic interpolation
    let interpBin = maxBin;
    if (maxBin > 0 && maxBin < mags.length - 1) {
      const y1 = mags[maxBin - 1];
      const y2 = mags[maxBin];
      const y3 = mags[maxBin + 1];
      const denom = 2 * (2 * y2 - y1 - y3);
      if (Math.abs(denom) > 0.0001) {
        interpBin = maxBin + (y3 - y1) / denom;
      }
    }

    const frequency = interpBin * sampleRate / fftSize;
    const midiNote = 69 + 12 * Math.log2(frequency / 440);
    const pitchClass = this.toPc(Math.round(midiNote));

    // Calculate confidence
    let sum = 0, count = 0;
    for (let b = binMin; b <= binMax && b < mags.length; b++) {
      sum += mags[b];
      count++;
    }
    const avgMag = sum / (count || 1);
    const confidence = Math.min(1.0, (maxMag / (avgMag + 0.001)) * 0.25);

    return { note: pitchClass, confidence, frequency };
  }

  /**
   * FFT
   */
  fft(input, size) {
    const N = size || input.length;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    
    for (let i = 0; i < Math.min(input.length, N); i++) {
      re[i] = input[i];
    }

    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    for (let len = 2; len <= N; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wLenReal = Math.cos(angle);
      const wLenImag = Math.sin(angle);
      
      for (let i = 0; i < N; i += len) {
        let wReal = 1, wImag = 0;
        
        for (let k = 0; k < len / 2; k++) {
          const idx = i + k + len / 2;
          const tReal = re[idx] * wReal - im[idx] * wImag;
          const tImag = re[idx] * wImag + im[idx] * wReal;
          
          re[idx] = re[i + k] - tReal;
          im[idx] = im[i + k] - tImag;
          re[i + k] += tReal;
          im[i + k] += tImag;
          
          const nextWReal = wReal * wLenReal - wImag * wLenImag;
          wImag = wReal * wLenImag + wImag * wLenReal;
          wReal = nextWReal;
        }
      }
    }

    const mags = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
      mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }

    return { mags, N };
  }

  /**
   * Parse chord root
   */
  parseRoot(label) {
    if (!label || typeof label !== 'string') return null;
    
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) return null;

    let note = match[1];
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    note = flatToSharp[note] || note;

    return this.NOTES.indexOf(note);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
}
