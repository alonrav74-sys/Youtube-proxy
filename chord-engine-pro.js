/**
 * ChordEngine Pro - FIXED Edition
 * Version: 2.3.0
 * 
 * Conservative chord detection - no fast chromatic inventions!
 */

class ChordEnginePro extends ChordEngine {
  constructor() {
    super();
    this.version = 'v2.3.0 - FIXED';
    
    // Add constants if parent doesn't have them
    if (!this.NOTES_SHARP) {
      this.NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    }
    if (!this.NOTES_FLAT) {
      this.NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    }
    if (!this.MAJOR_SCALE) {
      this.MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
    }
    if (!this.MINOR_SCALE) {
      this.MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
    }
    
    console.log(`✅ ChordEngine Pro FIXED (${this.version}) loaded!`);
  }

  /**
   * Main detection - uses parent's detect then filters
   */
  async detect(audioBuffer, options = {}) {
    console.log('🎸 ChordEnginePro.detect() called');
    
    // Call parent's detect method
    const baseResult = await super.detect(audioBuffer, options);
    console.log(`📊 Base detection: ${baseResult.chords.length} chords`);
    
    // Enhanced key detection using the actual EnhancedKeyDetection API
    if (typeof EnhancedKeyDetection !== 'undefined' && typeof EnhancedKeyDetection.detectKey === 'function') {
      try {
        const enhancedResult = EnhancedKeyDetection.detectKey(baseResult.chords, baseResult.key);
        if (enhancedResult && enhancedResult.key) {
          console.log(`🎼 Enhanced key: ${this.nameSharp(enhancedResult.key.root)}${enhancedResult.key.minor ? 'm' : ''} (confidence: ${enhancedResult.confidence}%)`);
          baseResult.key = enhancedResult.key;
          baseResult.mode = enhancedResult.key.minor ? 'Natural Minor' : 'Major';
        }
      } catch (e) {
        console.warn('⚠️ Enhanced key detection failed:', e.message);
      }
    }
    
    // Filter fast chromatic chords
    const filtered = this.filterFastChromaticChords(baseResult.chords, baseResult.key);
    console.log(`🔍 After filter: ${filtered.length} chords`);
    
    // Add harmonic context
    this.addHarmonicContext(filtered, baseResult.key);
    
    return {
      chords: filtered,
      key: baseResult.key,
      mode: baseResult.mode,
      bpm: baseResult.bpm,
      stats: {
        totalChords: filtered.length,
        diatonicChords: filtered.filter(ch => this.isDiatonic(ch.label, baseResult.key)).length,
        chromaticChords: filtered.filter(ch => !this.isDiatonic(ch.label, baseResult.key)).length
      }
    };
  }

  /**
   * Filter fast chromatic chords
   */
  filterFastChromaticChords(chords, key) {
    if (!chords || chords.length === 0) return chords;
    
    const filtered = [];
    const MIN_CHROMATIC_DURATION = 0.5;
    const MIN_CHROMATIC_CONFIDENCE = 70;
    
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const prevChord = filtered[filtered.length - 1];
      
      const duration = nextChord ? (nextChord.t - chord.t) : 1.0;
      const isChromatic = !this.isDiatonic(chord.label, key);
      
      if (isChromatic) {
        // Rule 1: Too short
        if (duration < MIN_CHROMATIC_DURATION) {
          console.log(`❌ Removed fast chromatic: ${chord.label} (${duration.toFixed(2)}s)`);
          continue;
        }
        
        // Rule 2: Low confidence
        if (chord.confidence < MIN_CHROMATIC_CONFIDENCE) {
          console.log(`❌ Removed uncertain: ${chord.label} (conf: ${chord.confidence})`);
          continue;
        }
        
        // Rule 3: Between same chords
        if (prevChord && nextChord) {
          const prevRoot = this.getRoot(prevChord.label);
          const nextRoot = this.getRoot(nextChord.label);
          if (prevRoot === nextRoot && this.isDiatonic(prevChord.label, key)) {
            console.log(`❌ Removed passing: ${chord.label}`);
            continue;
          }
        }
        
        console.log(`✅ Kept chromatic: ${chord.label} (${duration.toFixed(2)}s)`);
      }
      
      filtered.push(chord);
    }
    
    return filtered;
  }

  /**
   * Check if diatonic
   */
  isDiatonic(label, key) {
    const root = this.getRoot(label);
    if (root === null) return false;
    
    const scale = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const relativePitch = this.toPc(root - key.root);
    
    return scale.includes(relativePitch);
  }

  /**
   * Get root note
   */
  getRoot(label) {
    if (!label) return null;
    const match = label.match(/^([A-G](?:#|b)?)/);
    if (!match) return null;
    const note = match[1].replace('b', '#');
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return notes.indexOf(note);
  }

  /**
   * Add harmonic context
   */
  addHarmonicContext(chords, key) {
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      chord.isDiatonic = this.isDiatonic(chord.label, key);
      chord.ornamentType = chord.isDiatonic ? 'structural' : 'ornament';
    }
  }

  /**
   * Pitch class modulo
   */
  toPc(pitch) {
    return ((pitch % 12) + 12) % 12;
  }

  /**
   * Name with sharps
   */
  nameSharp(pc) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return notes[this.toPc(pc)];
  }

  /**
   * Name with flats
   */
  nameFlat(pc) {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return notes[this.toPc(pc)];
  }

  /**
   * Mix stereo to mono
   */
  mixStereo(audioBuffer) {
    const L = audioBuffer.getChannelData(0);
    const R = audioBuffer.getChannelData(1);
    const mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) {
      mono[i] = (L[i] + R[i]) * 0.5;
    }
    return mono;
  }

  /**
   * Resample audio linearly
   */
  resampleLinear(input, srIn, srOut) {
    const ratio = srIn / srOut;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * ratio;
      const srcIndex = Math.floor(srcPos);
      const frac = srcPos - srcIndex;
      
      if (srcIndex + 1 < input.length) {
        output[i] = input[srcIndex] * (1 - frac) + input[srcIndex + 1] * frac;
      } else {
        output[i] = input[srcIndex];
      }
    }
    
    return output;
  }

  /**
   * Estimate tempo from audio
   */
  estimateTempo(x, sr) {
    const hopSize = 512;
    const frameSize = 2048;
    const numFrames = Math.floor((x.length - frameSize) / hopSize);
    
    const energy = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      let sum = 0;
      for (let j = 0; j < frameSize; j++) {
        sum += x[start + j] * x[start + j];
      }
      energy[i] = Math.sqrt(sum / frameSize);
    }
    
    const peaks = [];
    for (let i = 1; i < energy.length - 1; i++) {
      if (energy[i] > energy[i - 1] && energy[i] > energy[i + 1] && energy[i] > 0.1) {
        peaks.push(i);
      }
    }
    
    if (peaks.length < 2) return 120;
    
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = (60 * sr) / (avgInterval * hopSize);
    
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  /**
   * Get diatonic chords for a key
   */
  getDiatonicChords(tonic, mode) {
    const root = this.NOTES_SHARP.indexOf(tonic.replace('b', '#'));
    if (root === -1) return [];
    
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' 
      ? ['m', 'dim', '', 'm', 'm', '', '']  // i, ii°, III, iv, v, VI, VII
      : ['', 'm', 'm', '', '', 'm', 'dim']; // I, ii, iii, IV, V, vi, vii°
    
    const chords = [];
    for (let i = 0; i < scale.length; i++) {
      const chordRoot = this.toPc(root + scale[i]);
      const chordName = this.nameSharp(chordRoot) + qualities[i];
      chords.push(chordName);
    }
    
    return chords;
  }

  /**
   * Build circle of fifths chords
   */
  buildCircleOfFifths(key) {
    const diatonic = this.getDiatonicChords(this.nameSharp(key.root), key.minor ? 'minor' : 'major');
    const funcNames = key.minor 
      ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
      : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    
    return diatonic.map((label, i) => ({
      label: label,
      function: funcNames[i]
    }));
  }
}

console.log('✅ ChordEngine Pro FIXED loaded!');
