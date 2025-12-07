/**
 * BassEngine v4.1 - FIXED BASS DETECTION
 * 
 * 🔧 תיקונים עיקריים:
 * - משתמש ב-FFT במקום autocorrelation (יותר אמין)
 * - מחפש את התו הכי נמוך שחזק מספיק (לא רק הכי חזק)
 * - הורדת סף הביטחון ל-0.45 (היה 0.65)
 * - הורדת סף היציבות ל-0.25 (היה 0.40)
 * - Quadratic interpolation לדיוק תדר משופר
 */

class BassEngine {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.audioContext = null;
    this._hannCache = {};
  }

  /**
   * Main method: Analyze bass for entire timeline
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const opts = {
      minBassConfidence: options.minBassConfidence || 0.45,      // 🔧 הורד מ-0.65
      minBassStrength: options.minBassStrength || 0.08,          // 🔧 הורד מ-0.20
      stabilityFrames: options.stabilityFrames || 2,             // 🔧 הורד מ-4
      allowBassChordChange: options.allowBassChordChange !== false,
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
      if (chordDuration < 0.3) {  // 🔧 הורד מ-0.4
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: 0,
          reason: 'too_short'
        });
        continue;
      }

      // Parse chord root
      const chordRoot = this.parseRoot(chord.label);
      if (chordRoot === null) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: 0,
          reason: 'cannot_parse'
        });
        continue;
      }

      // Extract audio segment
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // 🔧 NEW: Detect bass using FFT
      const bassResult = this.detectBassFFT(segment, sampleRate, opts);

      // No clear bass detected
      if (bassResult.note === null || bassResult.confidence < opts.minBassConfidence) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: bassResult.confidence,
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
          reason: 'bass_matches_root'
        });
        continue;
      }

      // Bass is different from root
      const toPc = n => ((n % 12) + 12) % 12;
      
      // Check if bass is part of the chord
      const isMinor = /m(?!aj)/.test(chord.label);
      const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
      const chordPcs = intervals.map(iv => toPc(chordRoot + iv));
      const bassInChord = chordPcs.includes(detectedBass);

      let newLabel = chord.label;
      let reason = 'no_change';

      // Bass is in chord → Add slash chord (inversion)
      if (bassInChord) {
        const match = chord.label.match(/^([A-G][#b]?)/);
        const rootName = match ? match[1] : '';
        const suffix = chord.label.slice(rootName.length);
        
        newLabel = rootName + suffix + '/' + bassNoteName;
        reason = 'inversion';
      }
      // Bass NOT in chord → Change the chord entirely (if allowed)
      else if (opts.allowBassChordChange && bassResult.confidence > 0.60) {  // 🔧 הורד מ-0.75
        const quality = isMinor ? 'm' : '';
        newLabel = bassNoteName + quality;
        reason = 'bass_override';
      }

      refined.push({
        ...chord,
        label: newLabel,
        bassDetected: bassNoteName,
        bassConfidence: bassResult.confidence,
        bassFrequency: bassResult.frequency,
        changedByBass: newLabel !== chord.label,
        reason
      });

      if (opts.debug && newLabel !== chord.label) {
        console.log(
          `🎸 ${chord.label} → ${newLabel} ` +
          `(bass: ${bassNoteName}, conf: ${(bassResult.confidence * 100).toFixed(0)}%, ` +
          `freq: ${bassResult.frequency.toFixed(1)} Hz, ` +
          `reason: ${reason})`
        );
      }
    }

    return refined;
  }

  /**
   * 🔧 NEW: Detect bass using FFT - finds LOWEST strong note
   */
  detectBassFFT(audioSegment, sampleRate, opts) {
    if (!audioSegment || audioSegment.length < 2048) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    const bassFreqMin = 35;   // 🔧 הורחב מ-40 (C1 בערך)
    const bassFreqMax = 300;  // B3

    // Split segment into frames
    const frameSize = 4096;
    const hopSize = 2048;
    const frames = [];

    for (let i = 0; i + frameSize <= audioSegment.length; i += hopSize) {
      frames.push(audioSegment.slice(i, i + frameSize));
    }

    if (frames.length < 2) {  // 🔧 הורד מ-3
      // If segment too short, analyze entire segment
      frames.push(audioSegment.slice(0, Math.min(frameSize, audioSegment.length)));
    }

    // Detect bass in each frame using FFT
    const detections = frames.map(frame => 
      this.detectBassInFrameFFT(frame, sampleRate, bassFreqMin, bassFreqMax)
    );

    // Filter out weak detections
    const strongDetections = detections.filter(d => 
      d.note !== null && 
      d.confidence > opts.minBassConfidence * 0.7 &&  // 🔧 הורד מ-0.8
      d.strength > opts.minBassStrength
    );

    if (strongDetections.length < opts.stabilityFrames) {
      // 🔧 NEW: אם אין מספיק detections חזקים, נסה עם הכי טוב שיש
      if (detections.length > 0) {
        const best = detections.reduce((a, b) => 
          (b.confidence || 0) > (a.confidence || 0) ? b : a
        );
        if (best.note !== null && best.confidence > opts.minBassConfidence * 0.5) {
          return best;
        }
      }
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Find most common bass note
    const noteCounts = {};
    for (const det of strongDetections) {
      noteCounts[det.note] = (noteCounts[det.note] || 0) + 1;
    }

    let mostCommonNote = null;
    let maxCount = 0;
    for (const note in noteCounts) {
      if (noteCounts[note] > maxCount) {
        maxCount = noteCounts[note];
        mostCommonNote = parseInt(note);
      }
    }

    // Calculate average confidence and frequency for this note
    const sameNoteDetections = strongDetections.filter(d => d.note === mostCommonNote);
    const avgConfidence = sameNoteDetections.reduce((sum, d) => sum + d.confidence, 0) / sameNoteDetections.length;
    const avgFrequency = sameNoteDetections.reduce((sum, d) => sum + d.frequency, 0) / sameNoteDetections.length;

    // Stability check: note must appear in at least X% of frames
    const stability = maxCount / frames.length;
    if (stability < 0.25) {  // 🔧 הורד מ-0.40
      return { note: null, confidence: 0, frequency: 0 };
    }

    return {
      note: mostCommonNote,
      confidence: Math.min(1.0, avgConfidence * (0.5 + stability * 0.5)),  // 🔧 שיפור חישוב
      frequency: avgFrequency
    };
  }

  /**
   * 🔧 NEW: FFT-based bass detection - finds LOWEST strong peak
   */
  detectBassInFrameFFT(frame, sampleRate, fMin, fMax) {
    const N = frame.length;
    
    // Apply Hann window
    const windowed = new Float32Array(N);
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      windowed[i] = frame[i] * window;
      energy += windowed[i] * windowed[i];
    }
    energy = Math.sqrt(energy / N);

    // Too quiet → no bass
    if (energy < 0.005) {  // 🔧 הורד מ-0.01
      return { note: null, confidence: 0, frequency: 0, strength: energy };
    }

    // FFT
    const fftSize = this._nextPow2(N);
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    
    for (let i = 0; i < N; i++) {
      real[i] = windowed[i];
    }
    
    this._fft(real, imag);

    // Calculate magnitude spectrum
    const mags = new Float32Array(fftSize / 2);
    for (let i = 0; i < fftSize / 2; i++) {
      mags[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    // Find bins for bass range
    const binMin = Math.floor(fMin * fftSize / sampleRate);
    const binMax = Math.ceil(fMax * fftSize / sampleRate);

    // 🎯 NEW APPROACH: Find LOWEST bin with significant energy
    // Calculate average magnitude in bass range
    let sum = 0;
    let count = 0;
    for (let b = binMin; b <= binMax && b < mags.length; b++) {
      sum += mags[b];
      count++;
    }
    const avgMag = sum / (count || 1);
    const threshold = avgMag * 1.5;  // 🔧 סף נמוך יותר (היה 2.0 או יותר)

    // Find the LOWEST frequency peak above threshold
    let lowestPeakBin = -1;
    let lowestPeakMag = 0;
    
    for (let b = binMin; b <= binMax && b < mags.length; b++) {
      // Check if this is a local peak
      const isPeak = b > 0 && b < mags.length - 1 &&
                     mags[b] > mags[b - 1] && mags[b] > mags[b + 1];
      
      if (isPeak && mags[b] > threshold) {
        // Take the FIRST (lowest frequency) peak that's strong enough
        if (lowestPeakBin < 0) {
          lowestPeakBin = b;
          lowestPeakMag = mags[b];
          break;  // 🔧 לוקחים את הראשון (הנמוך ביותר)
        }
      }
    }

    // If no peak found, find the strongest bin
    if (lowestPeakBin < 0) {
      let maxMag = 0;
      for (let b = binMin; b <= binMax && b < mags.length; b++) {
        if (mags[b] > maxMag) {
          maxMag = mags[b];
          lowestPeakBin = b;
          lowestPeakMag = maxMag;
        }
      }
    }

    if (lowestPeakBin < 0 || lowestPeakMag < avgMag * 0.5) {
      return { note: null, confidence: 0, frequency: 0, strength: energy };
    }

    // Quadratic interpolation for better frequency precision
    let interpBin = lowestPeakBin;
    if (lowestPeakBin > 0 && lowestPeakBin < mags.length - 1) {
      const y1 = mags[lowestPeakBin - 1];
      const y2 = mags[lowestPeakBin];
      const y3 = mags[lowestPeakBin + 1];
      const denom = 2 * (2 * y2 - y1 - y3);
      if (Math.abs(denom) > 0.0001) {
        const d = (y3 - y1) / denom;
        interpBin = lowestPeakBin + d;
      }
    }

    const frequency = interpBin * sampleRate / fftSize;

    // Convert to MIDI note and pitch class
    const midiNote = 69 + 12 * Math.log2(frequency / 440);
    const pitchClass = ((Math.round(midiNote) % 12) + 12) % 12;

    // Calculate confidence
    const confidence = Math.min(1.0, (lowestPeakMag / (avgMag + 0.0001)) * 0.3);  // 🔧 Scaled better

    return {
      note: pitchClass,
      confidence: confidence,
      frequency: frequency,
      strength: energy
    };
  }

  /**
   * Parse chord root from label
   */
  parseRoot(label) {
    if (!label || typeof label !== 'string') return null;
    
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) return null;

    let note = match[1];
    // Normalize flats to sharps
    const flatToSharp = {
      'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    };
    if (flatToSharp[note]) {
      note = flatToSharp[note];
    }

    return this.NOTES.indexOf(note);
  }

  /**
   * Helper: Next power of 2
   */
  _nextPow2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  /**
   * Helper: In-place FFT (Cooley-Tukey)
   */
  _fft(real, imag) {
    const N = real.length;
    
    // Bit reversal
    for (let i = 0, j = 0; i < N; i++) {
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    // FFT
    for (let step = 2; step <= N; step *= 2) {
      const halfStep = step / 2;
      const angleStep = -Math.PI / halfStep;
      
      for (let start = 0; start < N; start += step) {
        for (let k = 0; k < halfStep; k++) {
          const angle = k * angleStep;
          const wr = Math.cos(angle);
          const wi = Math.sin(angle);
          
          const i1 = start + k;
          const i2 = start + k + halfStep;
          
          const tr = real[i2] * wr - imag[i2] * wi;
          const ti = real[i2] * wi + imag[i2] * wr;
          
          real[i2] = real[i1] - tr;
          imag[i2] = imag[i1] - ti;
          real[i1] = real[i1] + tr;
          imag[i1] = imag[i1] + ti;
        }
      }
    }
  }

  /**
   * Play detected bass note (for debugging)
   */
  playBassNote(frequency, duration = 0.5) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;
    
    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
}
