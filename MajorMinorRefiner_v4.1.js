/**
 * MajorMinorRefiner v4.3 - WITH MEMORY + SIMPLE 3RD DETECTION
 * 
 * 🔧 שיפורים:
 * - זיכרון של 5 אקורדים אחרונים
 * - זיהוי פשוט של טרצות (3 סמיטונים = מינור, 4 = מז'ור)
 * - משווה לאקורדים קודמים על אותו שורש
 * - אם Em הופך ל-E (או להיפך) - מזהה את זה בקלות
 */

class MajorMinorRefiner {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.recentChords = []; // זיכרון של אקורדים אחרונים
    this.MEMORY_SIZE = 5;
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
      minConfidenceToOverride: options.minConfidenceToOverride || 0.25,
    };

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;

    // Reset memory at start
    this.recentChords = [];
    
    const refined = [];

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const nextChord = timeline[i + 1];
      
      const startTime = chord.t;
      const endTime = nextChord ? nextChord.t : duration;
      const chordDuration = endTime - startTime;

      // Skip very short chords
      if (chordDuration < 0.15) {
        refined.push({
          ...chord,
          shouldOverride: false,
          qualityConfidence: 0,
          detectedQuality: 'too_short',
          reason: 'too_short'
        });
        this.addToMemory(chord.label, null);
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

      // Skip sus/dim/aug (but NOT 7ths!)
      if (/sus|dim|aug/.test(chord.label)) {
        refined.push({
          ...chord,
          shouldOverride: false,
          qualityConfidence: 0,
          detectedQuality: 'complex',
          reason: 'complex_chord'
        });
        this.addToMemory(chord.label, null);
        continue;
      }

      // Extract audio segment
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // 🎯 SIMPLE: Detect 3rd interval
      const quality = this.detectThird(segment, sampleRate, root);
      
      // 🧠 MEMORY: Check if same root appeared recently with different quality
      const memoryHint = this.checkMemory(root, quality);

      // Combine detection with memory
      let finalConfidence = quality.confidence;
      if (memoryHint.hasContext) {
        // If we saw same root with clear quality before, boost confidence
        finalConfidence = Math.min(1.0, finalConfidence + memoryHint.boost);
      }

      // Decide if we should override
      let shouldOverride = false;
      let refinedLabel = chord.label;
      let reason = 'no_change';

      if (finalConfidence >= opts.minConfidenceToOverride) {
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

      // Add to memory
      this.addToMemory(refinedLabel, quality);

      refined.push({
        ...chord,
        label: shouldOverride ? refinedLabel : chord.label,
        shouldOverride,
        refinedLabel,
        qualityConfidence: finalConfidence,
        detectedQuality: quality.isMajor ? 'major' : quality.isMinor ? 'minor' : 'unclear',
        major3rdStrength: quality.major3rd,
        minor3rdStrength: quality.minor3rd,
        reason,
        memoryContext: memoryHint.context
      });

      if (opts.debug) {
        const symbol = quality.isMajor ? '▲' : quality.isMinor ? '▼' : '?';
        console.log(
          `🎵 [${i}] ${chord.label} ${symbol} ` +
          `M3:${(quality.major3rd * 100).toFixed(0)}% ` +
          `m3:${(quality.minor3rd * 100).toFixed(0)}% ` +
          `conf:${(finalConfidence * 100).toFixed(0)}%` +
          (memoryHint.context ? ` [${memoryHint.context}]` : '') +
          (shouldOverride ? ` → ${refinedLabel}` : '')
        );
      }
    }

    return refined;
  }

  /**
   * 🎯 SIMPLE 3rd detection - just compare 3 vs 4 semitones
   */
  detectThird(segment, sampleRate, rootPc) {
    if (!segment || segment.length < 512) {
      return { isMajor: false, isMinor: false, confidence: 0, major3rd: 0, minor3rd: 0 };
    }

    // Analyze entire segment with multiple FFT sizes
    const chroma = this.computeFullChroma(segment, sampleRate);
    
    if (!chroma) {
      return { isMajor: false, isMinor: false, confidence: 0, major3rd: 0, minor3rd: 0 };
    }

    // Get strengths
    const rootStrength = chroma[rootPc] || 0;
    const minor3rd = chroma[this.toPc(rootPc + 3)] || 0;  // 3 semitones
    const major3rd = chroma[this.toPc(rootPc + 4)] || 0;  // 4 semitones
    const fifth = chroma[this.toPc(rootPc + 7)] || 0;     // 7 semitones (for validation)

    // Need some root presence
    if (rootStrength < 0.03) {
      return { isMajor: false, isMinor: false, confidence: 0, major3rd, minor3rd };
    }

    // 🎯 SIMPLE DECISION: which 3rd is stronger?
    let isMajor = false;
    let isMinor = false;
    let confidence = 0;

    const diff = major3rd - minor3rd;
    const maxThird = Math.max(major3rd, minor3rd);

    if (maxThird < 0.02) {
      // Both thirds are too weak
      return { isMajor: false, isMinor: false, confidence: 0, major3rd, minor3rd };
    }

    if (diff > 0.01) {
      // Major 3rd is stronger
      isMajor = true;
      confidence = Math.min(1.0, diff * 10 + major3rd * 2);
    } else if (diff < -0.01) {
      // Minor 3rd is stronger
      isMinor = true;
      confidence = Math.min(1.0, (-diff) * 10 + minor3rd * 2);
    } else {
      // Too close to call
      confidence = 0;
    }

    // Boost confidence if 5th is also present
    if (fifth > 0.05 && confidence > 0) {
      confidence = Math.min(1.0, confidence * 1.2);
    }

    return { isMajor, isMinor, confidence, major3rd, minor3rd };
  }

  /**
   * Compute chroma from entire segment
   */
  computeFullChroma(segment, sampleRate) {
    const chroma = new Float32Array(12);
    const fftSize = 4096;
    const hopSize = 2048;
    let frameCount = 0;

    for (let start = 0; start + fftSize <= segment.length; start += hopSize) {
      const frame = segment.slice(start, start + fftSize);
      const frameChroma = this.computeFrameChroma(frame, sampleRate, fftSize);
      
      if (frameChroma) {
        for (let i = 0; i < 12; i++) {
          chroma[i] += frameChroma[i];
        }
        frameCount++;
      }
    }

    if (frameCount === 0) return null;

    // Average and normalize
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      chroma[i] /= frameCount;
      sum += chroma[i];
    }
    
    if (sum > 0) {
      for (let i = 0; i < 12; i++) {
        chroma[i] /= sum;
      }
    }

    return chroma;
  }

  /**
   * Compute chroma for single frame
   */
  computeFrameChroma(frame, sampleRate, fftSize) {
    const N = frame.length;
    
    // Hann window
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      windowed[i] = frame[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    }

    // FFT
    const { mags } = this.fft(windowed);
    
    // Build chroma
    const chroma = new Float32Array(12);
    
    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sampleRate / fftSize;
      if (freq < 80 || freq > 2000) continue;

      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = this.toPc(Math.round(midi));
      
      // Weight mid frequencies more
      const weight = (freq >= 200 && freq <= 1000) ? 1.5 : 1.0;
      chroma[pc] += mags[bin] * weight;
    }

    return chroma;
  }

  /**
   * 🧠 MEMORY: Add chord to recent memory
   */
  addToMemory(label, quality) {
    const root = this.parseChord(label).root;
    const isMinor = /m(?!aj)/.test(label);
    
    this.recentChords.push({
      label,
      root,
      isMinor,
      quality
    });

    // Keep only last N chords
    if (this.recentChords.length > this.MEMORY_SIZE) {
      this.recentChords.shift();
    }
  }

  /**
   * 🧠 MEMORY: Check if we saw this root before
   */
  checkMemory(currentRoot, currentQuality) {
    const result = {
      hasContext: false,
      boost: 0,
      context: null
    };

    // Look for same root in memory
    for (const mem of this.recentChords) {
      if (mem.root === currentRoot && mem.quality) {
        result.hasContext = true;
        
        // Same root appeared before
        if (mem.isMinor && currentQuality.isMajor) {
          // Was minor, now major - this is a real change!
          result.boost = 0.15;
          result.context = 'was_minor';
        } else if (!mem.isMinor && currentQuality.isMinor) {
          // Was major, now minor - this is a real change!
          result.boost = 0.15;
          result.context = 'was_major';
        } else if (mem.isMinor === currentQuality.isMinor) {
          // Same quality - boost confidence
          result.boost = 0.1;
          result.context = 'consistent';
        }
        
        break; // Use most recent match
      }
    }

    return result;
  }

  /**
   * FFT implementation
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
        let wReal = 1, wImag = 0;
        
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
    
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    let normalized = flatToSharp[baseChord] || baseChord;
    
    const root = this.NOTES.indexOf(normalized);
    const isMinor = /m(?!aj)/.test(label);
    const isMajor = !isMinor && !/dim|aug|sus/.test(label);

    return { root, isMajor, isMinor, baseChord };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MajorMinorRefiner;
}
