/**
 * MajorMinorRefiner v4.2 - IMPROVED 3rd Detection
 * 
 * 🔧 תיקונים עיקריים:
 * - זיהוי משופר של השליש (3 סמיטונים = מינור, 4 = מז'ור)
 * - סף נמוך יותר לזיהוי
 * - בודק את כל הפריים, לא רק חלק ממנו
 * - לא תלוי בבאס או באקורד קודם
 * 
 * 🎯 המטרה: רק לזהות אם זה מינור או מז'ור!
 */

class MajorMinorRefiner {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  /**
   * Main method: Validate major/minor quality for entire timeline
   */
  async refineChordTimeline(audioBuffer, timeline, options = {}) {
    const opts = {
      debug: options.debug || false,
      minConfidenceToOverride: options.minConfidenceToOverride || 0.30,  // 🔧 הורד מ-0.35
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
      if (chordDuration < 0.2) {
        refined.push({
          ...chord,
          shouldOverride: false,
          qualityConfidence: 0,
          detectedQuality: 'too_short',
          reason: 'too_short'
        });
        continue;
      }

      // Parse chord
      const { root, isMajor, isMinor, baseChord } = this.parseChord(chord.label);
      
      if (root === null) {
        refined.push({
          ...chord,
          shouldOverride: false,
          qualityConfidence: 0,
          detectedQuality: 'cannot_parse',
          reason: 'cannot_parse'
        });
        continue;
      }

      // Skip complex chords
      if (this.isComplexChord(chord.label)) {
        refined.push({
          ...chord,
          shouldOverride: false,
          qualityConfidence: 0,
          detectedQuality: 'complex',
          reason: 'complex_chord'
        });
        continue;
      }

      // Extract audio segment
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // 🎯 Analyze the 3rd interval
      const quality = this.analyzeThirdInterval(segment, sampleRate, root);

      // Decide if we should override
      let shouldOverride = false;
      let refinedLabel = chord.label;
      let reason = 'no_change';

      if (quality.confidence >= opts.minConfidenceToOverride) {
        // Current chord says major, but sound is clearly minor
        if (isMajor && quality.isMinor) {
          shouldOverride = true;
          refinedLabel = baseChord + 'm';
          reason = 'major_to_minor';
        }
        // Current chord says minor, but sound is clearly major
        else if (isMinor && quality.isMajor) {
          shouldOverride = true;
          refinedLabel = baseChord;
          reason = 'minor_to_major';
        }
      }

      refined.push({
        ...chord,
        label: shouldOverride ? refinedLabel : chord.label,
        shouldOverride,
        refinedLabel,
        qualityConfidence: quality.confidence,
        detectedQuality: quality.isMajor ? 'major' : quality.isMinor ? 'minor' : 'unclear',
        major3rdStrength: quality.major3rd,
        minor3rdStrength: quality.minor3rd,
        thirdRatio: quality.ratio,
        reason
      });

      if (opts.debug) {
        const symbol = quality.isMajor ? '▲' : quality.isMinor ? '▼' : '?';
        console.log(
          `🎵 ${chord.label} → ${symbol} ` +
          `M3:${(quality.major3rd * 100).toFixed(0)}% ` +
          `m3:${(quality.minor3rd * 100).toFixed(0)}% ` +
          `conf:${(quality.confidence * 100).toFixed(0)}%` +
          (shouldOverride ? ` → ${refinedLabel}` : '')
        );
      }
    }

    return refined;
  }

  /**
   * 🎯 Analyze the 3rd interval - SIMPLE AND DIRECT
   * minor 3rd = 3 semitones from root
   * major 3rd = 4 semitones from root
   */
  analyzeThirdInterval(segment, sampleRate, rootPc) {
    if (!segment || segment.length < 512) {
      return { isMajor: false, isMinor: false, confidence: 0, major3rd: 0, minor3rd: 0, ratio: 1 };
    }

    // Use multiple frame sizes for better detection
    const frameSizes = [2048, 4096];
    let totalMajor3rd = 0;
    let totalMinor3rd = 0;
    let totalRoot = 0;
    let frameCount = 0;

    for (const fftSize of frameSizes) {
      const hopSize = fftSize / 2;
      
      for (let start = 0; start + fftSize <= segment.length; start += hopSize) {
        const frame = segment.slice(start, start + fftSize);
        const chroma = this.computeChromaFromFrame(frame, sampleRate, fftSize);
        
        if (chroma) {
          totalRoot += chroma[rootPc] || 0;
          totalMinor3rd += chroma[this.toPc(rootPc + 3)] || 0;  // 3 semitones = minor
          totalMajor3rd += chroma[this.toPc(rootPc + 4)] || 0;  // 4 semitones = major
          frameCount++;
        }
      }
    }

    if (frameCount === 0 || totalRoot < 0.01) {
      return { isMajor: false, isMinor: false, confidence: 0, major3rd: 0, minor3rd: 0, ratio: 1 };
    }

    // Average
    const avgRoot = totalRoot / frameCount;
    const avgMinor3rd = totalMinor3rd / frameCount;
    const avgMajor3rd = totalMajor3rd / frameCount;

    // 🎯 Simple decision: which 3rd is stronger?
    const ratio = (avgMajor3rd + 0.001) / (avgMinor3rd + 0.001);
    
    let isMajor = false;
    let isMinor = false;
    let confidence = 0;

    // 🔧 LOWER thresholds - easier to detect
    if (ratio > 1.15 && avgMajor3rd > 0.02) {
      // Major 3rd is stronger
      isMajor = true;
      confidence = Math.min(1.0, (ratio - 1.0) * 0.5 + avgMajor3rd * 3);
    } else if (ratio < 0.87 && avgMinor3rd > 0.02) {
      // Minor 3rd is stronger
      isMinor = true;
      confidence = Math.min(1.0, (1.0 / ratio - 1.0) * 0.5 + avgMinor3rd * 3);
    } else if (avgMajor3rd > 0.05 && avgMajor3rd > avgMinor3rd * 1.05) {
      // Weak but present major
      isMajor = true;
      confidence = Math.min(0.5, (avgMajor3rd - avgMinor3rd) * 5);
    } else if (avgMinor3rd > 0.05 && avgMinor3rd > avgMajor3rd * 1.05) {
      // Weak but present minor
      isMinor = true;
      confidence = Math.min(0.5, (avgMinor3rd - avgMajor3rd) * 5);
    }

    return {
      isMajor,
      isMinor,
      confidence,
      major3rd: avgMajor3rd,
      minor3rd: avgMinor3rd,
      ratio
    };
  }

  /**
   * Compute chroma from a single frame
   */
  computeChromaFromFrame(frame, sampleRate, fftSize) {
    const N = frame.length;
    if (N < 512) return null;

    // Apply Hann window
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      windowed[i] = frame[i] * w;
    }

    // FFT
    const { mags } = this.fft(windowed);
    
    // Build chroma
    const chroma = new Float32Array(12);
    
    // Focus on frequency range where 3rd intervals are clearest
    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sampleRate / fftSize;
      
      // 🔧 Wider range: 60Hz - 3000Hz
      if (freq < 60 || freq > 3000) continue;

      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = this.toPc(Math.round(midi));
      
      // Weight mid frequencies more (where 3rds are clearest)
      const weight = (freq >= 150 && freq <= 1500) ? 1.5 : 1.0;
      chroma[pc] += mags[bin] * weight;
    }

    // Normalize
    const sum = chroma.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < 12; i++) {
        chroma[i] /= sum;
      }
    }

    return chroma;
  }

  /**
   * Simple FFT
   */
  fft(input) {
    const n = input.length;
    let N = 1;
    while (N < n) N <<= 1;

    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);

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
        let wReal = 1;
        let wImag = 0;
        
        for (let k = 0; k < len / 2; k++) {
          const tReal = re[i + k + len / 2] * wReal - im[i + k + len / 2] * wImag;
          const tImag = re[i + k + len / 2] * wImag + im[i + k + len / 2] * wReal;
          
          re[i + k + len / 2] = re[i + k] - tReal;
          im[i + k + len / 2] = im[i + k] - tImag;
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
   * Parse chord label
   */
  parseChord(label) {
    if (!label || typeof label !== 'string') {
      return { root: null, isMajor: false, isMinor: false, baseChord: '' };
    }

    const match = label.match(/^([A-G][#b]?)/);
    if (!match) {
      return { root: null, isMajor: false, isMinor: false, baseChord: '' };
    }

    const baseChord = match[1];
    
    const flatToSharp = {
      'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    };
    let normalized = baseChord;
    if (flatToSharp[baseChord]) {
      normalized = flatToSharp[baseChord];
    }
    
    const root = this.NOTES.indexOf(normalized);
    const isMinor = /m(?!aj)/.test(label);
    const isMajor = !isMinor && !/dim|aug|sus/.test(label);

    return { root, isMajor, isMinor, baseChord };
  }

  /**
   * Check if chord is complex
   */
  isComplexChord(label) {
    // 🔧 Don't skip 7ths - they still have clear 3rds!
    return /sus|dim|aug/.test(label);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MajorMinorRefiner;
}
