/**
 * BassEngine v5.3 - Pure Low Frequency Bass Detection
 * ====================================================
 * 
 * מטרה: זיהוי התו הכי נמוך בלבד (שורש הבאס)
 * ללא זיהוי מינור/מז'ור - רק הבאס הפיזי
 * משתלב עם ChordEngineEnhanced שמכיל את 6 שיטות זיהוי הסולם
 * 
 * שיטות זיהוי באס:
 * 1. YIN Algorithm - זיהוי פיץ' מדויק
 * 2. Autocorrelation - קורלציה עצמית
 * 3. FFT Peak Detection - פיק הכי נמוך בספקטרום
 * 
 * הצבעה רוב (Voting) לתוצאה סופית
 */
class BassEngine {
  constructor() {
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    // תחום באס צר - רק תדרים נמוכים מאוד
    this.bassRange = { min: 35, max: 165 }; // E1 to E3
  }

  analyze(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const results = [];

    const hopSeconds = 0.1;
    const winSeconds = 0.2;
    const hopSamples = Math.round(sr * hopSeconds);
    const windowSize = Math.round(sr * winSeconds);

    for (let i = 0; i < channelData.length - windowSize; i += hopSamples) {
      const segment = channelData.slice(i, i + windowSize);
      const bass = this.detectBass(segment, sr);

      results.push({
        t: i / sr,
        bassNote: bass?.note || null,
        bassPc: bass?.pc ?? -1,
        confidence: bass?.confidence || 0,
        bassMidi: bass?.midi ?? null,
        bassHz: bass?.freq ?? null
      });
    }
    return results;
  }

  /**
   * Low-pass filter - Butterworth 2-pole
   */
  _lowPassFilter(samples, sr, cutoff = 170) {
    const N = samples.length;
    const filtered = new Float32Array(N);

    const w0 = 2 * Math.PI * cutoff / sr;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * 0.707);

    const b0 = (1 - cosW0) / 2;
    const b1 = 1 - cosW0;
    const b2 = (1 - cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    const b0n = b0 / a0, b1n = b1 / a0, b2n = b2 / a0;
    const a1n = a1 / a0, a2n = a2 / a0;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < N; i++) {
      const x0 = samples[i];
      const y0 = b0n * x0 + b1n * x1 + b2n * x2 - a1n * y1 - a2n * y2;
      filtered[i] = y0;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
    }

    return filtered;
  }

  /**
   * שיטה 1: YIN Algorithm
   */
  _yinDetect(samples, sr) {
    const minPeriod = Math.floor(sr / this.bassRange.max);
    const maxPeriod = Math.min(Math.floor(sr / this.bassRange.min), Math.floor(samples.length / 2));
    if (maxPeriod <= minPeriod) return null;

    const W = maxPeriod;
    const yinThreshold = 0.15;

    // Difference function
    const diff = new Float32Array(maxPeriod + 1);
    for (let tau = 1; tau <= maxPeriod; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        if (j + tau < samples.length) {
          const d = samples[j] - samples[j + tau];
          sum += d * d;
        }
      }
      diff[tau] = sum;
    }

    // CMNDF
    const cmndf = new Float32Array(maxPeriod + 1);
    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxPeriod; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = diff[tau] / (runningSum / tau + 1e-10);
    }

    // Find first minimum below threshold
    let bestTau = -1;
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (cmndf[tau] < yinThreshold) {
        while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) tau++;
        bestTau = tau;
        break;
      }
    }

    // Fallback to global minimum
    if (bestTau < 0) {
      let minVal = Infinity;
      for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        if (cmndf[tau] < minVal) { minVal = cmndf[tau]; bestTau = tau; }
      }
      if (minVal > 0.5) return null;
    }

    // Parabolic interpolation
    if (bestTau > 0 && bestTau < maxPeriod) {
      const s0 = cmndf[bestTau - 1], s1 = cmndf[bestTau], s2 = cmndf[bestTau + 1];
      const denom = 2 * (s0 - 2 * s1 + s2);
      if (Math.abs(denom) > 1e-10) bestTau += (s0 - s2) / denom;
    }

    return { freq: sr / bestTau, confidence: 1 - cmndf[Math.round(bestTau)] || 0.5 };
  }

  /**
   * שיטה 2: Autocorrelation
   */
  _autocorrelationDetect(samples, sr) {
    const minPeriod = Math.floor(sr / this.bassRange.max);
    const maxPeriod = Math.min(Math.floor(sr / this.bassRange.min), Math.floor(samples.length / 2));
    if (maxPeriod <= minPeriod) return null;

    let mean = 0;
    for (let i = 0; i < samples.length; i++) mean += samples[i];
    mean /= samples.length;

    let denom = 0;
    for (let i = 0; i < samples.length; i++) {
      const d = samples[i] - mean;
      denom += d * d;
    }
    if (denom < 1e-10) return null;

    let bestLag = 0, bestR = -1;

    for (let lag = minPeriod; lag <= maxPeriod; lag++) {
      let r = 0;
      for (let i = 0; i < samples.length - lag; i++) {
        r += (samples[i] - mean) * (samples[i + lag] - mean);
      }
      r /= denom;
      
      // Bias toward lower frequencies (longer periods)
      const lowBias = 1 + (lag - minPeriod) / (maxPeriod - minPeriod) * 0.1;
      r *= lowBias;
      
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    if (bestLag <= 0 || bestR < 0.3) return null;
    return { freq: sr / bestLag, confidence: bestR };
  }

  /**
   * שיטה 3: FFT Peak Detection - הפיק הנמוך ביותר
   */
  _fftPeakDetect(samples, sr) {
    const N = samples.length;
    const fftSize = Math.pow(2, Math.ceil(Math.log2(N)));

    // Hann window
    const windowed = new Float32Array(fftSize);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      windowed[i] = samples[i] * w;
    }

    // DFT on bass range only
    const minBin = Math.max(1, Math.floor(this.bassRange.min * fftSize / sr));
    const maxBin = Math.ceil(this.bassRange.max * fftSize / sr);

    const peaks = [];

    for (let k = minBin; k <= maxBin; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n++) {
        const angle = -2 * Math.PI * k * n / fftSize;
        re += windowed[n] * Math.cos(angle);
        im += windowed[n] * Math.sin(angle);
      }
      const mag = Math.sqrt(re * re + im * im);
      const freq = k * sr / fftSize;
      peaks.push({ freq, mag });
    }

    // Find strongest peak in low bass range
    peaks.sort((a, b) => b.mag - a.mag);
    
    // בחר את הפיק הנמוך ביותר שעדיין חזק מספיק
    const threshold = peaks[0].mag * 0.3;
    let lowestStrongPeak = peaks[0];
    
    for (const p of peaks) {
      if (p.mag >= threshold && p.freq < lowestStrongPeak.freq) {
        lowestStrongPeak = p;
      }
    }

    if (lowestStrongPeak.mag < 0.01) return null;
    
    const maxMag = peaks[0].mag;
    return { 
      freq: lowestStrongPeak.freq, 
      confidence: lowestStrongPeak.mag / (maxMag + 1e-10) 
    };
  }

  /**
   * המרת תדר לתו (pitch class)
   */
  _freqToNote(freq) {
    if (freq < 20 || freq > 500) return null;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const roundedMidi = Math.round(midi);
    const pc = ((roundedMidi % 12) + 12) % 12;
    return { note: this.NOTES[pc], pc, midi: roundedMidi, freq };
  }

  /**
   * זיהוי באס בפריים בודד - שילוב 3 שיטות עם הצבעה
   */
  detectBass(samples, sr) {
    // 1. סינון low-pass חד
    const filtered = this._lowPassFilter(samples, sr, 170);

    // 2. בדיקת אנרגיה מינימלית
    let energy = 0;
    for (let i = 0; i < filtered.length; i++) energy += filtered[i] * filtered[i];
    if (energy < 1e-8) return null;

    // 3. הפעלת 3 השיטות
    const results = [];

    const yin = this._yinDetect(filtered, sr);
    if (yin && yin.freq >= this.bassRange.min && yin.freq <= this.bassRange.max) {
      results.push({ ...yin, method: 'YIN' });
    }

    const autocorr = this._autocorrelationDetect(filtered, sr);
    if (autocorr && autocorr.freq >= this.bassRange.min && autocorr.freq <= this.bassRange.max) {
      results.push({ ...autocorr, method: 'Autocorr' });
    }

    const fft = this._fftPeakDetect(filtered, sr);
    if (fft && fft.freq >= this.bassRange.min && fft.freq <= this.bassRange.max) {
      results.push({ ...fft, method: 'FFT' });
    }

    if (results.length === 0) return null;

    // 4. הצבעה - המר לתווים ובדוק הסכמה
    const votes = {};
    let bestResult = results[0];
    let bestConfidence = 0;

    for (const r of results) {
      const noteInfo = this._freqToNote(r.freq);
      if (!noteInfo) continue;

      const pc = noteInfo.pc;
      votes[pc] = (votes[pc] || 0) + r.confidence;

      if (r.confidence > bestConfidence) {
        bestConfidence = r.confidence;
        bestResult = r;
      }
    }

    // מצא את התו עם הכי הרבה קולות
    let winningPc = -1;
    let maxVotes = 0;
    for (const pc in votes) {
      if (votes[pc] > maxVotes) {
        maxVotes = votes[pc];
        winningPc = parseInt(pc);
      }
    }

    // אם יש הסכמה, השתמש בה
    if (winningPc >= 0) {
      // מצא את התדר המדויק ביותר עבור ה-PC הזוכה
      let bestFreqForPc = bestResult.freq;
      for (const r of results) {
        const ni = this._freqToNote(r.freq);
        if (ni && ni.pc === winningPc && r.confidence >= bestConfidence * 0.8) {
          bestFreqForPc = r.freq;
          break;
        }
      }

      const finalNote = this._freqToNote(bestFreqForPc);
      if (finalNote) {
        // Confidence = ממוצע משוקלל של כל השיטות שהסכימו
        const agreementBonus = results.filter(r => {
          const ni = this._freqToNote(r.freq);
          return ni && ni.pc === winningPc;
        }).length / results.length;

        return {
          note: finalNote.note,
          pc: finalNote.pc,
          midi: finalNote.midi,
          freq: bestFreqForPc,
          confidence: Math.min(1.0, (maxVotes / results.length) * (0.5 + agreementBonus * 0.5))
        };
      }
    }

    // Fallback - השתמש בתוצאה הכי בטוחה
    const fallback = this._freqToNote(bestResult.freq);
    if (fallback) {
      return {
        note: fallback.note,
        pc: fallback.pc,
        midi: fallback.midi,
        freq: bestResult.freq,
        confidence: bestResult.confidence * 0.7
      };
    }

    return null;
  }

  /**
   * בוחר את הבאס החזק ביותר בחלון זמן סביב זמן האקורד
   */
  _chooseStrongestBassAroundTime(bassResults, chordTime, windowSeconds) {
    if (!bassResults || bassResults.length === 0) return null;

    const half = windowSeconds / 2;
    const start = chordTime - half;
    const end = chordTime + half;

    let best = null;
    let bestConf = 0;

    for (const frame of bassResults) {
      if (frame.t < start || frame.t > end) continue;
      if (!frame.bassNote || frame.confidence <= 0) continue;

      if (frame.confidence > bestConf) {
        bestConf = frame.confidence;
        best = frame;
      }
    }

    return best;
  }

  /**
   * Refinement לרמת timeline
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    console.log('🎸 BassEngine.refineBassInTimeline called!', {
      timelineLength: timeline.length,
      audioBufferDuration: audioBuffer.duration
    });

    const bassResults = this.analyze(audioBuffer);
    console.log('🎸 Bass analysis complete:', bassResults.length, 'frames');

    const windowSeconds = options.bassWindowSeconds || 0.35;

    const refinedTimeline = timeline.map((chord) => {
      const chordTime = chord.t || 0;
      const best = this._chooseStrongestBassAroundTime(bassResults, chordTime, windowSeconds);

      if (!best) {
        return {
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: 0,
          bassFrequency: 0,
          changedByBass: false
        };
      }

      return {
        ...chord,
        bassDetected: best.bassNote,
        bassConfidence: best.confidence,
        bassFrequency: best.bassPc ?? 0,
        changedByBass: false
      };
    });

    console.log('🎸 Refined timeline sample:', refinedTimeline[0]);
    return refinedTimeline;
  }
}

window.BassEngine = BassEngine;
