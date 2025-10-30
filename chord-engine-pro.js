/**
 * 🎸 ChordEngine Pro - Confidence Booster Edition
 * 
 * Enhanced version of ChordEngine with intelligent validation and confidence boosting
 * NO Essentia - keeps your original bass-driven detection intact!
 * 
 * Features:
 * - Multi-frame validation (looks ahead/behind)
 * - Harmonic consistency checking
 * - Bass priority reinforcement  
 * - Temporal smoothing (prevents jumps)
 * - Common progression detection
 * - Cadence detection for tonic finding
 * 
 * @requires chord-engine.js (must be loaded first!)
 * @version 2.0.1
 * @author Alon
 */

class ChordEnginePro extends ChordEngine {
  
  constructor() {
    super();
    
    // Note names for key detection
    this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    this.MODE = {
      FAST: 'fast',           // No preprocessing, basic confidence
      BALANCED: 'balanced',   // Light preprocessing + confidence boost
      ACCURATE: 'accurate'    // Full preprocessing + aggressive validation
    };
    
    this.currentMode = this.MODE.BALANCED;
    
    this.stats = {
      totalChords: 0,
      highConfidence: 0,      // confidence > 80%
      corrected: 0,           // chords fixed by validation
      avgConfidenceBoost: 0,  // average boost applied
      temporalFixes: 0,       // jumps smoothed
      keyConstrainedFixes: 0, // chords fixed by key constraints
      secondaryDominants: 0   // secondary dominants detected
    };
    
    // Common chord progressions for validation
    this.COMMON_PROGRESSIONS = {
      // Major key (intervals from tonic)
      major: [
        [0, 5],    // I → V
        [0, 3],    // I → IV
        [3, 4],    // IV → V (plagal)
        [4, 0],    // V → I (authentic cadence)
        [0, 9],    // I → vi
        [9, 3],    // vi → IV
        [3, 0],    // IV → I
        [5, 3],    // V → IV
        [2, 4],    // ii → V
        [4, 9],    // V → vi (deceptive)
        [9, 2],    // vi → ii
        [2, 5],    // ii → V
      ],
      // Minor key (intervals from tonic)
      minor: [
        [0, 7],    // i → v
        [0, 5],    // i → IV
        [5, 7],    // IV → v
        [7, 0],    // v → i
        [0, 3],    // i → III
        [3, 7],    // III → v
        [10, 0],   // VII → i
        [5, 0],    // IV → i
        [8, 0],    // VI → i
        [0, 8],    // i → VI
      ]
    };
  }
  
  /**
   * 🎯 Main detection with key-constrained chord selection
   */
  async detect(audioBuffer, options = {}) {
    const mode = options.mode || this.currentMode;
    const bpm = options.bpm || 120;
    const harmonyMode = options.harmonyMode || 'pro';
    
    console.log(`🎼 ChordEngine Pro: ${mode} mode (Key-Constrained Detection)`);
    console.log(`🥁 BPM: ${bpm}`);
    
    const startTime = Date.now();
    
    // Reset stats
    this.stats = {
      totalChords: 0,
      highConfidence: 0,
      corrected: 0,
      avgConfidenceBoost: 0,
      temporalFixes: 0,
      keyConstrainedFixes: 0,
      secondaryDominants: 0
    };
    
    // 1️⃣ Preprocessing (based on mode)
    let cleanAudio;
    if (mode === this.MODE.FAST) {
      cleanAudio = {
        x: this.mixStereo(audioBuffer),
        sr: audioBuffer.sampleRate
      };
    } else if (mode === this.MODE.BALANCED) {
      cleanAudio = this.preprocessAudio(audioBuffer, { filtering: false });
    } else {
      cleanAudio = this.preprocessAudio(audioBuffer, { filtering: true });
    }
    
    // 2️⃣ Resample to 22050Hz
    const mono = cleanAudio.x;
    const sr0 = cleanAudio.sr;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    
    // 3️⃣ Feature extraction - use parent's extractFeatures!
    const feats = super.extractFeatures({ x, sr }, bpm);
    
    // 4️⃣ Initial chord detection (without key constraints)
    console.log('🎸 Initial bass-driven detection...');
    let timeline = super.buildChordsFromBass(feats, { root: 0, minor: false }, bpm);
    
    // 5️⃣ Key detection - NOW using cadences!
    const keyEstimate = this.estimateKey(feats.chroma, timeline);
    const key = {
      root: this.parseRoot(keyEstimate.tonic),
      minor: keyEstimate.mode === 'minor',
      confidence: 0.8
    };
    console.log(`🎹 Key: ${keyEstimate.tonic} ${keyEstimate.mode}`);
    
    // Display Circle of Fifths (diatonic chords)
    const diatonicChords = this.getDiatonicChords(keyEstimate.tonic, keyEstimate.mode);
    console.log(`🎼 Circle of Fifths: [${diatonicChords.join(', ')}]`);
    
    // Store key for constraint checking
    this.currentKey = key;
    
    // 6️⃣ Re-detect with KEY CONSTRAINTS!
    console.log('🎸 Re-detecting with key constraints...');
    timeline = this.buildChordsFromBassConstrained(feats, key, bpm);
    
    // Ensure we have tonic
    if(timeline.length === 0 || (timeline.length < 3 && x.length / sr > 30)){
      const tonicLabel = keyEstimate.tonic + (keyEstimate.mode === 'minor' ? 'm' : '');
      timeline.unshift({
        t: 0,
        label: tonicLabel,
        fi: 0,
        endFrame: Math.min(10, feats.chroma.length),
        avgChroma: feats.chroma[0] || new Float32Array(12),
        ornamentType: 'structural',
        confidence: 50,
        words: []
      });
    }
    
    // 7️⃣ Decoration (your harmonic analysis)
    const decorated = this.decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, 1.0);
    
    // 8️⃣ Confidence Boosting (only in Accurate mode)
    let final = decorated;
    
    if (mode === this.MODE.ACCURATE) {
      console.log('✨ Boosting confidence...');
      final = this.boostConfidence(final, key, feats);
      
      console.log('🔧 Temporal smoothing...');
      final = this.temporalSmoothing(final, key);
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Calculate stats
    this.stats.totalChords = final.length;
    this.stats.highConfidence = final.filter(c => (c.confidence || 50) > 80).length;
    const avgConfidence = final.reduce((sum, c) => sum + (c.confidence || 50), 0) / final.length;
    
    console.log(`✅ Detection complete in ${elapsed}s: ${final.length} chords`);
    console.log(`📊 Stats:`);
    console.log(`   - High confidence: ${this.stats.highConfidence}/${this.stats.totalChords} (${((this.stats.highConfidence/this.stats.totalChords)*100).toFixed(0)}%)`);
    console.log(`   - Key-constrained fixes: ${this.stats.keyConstrainedFixes}`);
    console.log(`   - Secondary dominants: ${this.stats.secondaryDominants}`);
    console.log(`   - Corrected: ${this.stats.corrected}`);
    console.log(`   - Temporal fixes: ${this.stats.temporalFixes}`);
    console.log(`   - Avg boost: +${this.stats.avgConfidenceBoost.toFixed(1)}%`);
    
    return {
      chords: final,
      key: key,
      bpm: bpm,
      mode: this.detectMode(feats, key),
      stats: {
        processingTime: elapsed,
        avgConfidence: avgConfidence.toFixed(1),
        highConfidenceRate: ((this.stats.highConfidence/this.stats.totalChords)*100).toFixed(0) + '%',
        keyConstrainedFixes: this.stats.keyConstrainedFixes,
        secondaryDominants: this.stats.secondaryDominants,
        corrected: this.stats.corrected,
        temporalFixes: this.stats.temporalFixes,
        avgBoost: '+' + this.stats.avgConfidenceBoost.toFixed(1) + '%'
      }
    };
  }
  
  /**
   * 🆕 Key-Constrained Bass-Driven Detection
   * Wrapper around buildChordsFromBass with key constraints
   */
  buildChordsFromBassConstrained(feats, key, bpm) {
    // Get original detection
    const originalTimeline = super.buildChordsFromBass(feats, key, bpm);
    
    // Apply key constraints to each chord
    return originalTimeline.map((chord, i) => {
      const constrained = this.applyKeyConstraint(
        chord, 
        key, 
        feats.chroma[chord.fi], 
        originalTimeline[i - 1],
        originalTimeline[i + 1]
      );
      return constrained;
    });
  }
  
  /**
   * 🎼 Apply key constraint to chord selection
   */
  applyKeyConstraint(chord, key, chroma, prevChord, nextChord) {
    const originalLabel = chord.label;
    const root = this.parseRoot(originalLabel);
    
    if (root < 0) return chord; // Can't parse, keep original
    
    // Check if chord is in scale
    const inScale = this.isInScale(originalLabel, key);
    
    if (inScale) {
      // Already in scale, great!
      return chord;
    }
    
    // Out of scale - check if it's justified
    console.log(`🔍 Checking out-of-scale chord: ${originalLabel}`);
    
    // Exception 1: Secondary dominant (V7/X)
    if (this.isSecondaryDominant(originalLabel, nextChord, key)) {
      console.log(`   ✅ Secondary dominant: ${originalLabel} → ${nextChord?.label}`);
      this.stats.secondaryDominants++;
      chord.isSecondaryDominant = true;
      return chord;
    }
    
    // Exception 2: Modal borrowing (common borrowed chords)
    if (this.isModalBorrowing(originalLabel, key)) {
      console.log(`   ✅ Modal borrowing: ${originalLabel}`);
      chord.isModalBorrowing = true;
      return chord;
    }
    
    // Exception 3: Slash chord (bass different from root)
    if (originalLabel.includes('/')) {
      const [chordPart] = originalLabel.split('/');
      if (this.isInScale(chordPart, key)) {
        console.log(`   ✅ Slash chord with in-scale root: ${originalLabel}`);
        return chord;
      }
    }
    
    // Exception 4: Very strong chromagram evidence (1.5x threshold)
    const strength = this.getChordStrength(chroma, root);
    const inScaleAlternative = this.findBestInScaleAlternative(root, key, chroma);
    const altStrength = this.getChordStrength(chroma, this.parseRoot(inScaleAlternative));
    
    if (strength > altStrength * 1.5) {
      console.log(`   ✅ Very strong evidence: ${originalLabel} (${strength.toFixed(2)} vs ${altStrength.toFixed(2)})`);
      chord.isChromatic = true;
      return chord;
    }
    
    // No exception applies - replace with in-scale alternative
    const quality = originalLabel.replace(/^[A-G](#|b)?/, '');
    const newLabel = inScaleAlternative + quality;
    
    console.log(`   🔧 Replacing ${originalLabel} → ${newLabel} (key constraint)`);
    
    this.stats.keyConstrainedFixes++;
    chord.label = newLabel;
    chord.wasConstrained = true;
    chord.originalLabel = originalLabel;
    
    return chord;
  }
  
  /**
   * 🎵 Check if chord is a secondary dominant
   */
  isSecondaryDominant(chordLabel, nextChord, key) {
    if (!nextChord) return false;
    
    // Secondary dominant must be dominant 7th
    if (!chordLabel.includes('7') || chordLabel.includes('maj7') || chordLabel.includes('m7')) {
      return false;
    }
    
    const root = this.parseRoot(chordLabel);
    const nextRoot = this.parseRoot(nextChord.label);
    
    if (root < 0 || nextRoot < 0) return false;
    
    // Check if chord resolves up a 4th (down a 5th) to next chord
    const interval = this.toPc(nextRoot - root);
    
    // V → I relationship (up a 4th = 5 semitones)
    if (interval === 5 || interval === 6) { // Allow b5 substitution
      // Check if target is in scale
      if (this.isInScale(nextChord.label, key)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 🎹 Check if chord is modal borrowing
   */
  isModalBorrowing(chordLabel, key) {
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const interval = this.toPc(root - key.root);
    const isMinor = chordLabel.match(/m(?!aj)/); // 'm' but not 'maj'
    
    // Common borrowed chords
    if (key.minor) {
      // From major: IV, I, V
      const majorBorrows = [
        { interval: 5, major: true },  // IV (from parallel major)
        { interval: 0, major: true },  // I (from parallel major)
        { interval: 7, major: true }   // V (from parallel major)
      ];
      
      return majorBorrows.some(b => 
        b.interval === interval && !isMinor
      );
    } else {
      // From minor: iv, bVII, bVI, ii°
      const minorBorrows = [
        { interval: 5, minor: true },   // iv (from parallel minor)
        { interval: 10, major: true },  // bVII (from parallel minor)
        { interval: 8, major: true },   // bVI (from parallel minor)
        { interval: 2, dim: true }      // ii° (from parallel minor)
      ];
      
      return minorBorrows.some(b => {
        if (b.dim) return interval === b.interval && chordLabel.includes('dim');
        if (b.minor) return interval === b.interval && isMinor;
        return interval === b.interval && !isMinor;
      });
    }
  }
  
  /**
   * 🎼 Check if chord is in key (diatonic)
   */
  isInKey(chordLabel, key) {
    if (!chordLabel || !key) return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const scale = this.buildCircleOfFifths(key);
    
    // Check if root is in scale
    const interval = this.toPc(root - key.root);
    return scale.includes(interval);
  }
  
  /**
   * 🎵 Check if chord is in scale (with quality check)
   * More strict than isInKey - checks both root AND quality
   */
  isInScale(chordLabel, key) {
    if (!chordLabel || !key) return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    // Get diatonic chords with qualities
    const diatonicChords = this.getDiatonicChords(
      this.noteNames[key.root],
      key.minor ? 'minor' : 'major'
    );
    
    // Normalize chord label for comparison
    const normalized = chordLabel.replace(/maj7|7|sus4|sus2|add9|6/g, '');
    
    // Check if the normalized chord is in the diatonic chords
    return diatonicChords.some(dc => {
      const dcNormalized = dc.replace(/maj7|7|sus4|sus2|add9|6/g, '');
      return normalized === dcNormalized || normalized.startsWith(dcNormalized);
    });
  }
  
  /**
   * 🎵 Build Circle of Fifths (diatonic scale intervals)
   */
  buildCircleOfFifths(key) {
    if (!key) return [0, 2, 4, 5, 7, 9, 11]; // C major default
    
    if (key.minor) {
      // Natural minor: 0, 2, 3, 5, 7, 8, 10
      return [0, 2, 3, 5, 7, 8, 10];
    } else {
      // Major: 0, 2, 4, 5, 7, 9, 11
      return [0, 2, 4, 5, 7, 9, 11];
    }
  }
  
  /**
   * 🎼 Get diatonic chord names for display
   * Returns the 7 natural chords in the key
   */
  getDiatonicChords(tonic, mode) {
    const tonicRoot = this.parseRoot(tonic);
    if (tonicRoot < 0) return [];
    
    const chords = [];
    
    if (mode === 'major') {
      // Major scale chord qualities: I, ii, iii, IV, V, vi, vii°
      const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
      const scale = [0, 2, 4, 5, 7, 9, 11]; // intervals from tonic
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        const rootName = this.noteNames[root];
        chords.push(rootName + qualities[i]);
      }
    } else {
      // Natural minor scale chord qualities: i, ii°, III, iv, v, VI, VII
      const qualities = ['m', 'dim', '', 'm', 'm', '', ''];
      const scale = [0, 2, 3, 5, 7, 8, 10]; // intervals from tonic
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        const rootName = this.noteNames[root];
        chords.push(rootName + qualities[i]);
      }
    }
    
    return chords;
  }
  
  /**
   * 📊 Get chord strength from chromagram
   */
  getChordStrength(chroma, root) {
    if (!chroma || root < 0) return 0;
    
    const rootStrength = chroma[root % 12];
    const thirdMajor = chroma[(root + 4) % 12];
    const thirdMinor = chroma[(root + 3) % 12];
    const fifth = chroma[(root + 7) % 12];
    
    // Average of root, third, fifth
    return (rootStrength + Math.max(thirdMajor, thirdMinor) + fifth) / 3;
  }
  
  /**
   * 🔍 Find best in-scale alternative
   */
  findBestInScaleAlternative(root, key, chroma) {
    const scale = key.minor ? 
      [0, 2, 3, 5, 7, 8, 10] : 
      [0, 2, 4, 5, 7, 9, 11];
    
    const interval = this.toPc(root - key.root);
    
    // Find closest scale degree
    let closest = scale[0];
    let minDist = 12;
    
    scale.forEach(degree => {
      const dist = Math.min(
        Math.abs(degree - interval),
        Math.abs(degree - interval + 12),
        Math.abs(degree - interval - 12)
      );
      if (dist < minDist) {
        minDist = dist;
        closest = degree;
      }
    });
    
    const newRoot = this.toPc(key.root + closest);
    return this.nameSharp(newRoot);
  }
  
  /**
   * ✨ Boost confidence based on multiple factors
   */
  boostConfidence(timeline, key, feats) {
    let totalBoost = 0;
    let count = 0;
    
    timeline.forEach((chord, i) => {
      let boost = 0;
      const baseConfidence = chord.confidence || 50;
      
      // Factor 1: Is chord in scale? (diatonic)
      if (this.isInScale(chord.label, key)) {
        boost += 15;
      } else {
        boost -= 10; // Penalty for non-diatonic
      }
      
      // Factor 2: Common progression with previous chord
      if (i > 0) {
        const prevChord = timeline[i - 1];
        if (this.isCommonProgression(prevChord.label, chord.label, key)) {
          boost += 12;
        }
      }
      
      // Factor 3: Common progression with next chord
      if (i < timeline.length - 1) {
        const nextChord = timeline[i + 1];
        if (this.isCommonProgression(chord.label, nextChord.label, key)) {
          boost += 10;
        }
      }
      
      // Factor 4: Bass strength (if available from original detection)
      if (chord.bassAmplitude && chord.bassAmplitude > 0.7) {
        boost += 15;
      } else if (chord.bassAmplitude && chord.bassAmplitude < 0.4) {
        boost -= 8;
      }
      
      // Factor 5: Harmonic consistency (check chromagram match)
      const chromaMatch = this.checkChromaMatch(chord, feats.chroma);
      if (chromaMatch > 0.75) {
        boost += 10;
      } else if (chromaMatch < 0.5) {
        boost -= 5;
      }
      
      // Factor 6: Duration (longer = more confident)
      if (chord.duration && chord.duration > 2.0) {
        boost += 8;
      }
      
      // Apply boost
      chord.confidence = Math.min(98, Math.max(20, baseConfidence + boost));
      chord.confidenceBoost = boost;
      
      totalBoost += boost;
      count++;
    });
    
    this.stats.avgConfidenceBoost = count > 0 ? totalBoost / count : 0;
    
    return timeline;
  }
  
  /**
   * 🔧 Temporal smoothing - fix unlikely jumps
   */
  temporalSmoothing(timeline, key) {
    for (let i = 1; i < timeline.length - 1; i++) {
      const prev = timeline[i - 1];
      const curr = timeline[i];
      const next = timeline[i + 1];
      
      // Check if current chord is an outlier
      const isOutlier = 
        !this.isInScale(curr.label, key) &&
        this.isInScale(prev.label, key) &&
        this.isInScale(next.label, key) &&
        (curr.confidence || 50) < 70;
      
      if (isOutlier) {
        // Check if prev → next makes sense without curr
        if (this.isCommonProgression(prev.label, next.label, key)) {
          // Try to find a better chord
          const alternative = this.findBetterAlternative(curr, prev, next, key);
          if (alternative) {
            console.log(`🔧 Fixed outlier: ${curr.label} → ${alternative}`);
            curr.label = alternative;
            curr.confidence = 75;
            this.stats.temporalFixes++;
            this.stats.corrected++;
          }
        }
      }
    }
    
    return timeline;
  }
  
  /**
   * 🎵 Check if progression is common
   */
  isCommonProgression(chord1Label, chord2Label, key) {
    const root1 = this.parseRoot(chord1Label);
    const root2 = this.parseRoot(chord2Label);
    
    if (root1 < 0 || root2 < 0) return false;
    
    const interval1 = this.toPc(root1 - key.root);
    const interval2 = this.toPc(root2 - key.root);
    
    const progressions = key.minor ? 
      this.COMMON_PROGRESSIONS.minor : 
      this.COMMON_PROGRESSIONS.major;
    
    return progressions.some(([a, b]) => a === interval1 && b === interval2);
  }
  
  /**
   * 📊 Check chromagram match
   */
  checkChromaMatch(chord, chromaArray) {
    if (!chord.fi || !chromaArray || chord.fi >= chromaArray.length) {
      return 0.5; // neutral
    }
    
    const chroma = chromaArray[chord.fi];
    if (!chroma) return 0.5;
    
    const root = this.parseRoot(chord.label);
    if (root < 0) return 0.5;
    
    // Check if root note is strong in chromagram
    const rootStrength = chroma[root % 12];
    const avgStrength = Array.from(chroma).reduce((a, b) => a + b, 0) / 12;
    
    return rootStrength / (avgStrength + 0.01);
  }
  
  /**
   * 🔍 Find better alternative chord
   */
  findBetterAlternative(curr, prev, next, key) {
    const root = this.parseRoot(curr.label);
    if (root < 0) return null;
    
    // Try nearby notes in scale
    const scale = key.minor ? 
      [0, 2, 3, 5, 7, 8, 10] : 
      [0, 2, 4, 5, 7, 9, 11];
    
    const currInterval = this.toPc(root - key.root);
    
    // Find closest scale degree
    let closest = scale[0];
    let minDist = 12;
    
    scale.forEach(degree => {
      const dist = Math.min(
        Math.abs(degree - currInterval),
        Math.abs(degree - currInterval + 12),
        Math.abs(degree - currInterval - 12)
      );
      if (dist < minDist) {
        minDist = dist;
        closest = degree;
      }
    });
    
    const newRoot = this.toPc(key.root + closest);
    const quality = curr.label.match(/^[A-G](#|b)?(.*)$/);
    const newLabel = this.nameSharp(newRoot) + (quality ? quality[2] : '');
    
    return newLabel;
  }
  
  /**
   * 🔧 Parse root note from chord label
   */
  parseRoot(label) {
    const m = label.match(/^([A-G])(#|b)?/);
    if (!m) return -1;
    
    const noteMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    let root = noteMap[m[1]];
    if (m[2] === '#') root++;
    if (m[2] === 'b') root--;
    
    return this.toPc(root);
  }
  
  /**
   * 🎵 Convert to pitch class (0-11)
   */
  toPc(n) {
    return ((n % 12) + 12) % 12;
  }
  
  /**
   * 🔧 Get short note name
   */
  nameSharp(pc) {
    return this.noteNames[this.toPc(pc)];
  }
  
  /**
   * 🎛️ Preprocessing with noise filtering and guitar isolation
   */
  preprocessAudio(audioBuffer, options = {}) {
    const { filtering = false } = options;
    
    let x = this.mixStereo(audioBuffer);
    const sr = audioBuffer.sampleRate;
    
    if (!filtering) {
      return { x, sr };
    }
    
    console.log('🔊 Preprocessing: filtering + guitar isolation');
    
    // High-pass filter (remove rumble)
    x = this.highPassFilter(x, sr, 80);
    
    // Bandpass for guitar range (200Hz - 5kHz)
    x = this.bandPassFilter(x, sr, 200, 5000);
    
    // Simple noise gate
    const threshold = this.estimateNoiseFloor(x) * 1.5;
    x = x.map(val => Math.abs(val) < threshold ? 0 : val);
    
    return { x, sr };
  }
  
  /**
   * 🎚️ High-pass filter (remove low frequencies)
   */
  highPassFilter(x, sr, cutoff) {
    const RC = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / sr;
    const alpha = RC / (RC + dt);
    
    const y = new Float32Array(x.length);
    y[0] = x[0];
    
    for (let i = 1; i < x.length; i++) {
      y[i] = alpha * (y[i-1] + x[i] - x[i-1]);
    }
    
    return y;
  }
  
  /**
   * 🎚️ Band-pass filter
   */
  bandPassFilter(x, sr, lowCutoff, highCutoff) {
    // Simple implementation: high-pass then low-pass
    let y = this.highPassFilter(x, sr, lowCutoff);
    y = this.lowPassFilter(y, sr, highCutoff);
    return y;
  }
  
  /**
   * 🎚️ Low-pass filter
   */
  lowPassFilter(x, sr, cutoff) {
    const RC = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / sr;
    const alpha = dt / (RC + dt);
    
    const y = new Float32Array(x.length);
    y[0] = x[0];
    
    for (let i = 1; i < x.length; i++) {
      y[i] = y[i-1] + alpha * (x[i] - y[i-1]);
    }
    
    return y;
  }
  
  /**
   * 📊 Estimate noise floor
   */
  estimateNoiseFloor(x) {
    const sorted = Array.from(x).map(Math.abs).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.1)]; // 10th percentile
  }
  
  /**
   * 🎹 Mix stereo to mono
   */
  mixStereo(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }
    
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    
    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) * 0.5;
    }
    
    return mono;
  }
  
  /**
   * 🔄 Resample audio
   */
  resampleLinear(x, sr0, sr1) {
    if (sr0 === sr1) return x;
    
    const ratio = sr0 / sr1;
    const newLen = Math.floor(x.length / ratio);
    const y = new Float32Array(newLen);
    
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, x.length - 1);
      const frac = srcIdx - i0;
      y[i] = x[i0] * (1 - frac) + x[i1] * frac;
    }
    
    return y;
  }
  
  /**
   * 📋 Get stats
   */
  getStats() {
    return this.stats;
  }
  
  /**
   * 🎨 Decorate with qualities and classify structural vs ornamental
   */
  decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, bassConfidence) {
    if (!timeline || timeline.length === 0) return timeline;
    
    // Use parent's decoration
    return super.decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, bassConfidence);
  }
  
  /**
   * 🎼 Estimate key from chromagram
   * SMART: Finds the tonic by detecting where the song "resolves" (cadence)
   */
  estimateKey(chromaArray, timeline = null) {
    if (!chromaArray || chromaArray.length === 0) {
      return { tonic: 'C', mode: 'major' };
    }
    
    let tonicCandidate = null;
    let tonicMode = null;
    
    // Strategy 1: Find cadences (resolution points)
    if (timeline && timeline.length >= 3) {
      const cadences = this.findCadences(timeline);
      
      if (cadences.length > 0) {
        // The most common resolution target is likely the tonic
        const resolutionCounts = {};
        cadences.forEach(cad => {
          const root = this.normalizeChordRoot(cad.target);
          resolutionCounts[root] = (resolutionCounts[root] || 0) + 1;
        });
        
        // Find most frequent resolution target
        const sortedResolutions = Object.entries(resolutionCounts)
          .sort((a, b) => b[1] - a[1]);
        
        if (sortedResolutions.length > 0) {
          tonicCandidate = sortedResolutions[0][0];
          // Determine mode from the target chord
          const targetChord = cadences.find(c => this.normalizeChordRoot(c.target) === tonicCandidate);
          tonicMode = /m(?!aj)/.test(targetChord.target) ? 'minor' : 'major';
          console.log(`🎯 Tonic detected from ${cadences.length} cadences: ${tonicCandidate} ${tonicMode}`);
          return { tonic: tonicCandidate, mode: tonicMode };
        }
      }
    }
    
    // Strategy 2: Check first and last chords
    if (timeline && timeline.length > 0) {
      const firstChord = timeline[0].label;
      const lastChord = timeline[timeline.length - 1].label;
      
      if (firstChord && lastChord && this.normalizeChordRoot(firstChord) === this.normalizeChordRoot(lastChord)) {
        tonicCandidate = this.normalizeChordRoot(firstChord);
        tonicMode = /m(?!aj)/.test(firstChord) ? 'minor' : 'major';
        console.log(`🎯 Tonic detected from first/last chord: ${tonicCandidate} ${tonicMode}`);
        return { tonic: tonicCandidate, mode: tonicMode };
      }
    }
    
    // Strategy 3: Chromagram analysis (Krumhansl-Schmuckler)
    const avgChroma = new Float32Array(12);
    for (let i = 0; i < chromaArray.length; i++) {
      const chroma = chromaArray[i];
      for (let j = 0; j < 12; j++) {
        avgChroma[j] += chroma[j];
      }
    }
    for (let i = 0; i < 12; i++) {
      avgChroma[i] /= chromaArray.length;
    }
    
    // Major and minor key profiles (Krumhansl-Schmuckler)
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    let bestKey = { tonic: 'C', mode: 'major', correlation: -1 };
    
    // Try all 12 major keys
    for (let root = 0; root < 12; root++) {
      let correlation = 0;
      for (let i = 0; i < 12; i++) {
        correlation += avgChroma[(root + i) % 12] * majorProfile[i];
      }
      
      if (correlation > bestKey.correlation) {
        bestKey = {
          tonic: this.noteNames[root],
          mode: 'major',
          correlation
        };
      }
    }
    
    // Try all 12 minor keys
    for (let root = 0; root < 12; root++) {
      let correlation = 0;
      for (let i = 0; i < 12; i++) {
        correlation += avgChroma[(root + i) % 12] * minorProfile[i];
      }
      
      if (correlation > bestKey.correlation) {
        bestKey = {
          tonic: this.noteNames[root],
          mode: 'minor',
          correlation
        };
      }
    }
    
    // Strategy 4: Use first chord as tie-breaker
    if (timeline && timeline.length > 0) {
      const firstChord = timeline[0].label;
      const firstRoot = this.normalizeChordRoot(firstChord);
      const firstMode = /m(?!aj)/.test(firstChord) ? 'minor' : 'major';
      
      if (firstRoot === bestKey.tonic && firstMode === bestKey.mode) {
        console.log(`✅ First chord confirms chromagram: ${bestKey.tonic} ${bestKey.mode}`);
      } else {
        console.log(`🔄 First chord (${firstRoot} ${firstMode}) vs chromagram (${bestKey.tonic} ${bestKey.mode})`);
        console.log(`   → Using first chord!`);
        return { tonic: firstRoot, mode: firstMode };
      }
    }
    
    console.log(`🎼 Key detected from chromagram: ${bestKey.tonic} ${bestKey.mode}`);
    return bestKey;
  }
  
  /**
   * 🎵 Find cadences (resolution points) in the progression
   * A cadence is when the harmony "resolves" - typically V→I or similar
   */
  findCadences(timeline) {
    if (!timeline || timeline.length < 2) return [];
    
    const cadences = [];
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1];
      
      if (!current.label || !next.label) continue;
      
      const currentRoot = this.parseRoot(current.label);
      const nextRoot = this.parseRoot(next.label);
      
      if (currentRoot < 0 || nextRoot < 0) continue;
      
      // Calculate interval
      const interval = this.toPc(nextRoot - currentRoot);
      
      // Cadence patterns:
      // 1. Perfect cadence: V → I (interval of 7 semitones = perfect 5th up)
      // 2. Plagal cadence: IV → I (interval of 5 semitones = perfect 4th up)
      // 3. Dominant 7th resolution: X7 → Y (any dominant 7th resolving)
      
      const isPerfectCadence = interval === 7; // V → I (up a 5th = 7 semitones)
      const isPlagalCadence = interval === 5;  // IV → I (up a 4th = 5 semitones)
      const isDominant7th = /7(?!maj)/.test(current.label); // X7 (not maj7)
      
      if (isPerfectCadence || isPlagalCadence || (isDominant7th && (interval === 7 || interval === 5))) {
        cadences.push({
          source: current.label,
          target: next.label,
          type: isPerfectCadence ? 'perfect' : isPlagalCadence ? 'plagal' : 'dominant',
          time: next.t
        });
        
        console.log(`   🎵 Cadence: ${current.label} → ${next.label} (${isPerfectCadence ? 'V→I' : isPlagalCadence ? 'IV→I' : 'V7→I'})`);
      }
    }
    
    return cadences;
  }
  
  /**
   * 🎵 Normalize chord to root note only
   */
  normalizeChordRoot(chordLabel) {
    if (!chordLabel) return 'C';
    const match = chordLabel.match(/^([A-G][b#]?)/);
    return match ? match[1] : 'C';
  }
}

console.log('✅ ChordEngine Pro (Confidence Booster v2.0.1) loaded!');
