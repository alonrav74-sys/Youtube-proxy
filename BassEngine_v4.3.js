/**
 * BassEngine v4.3 - SIMPLE BASS DETECTION ONLY
 * 
 * 🎯 המנוע הזה עושה דבר אחד בלבד:
 *    מזהה את תו הבס (התדר הכי נמוך והחזק)
 * 
 * ❌ לא עושה:
 *    - לוגיקה של אקורדים
 *    - החלטות על slash chords
 *    - שינוי labels
 * 
 * ✅ מחזיר:
 *    - bassDetected: התו שזוהה (C, D, E, וכו')
 *    - bassConfidence: אחוז ביטחון
 *    - bassFrequency: התדר ב-Hz
 */

class BassEngine {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  /**
   * Main method: Detect bass note for each chord in timeline
   * Returns timeline with bassDetected field added
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const opts = {
      minBassConfidence: options.minBassConfidence || 0.35,
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

      // Skip very short segments
      if (chordDuration < 0.2) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: 0,
          bassFrequency: 0
        });
        continue;
      }

      // Extract audio segment
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // 🎯 DETECT BASS NOTE - that's ALL we do!
      const bassResult = this.detectBassNote(segment, sampleRate, opts);

      if (bassResult.note === null || bassResult.confidence < opts.minBassConfidence) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: bassResult.confidence || 0,
          bassFrequency: 0
        });
      } else {
        const bassNoteName = this.NOTES[bassResult.note];
        
        refined.push({
          ...chord,
          bassDetected: bassNoteName,  // Just the note: "E", "A", "D", etc.
          bassConfidence: bassResult.confidence,
          bassFrequency: bassResult.frequency
        });

        if (opts.debug) {
          console.log(`🎸 [${this.formatTime(startTime)}] Bass: ${bassNoteName} (${Math.round(bassResult.confidence * 100)}%, ${Math.round(bassResult.frequency)}Hz)`);
        }
      }
    }

    return refined;
  }

  /**
   * 🎯 CORE FUNCTION: Detect the bass note in audio segment
   */
  detectBassNote(segment, sampleRate, opts) {
    if (!segment || segment.length < 2048) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    const bassFreqMin = 30;   // Lowest bass (B0 = 31Hz)
    const bassFreqMax = 350;  // Highest bass we care about
    const fftSize = 4096;
    const hopSize = 2048;
    
    const detections = [];

    // Analyze multiple frames
    for (let start = 0; start + fftSize <= segment.length; start += hopSize) {
      const frame = segment.slice(start, start + fftSize);
      const result = this.analyzeFrame(frame, sampleRate, fftSize, bassFreqMin, bassFreqMax);
      
      if (result.note !== null && result.confidence > 0.2) {
        detections.push(result);
      }
    }

    // Need stable detection
    if (detections.length < opts.stabilityFrames) {
      if (detections.length > 0) {
        // Return best single detection
        return detections.reduce((a, b) => b.confidence > a.confidence ? b : a);
      }
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Find most common note (voting)
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

    // Average confidence and frequency for winning note
    const winners = detections.filter(d => d.note === bestNote);
    const avgConf = winners.reduce((s, d) => s + d.confidence, 0) / winners.length;
    const avgFreq = winners.reduce((s, d) => s + d.frequency, 0) / winners.length;

    // Stability bonus
    const stability = maxCount / detections.length;
    const finalConfidence = Math.min(1.0, avgConf * (0.6 + stability * 0.4));

    return {
      note: bestNote,
      confidence: finalConfidence,
      frequency: avgFreq
    };
  }

  /**
   * Analyze single frame for bass frequency
   */
  analyzeFrame(frame, sampleRate, fftSize, fMin, fMax) {
    const N = frame.length;
    
    // Check energy
    let energy = 0;
    for (let i = 0; i < N; i++) {
      energy += frame[i] * frame[i];
    }
    energy = Math.sqrt(energy / N);
    
    if (energy < 0.003) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Apply Hann window
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      windowed[i] = frame[i] * w;
    }

    // FFT
    const mags = this.fft(windowed);

    // Find bins for bass range
    const binMin = Math.floor(fMin * fftSize / sampleRate);
    const binMax = Math.ceil(fMax * fftSize / sampleRate);

    // Calculate average magnitude in bass range
    let sum = 0, count = 0;
    for (let b = binMin; b <= binMax && b < mags.length; b++) {
      sum += mags[b];
      count++;
    }
    const avgMag = sum / (count || 1);

    // Find peaks in bass range
    const peaks = [];
    for (let b = binMin + 1; b < binMax - 1 && b < mags.length - 1; b++) {
      if (mags[b] > mags[b - 1] && mags[b] > mags[b + 1] && mags[b] > avgMag * 1.5) {
        // Quadratic interpolation for better frequency
        const y1 = mags[b - 1];
        const y2 = mags[b];
        const y3 = mags[b + 1];
        const denom = 2 * (2 * y2 - y1 - y3);
        let interpBin = b;
        if (Math.abs(denom) > 0.0001) {
          interpBin = b + (y3 - y1) / denom;
        }
        
        const freq = interpBin * sampleRate / fftSize;
        peaks.push({ bin: b, freq, mag: mags[b] });
      }
    }

    if (peaks.length === 0) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Choose the LOWEST strong peak (that's the bass!)
    peaks.sort((a, b) => a.freq - b.freq);
    
    // Take lowest peak that's strong enough
    let chosen = peaks[0];
    for (const peak of peaks) {
      if (peak.mag >= chosen.mag * 0.7) {
        chosen = peak;
        break;
      }
    }

    // Convert to pitch class
    const midiNote = 69 + 12 * Math.log2(chosen.freq / 440);
    const pitchClass = this.toPc(Math.round(midiNote));

    // Confidence based on peak strength
    const confidence = Math.min(1.0, (chosen.mag / (avgMag + 0.001)) * 0.2);

    return {
      note: pitchClass,
      confidence,
      frequency: chosen.freq
    };
  }

  /**
   * Simple FFT - returns magnitude array
   */
  fft(input) {
    const N = input.length;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);

    // Bit reversal
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    // FFT
    for (let len = 2; len <= N; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wLenRe = Math.cos(angle);
      const wLenIm = Math.sin(angle);
      
      for (let i = 0; i < N; i += len) {
        let wRe = 1, wIm = 0;
        
        for (let k = 0; k < len / 2; k++) {
          const idx = i + k + len / 2;
          const tRe = re[idx] * wRe - im[idx] * wIm;
          const tIm = re[idx] * wIm + im[idx] * wRe;
          
          re[idx] = re[i + k] - tRe;
          im[idx] = im[i + k] - tIm;
          re[i + k] += tRe;
          im[i + k] += tIm;
          
          const nextWRe = wRe * wLenRe - wIm * wLenIm;
          wIm = wRe * wLenIm + wIm * wLenRe;
          wRe = nextWRe;
        }
      }
    }

    // Magnitudes
    const mags = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
      mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }

    return mags;
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
}
