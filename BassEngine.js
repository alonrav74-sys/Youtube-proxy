/**
 * BassEngine v5.2 - Significant Physical Bass
 * -------------------------------------------
 * עקרונות:
 * - עובד רק על תחום הבאס (low-pass + בדיקת יחס אנרגיה נמוכים/גבוהים)
 * - בודק אם בכלל יש באס משמעותי בפריים, אחרת מחזיר null
 * - עושה אוטוקורלציה על הסיגנל המסונן לנמוכים בלבד
 * - ברמת timeline: לכל אקורד לוקחים את הבאס עם ה-confidence הכי גבוה
 *   בחלון זמן קטן סביב האקורד. אם אין → NO_BASS.
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
   * הפרדת נמוכים/גבוהים עם low-pass חד-קוטבי פשוט
   */
  _separateLowHigh(samples, sr) {
    const N = samples.length;
    const low = new Float32Array(N);
    const high = new Float32Array(N);

    // cutoff ~200Hz (בקירוב) - מספיק כדי להדגיש את הבאס
    const alpha = 2 * Math.PI * 200 / sr;
    const a = alpha / (1 + alpha);

    let prevLow = 0;
    let lowEnergy = 0;
    let highEnergy = 0;

    for (let i = 0; i < N; i++) {
      const x = samples[i];
      const y = prevLow + a * (x - prevLow); // low-pass
      prevLow = y;
      const h = x - y;                        // high component

      low[i] = y;
      high[i] = h;

      lowEnergy  += y * y;
      highEnergy += h * h;
    }

    return { low, high, lowEnergy, highEnergy };
  }

  /**
   * זיהוי באס בפריים בודד, ללא הרמוניה - רק תדר פיזיקלי משמעותי
   */
  detectBass(samples, sr) {
    const { low, high, lowEnergy, highEnergy } = this._separateLowHigh(samples, sr);

    const totalEnergy = lowEnergy + highEnergy;

    // שקט מוחלט או כמעט → אין באס
    if (totalEnergy < 1e-7) {
      return null;
    }

    const bassEnergyRatio = lowEnergy / (totalEnergy + 1e-12);

    // אם הנמוכים לא דומיננטיים בכלל → זה כנראה פריטה/רעשים, לא באס משמעותי
    if (bassEnergyRatio < 0.45) {
      return null;
    }

    // Hann window על הנמוכים לייצוב האוטוקורלציה
    const N = low.length;
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      windowed[i] = low[i] * w;
    }

    const minPeriod = Math.floor(sr / this.bassRange.max);
    const maxPeriod = Math.floor(sr / this.bassRange.min);

    let bestCorr = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let corr = 0, norm1 = 0, norm2 = 0;
      const len = Math.min(N - period, 1000);

      for (let i = 0; i < len; i++) {
        const s1 = windowed[i];
        const s2 = windowed[i + period];
        corr  += s1 * s2;
        norm1 += s1 * s1;
        norm2 += s2 * s2;
      }

      const denom = Math.sqrt(norm1 * norm2 + 1e-10);
      if (denom === 0) continue;
      let normCorr = corr / denom;

      // ביאס קטן לכיוון תדר נמוך יותר (פונדמנטל מול אוקטבה),
      // אבל בלי קשר להרמוניה, רק פיזיקלית.
      const lowFreqBias = Math.pow(period / maxPeriod, 0.25);
      normCorr *= lowFreqBias;

      if (normCorr > bestCorr) {
        bestCorr = normCorr;
        bestPeriod = period;
      }
    }

    // אם אין פיק מספיק חזק → מבחינתנו אין באס משמעותי בפריים הזה
    const MIN_CORR = 0.3; // אפשר לשחק בין 0.25–0.4 לפי כמה אגרסיבי אתה רוצה
    if (bestPeriod === 0 || bestCorr < MIN_CORR) {
      return null;
    }

    // תרגום ל-freq / midi / note
    const freq = sr / bestPeriod;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const roundedMidi = Math.round(midi);
    const pc = ((roundedMidi % 12) + 12) % 12;

    return {
      note: this.NOTES[pc],
      pc,
      midi: roundedMidi,
      freq,
      confidence: bestCorr * bassEnergyRatio // מחזק רק אם הנמוכים באמת דומיננטיים
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
