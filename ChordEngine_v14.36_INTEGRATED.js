/**
 * ChordEngine v14.36 INTEGRATED
 * מנוע זיהוי אקורדים עם תמיכה ב-BassEngine ו-MajorMinorRefiner
 */
class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
    this.MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
    
    this.CHORD_TEMPLATES = {
      'maj': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      'm':   [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
      '7':   [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      'm7':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
      'maj7':[1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
      'dim': [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
      'aug': [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      'sus4':[1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
      'sus2':[1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]
    };
    
    this.hopSize = 2048;
    this.fftSize = 8192;
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  async detect(audioBuffer, options = {}) {
    const startTime = performance.now();
    const channelData = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    
    // Initialize debug data
    const debugData = {
      bassResults: [],
      refinerResults: []
    };
    
    // Step 1: Compute chromagram
    const chromaFrames = this.computeChromagram(channelData, sr);
    
    // Step 2: Detect chords from chroma
    let chords = this.detectChordsFromChroma(chromaFrames, sr);
    
    // Step 3: Run BassEngine if available
    if (options.useBassEngine && typeof BassEngine !== 'undefined') {
      try {
        const bassEngine = new BassEngine({ sampleRate: sr });
        const bassResults = bassEngine.analyze(audioBuffer);
        debugData.bassResults = bassResults;
        
        // Apply bass notes to chords
        chords = this.applyBassToChords(chords, bassResults, options.bassMultiplier || 1.0);
        console.log(`🎸 BassEngine: analyzed ${bassResults.length} segments`);
      } catch (e) {
        console.warn('BassEngine error:', e);
      }
    }
    
    // Step 4: Run MajorMinorRefiner if available
    if (options.useMajorMinorRefiner && typeof MajorMinorRefiner !== 'undefined') {
      try {
        const refiner = new MajorMinorRefiner({
          minConfidenceToOverride: options.minConfidenceToOverride || 0.40,
          decisionThreshold: options.decisionThreshold || 0.15
        });
        const refinerResults = refiner.refine(chords, audioBuffer);
        debugData.refinerResults = refinerResults;
        
        const corrections = refinerResults.filter(r => r.shouldOverride).length;
        console.log(`🎵 MajorMinorRefiner: ${corrections} corrections`);
      } catch (e) {
        console.warn('MajorMinorRefiner error:', e);
      }
    }
    
    // Step 5: Detect key
    const key = this.detectKey(chromaFrames);
    
    // Step 6: Calculate stats
    const stats = this.calculateStats(chords, key);
    
    const elapsed = performance.now() - startTime;
    console.log(`✅ ChordEngine v14.36: ${chords.length} chords in ${elapsed.toFixed(0)}ms`);
    
    return {
      chords,
      key,
      stats,
      profile: options.profile || 'auto',
      _debug: debugData
    };
  }

  computeChromagram(samples, sr) {
    const frames = [];
    const hopSamples = this.hopSize;
    const numFrames = Math.floor((samples.length - this.fftSize) / hopSamples);
    
    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSamples;
      const frame = samples.slice(start, start + this.fftSize);
      const chroma = this.frameToChroma(frame, sr);
      frames.push({
        time: start / sr,
        chroma: chroma
      });
    }
    
    return frames;
  }

  frameToChroma(frame, sr) {
    // Apply Hanning window
    const windowed = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      windowed[i] = frame[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / frame.length));
    }
    
    // Simple DFT for specific frequencies (optimized for chroma)
    const chroma = new Float32Array(12).fill(0);
    
    for (let pc = 0; pc < 12; pc++) {
      // Check octaves 2-6
      for (let octave = 2; octave <= 6; octave++) {
        const midi = octave * 12 + pc;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const binFloat = freq * frame.length / sr;
        const bin = Math.round(binFloat);
        
        if (bin > 0 && bin < frame.length / 2) {
          // Goertzel-like calculation
          let real = 0, imag = 0;
          const k = 2 * Math.PI * bin / frame.length;
          for (let n = 0; n < frame.length; n++) {
            real += windowed[n] * Math.cos(k * n);
            imag += windowed[n] * Math.sin(k * n);
          }
          const mag = Math.sqrt(real * real + imag * imag);
          chroma[pc] += mag;
        }
      }
    }
    
    // Normalize
    const max = Math.max(...chroma);
    if (max > 0) {
      for (let i = 0; i < 12; i++) chroma[i] /= max;
    }
    
    return chroma;
  }

  detectChordsFromChroma(frames, sr) {
    const chords = [];
    let lastChord = null;
    let lastTime = 0;
    const minDuration = 0.3; // minimum chord duration
    
    for (const frame of frames) {
      const best = this.matchChordTemplate(frame.chroma);
      
      if (!lastChord || best.label !== lastChord.label) {
        if (lastChord && (frame.time - lastTime) >= minDuration) {
          chords.push({
            t: lastTime,
            label: lastChord.label,
            confidence: lastChord.confidence,
            chroma: lastChord.chroma,
            _chroma: lastChord.chroma
          });
        }
        lastChord = { ...best, chroma: frame.chroma };
        lastTime = frame.time;
      }
    }
    
    // Add last chord
    if (lastChord) {
      chords.push({
        t: lastTime,
        label: lastChord.label,
        confidence: lastChord.confidence,
        chroma: lastChord.chroma,
        _chroma: lastChord.chroma
      });
    }
    
    return chords;
  }

  matchChordTemplate(chroma) {
    let bestScore = -Infinity;
    let bestRoot = 0;
    let bestType = 'maj';
    
    for (let root = 0; root < 12; root++) {
      for (const [type, template] of Object.entries(this.CHORD_TEMPLATES)) {
        let score = 0;
        for (let i = 0; i < 12; i++) {
          const chromaIdx = (root + i) % 12;
          score += chroma[chromaIdx] * template[i];
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestRoot = root;
          bestType = type;
        }
      }
    }
    
    const label = this.NOTES_SHARP[bestRoot] + (bestType === 'maj' ? '' : bestType);
    return {
      label,
      root: bestRoot,
      type: bestType,
      confidence: bestScore
    };
  }

  applyBassToChords(chords, bassResults, multiplier = 1.0) {
    for (const chord of chords) {
      const bassAtTime = this.findBassAtTime(bassResults, chord.t);
      if (bassAtTime && bassAtTime.bassNote && bassAtTime.confidence > 0.4) {
        chord.bassNote = bassAtTime.bassNote;
        chord.bassPc = bassAtTime.bassPc;
        chord.bassConfidence = bassAtTime.confidence;
        
        // Add slash notation if bass differs from root
        const rootMatch = chord.label.match(/^([A-G][#b]?)/);
        if (rootMatch) {
          const chordRoot = rootMatch[1];
          if (bassAtTime.bassNote !== chordRoot && bassAtTime.bassNote !== chordRoot.replace('#', 'b')) {
            // Only add if not already a slash chord
            if (!chord.label.includes('/')) {
              chord.label = chord.label + '/' + bassAtTime.bassNote;
            }
          }
        }
      }
    }
    return chords;
  }

  findBassAtTime(bassResults, time) {
    if (!bassResults || bassResults.length === 0) return null;
    
    let closest = bassResults[0];
    let minDiff = Math.abs(bassResults[0].t - time);
    
    for (const r of bassResults) {
      const diff = Math.abs(r.t - time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }
    
    return minDiff < 0.5 ? closest : null;
  }

  detectKey(frames) {
    // Aggregate all chroma
    const totalChroma = new Float32Array(12).fill(0);
    for (const frame of frames) {
      for (let i = 0; i < 12; i++) {
        totalChroma[i] += frame.chroma[i];
      }
    }
    
    // Key profiles (Krumhansl-Schmuckler)
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    let bestKey = { root: 0, minor: false, confidence: 0 };
    
    for (let root = 0; root < 12; root++) {
      // Rotate chroma to this root
      const rotated = [];
      for (let i = 0; i < 12; i++) {
        rotated.push(totalChroma[(root + i) % 12]);
      }
      
      // Correlate with major
      const majorCorr = this.correlate(rotated, majorProfile);
      if (majorCorr > bestKey.confidence) {
        bestKey = { root, minor: false, confidence: majorCorr };
      }
      
      // Correlate with minor
      const minorCorr = this.correlate(rotated, minorProfile);
      if (minorCorr > bestKey.confidence) {
        bestKey = { root, minor: true, confidence: minorCorr };
      }
    }
    
    return bestKey;
  }

  correlate(a, b) {
    let sum = 0;
    let sumA = 0, sumB = 0;
    let sumA2 = 0, sumB2 = 0;
    const n = a.length;
    
    for (let i = 0; i < n; i++) {
      sumA += a[i];
      sumB += b[i];
    }
    const meanA = sumA / n;
    const meanB = sumB / n;
    
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      sum += da * db;
      sumA2 += da * da;
      sumB2 += db * db;
    }
    
    return sum / Math.sqrt(sumA2 * sumB2 + 1e-10);
  }

  calculateStats(chords, key) {
    const stats = {
      totalChords: chords.length,
      inScale: 0,
      borrowed: 0,
      inversions: 0,
      extensions: 0
    };
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(interval => this.toPc(key.root + interval));
    
    for (const chord of chords) {
      if (!chord.label) continue;
      
      const match = chord.label.match(/^([A-G][#b]?)/);
      if (match) {
        const rootPc = this.NOTES_SHARP.indexOf(match[1].replace('b', '#'));
        if (diatonicPcs.includes(rootPc)) {
          stats.inScale++;
        } else {
          stats.borrowed++;
        }
      }
      
      if (chord.label.includes('/')) stats.inversions++;
      if (/[79]|maj7|m7/.test(chord.label)) stats.extensions++;
    }
    
    return stats;
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic.replace('b', '#'));
    if (tonicPc < 0) return [];
    
    const patterns = mode === 'minor' 
      ? ['m', 'dim', '', 'm', 'm', '', '']
      : ['', 'm', 'm', '', '', 'm', 'dim'];
    
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    
    return scale.map((interval, i) => {
      const notePc = this.toPc(tonicPc + interval);
      return this.NOTES_SHARP[notePc] + patterns[i];
    });
  }

  buildCircleOfFifths(key) {
    const chords = [];
    const tonic = this.NOTES_SHARP[this.toPc(key.root)];
    const mode = key.minor ? 'minor' : 'major';
    const diatonic = this.getDiatonicChords(tonic, mode);
    
    const functions = mode === 'minor' 
      ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
      : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    
    diatonic.forEach((label, i) => {
      chords.push({ label, function: functions[i] });
    });
    
    return chords;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
} else {
  window.ChordEngineEnhanced = ChordEngineEnhanced;
}

console.log('✅ ChordEngine v14.36 INTEGRATED loaded');
