/**
 * MajorMinorRefiner v4.0 - QUALITY VALIDATOR ONLY
 * 
 * 🎯 NEW APPROACH:
 * - Does NOT change chord roots
 * - ONLY validates if the sound is major or minor
 * - Analyzes the 3rd interval (major 3rd vs minor 3rd)
 * - Returns quality confidence: "definitely major", "definitely minor", "unclear"
 * 
 * Example: If engine says "E" but sound has minor 3rd → change to "Em"
 *          If engine says "Em" but sound has major 3rd → change to "E"
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
      minConfidenceToOverride: options.minConfidenceToOverride || 0.50,  // Higher = more conservative
      thirdRatioThreshold: options.thirdRatioThreshold || 1.3,            // How clear the 3rd must be
    };

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

      // Skip very short chords (< 0.3s)
      if (chordDuration < 0.3) {
        refined.push({
          ...chord,
          shouldOverride: false,
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
          reason: 'cannot_parse'
        });
        continue;
      }

      // Skip complex chords (sus, dim, aug, 7ths, etc.)
      if (this.isComplexChord(chord.label)) {
        refined.push({
          ...chord,
          shouldOverride: false,
          reason: 'complex_chord'
        });
        continue;
      }

      // Extract audio segment for this chord
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // Analyze the 3rd interval
      const quality = this.analyzeThirdQuality(segment, sampleRate, root);

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
        shouldOverride,
        refinedLabel,
        qualityConfidence: quality.confidence,
        detectedQuality: quality.isMajor ? 'major' : quality.isMinor ? 'minor' : 'unclear',
        thirdRatio: quality.thirdRatio,
        reason
      });

      if (opts.debug && shouldOverride) {
        console.log(
          `🎵 ${chord.label} → ${refinedLabel} ` +
          `(conf: ${(quality.confidence * 100).toFixed(0)}%, ` +
          `ratio: ${quality.thirdRatio.toFixed(2)}, ` +
          `reason: ${reason})`
        );
      }
    }

    return refined;
  }

  /**
   * Analyze if the sound has a major 3rd or minor 3rd
   */
  analyzeThirdQuality(audioSegment, sampleRate, rootPc) {
    const toPc = n => ((n % 12) + 12) % 12;
    
    // Compute chroma for this segment
    const chroma = this.computeChroma(audioSegment, sampleRate);
    
    if (!chroma) {
      return { isMajor: false, isMinor: false, confidence: 0, thirdRatio: 1.0 };
    }

    // Get root, major 3rd, and minor 3rd strengths
    const rootStrength = chroma[toPc(rootPc)] || 0;
    const majorThird = chroma[toPc(rootPc + 4)] || 0;
    const minorThird = chroma[toPc(rootPc + 3)] || 0;

    // Need strong root to be confident
    if (rootStrength < 0.15) {
      return { isMajor: false, isMinor: false, confidence: 0, thirdRatio: 1.0 };
    }

    // Calculate ratio between major and minor 3rd
    const thirdRatio = (majorThird + 0.001) / (minorThird + 0.001);

    let isMajor = false;
    let isMinor = false;
    let confidence = 0;

    // Major 3rd is clearly stronger
    if (thirdRatio > 1.5 && majorThird > 0.12) {
      isMajor = true;
      confidence = Math.min(1.0, (thirdRatio - 1.0) * 0.4 + (majorThird - 0.12) * 2.0);
    }
    // Minor 3rd is clearly stronger
    else if (thirdRatio < 0.67 && minorThird > 0.12) {
      isMinor = true;
      confidence = Math.min(1.0, (1.0 / thirdRatio - 1.0) * 0.4 + (minorThird - 0.12) * 2.0);
    }
    // Ambiguous - don't override
    else {
      confidence = 0;
    }

    return { isMajor, isMinor, confidence, thirdRatio };
  }

  /**
   * Compute chromagram for audio segment
   */
  computeChroma(audioSegment, sampleRate) {
    if (!audioSegment || audioSegment.length < 1024) return null;

    const fftSize = 4096;
    const chroma = new Float32Array(12);

    // Hann window
    const window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }

    // Take middle portion of segment
    const startIdx = Math.floor((audioSegment.length - fftSize) / 2);
    if (startIdx < 0) return null;

    const frame = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      frame[i] = audioSegment[startIdx + i] * window[i];
    }

    // Simple FFT
    const { mags } = this.fft(frame);

    // Map frequencies to pitch classes
    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sampleRate / fftSize;
      
      // Focus on musical range (80 Hz - 2000 Hz)
      if (freq < 80 || freq > 2000) continue;

      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = Math.round(midi) % 12;
      
      chroma[pc] += mags[bin];
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

    // Extract root note (e.g., "C#", "Bb", "F")
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) {
      return { root: null, isMajor: false, isMinor: false, baseChord: '' };
    }

    const baseChord = match[1];
    const root = this.NOTES.indexOf(baseChord.replace('b', '#').replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#'));

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
