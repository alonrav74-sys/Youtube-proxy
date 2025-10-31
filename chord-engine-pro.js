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
      secondaryDominants: 0,  // secondary dominants detected
      modalBorrowings: 0      // modal borrowed chords detected
    };
    
    // 🎼 HMM: Build transition probability matrix
    this.transitionMatrix = this.buildTransitionMatrix();
    console.log('🎼 HMM transition matrix initialized');
    
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
      secondaryDominants: 0,
      modalBorrowings: 0
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
    
    // 🆕 3.5️⃣ Onset detection for beat tracking
    console.log('🥁 Detecting onsets...');
    const onsets = this.detectOnsets(x, sr);
    feats.onsets = onsets;
    
    // 🆕 3.6️⃣ BPM estimation from onsets (if not provided)
    if (!bpm && onsets.length > 0) {
      bpm = this.estimateBPMFromOnsets(onsets, x.length / sr);
      console.log(`🎵 BPM estimated from onsets: ${bpm}`);
    } else if (!bpm) {
      bpm = 120; // Default
    }
    
    // 🆕 3.7️⃣ Generate beat grid
    const duration = x.length / sr;
    const beatGrid = this.generateBeatGrid(duration, bpm, onsets);
    console.log(`🎼 Generated beat grid: ${beatGrid.length} beats`);
    
    // 4️⃣ Initial chord detection (without key constraints)
    console.log('🎸 Initial bass-driven detection...');
    // 🆕 Don't assume C major - let bass detection be truly agnostic
    let timeline = super.buildChordsFromBass(feats, { root: -1, minor: false }, bpm);
    console.log(`   Found ${timeline.length} initial chords: ${timeline.slice(0, 5).map(c => c.label).join(', ')}...`);
    
    // Key detection will be done by parent class (simple and proven)
    
    // Tonic detection removed - using simple key detection from parent class
    
    // 5️⃣ Key detection - Use simple proven algorithm from parent
    console.log('🎹 Detecting key...');
    const key = super.estimateKey(feats.chroma);
    console.log(`   Key: ${this.noteNames[key.root]}${key.minor ? 'm' : ''} ✅`);
    console.log(`🎹 FINAL Key: ${this.noteNames[key.root]} ${key.minor ? 'minor' : 'major'} (conf: ${key.confidence.toFixed(2)})`);
    
    // Display Circle of Fifths (diatonic chords)
    const diatonicChords = this.getDiatonicChords(keyEstimate.tonic, keyEstimate.mode);
    console.log(`🎼 Circle of Fifths: [${diatonicChords.join(', ')}]`);
    
    // Store key for constraint checking
    this.currentKey = key;
    
    // 6️⃣ Re-detect with KEY CONSTRAINTS!
    console.log('🎸 Re-detecting with key constraints...');
    timeline = this.buildChordsFromBassConstrained(feats, key, bpm);
    
    // 🆕 6.5️⃣ RE-ESTIMATE KEY after constrained detection!
    // The constrained detection might have changed chord qualities
    console.log('🎹 Re-estimating key after constraint detection...');
    const refinedKeyEstimate = this.estimateKey(feats.chroma, timeline);
    
    // Update key with refined estimate
    const refinedKey = {
      root: this.parseRoot(refinedKeyEstimate.tonic),
      minor: refinedKeyEstimate.mode === 'minor',
      confidence: 0.9
    };
    
    // Only update if the tonic is similar (within perfect 5th)
    const oldRoot = key.root;
    const newRoot = refinedKey.root;
    const distance = Math.min(Math.abs(newRoot - oldRoot), 12 - Math.abs(newRoot - oldRoot));
    
    if (distance <= 1 || distance === 5 || distance === 7) {
      // Tonic is close - use refined estimate
      key.root = refinedKey.root;
      key.minor = refinedKey.minor;
      console.log(`   ✅ Key refined to: ${refinedKeyEstimate.tonic} ${refinedKeyEstimate.mode}`);
    } else {
      console.log(`   ⚠️ Keeping original key (refined was too different): ${keyEstimate.tonic} ${keyEstimate.mode}`);
    }
    
    // Update currentKey
    this.currentKey = key;
    
    // Ensure we have tonic
    if(timeline.length === 0 || (timeline.length < 3 && x.length / sr > 30)){
      const tonicName = this.nameSharp(key.root);
      const tonicLabel = tonicName + (key.minor ? 'm' : '');
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
    
    // 7.5️⃣ Classify structural vs ornamental
    console.log('🎨 Classifying chords by duration...');
    const classified = this.classifyOrnamentsByDuration(decorated, bpm);
    
    // Count results
    const structuralCount = classified.filter(c => c.ornamentType === 'structural').length;
    const ornamentCount = classified.filter(c => c.ornamentType !== 'structural').length;
    console.log(`   - Structural: ${structuralCount}, Ornaments: ${ornamentCount}`);
    
    // 8️⃣ Confidence Boosting (only in Accurate mode)
    let final = classified;
    
    if (mode === this.MODE.ACCURATE) {
      console.log('✨ Boosting confidence...');
      final = this.boostConfidence(final, key, feats);
      
      console.log('🔧 Temporal smoothing...');
      final = this.temporalSmoothing(final, key);
      
      // 🆕 9️⃣ HMM/Viterbi Smoothing
      console.log('🎼 HMM/Viterbi smoothing...');
      final = this.viterbiSmoothing(final, key);
      
      // 🆕 🔟 Beat Quantization
      console.log('⚡ Quantizing to beat grid...');
      final = this.quantizeChordsToBeats(final, beatGrid, 0.15);
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
    console.log(`   - Modal borrowings: ${this.stats.modalBorrowings}`);
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
        modalBorrowings: this.stats.modalBorrowings,
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
      this.stats.modalBorrowings++;
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
    if (!chordLabel || typeof chordLabel !== 'string') return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const interval = this.toPc(root - key.root);
    const isMinor = chordLabel && typeof chordLabel === 'string' && chordLabel.match(/m(?!aj)/); // 'm' but not 'maj'
    
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
    const quality = curr.label && typeof curr.label === 'string' ? curr.label.match(/^[A-G](#|b)?(.*)$/) : null;
    const newLabel = this.nameSharp(newRoot) + (quality ? quality[2] : '');
    
    return newLabel;
  }
  
  /**
   * 🔧 Parse root note from chord label
   */
  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
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
   * 🔥 סיווג אקורדים - רק אקורדים ארוכים = structural
   * (Inherited from ChordEngine but ensuring it's available)
   */
  classifyOrnamentsByDuration(tl, bpm) {
    // Use parent's implementation
    return super.classifyOrnamentsByDuration(tl, bpm);
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
   * 🎼 ROBUST Key Detection - Multiple Algorithms + Voting
   * Combines 4 methods for 90%+ accuracy
   */
  
  /**
   * 🎯 Algorithm 1: Template Matching (Krumhansl-Schmuckler)
   */
  
  /**
   * 🎯 Algorithm 2: Strongest Chroma Peaks
   */
  
  /**
   * 🎯 Algorithm 3: Chord Progression Analysis
   */
  
  /**
   * 🎯 Algorithm 4: Cadence Analysis
   */
  
  /**
   * 🗳️ Weighted Voting
   */
  
  
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
   * 🎯 TONIC DETECTION - Find the true tonic of the song
   * Uses multiple heuristics to identify the home chord
   */
  
  /**
   * 🎵 Normalize chord to root note only
   */
  normalizeChordRoot(chordLabel) {
    if (!chordLabel || typeof chordLabel !== 'string') return 'C';
    const match = chordLabel.match(/^([A-G][b#]?)/);
    return match ? match[1] : 'C';
  }
  
  /**
   * 🎵 Estimate BPM from onset intervals
   */
  estimateBPMFromOnsets(onsets, duration) {
    if (onsets.length < 4) return 120; // Default if not enough data
    
    // Calculate intervals between onsets
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i - 1]);
    }
    
    // Find most common interval (median)
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    
    // Convert to BPM
    let bpm = 60 / medianInterval;
    
    // Ensure BPM is in reasonable range
    while (bpm < 60) bpm *= 2;
    while (bpm > 200) bpm /= 2;
    
    return Math.round(bpm);
  }
  
  /**
   * 🎼 Build HMM Transition Probability Matrix
   * Based on Circle of Fifths and common progressions
   */
  buildTransitionMatrix() {
    const matrix = [];
    
    // Initialize 12x12 matrix
    for (let i = 0; i < 12; i++) {
      matrix[i] = new Array(12).fill(0.005); // Small baseline
    }
    
    // Fill with music theory probabilities
    for (let from = 0; from < 12; from++) {
      // Self-transition (staying on same chord)
      matrix[from][from] = 0.30;
      
      // VERY STRONG: Perfect cadence V→I (down 5th)
      const down5th = (from + 7) % 12;
      matrix[from][down5th] = 0.25;
      
      // STRONG: Plagal cadence IV→I (down 4th)
      const down4th = (from + 5) % 12;
      matrix[from][down4th] = 0.18;
      
      // MEDIUM: ii→V, vi→IV (common)
      const up2nd = (from + 2) % 12;
      matrix[from][up2nd] = 0.12;
      
      const down3rd = (from + 9) % 12;
      matrix[from][down3rd] = 0.08;
      
      // WEAK: Less common but valid
      const up3rd = (from + 4) % 12;
      matrix[from][up3rd] = 0.04;
      
      const down2nd = (from + 10) % 12;
      matrix[from][down2nd] = 0.02;
      
      // RARE: Chromatic
      matrix[from][(from + 1) % 12] = 0.005;
      matrix[from][(from + 11) % 12] = 0.005;
      matrix[from][(from + 6) % 12] = 0.003; // Tritone (rare)
    }
    
    // Normalize rows
    for (let i = 0; i < 12; i++) {
      const sum = matrix[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < 12; j++) {
        matrix[i][j] /= sum;
      }
    }
    
    return matrix;
  }
  
  /**
   * 🎯 Viterbi Algorithm - Find most likely chord sequence
   * Uses HMM with transition probabilities
   */
  viterbiSmoothing(timeline, key) {
    if (!timeline || timeline.length < 3) return timeline;
    
    const n = timeline.length;
    
    // Extract chord roots
    const observations = timeline.map(ch => this.parseRoot(ch.label));
    
    // Viterbi variables
    const V = []; // V[t][state] = max probability of being in state at time t
    const path = []; // path[t][state] = previous state that led to this
    
    // Initialize (t=0)
    V[0] = {};
    path[0] = {};
    
    for (let state = 0; state < 12; state++) {
      // Emission probability: how well does this state explain the observation?
      const obs = observations[0];
      const emission = this.getEmissionProb(state, obs, timeline[0]);
      
      V[0][state] = Math.log(emission); // Use log probabilities
      path[0][state] = null;
    }
    
    // Forward pass (t=1 to n-1)
    for (let t = 1; t < n; t++) {
      V[t] = {};
      path[t] = {};
      
      for (let currState = 0; currState < 12; currState++) {
        let maxProb = -Infinity;
        let bestPrev = 0;
        
        // Find best previous state
        for (let prevState = 0; prevState < 12; prevState++) {
          const transProb = Math.log(this.transitionMatrix[prevState][currState] + 1e-10);
          const prob = V[t-1][prevState] + transProb;
          
          if (prob > maxProb) {
            maxProb = prob;
            bestPrev = prevState;
          }
        }
        
        // Add emission probability
        const obs = observations[t];
        const emission = this.getEmissionProb(currState, obs, timeline[t]);
        
        V[t][currState] = maxProb + Math.log(emission + 1e-10);
        path[t][currState] = bestPrev;
      }
    }
    
    // Backtrack to find best path
    const bestPath = new Array(n);
    
    // Find best final state
    let maxFinalProb = -Infinity;
    let bestFinalState = 0;
    
    for (let state = 0; state < 12; state++) {
      if (V[n-1][state] > maxFinalProb) {
        maxFinalProb = V[n-1][state];
        bestFinalState = state;
      }
    }
    
    // Backtrack
    bestPath[n-1] = bestFinalState;
    for (let t = n-2; t >= 0; t--) {
      bestPath[t] = path[t+1][bestPath[t+1]];
    }
    
    // Apply smoothing: update chords if Viterbi path differs significantly
    const smoothed = [];
    let changes = 0;
    
    for (let i = 0; i < n; i++) {
      const originalRoot = observations[i];
      const viterbiRoot = bestPath[i];
      
      const chord = { ...timeline[i] };
      
      // Only change if:
      // 1. Viterbi suggests different root
      // 2. Original confidence is low (<70%)
      // 3. Change is musically reasonable
      
      const shouldChange = 
        viterbiRoot !== originalRoot &&
        (chord.confidence || 50) < 70 &&
        this.transitionMatrix[i > 0 ? bestPath[i-1] : viterbiRoot][viterbiRoot] > 0.05;
      
      if (shouldChange) {
        // Update chord root while preserving quality
        const quality = chord.label.replace(/^[A-G][#b]?/, '');
        chord.label = this.nameSharp(viterbiRoot) + quality;
        chord.confidence = Math.min(85, (chord.confidence || 50) + 15);
        chord.viterbiCorrected = true;
        changes++;
      }
      
      smoothed.push(chord);
    }
    
    if (changes > 0) {
      console.log(`🎼 Viterbi: corrected ${changes}/${n} chords using HMM`);
    }
    
    return smoothed;
  }
  
  /**
   * 📊 Get emission probability - how likely is observation given state
   */
  getEmissionProb(state, observation, chord) {
    // If state matches observation exactly: high probability
    if (state === observation) {
      return 0.9;
    }
    
    // If close (within perfect 5th): medium
    const dist = Math.min(Math.abs(state - observation), 12 - Math.abs(state - observation));
    if (dist <= 1) return 0.5;  // Semitone away
    if (dist === 5 || dist === 7) return 0.3; // 4th/5th away
    
    // Otherwise: low but non-zero
    return 0.1 / (dist + 1);
  }
}

console.log('✅ ChordEngine Pro (Confidence Booster v2.0.1) loaded!');
