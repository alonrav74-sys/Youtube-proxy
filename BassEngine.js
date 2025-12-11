/**
 * BassEngine v5.2 - Significant Physical Bass (Upgraded)
 * -------------------------------------------------------
 * עקרונות:
 * - עובד רק על תחום הבאס (low-pass + בדיקת יחס אנרגיה נמוכים/גבוהים)
 * - בודק אם בכלל יש באס משמעותי בפריים, אחרת מחזיר null
 * - עושה YIN detection על הסיגנל המסונן לנמוכים בלבד
 * - ברמת timeline: לכל אקורד לוקחים את הבאס עם ה-confidence הכי גבוה
 *   בחלון זמן קטן סביב האקורד. אם אין → NO_BASS.
 * 
 * שדרוגים:
 * - Butterworth 2-pole filter במקום חד-קוטבי
 * - YIN algorithm במקום אוטוקורלציה פשוטה
 * - FFT validation לאימות התוצאה
 */
class BassEngine {
  constructor() {
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.bassRange = { min: 40, max: 250 }; // תדרי בס טיפוסיים (Hz)
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
   * הפרדת נמוכים/גבוהים עם Butterworth 2-pole low-pass
   */
  _separateLowHigh(samples, sr) {
    const N = samples.length;
    const low = new Float32Array(N);
    const high = new Float32Array(N);

    // Butterworth 2-pole filter ~180Hz
    const cutoff = 180;
    const w0 = 2 * Math.PI * cutoff / sr;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * 0.707); // Q = 0.707 (Butterworth)

    const b0 = (1 - cosW0) / 2;
    const b1 = 1 - cosW0;
    const b2 = (1 - cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    // Normalize
    const b0n = b0 / a0;
    const b1n = b1 / a0;
    const b2n = b2 / a0;
    const a1n = a1 / a0;
    const a2n = a2 / a0;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let lowEnergy = 0;
    let highEnergy = 0;

    for (let i = 0; i < N; i++) {
      const x = samples[i];
      const y = b0n * x + b1n * x1 + b2n * x2 - a1n * y1 - a2n * y2;
      const h = x - y;

      low[i] = y;
      high[i] = h;

      x2 = x1; x1 = x;
      y2 = y1; y1 = y;

      lowEnergy  += y * y;
      highEnergy += h * h;
    }

    return { low, high, lowEnergy, highEnergy };
  }

  /**
   * YIN Algorithm - זיהוי פיץ' מדויק
   */
  _yinDetect(samples, sr) {
    const minPeriod = Math.floor(sr / this.bassRange.max);
    const maxPeriod = Math.min(
      Math.floor(sr / this.bassRange.min),
      Math.floor(samples.length / 2)
    );

    if (maxPeriod <= minPeriod) return null;

    const W = maxPeriod;
    const yinThreshold = 0.15;

    // Step 1: Difference function
    const diff = new Float32Array(maxPeriod + 1);
    diff[0] = 0;

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

    // Step 2: Cumulative Mean Normalized Difference (CMNDF)
    const cmndf = new Float32Array(maxPeriod + 1);
    cmndf[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau <= maxPeriod; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = diff[tau] / (runningSum / tau + 1e-10);
    }

    // Step 3: Absolute threshold - מצא פריודה ראשונה מתחת לסף
    let bestTau = -1;
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (cmndf[tau] < yinThreshold) {
        // מצא מינימום מקומי
        while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    // אם לא נמצא - חפש מינימום גלובלי
    if (bestTau < 0) {
      let minVal = Infinity;
      for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        if (cmndf[tau] < minVal) {
          minVal = cmndf[tau];
          bestTau = tau;
        }
      }
      if (minVal > 0.5) return null;
    }

    // Step 4: Parabolic interpolation
    let refinedTau = bestTau;
    if (bestTau > 0 && bestTau < maxPeriod) {
      const s0 = cmndf[bestTau - 1];
      const s1 = cmndf[bestTau];
      const s2 = cmndf[bestTau + 1];
      const denom = 2 * (s0 - 2 * s1 + s2);
      if (Math.abs(denom) > 1e-10) {
        refinedTau = bestTau + (s0 - s2) / denom;
      }
    }

    return {
      period: refinedTau,
      confidence: 1 - cmndf[bestTau],
      freq: sr / refinedTau
    };
  }

  /**
   * FFT validation - אימות התדר עם ספקטרום
   */
  _fftValidate(samples, sr, yinFreq) {
    const N = samples.length;
    const fftSize = Math.pow(2, Math.ceil(Math.log2(N)));

    // Hann window + zero-pad
    const padded = new Float32Array(fftSize);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      padded[i] = samples[i] * w;
    }

    // DFT על תחום הבאס בלבד
    const minBin = Math.max(1, Math.floor(this.bassRange.min * fftSize / sr));
    const maxBin = Math.min(Math.ceil(this.bassRange.max * fftSize / sr), fftSize / 2);

    let maxMag = 0;
    let maxFreq = 0;

    for (let k = minBin; k <= maxBin; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n++) {
        const angle = -2 * Math.PI * k * n / fftSize;
        re += padded[n] * Math.cos(angle);
        im += padded[n] * Math.sin(angle);
      }
      const mag = Math.sqrt(re * re + im * im);
      if (mag > maxMag) {
        maxMag = mag;
        maxFreq = k * sr / fftSize;
      }
    }

    // בדוק התאמה
    const ratio = maxFreq / yinFreq;
    const tolerance = 0.15;

    if (Math.abs(ratio - 1) < tolerance) {
      return { valid: true, correction: null };
    }
    if (Math.abs(ratio - 2) < tolerance) {
      return { valid: true, correction: 'down' }; // YIN תפס אוקטבה למעלה
    }
    if (Math.abs(ratio - 0.5) < tolerance) {
      return { valid: true, correction: 'up' }; // YIN תפס אוקטבה למטה
    }

    return { valid: false, fftFreq: maxFreq };
  }

  /**
   * זיהוי באס בפריים בודד - משודרג עם YIN + FFT
   */
  detectBass(samples, sr) {
    const { low, high, lowEnergy, highEnergy } = this._separateLowHigh(samples, sr);

    const totalEnergy = lowEnergy + highEnergy;

    // שקט מוחלט או כמעט → אין באס
    if (totalEnergy < 1e-7) {
      return null;
    }

    const bassEnergyRatio = lowEnergy / (totalEnergy + 1e-12);

    // אם הנמוכים לא דומיננטיים בכלל → לא באס משמעותי
    // הורדתי את הסף מ-0.45 ל-0.3 כי במיקסים מודרניים הבאס לא תמיד דומיננטי
    if (bassEnergyRatio < 0.3) {
      return null;
    }

    // Hann window על הנמוכים
    const N = low.length;
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      windowed[i] = low[i] * w;
    }

    // YIN detection
    const yinResult = this._yinDetect(windowed, sr);
    if (!yinResult || yinResult.confidence < 0.3) {
      return null;
    }

    let freq = yinResult.freq;
    let confidence = yinResult.confidence;

    // FFT validation
    const fftCheck = this._fftValidate(windowed, sr, freq);
    if (fftCheck.valid) {
      if (fftCheck.correction === 'down') {
        freq = freq / 2;
      } else if (fftCheck.correction === 'up') {
        freq = freq * 2;
      }
      confidence *= 1.1; // boost כי מאומת
    } else {
      confidence *= 0.75; // penalty כי לא מאומת
    }

    // סף סופי
    const MIN_CONF = 0.35;
    if (confidence < MIN_CONF) {
      return null;
    }

    // תרגום ל-note
    const midi = 12 * Math.log2(freq / 440) + 69;
    const roundedMidi = Math.round(midi);
    const pc = ((roundedMidi % 12) + 12) % 12;

    return {
      note: this.NOTES[pc],
      pc,
      midi: roundedMidi,
      freq,
      confidence: Math.min(confidence * bassEnergyRatio, 1.0)
    };
  }

  /**
   * בוחר את הבאס החזק ביותר בחלון זמן סביב זמן האקורד (אין הרמוניה)
   */
  _chooseStrongestBassAroundTime(bassResults, chordTime, windowSeconds) {
    if (!bassResults || bassResults.length === 0) return null;

    const half = windowSeconds / 2;
    const start = chordTime - half;
    const end   = chordTime + half;

    let best = null;
    let bestConf = 0;

    for (const frame of bassResults) {
      if (frame.t < start || frame.t > end) continue;
      if (!frame.bassNote || frame.confidence <= 0) continue;

      // בוחרים פשוט את הבאס עם ה-confidence הכי גבוה בחלון
      if (frame.confidence > bestConf) {
        bestConf = frame.confidence;
        best = frame;
      }
    }

    return best;
  }

  /**
   * Refinement לרמת timeline:
   * לכל אקורד בוחרים את הבאס הכי משמעותי (לפי confidence) סביב זמן האקורד.
   * אם אין באס משמעותי → NO_BASS.
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
