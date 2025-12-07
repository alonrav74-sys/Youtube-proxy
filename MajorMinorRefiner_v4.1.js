/**
 * MajorMinorRefiner v4.1 - FIXED QUALITY VALIDATOR
 * 
 * 🔧 תיקונים עיקריים:
 * - ניתוח מרובה פריימים (לא רק האמצע)
 * - הורדת סף ה-third strength מ-0.12 ל-0.04
 * - הורדת סף ה-root strength מ-0.15 ל-0.05
 * - הורדת יחס ה-thirdRatio מ-1.5 ל-1.2
 * - חישוב confidence משופר
 * 
 * 🎯 המטרה: רק לזהות אם זה מינור או מז'ור, לא לשנות את השורש!
 */

class MajorMinorRefiner {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  /**
   * Main method: Validate major/minor quality for entire timeline
   */
  async refineChordTimeline(audioBuffer, timeline, options = {}) {
    const opts = {
      debug: options.debug || false,
      minConfidenceToOverride: options.minConfidenceToOverride || 0.35,  // 🔧 הורד מ-0.50
      thirdRatioThreshold: options.thirdRatioThreshold || 1.2,           // 🔧 הורד מ-1.3
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

      // Skip very short chords (< 0.25s)
      if (chordDuration < 0.25) {  // 🔧 הורד מ-0.3
        refined.push({
          ...chord,
          shouldOverride: false,
          qualityConfidence: 0,
          detectedQuality: 'too_short',
          reason: 'too_short'
        });
        continue;
      }

      // Parse chord root and current quality
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

      // Skip complex chords (sus, dim, aug, 7ths, etc.)
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

      // Extract audio segment for this chord
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // 🔧 NEW: Analyze the 3rd interval with multi-frame approach
      const quality = this.analyzeThirdQualityMultiFrame(segment, sampleRate, root);

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
        major3rdStrength: quality.majorThird,
        minor3rdStrength: quality.minorThird,
        thirdRatio: quality.thirdRatio,
        reason
      });

      if (opts.debug) {
        const symbol = quality.isMajor ? '▲' : quality.isMinor ? '▼' : '?';
        console.log(
          `🎵 ${chord.label} ${symbol} ` +
          `(M3: ${(quality.majorThird * 100).toFixed(0)}%, ` +
          `m3: ${(quality.minorThird * 100).toFixed(0)}%, ` +
          `ratio: ${quality.thirdRatio.toFixed(2)}, ` +
          `conf: ${(quality.confidence * 100).toFixed(0)}%)` +
          (shouldOverride ? ` → ${refinedLabel}` : '')
        );
      }
    }

    return refined;
  }

  /**
   * 🔧 NEW: Analyze 3rd quality using multiple frames
   */
  analyzeThirdQualityMultiFrame(audioSegment, sampleRate, rootPc) {
    const toPc = n => ((n % 12) + 12) % 12;
    
    if (!audioSegment || audioSegment.length < 1024) {
      return { isMajor: false, isMinor: false, confidence: 0, thirdRatio: 1.0, majorThird: 0, minorThird: 0 };
    }

    const fftSize = 4096;
    const hopSize = 2048;
    const frames = [];

    // 🔧 NEW: Extract multiple frames
    for (let i = 0; i + fftSize <= audioSegment.length; i += hopSize) {
      frames.push(audioSegment.slice(i, i + fftSize));
    }

    if (frames.length === 0) {
      // Segment too short - use what we have
      const padded = new Float32Array(fftSize);
      padded.set(audioSegment.slice(0, Math.min(audioSegment.length, fftSize)));
      frames.push(padded);
    }

    // Compute chroma for each frame and average
    const avgChroma = new Float32Array(12);
    let validFrames = 0;

    for (const frame of frames) {
      const chroma = this.computeChroma(frame, sampleRate);
      if (chroma) {
        for (let i = 0; i < 12; i++) {
          avgChroma[i] += chroma[i];
        }
        validFrames++;
      }
    }

    if (validFrames === 0) {
      return { isMajor: false, isMinor: false, confidence: 0, thirdRatio: 1.0, majorThird: 0, minorThird: 0 };
    }

    // Average the chroma
    for (let i = 0; i < 12; i++) {
      avgChroma[i] /= validFrames;
    }

    // Get root, major 3rd, and minor 3rd strengths
    const rootStrength = avgChroma[toPc(rootPc)] || 0;
    const majorThird = avgChroma[toPc(rootPc + 4)] || 0;
    const minorThird = avgChroma[toPc(rootPc + 3)] || 0;
    const fifth = avgChroma[toPc(rootPc + 7)] || 0;

    // 🔧 LOWER threshold - need some root presence
    if (rootStrength < 0.05) {  // היה 0.15
      return { isMajor: false, isMinor: false, confidence: 0, thirdRatio: 1.0, majorThird, minorThird };
    }

    // Calculate ratio between major and minor 3rd
    const thirdRatio = (majorThird + 0.001) / (minorThird + 0.001);

    let isMajor = false;
    let isMinor = false;
    let confidence = 0;

    // 🔧 LOWER thresholds for detection
    // Major 3rd is stronger
    if (thirdRatio > 1.2 && majorThird > 0.04) {  // היה 1.5 ו-0.12
      isMajor = true;
      // Confidence based on how clear the difference is
      const ratioBased = Math.min(1.0, (thirdRatio - 1.0) * 0.5);
      const strengthBased = Math.min(1.0, majorThird * 5);
      confidence = (ratioBased + strengthBased) / 2;
    }
    // Minor 3rd is stronger
    else if (thirdRatio < 0.83 && minorThird > 0.04) {  // היה 0.67 ו-0.12
      isMinor = true;
      const ratioBased = Math.min(1.0, (1.0 / thirdRatio - 1.0) * 0.5);
      const strengthBased = Math.min(1.0, minorThird * 5);
      confidence = (ratioBased + strengthBased) / 2;
    }
    // 🔧 NEW: Check even if ratios are close but one is clearly present
    else if (majorThird > 0.08 && majorThird > minorThird) {
      isMajor = true;
      confidence = Math.min(0.5, (majorThird - minorThird) * 3);
    }
    else if (minorThird > 0.08 && minorThird > majorThird) {
      isMinor = true;
      confidence = Math.min(0.5, (minorThird - majorThird) * 3);
    }

    // 🔧 Boost confidence if fifth is also present (validates the chord)
    if (fifth > 0.06 && confidence > 0) {
      confidence = Math.min(1.0, confidence * 1.2);
    }

    return { isMajor, isMinor, confidence, thirdRatio, majorThird, minorThird };
  }

  /**
   * Compute chromagram for audio frame
   */
  computeChroma(frame, sampleRate) {
    if (!frame || frame.length < 1024) return null;

    const N = frame.length;
    const chroma = new Float32Array(12);

    // Hann window
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      windowed[i] = frame[i] * window;
    }

    // FFT
    const { mags } = this.fft(windowed);

    // Map frequencies to pitch classes
    // 🔧 Focus on range where 3rd intervals are clearest (100-1500 Hz)
    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sampleRate / N;
      
      if (freq < 60 || freq > 2500) continue;  // 🔧 הרחבתי מ-80-2000

      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      
      // 🔧 Weight lower harmonics more (they're more reliable for chord quality)
      const weight = freq < 500 ? 1.5 : 1.0;
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
   * Simple FFT implementation
   */
  fft(input) {
    const n = input.length;
    let N = 1;
    while (N < n) N <<= 1;

    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);

    // Bit-reversal
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

    // FFT
    for (let len = 2; len <= N; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wLenReal = Math.cos(angle);
      const wLenImag = Math.sin(angle);
      
      for (let i = 0; i < N; i += len) {
        let wReal = 1;
        let wImag = 0;
        
        for (let j = 0; j < len / 2; j++) {
          const tReal = re[i + j + len / 2] * wReal - im[i + j + len / 2] * wImag;
          const tImag = re[i + j + len / 2] * wImag + im[i + j + len / 2] * wReal;
          
          re[i + j + len / 2] = re[i + j] - tReal;
          im[i + j + len / 2] = im[i + j] - tImag;
          re[i + j] += tReal;
          im[i + j] += tImag;
          
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
   * Parse chord label to extract root and quality
   */
  parseChord(label) {
    if (!label || typeof label !== 'string') {
      return { root: null, isMajor: false, isMinor: false, baseChord: '' };
    }

    // Extract root note
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) {
      return { root: null, isMajor: false, isMinor: false, baseChord: '' };
    }

    const baseChord = match[1];
    
    // Normalize flats to sharps for lookup
    const flatToSharp = {
      'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    };
    let normalized = baseChord;
    if (flatToSharp[baseChord]) {
      normalized = flatToSharp[baseChord];
    } else if (baseChord.includes('b')) {
      // Handle single flats like "Cb" -> "B"
      const noteMap = {'Cb': 'B', 'Fb': 'E'};
      normalized = noteMap[baseChord] || baseChord.replace('b', '#');
    }
    
    const root = this.NOTES.indexOf(normalized);

    // Check if it's minor (has 'm' but not 'maj')
    const isMinor = /m(?!aj)/.test(label);
    const isMajor = !isMinor && !/dim|aug|sus/.test(label);

    return { root, isMajor, isMinor, baseChord };
  }

  /**
   * Check if chord is complex (sus, dim, aug, 7ths, etc.)
   */
  isComplexChord(label) {
    return /sus|dim|aug|7|9|11|13|6|add/.test(label);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MajorMinorRefiner;
}
