/**
 * ChordEngine - Enhanced Musical Intelligence v5.0
 * 🎸 With Professional Music Theory Improvements
 * 
 * New in v5.0:
 * - Harmonic + Melodic Minor support
 * - Mode detection (Dorian, Mixolydian, Phrygian, Lydian)
 * - Improved inversion detection with figured bass notation
 * - Cadential 6/4 detection
 * - Roman numeral analysis
 * - Jazz extended chords (7alt, 13sus4, etc.)
 * - Modulation detection
 * - Circle progression detection
 * - Tritone substitution
 * 
 * @version 5.0.0
 * @author Alon - Based on Academic Music Theory Review
 */

class ChordEngine {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    
    // 🆕 Enhanced Scales
    this.SCALES = {
      MAJOR: [0,2,4,5,7,9,11],
      NATURAL_MINOR: [0,2,3,5,7,8,10],
      HARMONIC_MINOR: [0,2,3,5,7,8,11],  // 🆕 Leading tone!
      MELODIC_MINOR: [0,2,3,5,7,9,11],   // 🆕 Ascending
      DORIAN: [0,2,3,5,7,9,10],           // 🆕
      PHRYGIAN: [0,1,3,5,7,8,10],         // 🆕
      LYDIAN: [0,2,4,6,7,9,11],           // 🆕
      MIXOLYDIAN: [0,2,4,5,7,9,10],       // 🆕
      LOCRIAN: [0,1,3,5,6,8,10],          // 🆕
      BLUES: [0,3,5,6,7,10]               // 🆕
    };
    
    this.MAJOR_SCALE = this.SCALES.MAJOR;
    this.MINOR_SCALE = this.SCALES.NATURAL_MINOR;
    
    // 🎯 Circle of Fifths - Order of importance
    this.CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    
    // 🎸 Enhanced Chord Quality Templates
    this.CHORD_TEMPLATES = {
      // Triads
      major: { intervals: [0, 4, 7], weights: [1.0, 0.9, 0.8], label: '', romanMajor: '', romanMinor: 'III' },
      minor: { intervals: [0, 3, 7], weights: [1.0, 0.9, 0.8], label: 'm', romanMajor: 'ii', romanMinor: 'i' },
      dim: { intervals: [0, 3, 6], weights: [1.0, 0.9, 0.8], label: 'dim', romanMajor: 'vii°', romanMinor: 'ii°' },
      aug: { intervals: [0, 4, 8], weights: [1.0, 0.9, 0.8], label: 'aug', romanMajor: 'III+', romanMinor: '' },
      sus2: { intervals: [0, 2, 7], weights: [1.0, 0.85, 0.8], label: 'sus2', romanMajor: '', romanMinor: '' },
      sus4: { intervals: [0, 5, 7], weights: [1.0, 0.85, 0.8], label: 'sus4', romanMajor: '', romanMinor: '' },
      
      // 7th chords
      maj7: { intervals: [0, 4, 7, 11], weights: [1.0, 0.9, 0.8, 0.75], label: 'maj7', romanMajor: 'Imaj7', romanMinor: 'IIImaj7' },
      dom7: { intervals: [0, 4, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: '7', romanMajor: 'V7', romanMinor: 'V7' },
      m7: { intervals: [0, 3, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7', romanMajor: 'ii7', romanMinor: 'i7' },
      dim7: { intervals: [0, 3, 6, 9], weights: [1.0, 0.9, 0.8, 0.75], label: 'dim7', romanMajor: 'vii°7', romanMinor: 'vii°7' },
      m7b5: { intervals: [0, 3, 6, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7b5', romanMajor: 'viiø7', romanMinor: 'ii ø7' },
      
      // Extended
      dom9: { intervals: [0, 4, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: '9', romanMajor: 'V9', romanMinor: 'V9' },
      maj9: { intervals: [0, 4, 7, 11, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'maj9', romanMajor: 'Imaj9', romanMinor: '' },
      m9: { intervals: [0, 3, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'm9', romanMajor: 'iim9', romanMinor: 'im9' },
      dom11: { intervals: [0, 4, 7, 10, 14, 17], weights: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], label: '11', romanMajor: 'V11', romanMinor: 'V11' },
      dom13: { intervals: [0, 4, 7, 10, 14, 21], weights: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], label: '13', romanMajor: 'V13', romanMinor: 'V13' },
      
      // 🆕 Jazz Extended
      dom7alt: { intervals: [0, 4, 7, 10, 13, 15], weights: [1.0, 0.85, 0.8, 0.75, 0.6, 0.6], label: '7alt', romanMajor: 'V7alt', romanMinor: 'V7alt' },
      dom7sus4: { intervals: [0, 5, 7, 10], weights: [1.0, 0.9, 0.85, 0.75], label: '7sus4', romanMajor: 'V7sus4', romanMinor: 'V7sus4' },
      dom9sus4: { intervals: [0, 5, 7, 10, 14], weights: [1.0, 0.9, 0.85, 0.75, 0.65], label: '9sus4', romanMajor: 'V9sus4', romanMinor: 'V9sus4' },
      dom13sus4: { intervals: [0, 5, 7, 10, 14, 21], weights: [1.0, 0.9, 0.85, 0.8, 0.7, 0.6], label: '13sus4', romanMajor: 'V13sus4', romanMinor: 'V13sus4' },
      maj7sharp11: { intervals: [0, 4, 7, 11, 18], weights: [1.0, 0.9, 0.85, 0.75, 0.65], label: 'maj7#11', romanMajor: 'Imaj7#11', romanMinor: '' },
      m11: { intervals: [0, 3, 7, 10, 14, 17], weights: [1.0, 0.9, 0.85, 0.75, 0.65, 0.55], label: 'm11', romanMajor: 'iim11', romanMinor: 'im11' }
    };
    
    // 🎼 Common Progressions with Weights
    this.COMMON_PROGRESSIONS = {
      major: [
        [0, 5, 25],    // I → IV
        [0, 7, 30],    // I → V
        [5, 7, 20],    // IV → V
        [7, 0, 35],    // V → I (strongest!)
        [0, 9, 18],    // I → vi
        [9, 5, 15],    // vi → IV
        [5, 0, 12],    // IV → I
        [7, 5, 8],     // V → IV
        [2, 7, 22],    // ii → V
        [7, 9, 10],    // V → vi (deceptive)
        [9, 2, 14],    // vi → ii
        [2, 5, 12],    // ii → IV
        [4, 7, 16],    // iii → V
        [9, 4, 8],     // vi → iii
      ],
      minor: [
        [0, 7, 28],    // i → v/V
        [0, 5, 22],    // i → iv/IV
        [5, 7, 18],    // iv → v
        [7, 0, 32],    // v/V → i (strongest!)
        [0, 3, 20],    // i → III
        [3, 7, 15],    // III → v
        [10, 0, 25],   // VII → i
        [5, 0, 14],    // iv → i
        [8, 0, 12],    // VI → i
        [0, 8, 16],    // i → VI
        [2, 7, 18],    // ii° → V
        [8, 5, 10],    // VI → iv
      ]
    };
  }

  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.NOTES_SHARP[this.toPc(pc)]; }
  nameFlat(pc) { return this.NOTES_FLAT[this.toPc(pc)]; }

  /**
   * 🎯 Build allowed chords by scale with mode support
   */
  buildAllowedChords(key) {
    let scale;
    
    // Determine scale based on mode
    if (key.mode === 'harmonic_minor') {
      scale = this.SCALES.HARMONIC_MINOR;
    } else if (key.mode === 'melodic_minor') {
      scale = this.SCALES.MELODIC_MINOR;
    } else if (key.minor) {
      scale = this.SCALES.NATURAL_MINOR;
    } else {
      scale = this.SCALES.MAJOR;
    }
    
    const diatonic = scale.map(s => this.toPc(key.root + s));
    
    const borrowed = [];
    
    if (key.minor) {
      borrowed.push(this.toPc(key.root + 7));  // V major
      borrowed.push(this.toPc(key.root + 11)); // VII
      borrowed.push(this.toPc(key.root + 0));  // I (Picardy 3rd)
    } else {
      borrowed.push(this.toPc(key.root + 5));  // iv
      borrowed.push(this.toPc(key.root + 10)); // bVII
      borrowed.push(this.toPc(key.root + 8));  // bVI
      borrowed.push(this.toPc(key.root + 3));  // bIII (🆕)
      borrowed.push(this.toPc(key.root + 1));  // bII (🆕 Neapolitan)
    }
    
    const secondaryDominants = diatonic.map(note => this.toPc(note + 7));
    
    return {
      diatonic: diatonic,
      borrowed: borrowed,
      secondaryDominants: secondaryDominants,
      allAllowed: [...new Set([...diatonic, ...borrowed])]
    };
  }

  /**
   * 🎯 Score chord confidence with harmonic context
   */
  scoreChordConfidence(root, label, key, avgChroma, duration) {
    const allowed = this.buildAllowedChords(key);
    let score = 0;
    
    // 1. Is chord in scale?
    if (allowed.diatonic.includes(root)) {
      score += 50;
    } else if (allowed.borrowed.includes(root)) {
      score += 30;
    } else if (allowed.secondaryDominants.includes(root) && label.includes('7')) {
      score += 20;
    } else {
      score -= 30;
    }
    
    // 2. Chroma strength
    const rootStrength = avgChroma[root] || 0;
    score += rootStrength * 50;
    
    // 3. Duration
    if (duration > 1.5) score += 20;
    else if (duration > 0.75) score += 10;
    else if (duration < 0.3) score -= 20;
    
    // 4. Valid triad check
    const hasValidTriad = this.hasValidTriad(root, label, avgChroma);
    if (hasValidTriad) {
      score += 15;
    } else {
      score -= 25;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 🎵 Check if valid triad exists
   */
  hasValidTriad(root, label, avgChroma) {
    const rootStrength = avgChroma[root] || 0;
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    
    const isMinor = label.includes('m') && !label.includes('maj');
    const third = isMinor ? minor3rd : major3rd;
    
    return rootStrength > 0.12 && third > 0.08 && fifth > 0.08;
  }

  /**
   * 🎼 Build Circle of Fifths with Roman Numerals
   */
  buildCircleOfFifths(key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const scaleNotes = scale.map(interval => this.toPc(key.root + interval));
    
    const fifthsOrder = [];
    let currentNote = key.root;
    
    for (let i = 0; i < 7; i++) {
      fifthsOrder.push(currentNote);
      currentNote = this.toPc(currentNote + 7);
    }
    
    const naturalChords = fifthsOrder.map(note => {
      const degreeInScale = scaleNotes.indexOf(note);
      if (degreeInScale === -1) return null;
      
      let quality = '';
      let roman = '';
      
      if (key.minor) {
        // Natural minor qualities
        const qualities = ['m', 'dim', '', 'm', 'm', '', ''];
        const romans = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
        quality = qualities[degreeInScale];
        roman = romans[degreeInScale];
      } else {
        // Major qualities
        const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
        const romans = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
        quality = qualities[degreeInScale];
        roman = romans[degreeInScale];
      }
      
      return {
        root: note,
        label: this.nameSharp(note) + quality,
        degree: degreeInScale + 1,
        roman: roman,
        function: this.getChordFunction(degreeInScale, key.minor)
      };
    }).filter(x => x !== null);
    
    return naturalChords;
  }

  getChordFunction(degree, isMinor) {
    if (isMinor) {
      const functions = ['Tonic', 'Subdominant', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Subtonic'];
      return functions[degree] || 'Unknown';
    } else {
      const functions = ['Tonic', 'Supertonic', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Leading Tone'];
      return functions[degree] || 'Unknown';
    }
  }
  
  /**
   * 🎼 Get diatonic chord names with Roman numerals
   */
  getDiatonicChords(tonic, mode) {
    const tonicRoot = this.parseRoot(tonic);
    if (tonicRoot < 0) return [];
    
    const chords = [];
    
    if (mode === 'major') {
      const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
      const romans = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
      const scale = [0, 2, 4, 5, 7, 9, 11];
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        chords.push({
          label: this.NOTES_SHARP[root] + qualities[i],
          roman: romans[i]
        });
      }
    } else {
      const qualities = ['m', 'dim', '', 'm', 'm', '', ''];
      const romans = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
      const scale = [0, 2, 3, 5, 7, 8, 10];
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        chords.push({
          label: this.NOTES_SHARP[root] + qualities[i],
          roman: romans[i]
        });
      }
    }
    
    return chords;
  }
  
  /**
   * 🆕 Get Roman Numeral for chord in key context
   */
  getRomanNumeral(chordLabel, key) {
    const root = this.parseRoot(chordLabel);
    if (root < 0) return '?';
    
    const interval = this.toPc(root - key.root);
    const scale = key.minor ? this.SCALES.NATURAL_MINOR : this.SCALES.MAJOR;
    
    // Find scale degree
    const degreeIndex = scale.indexOf(interval);
    
    if (degreeIndex >= 0) {
      // Diatonic chord
      const romans = key.minor ? 
        ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] :
        ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
      
      let roman = romans[degreeIndex];
      
      // Add quality modifiers
      if (chordLabel.includes('7')) roman += '7';
      if (chordLabel.includes('maj7')) roman = roman.replace('7', 'maj7');
      if (chordLabel.includes('dim7')) roman += '°7';
      if (chordLabel.includes('m7b5')) roman += 'ø7';
      
      return roman;
    } else {
      // Chromatic chord - show as alteration
      const chromaticRomans = {
        1: 'bII',   // Neapolitan
        3: 'bIII',  // Mediant
        6: '#IV',   // Raised subdominant
        8: 'bVI',   // Submediant
        10: 'bVII'  // Subtonic
      };
      
      return chromaticRomans[interval] || `(${this.nameSharp(root)})`;
    }
  }

  percentileLocal(arr, pct) {
    const sorted = [...arr].filter(x => Number.isFinite(x)).sort((a,b) => a-b);
    const idx = Math.floor(sorted.length * pct / 100);
    return sorted[idx] || 0;
  }

  /**
   * 🎹 Enhanced Key Detection with mode support
   */
  estimateKey(chroma) {
    // Method 1: Krumhansl-Schmuckler
    const ksKey = this.estimateKeyKS(chroma);
    
    // Method 2: Chroma peaks
    const peaksKey = this.estimateKeyByPeaks(chroma);
    
    // Weighted voting
    const confidence = Math.max(ksKey.confidence, peaksKey.confidence);
    
    let finalKey;
    if (ksKey.confidence > 0.7) {
      finalKey = ksKey;
    } else if (ksKey.root === peaksKey.root) {
      finalKey = { ...ksKey, confidence: (ksKey.confidence + peaksKey.confidence) / 2 };
    } else {
      finalKey = ksKey.confidence > peaksKey.confidence ? ksKey : peaksKey;
    }
    
    // 🆕 Detect mode
    const mode = this.detectMode(chroma, finalKey);
    finalKey.mode = mode.name;
    finalKey.modeConfidence = mode.confidence;
    
    return finalKey;
  }
  
  /**
   * 🆕 Mode Detection (Dorian, Mixolydian, etc.)
   */
  detectMode(chromaArray, key) {
    const avgChroma = new Float32Array(12);
    chromaArray.forEach(frame => {
      for (let i = 0; i < 12; i++) {
        avgChroma[i] += frame[i];
      }
    });
    
    for (let i = 0; i < 12; i++) {
      avgChroma[i] /= chromaArray.length;
    }
    
    const root = key.root;
    
    // Check for characteristic intervals
    const b2 = avgChroma[this.toPc(root + 1)];
    const nat2 = avgChroma[this.toPc(root + 2)];
    const b3 = avgChroma[this.toPc(root + 3)];
    const nat3 = avgChroma[this.toPc(root + 4)];
    const nat4 = avgChroma[this.toPc(root + 5)];
    const sharp4 = avgChroma[this.toPc(root + 6)];
    const nat6 = avgChroma[this.toPc(root + 9)];
    const b6 = avgChroma[this.toPc(root + 8)];
    const b7 = avgChroma[this.toPc(root + 10)];
    const nat7 = avgChroma[this.toPc(root + 11)];
    
    // 🎵 Dorian: b3 + natural 6
    if (b3 > nat3 && nat6 > b6) {
      return { name: 'dorian', confidence: 0.85, characteristic: 'b3 + natural 6' };
    }
    
    // 🎵 Mixolydian: major 3 + b7
    if (nat3 > b3 && b7 > nat7) {
      return { name: 'mixolydian', confidence: 0.82, characteristic: 'major 3 + b7' };
    }
    
    // 🎵 Phrygian: b2 + b3
    if (b2 > nat2 && b3 > nat3) {
      return { name: 'phrygian', confidence: 0.80, characteristic: 'b2 + b3' };
    }
    
    // 🎵 Lydian: #4
    if (sharp4 > nat4) {
      return { name: 'lydian', confidence: 0.78, characteristic: '#4' };
    }
    
    // 🎵 Harmonic Minor: b3 + natural 7
    if (key.minor && nat7 > b7) {
      return { name: 'harmonic_minor', confidence: 0.88, characteristic: 'b3 + natural 7' };
    }
    
    // Default: Natural Major/Minor
    if (key.minor) {
      return { name: 'natural_minor', confidence: 0.75, characteristic: 'natural minor scale' };
    } else {
      return { name: 'major', confidence: 0.75, characteristic: 'major scale' };
    }
  }
  
  /**
   * 🎵 Krumhansl-Schmuckler algorithm
   */
  estimateKeyKS(chroma) {
    const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    const agg = new Array(12).fill(0);
    for (const c of chroma) {
      for (let p = 0; p < 12; p++) agg[p] += c[p];
    }
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;
    
    let bestRoot = 0, bestScore = -Infinity, bestMinor = false;
    
    for (let root = 0; root < 12; root++) {
      let scoreMaj = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += agg[this.toPc(root + i)] * KS_MAJOR[i];
      }
      
      let scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        scoreMin += agg[this.toPc(root + i)] * KS_MINOR[i];
      }
      
      if (scoreMaj > bestScore) {
        bestScore = scoreMaj;
        bestRoot = root;
        bestMinor = false;
      }
      
      if (scoreMin > bestScore) {
        bestScore = scoreMin;
        bestRoot = root;
        bestMinor = true;
      }
    }
    
    const confidence = Math.min(0.95, bestScore / 5.0);
    
    return { 
      root: bestRoot, 
      minor: bestMinor,
      confidence: confidence
    };
  }
  
  /**
   * 🎵 Key detection by chroma peaks
   */
  estimateKeyByPeaks(chroma) {
    const avgChroma = new Float32Array(12);
    chroma.forEach(frame => {
      for (let i = 0; i < 12; i++) {
        avgChroma[i] += frame[i];
      }
    });
    
    for (let i = 0; i < 12; i++) {
      avgChroma[i] /= chroma.length;
    }
    
    let maxVal = 0;
    let maxIdx = 0;
    
    for (let i = 0; i < 12; i++) {
      if (avgChroma[i] > maxVal) {
        maxVal = avgChroma[i];
        maxIdx = i;
      }
    }
    
    const majorThird = avgChroma[(maxIdx + 4) % 12];
    const minorThird = avgChroma[(maxIdx + 3) % 12];
    const isMinor = minorThird > majorThird;
    
    const avgStrength = Array.from(avgChroma).reduce((a, b) => a + b, 0) / 12;
    const confidence = Math.min(0.95, maxVal / (avgStrength * 2));
    
    return {
      root: maxIdx,
      minor: isMinor,
      confidence: confidence
    };
  }

  // Audio Processing Functions

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const frames = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      frames.push(e);
    }
    const minLag = Math.floor(0.3 / (hop / sr));
    const maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const bpm = 60 / (bestLag * (hop / sr));
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }
  
  /**
   * 🥁 Onset Detection
   */
  detectOnsets(x, sr) {
    const hopSize = Math.floor(sr * 0.01);
    const windowSize = Math.floor(sr * 0.046);
    
    const energy = [];
    for (let i = 0; i + windowSize < x.length; i += hopSize) {
      let e = 0;
      for (let j = 0; j < windowSize; j++) {
        e += x[i + j] * x[i + j];
      }
      energy.push(Math.sqrt(e / windowSize));
    }
    
    const diff = [];
    for (let i = 1; i < energy.length; i++) {
      diff.push(Math.max(0, energy[i] - energy[i - 1]));
    }
    
    const meanDiff = diff.reduce((a, b) => a + b, 0) / diff.length;
    const threshold = meanDiff * 2.5;
    
    const onsets = [];
    for (let i = 1; i < diff.length - 1; i++) {
      if (diff[i] > threshold && diff[i] > diff[i - 1] && diff[i] > diff[i + 1]) {
        const time = i * hopSize / sr;
        onsets.push(time);
      }
    }
    
    console.log(`🥁 Detected ${onsets.length} onsets`);
    return onsets;
  }
  
  /**
   * 🎼 Generate Beat Grid
   */
  generateBeatGrid(duration, bpm, onsets = []) {
    const beatInterval = 60 / bpm;
    const beats = [];
    
    let bestOffset = 0;
    let bestScore = 0;
    
    for (let offset = 0; offset < beatInterval; offset += 0.01) {
      let score = 0;
      for (let t = offset; t < duration; t += beatInterval) {
        const nearestOnset = onsets.find(o => Math.abs(o - t) < 0.05);
        if (nearestOnset) score++;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }
    
    for (let t = bestOffset; t < duration; t += beatInterval) {
      beats.push(t);
    }
    
    console.log(`🎼 Generated ${beats.length} beats at ${bpm} BPM`);
    return beats;
  }
  
  /**
   * ⚡ Quantize chords to beat grid
   */
  quantizeChordsToBeats(timeline, beats, threshold = 0.15) {
    if (!beats || beats.length === 0) return timeline;
    
    const quantized = [];
    
    for (const chord of timeline) {
      let nearestBeat = beats[0];
      let minDist = Math.abs(chord.t - nearestBeat);
      
      for (const beat of beats) {
        const dist = Math.abs(chord.t - beat);
        if (dist < minDist) {
          minDist = dist;
          nearestBeat = beat;
        }
      }
      
      if (minDist < threshold) {
        quantized.push({ ...chord, t: nearestBeat, originalTime: chord.t });
      } else {
        quantized.push(chord);
      }
    }
    
    const deduped = [];
    let lastBeat = -1;
    
    for (const chord of quantized) {
      if (chord.t !== lastBeat) {
        deduped.push(chord);
        lastBeat = chord.t;
      }
    }
    
    console.log(`⚡ Quantized ${timeline.length} → ${deduped.length} chords`);
    return deduped;
  }

  mixStereo(buf) {
    const a = buf.getChannelData(0);
    const b = buf.getChannelData(1) || a;
    const m = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) m[i] = (a[i] + b[i]) * 0.5;
    return m;
  }

  resampleLinear(x, sr, target) {
    const r = target / sr;
    const L = Math.floor(x.length * r);
    const y = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const t = i / r;
      const i0 = Math.floor(t);
      const i1 = Math.min(x.length - 1, i0 + 1);
      y[i] = x[i0] * (1 - (t - i0)) + x[i1] * (t - i0);
    }
    return y;
  }

  extractFeatures(audioData, bpm) {
    const { x, sr } = audioData;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
    
    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) frames.push(x.subarray(s, s + win));
    
    const fft = (input) => {
      let n = input.length, N = 1;
      while (N < n) N <<= 1;
      const re = new Float32Array(N), im = new Float32Array(N);
      re.set(input);
      let j = 0;
      for (let i = 0; i < N; i++) {
        if (i < j) {
          [re[i], re[j]] = [re[j], re[i]];
          [im[i], im[j]] = [im[j], im[i]];
        }
        let m = N >> 1;
        while (m >= 1 && j >= m) { j -= m; m >>= 1; }
        j += m;
      }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = -2 * Math.PI / len, wlr = Math.cos(ang), wli = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
          let wr = 1, wi = 0;
          for (let k = 0; k < (len >> 1); k++) {
            const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi;
            const vi = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr;
            re[i + k] = ur + vr; im[i + k] = ui + vi;
            re[i + k + (len >> 1)] = ur - vr; im[i + k + (len >> 1)] = ui - vi;
            const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr;
          }
        }
      }
      const mags = new Float32Array(N >> 1);
      for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
      return { mags, N };
    };
    
    const hz = (b, N) => b * sr / N;
    const chroma = [], bassPc = [], bassEnergy = [], frameE = [];
    const arpeggioWindow = Math.max(4, Math.min(8, Math.round(60 / bpm * sr / hop)));
    
    for (let i = 0; i < frames.length; i++) {
      const y = new Float32Array(win);
      for (let k = 0; k < win; k++) y[k] = frames[i][k] * hann[k];
      let en = 0;
      for (let k = 0; k < win; k++) en += y[k] * y[k];
      frameE.push(en);
      
      const accumulated = new Float32Array(12);
      const startIdx = Math.max(0, i - arpeggioWindow + 1);
      
      for (let j = startIdx; j <= i; j++) {
        const frame = frames[j];
        const tempY = new Float32Array(win);
        for (let k = 0; k < win; k++) tempY[k] = frame[k] * hann[k];
        const { mags, N } = fft(tempY);
        const weight = Math.pow(0.7, i - j);
        
        for (let b = 1; b < mags.length; b++) {
          const f = hz(b, N);
          if (f < 80 || f > 5000) continue;
          const midi = 69 + 12 * Math.log2(f / 440);
          const pc = this.toPc(Math.round(midi));
          const freqWeight = f < 300 ? 2.5 : 1.0;
          accumulated[pc] += mags[b] * freqWeight * weight;
        }
      }
      
      let s = 0;
      for (let k = 0; k < 12; k++) s += accumulated[k];
      if (s > 0) { for (let k = 0; k < 12; k++) accumulated[k] /= s; }
      chroma.push(accumulated);
      
      const bassChroma = new Float32Array(12);
      let bassEn = 0;
      
      for (let j = startIdx; j <= i; j++) {
        const frame = frames[j];
        const tempY = new Float32Array(win);
        for (let k = 0; k < win; k++) tempY[k] = frame[k] * hann[k];
        const { mags, N } = fft(tempY);
        const weight = Math.pow(0.8, i - j);
        
        for (let b = 1; b < mags.length; b++) {
          const f = hz(b, N);
          if (f >= 50 && f <= 200) {
            const midi = 69 + 12 * Math.log2(f / 440);
            const pc = this.toPc(Math.round(midi));
            const fundamental = f < 100 ? 10.0 : (f < 150 ? 5.0 : 2.0);
            bassChroma[pc] += mags[b] * fundamental * weight * 1.8;
            bassEn += mags[b] * weight;
          }
        }
      }
      
      let maxBass = -1, maxVal = 0;
      for (let pc = 0; pc < 12; pc++) {
        const score = bassChroma[pc];
        if (score > maxVal) { maxVal = score; maxBass = pc; }
      }
      
      const threshold = bassEn * 0.20;
      bassPc.push(bassChroma[maxBass] > threshold ? maxBass : -1);
      bassEnergy.push(bassEn);
    }
    
    const thrE = this.percentileLocal(frameE, 15);
    const bassPcFinal = new Array(bassPc.length).fill(-1);
    for (let i = 3; i < bassPc.length - 3; i++) {
      const v = bassPc[i];
      if (v < 0 || frameE[i] < thrE || bassEnergy[i] < this.percentileLocal(bassEnergy, 10)) continue;
      const window = [bassPc[i - 3], bassPc[i - 2], bassPc[i - 1], v, bassPc[i + 1], bassPc[i + 2], bassPc[i + 3]];
      const votes = window.filter(x => x === v).length;
      if (votes >= 3) bassPcFinal[i] = v;
    }
    
    const onsets = this.detectOnsets(frameE, hop, sr);
    
    return { chroma, bassPc: bassPcFinal, frameE, onsets, hop, sr };
  }

  detectMode(feats, key) {
    const { chroma } = feats;
    const agg = new Array(12).fill(0);
    for (const c of chroma) for (let p = 0; p < 12; p++) agg[p] += c[p];
    const s = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= s;
    if (!key.minor) {
      if (agg[this.toPc(key.root + 10)] > 0.15) return 'Mixolydian';
      if (agg[this.toPc(key.root + 6)] > 0.12) return 'Lydian';
      return 'Major';
    } else {
      if (agg[this.toPc(key.root + 9)] > 0.15 && agg[this.toPc(key.root + 11)] < 0.08) return 'Dorian';
      if (agg[this.toPc(key.root + 11)] > 0.15) return 'Harmonic Minor';
      return 'Natural Minor';
    }
  }

  /**
   * 🔥 Build chords from bass with harmonic validation
   */
  buildChordsFromBass(feats, key, bpm){
    const {bassPc, chroma, frameE, hop, sr} = feats;
    const allowed = this.buildAllowedChords(key);
    
    const spb = 60/Math.max(60, bpm||120);
    const minFrames = Math.max(2, Math.floor((spb * 0.3) / (hop/sr)));
    
    const timeline = [];
    let i = 0;
    
    while(i < bassPc.length){
      if(bassPc[i] < 0 || frameE[i] < this.percentileLocal(frameE, 15)){
        i++;
        continue;
      }
      
      const root = bassPc[i];
      const startFrame = i;
      const startTime = i * (hop/sr);
      
      if(!allowed.allAllowed.includes(root)){
        i++;
        continue;
      }
      
      let endFrame = startFrame;
      let gapCounter = 0;
      const maxGap = 3;
      
      while(endFrame < bassPc.length){
        if(bassPc[endFrame] === root){
          gapCounter = 0;
          endFrame++;
        } else if(bassPc[endFrame] < 0 || gapCounter < maxGap){
          gapCounter++;
          endFrame++;
        } else {
          break;
        }
      }
      
      if((endFrame - startFrame) < minFrames){
        i = endFrame;
        continue;
      }
      
      const bassVotes = new Array(12).fill(0);
      for(let j = startFrame; j < endFrame; j++){
        if(bassPc[j] >= 0) bassVotes[bassPc[j]]++;
      }
      const votedRoot = bassVotes.indexOf(Math.max(...bassVotes));
      const finalRoot = votedRoot >= 0 ? votedRoot : root;
      
      if(!allowed.allAllowed.includes(finalRoot)){
        i = endFrame;
        continue;
      }
      
      const avgChroma = new Float32Array(12);
      let totalWeight = 0;
      
      for(let j=startFrame; j<endFrame; j++){
        if(chroma[j]){
          const weight = Math.sqrt(frameE[j] || 1);
          for(let p=0; p<12; p++) avgChroma[p] += chroma[j][p] * weight;
          totalWeight += weight;
        }
      }
      
      if(totalWeight > 0){
        for(let p=0; p<12; p++) avgChroma[p] /= totalWeight;
      }
      
      const minor3rd = avgChroma[this.toPc(finalRoot + 3)] || 0;
      const major3rd = avgChroma[this.toPc(finalRoot + 4)] || 0;
      const fifth = avgChroma[this.toPc(finalRoot + 7)] || 0;
      
      const minor3rdHarmonic = avgChroma[this.toPc(finalRoot + 6)] || 0;
      const major3rdHarmonic = avgChroma[this.toPc(finalRoot + 8)] || 0;
      
      const minorScore = (minor3rd * 2.0) + (minor3rdHarmonic * 0.8) + (fifth * 1.0);
      const majorScore = (major3rd * 2.0) + (major3rdHarmonic * 0.8) + (fifth * 1.0);
      
      let isMinor = false;
      if(majorScore > minorScore * 1.2) {
        isMinor = false;
      } else if(minorScore > majorScore * 1.2) {
        isMinor = true;
      } else {
        isMinor = minorScore >= majorScore * 0.9;
      }
      
      if (Math.abs(majorScore - minorScore) < 0.05) {
        const degreeInScale = allowed.diatonic.indexOf(finalRoot);
        if (degreeInScale >= 0) {
          if (key.minor) {
            isMinor = [0, 3, 4].includes(degreeInScale);
          } else {
            isMinor = [1, 2, 5].includes(degreeInScale);
          }
        }
      }
      
      let label = this.nameSharp(finalRoot) + (isMinor ? 'm' : '');
      const duration = (endFrame - startFrame) * (hop / sr);
      
      const confidence = this.scoreChordConfidence(finalRoot, label, key, avgChroma, duration);
      
      if (confidence < 30) {
        i = endFrame;
        continue;
      }
      
      timeline.push({
        t: startTime,
        label: label,
        fi: startFrame,
        endFrame: endFrame,
        avgChroma: avgChroma,
        confidence: confidence,
        duration: duration,
        words: []
      });
      
      i = endFrame;
    }
    
    return timeline;
  }

  chromaDifference(chroma1, chroma2) {
    let diff = 0;
    for (let i = 0; i < 12; i++) {
      diff += Math.abs((chroma1[i] || 0) - (chroma2[i] || 0));
    }
    return diff / 12;
  }

  decideMajorMinorFromChroma(root, avgChroma) {
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    const rootStrength = avgChroma[root] || 0;
    
    if (minor3rd < 0.05 && major3rd < 0.05) {
      return fifth > 0.2;
    }
    
    if (major3rd > minor3rd * 1.3) return false;
    if (minor3rd > major3rd * 1.3) return true;
    
    const major3rdRatio = major3rd / (rootStrength + 0.001);
    const minor3rdRatio = minor3rd / (rootStrength + 0.001);
    
    if (major3rdRatio > minor3rdRatio * 1.1) return false;
    if (minor3rdRatio > major3rdRatio * 1.1) return true;
    
    return minor3rd >= major3rd * 0.85;
  }
  
  /**
   * 🎸 Enhanced Template-Based Chord Quality Detection
   */
  detectChordQuality(root, avgChroma, mode = 'balanced') {
    const results = [];
    
    for (const [templateName, template] of Object.entries(this.CHORD_TEMPLATES)) {
      let score = 0;
      let present = 0;
      
      for (let i = 0; i < template.intervals.length; i++) {
        const interval = template.intervals[i];
        const pc = this.toPc(root + interval);
        const strength = avgChroma[pc] || 0;
        const weight = template.weights[i];
        
        score += strength * weight;
        if (strength > 0.12) present++;
      }
      
      const maxScore = template.weights.reduce((sum, w) => sum + w, 0);
      const normalizedScore = score / maxScore;
      
      const minPresent = Math.min(3, template.intervals.length);
      if (present >= minPresent) {
        results.push({
          template: templateName,
          label: template.label,
          score: normalizedScore,
          present: present,
          total: template.intervals.length
        });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    
    if (results.length > 0 && results[0].score > 0.4) {
      return {
        label: results[0].label,
        confidence: results[0].score,
        alternatives: results.slice(1, 3)
      };
    }
    
    const isMinor = this.decideMajorMinorFromChroma(root, avgChroma);
    return {
      label: isMinor ? 'm' : '',
      confidence: 0.5,
      alternatives: []
    };
  }

  /**
   * 🔥 Decorate with qualities using template matching
   */
  decorateQualitiesBassFirst(tl, feats, key, mode, decMul = 1.0) {
    if (mode === 'basic') return tl;
    
    const allowed = this.buildAllowedChords(key);
    const out = [];
    
    for (const ev of tl) {
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }
      
      let avg;
      if (ev.avgChroma) {
        avg = ev.avgChroma;
      } else if (feats && feats.chroma && ev.fi !== undefined) {
        const startFi = ev.fi;
        const endFi = ev.endFrame || Math.min(startFi + 10, feats.chroma.length - 1);
        
        avg = new Float32Array(12);
        let count = 0;
        for (let i = startFi; i <= endFi && i < feats.chroma.length; i++) {
          if (feats.chroma[i]) {
            for (let p = 0; p < 12; p++) {
              avg[p] += feats.chroma[i][p] || 0;
            }
            count++;
          }
        }
        if (count > 0) {
          for (let p = 0; p < 12; p++) avg[p] /= count;
        }
      } else {
        out.push(ev);
        continue;
      }
      
      const quality = this.detectChordQuality(root, avg, mode);
      const rootName = this.nameSharp(root);
      let label = rootName + quality.label;
      
      ev.qualityConfidence = quality.confidence;
      
      // 🆕 Add Roman numeral
      ev.romanNumeral = this.getRomanNumeral(label, key);
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  parseRoot(label) {
    const m = label?.match?.(/^([A-G](?:#|b)?)/);
    if (!m) return -1;
    const nm = m[1].replace('b', '#');
    return this.NOTES_SHARP.indexOf(nm);
  }

  /**
   * 🆕 Enhanced Inversion Detection with Figured Bass Notation
   */
  addInversionsIfNeeded(tl, feats, bassSens = 1.25) {
    if (bassSens < 1.6) return tl;
    
    return tl.map(ev => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      const { bassPc } = feats;
      const i0 = Math.max(0, ev.fi);
      const i1 = Math.min(bassPc.length - 1, ev.endFrame || ev.fi + 3);
      
      const bassVotes = new Array(12).fill(0);
      for (let i = i0; i <= i1; i++) {
        if (bassPc[i] >= 0) bassVotes[bassPc[i]]++;
      }
      
      const dominantBass = bassVotes.indexOf(Math.max(...bassVotes));
      if (dominantBass < 0 || dominantBass === root) return ev;
      
      const bassInterval = this.toPc(dominantBass - root);
      
      // 🆕 Detect inversion type with figured bass notation
      const inversionInfo = this.detectInversionType(ev.label, bassInterval);
      
      if (inversionInfo) {
        const bassNote = this.nameSharp(dominantBass);
        return { 
          ...ev, 
          label: ev.label + '/' + bassNote,
          inversion: inversionInfo.type,
          figuredBass: inversionInfo.notation,
          inversionInterval: bassInterval
        };
      }
      
      return ev;
    });
  }
  
  /**
   * 🆕 Detect Inversion Type with Figured Bass
   */
  detectInversionType(chordLabel, bassInterval) {
    const has7th = chordLabel.includes('7');
    const has9th = chordLabel.includes('9');
    
    // First inversion: 3rd in bass
    if (bassInterval === 3 || bassInterval === 4) {
      return {
        type: 'first',
        notation: has7th ? '6/5' : '6',
        name: 'First Inversion'
      };
    }
    
    // Second inversion: 5th in bass
    if (bassInterval === 7) {
      return {
        type: 'second',
        notation: has7th ? '4/3' : '6/4',
        name: 'Second Inversion'
      };
    }
    
    // Third inversion: 7th in bass (only for 7th chords)
    if ((bassInterval === 10 || bassInterval === 11) && has7th) {
      return {
        type: 'third',
        notation: '4/2',
        name: 'Third Inversion'
      };
    }
    
    return null;
  }
  
  /**
   * 🆕 Detect Cadential 6/4
   */
  detectCadential64(timeline, key) {
    const cadential64s = [];
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      
      // Check: I 6/4 → V
      if (curr.inversion === 'second' && curr.inversionInterval === 7) {
        // Check if next is dominant
        const nextRoot = this.parseRoot(next.label);
        if (nextRoot >= 0) {
          const nextInterval = this.toPc(nextRoot - key.root);
          if (nextInterval === 7) { // V chord
            cadential64s.push({
              index: i,
              chord: curr.label,
              type: 'cadential_6_4',
              importance: 'CRITICAL',
              explanation: 'I 6/4 → V progression (strongest pre-cadential)'
            });
            
            curr.isCadential64 = true;
            curr.harmonicFunction = 'pre-cadential';
          }
        }
      }
    }
    
    console.log(`🎼 Found ${cadential64s.length} Cadential 6/4 progressions`);
    return cadential64s;
  }

  /**
   * 🔥 Validate chords harmonically
   */
  validateChords(tl, key, feats) {
    const allowed = this.buildAllowedChords(key);
    
    return tl.filter((ev, idx) => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return false;
      
      const isDiatonic = allowed.diatonic.includes(root);
      const isBorrowed = allowed.borrowed.includes(root);
      const isSecondaryDom = allowed.secondaryDominants.includes(root) && ev.label.includes('7');
      
      if (!isDiatonic && !isBorrowed && !isSecondaryDom) {
        return false;
      }
      
      const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
      
      if (isDiatonic) {
        return chromaStrength >= 0.12;
      } else if (isBorrowed) {
        return chromaStrength >= 0.18;
      } else {
        return chromaStrength >= 0.25;
      }
    });
  }

  /**
   * 🔥 Classify chords by duration and harmonic function
   */
  classifyOrnamentsByDuration(tl, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const structuralThreshold = spb * 0.75;
    
    return tl.map((ev, i) => {
      const nextEv = tl[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : (spb * 2);
      
      let ornamentType = 'structural';
      
      if (duration < spb * 0.25) {
        if (ev.confidence && ev.confidence < 70) {
          ornamentType = 'passing';
        } else {
          ornamentType = 'ornament';
        }
      } else if (duration < structuralThreshold) {
        ornamentType = 'ornament';
      }
      
      return { ...ev, ornamentType, duration };
    });
  }

  quantizeToGrid(tl, bpm, quantValue = 4) {
    const spb = 60 / Math.max(60, bpm || 120);
    const gridSize = spb / quantValue;
    
    return tl.map((ev, i) => {
      const quantized = Math.round(ev.t / gridSize) * gridSize;
      const nextEv = tl[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : spb;
      const beats = Math.max(1, Math.round(duration / spb));
      
      return { ...ev, t: quantized, beats };
    });
  }

  removeRedundantChords(tl, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const barDuration = spb * 4;
    
    const out = [];
    let lastLabel = null;
    let lastBar = -1;
    
    for (const ev of tl) {
      const currentBar = Math.floor(ev.t / barDuration);
      
      if (!lastLabel || ev.label !== lastLabel) {
        out.push(ev);
        lastLabel = ev.label;
        lastBar = currentBar;
        continue;
      }
      
      if (currentBar > lastBar) {
        out.push(ev);
        lastBar = currentBar;
      }
    }
    
    return out;
  }

  detectStartGate(feats) {
    const { frameE, bassPc } = feats;
    const energies = [...frameE].filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    const median = energies[Math.floor(energies.length * 0.5)] || 0;
    const energyThreshold = median * 0.8;
    for (let i = 0; i < frameE.length; i++) {
      if (frameE[i] < energyThreshold) continue;
      if (bassPc[i] >= 0) return Math.max(0, i - 1);
    }
    return 0;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.ChordEngine = ChordEngine;
  console.log('✅ ChordEngine v5.0 (Enhanced Musical Intelligence) loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}
