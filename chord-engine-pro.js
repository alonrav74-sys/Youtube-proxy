/**
 * 🎸 ChordEngine Pro - ULTIMATE Edition v2.2
 * 
 * ALL ENHANCEMENTS:
 * 1. 🎵 Enhanced 7ths, 9ths, 11ths, 13ths detection
 * 2. 🔊 Bass Harmonic Series Analysis (Option A)
 * 3. 🎹 Spectral Centroid for Major/Minor (Option B)
 * 4. 🥁 Rhythmic Pattern Analysis (Option C)
 * 5. 🎼 Modulation Detection (key changes: C→F, C→G, etc.)
 * 6. 🎯 Advanced inversion detection
 * 
 * @requires chord-engine.js (must be loaded first!)
 * @version 2.2.0 ULTIMATE
 * @author Alon
 */

class ChordEnginePro extends ChordEngine {
  
  constructor() {
    super();
    
    this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    this.MODE = {
      FAST: 'fast',
      BALANCED: 'balanced',
      ACCURATE: 'accurate'
    };
    
    this.currentMode = this.MODE.BALANCED;
    
    this.stats = {
      totalChords: 0,
      highConfidence: 0,
      corrected: 0,
      avgConfidenceBoost: 0,
      temporalFixes: 0,
      keyConstrainedFixes: 0,
      secondaryDominants: 0,
      modalBorrowings: 0,
      extensionsDetected: 0,
      inversionsDetected: 0,
      modulationsDetected: 0  // 🆕
    };
    
    this.transitionMatrix = this.buildTransitionMatrix();
    
    // 🆕 Enhanced chord templates with harmonics
    this.ENHANCED_TEMPLATES = {
      maj7: {
        intervals: [0, 4, 7, 11],
        weights: [1.0, 0.85, 0.8, 0.75],
        harmonics: [12, 16, 19, 23],
        label: 'maj7',
        minPresence: 3
      },
      dom7: {
        intervals: [0, 4, 7, 10],
        weights: [1.0, 0.85, 0.8, 0.8],
        harmonics: [12, 16, 19, 22],
        label: '7',
        minPresence: 3
      },
      m7: {
        intervals: [0, 3, 7, 10],
        weights: [1.0, 0.85, 0.8, 0.75],
        harmonics: [12, 15, 19, 22],
        label: 'm7',
        minPresence: 3
      },
      dim7: {
        intervals: [0, 3, 6, 9],
        weights: [1.0, 0.85, 0.8, 0.75],
        harmonics: [12, 15, 18, 21],
        label: 'dim7',
        minPresence: 3
      },
      m7b5: {
        intervals: [0, 3, 6, 10],
        weights: [1.0, 0.85, 0.75, 0.75],
        harmonics: [12, 15, 18, 22],
        label: 'm7b5',
        minPresence: 3
      },
      maj9: {
        intervals: [0, 4, 7, 11, 14],
        weights: [1.0, 0.8, 0.75, 0.7, 0.65],
        harmonics: [12, 16, 19, 23, 26],
        label: 'maj9',
        minPresence: 4
      },
      dom9: {
        intervals: [0, 4, 7, 10, 14],
        weights: [1.0, 0.8, 0.75, 0.75, 0.7],
        harmonics: [12, 16, 19, 22, 26],
        label: '9',
        minPresence: 4
      },
      m9: {
        intervals: [0, 3, 7, 10, 14],
        weights: [1.0, 0.8, 0.75, 0.7, 0.65],
        harmonics: [12, 15, 19, 22, 26],
        label: 'm9',
        minPresence: 4
      },
      dom11: {
        intervals: [0, 4, 7, 10, 14, 17],
        weights: [1.0, 0.75, 0.7, 0.75, 0.6, 0.6],
        harmonics: [12, 16, 19, 22, 26, 29],
        label: '11',
        minPresence: 4
      },
      m11: {
        intervals: [0, 3, 7, 10, 14, 17],
        weights: [1.0, 0.75, 0.7, 0.7, 0.6, 0.6],
        harmonics: [12, 15, 19, 22, 26, 29],
        label: 'm11',
        minPresence: 4
      },
      dom13: {
        intervals: [0, 4, 7, 10, 14, 21],
        weights: [1.0, 0.75, 0.7, 0.75, 0.6, 0.55],
        harmonics: [12, 16, 19, 22, 26, 33],
        label: '13',
        minPresence: 4
      },
      maj13: {
        intervals: [0, 4, 7, 11, 14, 21],
        weights: [1.0, 0.75, 0.7, 0.7, 0.6, 0.55],
        harmonics: [12, 16, 19, 23, 26, 33],
        label: 'maj13',
        minPresence: 4
      },
      add9: {
        intervals: [0, 4, 7, 14],
        weights: [1.0, 0.85, 0.8, 0.7],
        harmonics: [12, 16, 19, 26],
        label: 'add9',
        minPresence: 3
      },
      sus2: {
        intervals: [0, 2, 7],
        weights: [1.0, 0.85, 0.8],
        harmonics: [12, 14, 19],
        label: 'sus2',
        minPresence: 2
      },
      sus4: {
        intervals: [0, 5, 7],
        weights: [1.0, 0.85, 0.8],
        harmonics: [12, 17, 19],
        label: 'sus4',
        minPresence: 2
      }
    };
    
    console.log('🎸 ChordEngine Pro ULTIMATE v2.2 loaded!');
  }
  
  /**
   * 🎯 Main detection
   */
  async detect(audioBuffer, options = {}) {
    const mode = options.mode || this.currentMode;
    const bpm = options.bpm || 120;
    const harmonyMode = options.harmonyMode || 'pro';
    
    console.log(`🎼 ChordEngine Pro ULTIMATE: ${mode} mode`);
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
      modalBorrowings: 0,
      extensionsDetected: 0,
      inversionsDetected: 0,
      modulationsDetected: 0
    };
    
    // 1️⃣ Preprocessing
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
    
    // 2️⃣ Resample
    const mono = cleanAudio.x;
    const sr0 = cleanAudio.sr;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    
    // 3️⃣ Feature extraction
    const feats = super.extractFeatures({ x, sr }, bpm);
    
    // 3.5️⃣ Onset detection
    console.log('🥁 Detecting onsets...');
    const onsets = this.detectOnsets(x, sr);
    feats.onsets = onsets;
    
    // 3.6️⃣ BPM estimation
    if (!bpm && onsets.length > 0) {
      bpm = this.estimateBPMFromOnsets(onsets, x.length / sr);
      console.log(`🎵 BPM estimated: ${bpm}`);
    } else if (!bpm) {
      bpm = 120;
    }
    
    // 3.7️⃣ Beat grid
    const duration = x.length / sr;
    const beatGrid = this.generateBeatGrid(duration, bpm, onsets);
    console.log(`🎼 Beat grid: ${beatGrid.length} beats`);
    
    // 4️⃣ Initial chord detection
    console.log('🎸 Initial detection...');
    let timeline = super.buildChordsFromBass(feats, { root: -1, minor: false }, bpm);
    console.log(`   Found ${timeline.length} chords`);
    
    // 5️⃣ Key detection
    console.log('🎹 Detecting key...');
    let key = super.estimateKey(feats.chroma);
    console.log(`   Initial key: ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    
    // Enhanced key detection
    if (typeof EnhancedKeyDetection !== 'undefined') {
      key = EnhancedKeyDetection.detectKeyEnhanced(feats.chroma, timeline, key);
    }
    console.log(`   ✅ Final key: ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    
    const keyTonic = this.noteNames[key.root];
    const keyMode = key.minor ? 'minor' : 'major';
    const diatonicChords = this.getDiatonicChords(keyTonic, keyMode);
    console.log(`🎼 Diatonic chords: [${diatonicChords.join(', ')}]`);
    
    this.currentKey = key;
    
    // 6️⃣ Re-detect with KEY CONSTRAINTS + MODULATION DETECTION
    console.log('🎸 Re-detecting with key constraints + modulation...');
    timeline = this.buildChordsWithModulation(feats, key, bpm);
    
    // Ensure tonic
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
    
    // 7️⃣ Enhanced decoration
    console.log('🎨 Decorating with ULTIMATE quality detection...');
    const decorated = this.decorateQualitiesUltimate(timeline, feats, key, harmonyMode, bpm, 1.0);
    
    // 7.5️⃣ Classify with rhythmic patterns (Option C)
    console.log('🥁 Classifying with rhythmic patterns...');
    const classified = this.classifyByRhythm(decorated, bpm, beatGrid);
    
    const structuralCount = classified.filter(c => c.ornamentType === 'structural').length;
    const ornamentCount = classified.filter(c => c.ornamentType !== 'structural').length;
    console.log(`   - Structural: ${structuralCount}, Ornaments: ${ornamentCount}`);
    
    // 8️⃣ Smoothing (only in Accurate mode)
    let final = classified;
    
    if (mode === this.MODE.ACCURATE) {
      console.log('✨ Boosting confidence...');
      final = this.boostConfidence(final, key, feats);
      
      console.log('🔧 Temporal smoothing...');
      final = this.temporalSmoothing(final, key);
      
      console.log('🎼 HMM/Viterbi smoothing...');
      final = this.viterbiSmoothing(final, key);
      
      console.log('⚡ Quantizing to beat grid...');
      final = this.quantizeChordsToBeats(final, beatGrid, 0.15);
    }
    
    // 9️⃣ Inversion detection
    console.log('🎹 Detecting inversions...');
    final = this.detectInversions(final, feats);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Stats
    this.stats.totalChords = final.length;
    this.stats.highConfidence = final.filter(c => (c.confidence || 50) > 80).length;
    const avgConfidence = final.reduce((sum, c) => sum + (c.confidence || 50), 0) / final.length;
    
    console.log(`✅ ULTIMATE detection complete in ${elapsed}s: ${final.length} chords`);
    console.log(`📊 ULTIMATE Stats:`);
    console.log(`   - High confidence: ${this.stats.highConfidence}/${this.stats.totalChords} (${((this.stats.highConfidence/this.stats.totalChords)*100).toFixed(0)}%)`);
    console.log(`   - Extensions: ${this.stats.extensionsDetected}`);
    console.log(`   - Inversions: ${this.stats.inversionsDetected}`);
    console.log(`   - Modulations: ${this.stats.modulationsDetected}`);
    console.log(`   - Key fixes: ${this.stats.keyConstrainedFixes}`);
    console.log(`   - Secondary dominants: ${this.stats.secondaryDominants}`);
    console.log(`   - Modal borrowings: ${this.stats.modalBorrowings}`);
    
    return {
      chords: final,
      key: key,
      bpm: bpm,
      mode: this.detectMode(feats, key),
      stats: {
        processingTime: elapsed,
        avgConfidence: avgConfidence.toFixed(1),
        highConfidenceRate: ((this.stats.highConfidence/this.stats.totalChords)*100).toFixed(0) + '%',
        extensionsDetected: this.stats.extensionsDetected,
        inversionsDetected: this.stats.inversionsDetected,
        modulationsDetected: this.stats.modulationsDetected,
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
   * 🆕 OPTION A: Bass Harmonic Series Analysis
   * Checks for harmonic overtones to confirm bass note
   */
  checkBassHarmonicSeries(chroma, bassRoot) {
    if (bassRoot < 0) return 0;
    
    // Check harmonics: octave (12), perfect 5th (19), major 3rd (16)
    const octave = chroma[this.toPc(bassRoot + 12)] || 0;
    const fifth = chroma[this.toPc(bassRoot + 19)] || 0;
    const third = chroma[this.toPc(bassRoot + 16)] || 0;
    
    // If harmonics are present, this is likely a real bass note
    const harmonicStrength = (octave * 0.6) + (fifth * 0.3) + (third * 0.1);
    
    return harmonicStrength;
  }
  
  /**
   * 🆕 OPTION B: Spectral Centroid for Major/Minor
   * Lower centroid = darker = minor
   * Higher centroid = brighter = major
   */
  calculateSpectralCentroid(chroma) {
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (let pc = 0; pc < 12; pc++) {
      const weight = chroma[pc] || 0;
      weightedSum += pc * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 5.5;
  }
  
  /**
   * 🆕 OPTION C: Rhythmic Pattern Analysis
   * Structural chords on strong beats, ornaments on weak beats
   */
  classifyByRhythm(timeline, bpm, beatGrid) {
    const spb = 60 / Math.max(60, bpm || 120);
    const beatTolerance = spb * 0.15; // 15% of beat
    
    return timeline.map((ev, i) => {
      const nextEv = timeline[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : (spb * 2);
      
      // 🆕 Check if chord is on strong beat
      const nearestBeat = beatGrid.find(b => Math.abs(b - ev.t) < beatTolerance);
      const beatInBar = nearestBeat ? (nearestBeat % (spb * 4)) / spb : -1;
      
      // Strong beats: 1 (0.0), 3 (2.0)
      const isStrongBeat = (Math.abs(beatInBar - 0) < 0.2 || Math.abs(beatInBar - 2) < 0.2);
      
      let ornamentType = 'structural';
      
      // Very short chords
      if (duration < spb * 0.25) {
        if (isStrongBeat && (ev.confidence || 50) > 70) {
          ornamentType = 'ornament'; // Short but strong
        } else {
          ornamentType = 'passing'; // Weak and short
        }
      }
      // Medium length chords
      else if (duration < spb * 0.75) {
        if (!isStrongBeat && (ev.confidence || 50) < 70) {
          ornamentType = 'ornament';
        }
      }
      // Long chords = always structural
      
      return { ...ev, ornamentType, onStrongBeat: isStrongBeat };
    });
  }
  
  /**
   * 🆕 Modulation Detection (Key Changes)
   * Detects when song moves to different key (C→F, C→G, etc.)
   */
  buildChordsWithModulation(feats, primaryKey, bpm) {
    const originalTimeline = super.buildChordsFromBass(feats, primaryKey, bpm);
    
    if (originalTimeline.length < 8) {
      // Too short for modulation
      return originalTimeline.map((chord, i) => 
        this.applyKeyConstraint(chord, primaryKey, feats.chroma[chord.fi], 
          originalTimeline[i-1], originalTimeline[i+1])
      );
    }
    
    // 🎼 Detect modulations
    const sections = this.detectModulationSections(originalTimeline, primaryKey);
    
    console.log(`🎼 Found ${sections.length} key sections:`);
    sections.forEach(s => {
      const keyName = this.noteNames[s.key.root] + (s.key.minor ? 'm' : '');
      console.log(`   - ${s.start}-${s.end}: ${keyName}`);
    });
    
    // Apply constraints with section-specific keys
    const result = [];
    
    for (let i = 0; i < originalTimeline.length; i++) {
      const chord = originalTimeline[i];
      
      // Find which section this chord belongs to
      const section = sections.find(s => i >= s.start && i <= s.end);
      const activeKey = section ? section.key : primaryKey;
      
      const constrained = this.applyKeyConstraint(
        chord,
        activeKey,
        feats.chroma[chord.fi],
        originalTimeline[i - 1],
        originalTimeline[i + 1]
      );
      
      // Mark if in modulated section
      if (section && section.key.root !== primaryKey.root) {
        constrained.modulatedKey = activeKey;
        constrained.inModulation = true;
      }
      
      result.push(constrained);
    }
    
    return result;
  }
  
  /**
   * 🎼 Detect modulation sections
   * Common modulations: C→F, C→G, Am→Dm, etc.
   */
  detectModulationSections(timeline, primaryKey) {
    const sections = [];
    let currentSection = {
      key: primaryKey,
      start: 0,
      end: timeline.length - 1,
      confidence: 100
    };
    
    const windowSize = 8; // Analyze 8 chords at a time
    
    for (let i = 0; i < timeline.length - windowSize; i += 4) {
      const window = timeline.slice(i, i + windowSize);
      
      // Analyze this window
      const analysis = this.analyzeKeyWindow(window, primaryKey);
      
      if (analysis.confidence > 70 && analysis.key.root !== currentSection.key.root) {
        // Found modulation!
        console.log(`   🎵 Modulation detected at chord ${i}: ${this.noteNames[currentSection.key.root]} → ${this.noteNames[analysis.key.root]}`);
        
        // Close current section
        currentSection.end = i - 1;
        sections.push(currentSection);
        
        // Start new section
        currentSection = {
          key: analysis.key,
          start: i,
          end: timeline.length - 1,
          confidence: analysis.confidence
        };
        
        this.stats.modulationsDetected++;
      }
    }
    
    // Add final section
    sections.push(currentSection);
    
    // Merge short sections (< 4 chords)
    const merged = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const length = section.end - section.start + 1;
      
      if (length < 4 && merged.length > 0) {
        // Too short, merge with previous
        merged[merged.length - 1].end = section.end;
      } else {
        merged.push(section);
      }
    }
    
    return merged;
  }
  
  /**
   * 🎼 Analyze key for a window of chords
   */
  analyzeKeyWindow(window, primaryKey) {
    // Count chord roots
    const rootCounts = new Array(12).fill(0);
    
    for (const chord of window) {
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        rootCounts[root]++;
      }
    }
    
    // Common modulations (from primaryKey)
    const primaryRoot = primaryKey.root;
    
    const modulations = [
      { interval: 5, name: 'IV' },   // C → F (subdominant)
      { interval: 7, name: 'V' },    // C → G (dominant)
      { interval: 9, name: 'vi' },   // C → Am (relative minor)
      { interval: 10, name: 'bVII' }, // C → Bb (modal)
      { interval: 2, name: 'II' }    // C → D (secondary dominant target)
    ];
    
    let bestModulation = null;
    let bestScore = 0;
    
    for (const mod of modulations) {
      const targetRoot = this.toPc(primaryRoot + mod.interval);
      const targetKey = { root: targetRoot, minor: primaryKey.minor };
      
      // Score: how many chords fit this key?
      const diatonic = this.buildCircleOfFifths(targetKey);
      let score = 0;
      
      for (let pc = 0; pc < 12; pc++) {
        if (diatonic.includes(pc)) {
          score += rootCounts[pc] * 2; // In-scale chords
        }
      }
      
      // Check for dominant→tonic cadence in new key
      const dominant = this.toPc(targetRoot + 7);
      if (rootCounts[dominant] > 0 && rootCounts[targetRoot] > 0) {
        score += 30; // Strong evidence
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestModulation = {
          key: targetKey,
          confidence: Math.min(100, score * 2),
          name: mod.name
        };
      }
    }
    
    // Compare with staying in primary key
    const primaryDiatonic = this.buildCircleOfFifths(primaryKey);
    let primaryScore = 0;
    
    for (let pc = 0; pc < 12; pc++) {
      if (primaryDiatonic.includes(pc)) {
        primaryScore += rootCounts[pc] * 2;
      }
    }
    
    // Only modulate if new key is significantly better
    if (bestModulation && bestModulation.confidence > primaryScore * 1.3) {
      return bestModulation;
    }
    
    // Stay in primary key
    return {
      key: primaryKey,
      confidence: primaryScore,
      name: 'I'
    };
  }
  
  /**
   * 🆕 ULTIMATE Quality Detection (with Options A, B)
   */
  decorateQualitiesUltimate(timeline, feats, key, mode, bpm, decMul = 1.0) {
    if (mode === 'basic') return timeline;
    
    const out = [];
    
    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) {
        out.push(ev);
        continue;
      }
      
      // Get chroma
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
      
      // 🆕 Enhanced detection with Options A & B
      const quality = this.detectChordQualityUltimate(root, avg, mode);
      
      const rootName = this.nameSharp(root);
      let label = rootName + quality.label;
      
      // Track extensions
      if (quality.label.includes('9') || quality.label.includes('11') || quality.label.includes('13')) {
        this.stats.extensionsDetected++;
      }
      
      ev.qualityConfidence = quality.confidence;
      ev.alternatives = quality.alternatives;
      
      out.push({ ...ev, label });
    }
    
    return out;
  }
  
  /**
   * 🆕 ULTIMATE chord quality detection
   * Uses Options A (harmonic series) and B (spectral centroid)
   */
  detectChordQualityUltimate(root, avgChroma, mode) {
    const results = [];
    
    // 🆕 OPTION A: Check bass harmonic series
    const harmonicBonus = this.checkBassHarmonicSeries(avgChroma, root);
    
    // Test each template
    for (const [templateName, template] of Object.entries(this.ENHANCED_TEMPLATES)) {
      let score = 0;
      let present = 0;
      
      // Check fundamental intervals
      for (let i = 0; i < template.intervals.length; i++) {
        const interval = template.intervals[i];
        const pc = this.toPc(root + interval);
        const strength = avgChroma[pc] || 0;
        const weight = template.weights[i];
        
        score += strength * weight;
        if (strength > 0.10) present++;
      }
      
      // Check harmonics
      if (template.harmonics && mode !== 'fast') {
        for (let i = 0; i < template.harmonics.length; i++) {
          const harmonic = template.harmonics[i];
          const pc = this.toPc(root + harmonic);
          const strength = avgChroma[pc] || 0;
          score += strength * 0.4;
        }
      }
      
      // 🆕 OPTION A: Add harmonic bonus
      score += harmonicBonus * 0.3;
      
      // Normalize
      const maxScore = template.weights.reduce((sum, w) => sum + w, 0) + 0.3;
      const normalizedScore = score / maxScore;
      
      const minPresent = template.minPresence || 2;
      
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
    
    // Sort by score
    results.sort((a, b) => b.score - a.score);
    
    // Return best match
    if (results.length > 0) {
      const best = results[0];
      const isExtension = best.label.includes('9') || best.label.includes('11') || best.label.includes('13');
      const threshold = isExtension ? 0.52 : 0.42; // Slightly lower threshold with harmonic bonus
      
      if (best.score > threshold) {
        return {
          label: best.label,
          confidence: best.score,
          alternatives: results.slice(1, 3)
        };
      }
    }
    
    // 🆕 OPTION B: Use spectral centroid for major/minor
    const isMinor = this.decideMajorMinorWithCentroid(root, avgChroma);
    return {
      label: isMinor ? 'm' : '',
      confidence: 0.5,
      alternatives: []
    };
  }
  
  /**
   * 🆕 OPTION B: Decide major/minor using spectral centroid
   */
  decideMajorMinorWithCentroid(root, avgChroma) {
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    
    // If clear difference, use it
    if (major3rd > minor3rd * 1.2) return false;
    if (minor3rd > major3rd * 1.2) return true;
    
    // 🆕 If ambiguous, use spectral centroid
    const centroid = this.calculateSpectralCentroid(avgChroma);
    
    // Lower centroid = darker = minor
    // Higher centroid = brighter = major
    // Threshold: 5.5 (middle of 0-11 range)
    
    if (centroid < 5.2) return true;  // Dark = minor
    if (centroid > 5.8) return false; // Bright = major
    
    // Still ambiguous, slight preference for minor
    return minor3rd >= major3rd * 0.85;
  }
  
  /**
   * 🎹 Detect inversions
   */
  detectInversions(timeline, feats) {
    if (!feats || !feats.bassPc) return timeline;
    
    const { bassPc } = feats;
    
    return timeline.map(ev => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      const startFi = ev.fi || 0;
      const endFi = ev.endFrame || Math.min(startFi + 10, bassPc.length - 1);
      
      const bassVotes = new Array(12).fill(0);
      for (let i = startFi; i <= endFi; i++) {
        if (bassPc[i] >= 0) {
          bassVotes[bassPc[i]]++;
        }
      }
      
      let dominantBass = -1;
      let maxVotes = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (bassVotes[pc] > maxVotes) {
          maxVotes = bassVotes[pc];
          dominantBass = pc;
        }
      }
      
      if (dominantBass >= 0 && dominantBass !== root && maxVotes >= 2) {
        const bassInterval = this.toPc(dominantBass - root);
        const validIntervals = [3, 4, 7, 10, 11];
        
        if (validIntervals.includes(bassInterval)) {
          const bassNote = this.nameSharp(dominantBass);
          const inversionLabel = ev.label + '/' + bassNote;
          
          this.stats.inversionsDetected++;
          
          return {
            ...ev,
            label: inversionLabel,
            isInversion: true,
            bassNote: dominantBass
          };
        }
      }
      
      return ev;
    });
  }
  
  /**
   * 🎼 Apply key constraint (with modulation awareness)
   */
  applyKeyConstraint(chord, key, chroma, prevChord, nextChord) {
    const originalLabel = chord.label;
    const root = this.parseRoot(originalLabel);
    
    if (root < 0) return chord;
    
    const inScale = this.isInScale(originalLabel, key);
    
    if (inScale) return chord;
    
    // Exception 1: Secondary dominant
    if (this.isSecondaryDominant(originalLabel, nextChord, key)) {
      this.stats.secondaryDominants++;
      chord.isSecondaryDominant = true;
      return chord;
    }
    
    // Exception 2: Modal borrowing
    if (this.isModalBorrowing(originalLabel, key)) {
      this.stats.modalBorrowings++;
      chord.isModalBorrowing = true;
      return chord;
    }
    
    // Exception 3: Part of modulation (check if chord fits related key)
    if (this.isProbableModulation(originalLabel, prevChord, nextChord, key)) {
      console.log(`   ✅ Modulation chord: ${originalLabel}`);
      return chord;
    }
    
    // Exception 4: Slash chord
    if (originalLabel.includes('/')) {
      const [chordPart] = originalLabel.split('/');
      if (this.isInScale(chordPart, key)) {
        return chord;
      }
    }
    
    // Exception 5: Strong evidence
    const strength = this.getChordStrength(chroma, root);
    const inScaleAlt = this.findBestInScaleAlternative(root, key, chroma);
    const altStrength = this.getChordStrength(chroma, this.parseRoot(inScaleAlt));
    
    if (strength > altStrength * 1.5) {
      chord.isChromatic = true;
      return chord;
    }
    
    // Replace
    const quality = originalLabel.replace(/^[A-G](#|b)?/, '');
    const newLabel = inScaleAlt + quality;
    
    this.stats.keyConstrainedFixes++;
    chord.label = newLabel;
    chord.wasConstrained = true;
    chord.originalLabel = originalLabel;
    
    return chord;
  }
  
  /**
   * 🆕 Check if chord is part of modulation
   * C major → F major: Bb is allowed (bVII in C, but IV in F)
   * C major → G major: F# is allowed (raised IV)
   */
  isProbableModulation(chordLabel, prevChord, nextChord, primaryKey) {
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    // Common modulation targets
    const modulationTargets = [
      { interval: 5, name: 'IV' },   // C → F
      { interval: 7, name: 'V' },    // C → G
      { interval: 10, name: 'bVII' } // C → Bb
    ];
    
    for (const target of modulationTargets) {
      const targetRoot = this.toPc(primaryKey.root + target.interval);
      const targetKey = { root: targetRoot, minor: primaryKey.minor };
      
      // Check if this chord fits the target key
      if (this.isInScale(chordLabel, targetKey)) {
        // Check if surrounding chords support this modulation
        const contextFits = 
          (prevChord && this.isInScale(prevChord.label, targetKey)) ||
          (nextChord && this.isInScale(nextChord.label, targetKey));
        
        if (contextFits) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  isSecondaryDominant(chordLabel, nextChord, key) {
    if (!nextChord) return false;
    if (!chordLabel.includes('7') || chordLabel.includes('maj7') || chordLabel.includes('m7')) return false;
    
    const root = this.parseRoot(chordLabel);
    const nextRoot = this.parseRoot(nextChord.label);
    
    if (root < 0 || nextRoot < 0) return false;
    
    const interval = this.toPc(nextRoot - root);
    
    if (interval === 5 || interval === 6) {
      if (this.isInScale(nextChord.label, key)) {
        return true;
      }
    }
    
    return false;
  }
  
  isModalBorrowing(chordLabel, key) {
    if (!chordLabel || typeof chordLabel !== 'string') return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const interval = this.toPc(root - key.root);
    const isMinor = chordLabel && typeof chordLabel === 'string' && chordLabel.match(/m(?!aj)/);
    
    if (key.minor) {
      const majorBorrows = [
        { interval: 5, major: true },
        { interval: 0, major: true },
        { interval: 7, major: true }
      ];
      return majorBorrows.some(b => b.interval === interval && !isMinor);
    } else {
      const minorBorrows = [
        { interval: 5, minor: true },
        { interval: 10, major: true },
        { interval: 8, major: true },
        { interval: 2, dim: true }
      ];
      return minorBorrows.some(b => {
        if (b.dim) return interval === b.interval && chordLabel.includes('dim');
        if (b.minor) return interval === b.interval && isMinor;
        return interval === b.interval && !isMinor;
      });
    }
  }
  
  isInScale(chordLabel, key) {
    if (!chordLabel || !key) return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const diatonicChords = this.getDiatonicChords(
      this.noteNames[key.root],
      key.minor ? 'minor' : 'major'
    );
    
    const normalized = chordLabel.replace(/maj7|7|sus4|sus2|add9|6|9|11|13/g, '');
    
    return diatonicChords.some(dc => {
      const dcNormalized = dc.replace(/maj7|7|sus4|sus2|add9|6|9|11|13/g, '');
      return normalized === dcNormalized || normalized.startsWith(dcNormalized);
    });
  }
  
  buildCircleOfFifths(key) {
    if (!key) return [0, 2, 4, 5, 7, 9, 11];
    if (key.minor) return [0, 2, 3, 5, 7, 8, 10];
    else return [0, 2, 4, 5, 7, 9, 11];
  }
  
  getDiatonicChords(tonic, mode) {
    const tonicRoot = this.parseRoot(tonic);
    if (tonicRoot < 0) return [];
    
    const chords = [];
    
    if (mode === 'major') {
      const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
      const scale = [0, 2, 4, 5, 7, 9, 11];
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        chords.push(this.noteNames[root] + qualities[i]);
      }
    } else {
      const qualities = ['m', 'dim', '', 'm', 'm', '', ''];
      const scale = [0, 2, 3, 5, 7, 8, 10];
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        chords.push(this.noteNames[root] + qualities[i]);
      }
    }
    
    return chords;
  }
  
  getChordStrength(chroma, root) {
    if (!chroma || root < 0) return 0;
    
    const rootStrength = chroma[root % 12];
    const thirdMajor = chroma[(root + 4) % 12];
    const thirdMinor = chroma[(root + 3) % 12];
    const fifth = chroma[(root + 7) % 12];
    
    return (rootStrength + Math.max(thirdMajor, thirdMinor) + fifth) / 3;
  }
  
  findBestInScaleAlternative(root, key, chroma) {
    const scale = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const interval = this.toPc(root - key.root);
    
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
  
  boostConfidence(timeline, key, feats) {
    let totalBoost = 0;
    let count = 0;
    
    timeline.forEach((chord, i) => {
      let boost = 0;
      const baseConfidence = chord.confidence || 50;
      
      if (this.isInScale(chord.label, key)) boost += 15;
      else boost -= 10;
      
      if (i > 0) {
        const prevChord = timeline[i - 1];
        if (this.isCommonProgression(prevChord.label, chord.label, key)) boost += 12;
      }
      
      if (i < timeline.length - 1) {
        const nextChord = timeline[i + 1];
        if (this.isCommonProgression(chord.label, nextChord.label, key)) boost += 10;
      }
      
      if (chord.bassAmplitude && chord.bassAmplitude > 0.7) boost += 15;
      else if (chord.bassAmplitude && chord.bassAmplitude < 0.4) boost -= 8;
      
      const chromaMatch = this.checkChromaMatch(chord, feats.chroma);
      if (chromaMatch > 0.75) boost += 10;
      else if (chromaMatch < 0.5) boost -= 5;
      
      if (chord.duration && chord.duration > 2.0) boost += 8;
      
      chord.confidence = Math.min(98, Math.max(20, baseConfidence + boost));
      chord.confidenceBoost = boost;
      
      totalBoost += boost;
      count++;
    });
    
    this.stats.avgConfidenceBoost = count > 0 ? totalBoost / count : 0;
    return timeline;
  }
  
  temporalSmoothing(timeline, key) {
    for (let i = 1; i < timeline.length - 1; i++) {
      const prev = timeline[i - 1];
      const curr = timeline[i];
      const next = timeline[i + 1];
      
      const isOutlier = 
        !this.isInScale(curr.label, key) &&
        this.isInScale(prev.label, key) &&
        this.isInScale(next.label, key) &&
        (curr.confidence || 50) < 70;
      
      if (isOutlier) {
        if (this.isCommonProgression(prev.label, next.label, key)) {
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
  
  isCommonProgression(chord1Label, chord2Label, key) {
    const root1 = this.parseRoot(chord1Label);
    const root2 = this.parseRoot(chord2Label);
    
    if (root1 < 0 || root2 < 0) return false;
    
    const interval1 = this.toPc(root1 - key.root);
    const interval2 = this.toPc(root2 - key.root);
    
    const COMMON_PROGRESSIONS = {
      major: [[0, 5], [0, 3], [3, 4], [4, 0], [0, 9], [9, 3], [3, 0], [5, 3], [2, 4], [4, 9], [9, 2], [2, 5]],
      minor: [[0, 7], [0, 5], [5, 7], [7, 0], [0, 3], [3, 7], [10, 0], [5, 0], [8, 0], [0, 8]]
    };
    
    const progressions = key.minor ? COMMON_PROGRESSIONS.minor : COMMON_PROGRESSIONS.major;
    return progressions.some(([a, b]) => a === interval1 && b === interval2);
  }
  
  checkChromaMatch(chord, chromaArray) {
    if (!chord.fi || !chromaArray || chord.fi >= chromaArray.length) return 0.5;
    
    const chroma = chromaArray[chord.fi];
    if (!chroma) return 0.5;
    
    const root = this.parseRoot(chord.label);
    if (root < 0) return 0.5;
    
    const rootStrength = chroma[root % 12];
    const avgStrength = Array.from(chroma).reduce((a, b) => a + b, 0) / 12;
    
    return rootStrength / (avgStrength + 0.01);
  }
  
  findBetterAlternative(curr, prev, next, key) {
    const root = this.parseRoot(curr.label);
    if (root < 0) return null;
    
    const scale = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const currInterval = this.toPc(root - key.root);
    
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
    return this.nameSharp(newRoot) + (quality ? quality[2] : '');
  }
  
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
  
  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.noteNames[this.toPc(pc)]; }
  
  preprocessAudio(audioBuffer, options = {}) {
    const { filtering = false } = options;
    let x = this.mixStereo(audioBuffer);
    const sr = audioBuffer.sampleRate;
    
    if (!filtering) return { x, sr };
    
    x = this.highPassFilter(x, sr, 80);
    x = this.bandPassFilter(x, sr, 200, 5000);
    
    const threshold = this.estimateNoiseFloor(x) * 1.5;
    x = x.map(val => Math.abs(val) < threshold ? 0 : val);
    
    return { x, sr };
  }
  
  highPassFilter(x, sr, cutoff) {
    const RC = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / sr;
    const alpha = RC / (RC + dt);
    const y = new Float32Array(x.length);
    y[0] = x[0];
    for (let i = 1; i < x.length; i++) y[i] = alpha * (y[i-1] + x[i] - x[i-1]);
    return y;
  }
  
  bandPassFilter(x, sr, lowCutoff, highCutoff) {
    let y = this.highPassFilter(x, sr, lowCutoff);
    y = this.lowPassFilter(y, sr, highCutoff);
    return y;
  }
  
  lowPassFilter(x, sr, cutoff) {
    const RC = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / sr;
    const alpha = dt / (RC + dt);
    const y = new Float32Array(x.length);
    y[0] = x[0];
    for (let i = 1; i < x.length; i++) y[i] = y[i-1] + alpha * (x[i] - y[i-1]);
    return y;
  }
  
  estimateNoiseFloor(x) {
    const sorted = Array.from(x).map(Math.abs).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.1)];
  }
  
  mixStereo(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) * 0.5;
    return mono;
  }
  
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
  
  getStats() { return this.stats; }
  
  classifyOrnamentsByDuration(tl, bpm) {
    return super.classifyOrnamentsByDuration(tl, bpm);
  }
  
  buildTransitionMatrix() {
    const matrix = [];
    for (let i = 0; i < 12; i++) matrix[i] = new Array(12).fill(0.005);
    
    for (let from = 0; from < 12; from++) {
      matrix[from][from] = 0.30;
      matrix[from][(from + 7) % 12] = 0.25;
      matrix[from][(from + 5) % 12] = 0.18;
      matrix[from][(from + 2) % 12] = 0.12;
      matrix[from][(from + 9) % 12] = 0.08;
      matrix[from][(from + 4) % 12] = 0.04;
      matrix[from][(from + 10) % 12] = 0.02;
      matrix[from][(from + 1) % 12] = 0.005;
      matrix[from][(from + 11) % 12] = 0.005;
      matrix[from][(from + 6) % 12] = 0.003;
    }
    
    for (let i = 0; i < 12; i++) {
      const sum = matrix[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < 12; j++) matrix[i][j] /= sum;
    }
    
    return matrix;
  }
  
  viterbiSmoothing(timeline, key) {
    if (!timeline || timeline.length < 3) return timeline;
    
    const n = timeline.length;
    const observations = timeline.map(ch => this.parseRoot(ch.label));
    const V = [];
    const path = [];
    
    V[0] = {};
    path[0] = {};
    
    for (let state = 0; state < 12; state++) {
      const obs = observations[0];
      const emission = this.getEmissionProb(state, obs, timeline[0]);
      V[0][state] = Math.log(emission);
      path[0][state] = null;
    }
    
    for (let t = 1; t < n; t++) {
      V[t] = {};
      path[t] = {};
      
      for (let currState = 0; currState < 12; currState++) {
        let maxProb = -Infinity;
        let bestPrev = 0;
        
        for (let prevState = 0; prevState < 12; prevState++) {
          const transProb = Math.log(this.transitionMatrix[prevState][currState] + 1e-10);
          const prob = V[t-1][prevState] + transProb;
          if (prob > maxProb) {
            maxProb = prob;
            bestPrev = prevState;
          }
        }
        
        const obs = observations[t];
        const emission = this.getEmissionProb(currState, obs, timeline[t]);
        V[t][currState] = maxProb + Math.log(emission + 1e-10);
        path[t][currState] = bestPrev;
      }
    }
    
    const bestPath = new Array(n);
    let maxFinalProb = -Infinity;
    let bestFinalState = 0;
    
    for (let state = 0; state < 12; state++) {
      if (V[n-1][state] > maxFinalProb) {
        maxFinalProb = V[n-1][state];
        bestFinalState = state;
      }
    }
    
    bestPath[n-1] = bestFinalState;
    for (let t = n-2; t >= 0; t--) bestPath[t] = path[t+1][bestPath[t+1]];
    
    const smoothed = [];
    let changes = 0;
    
    for (let i = 0; i < n; i++) {
      const originalRoot = observations[i];
      const viterbiRoot = bestPath[i];
      const chord = { ...timeline[i] };
      
      const shouldChange = 
        viterbiRoot !== originalRoot &&
        (chord.confidence || 50) < 70 &&
        this.transitionMatrix[i > 0 ? bestPath[i-1] : viterbiRoot][viterbiRoot] > 0.05;
      
      if (shouldChange) {
        const quality = chord.label.replace(/^[A-G][#b]?/, '');
        chord.label = this.nameSharp(viterbiRoot) + quality;
        chord.confidence = Math.min(85, (chord.confidence || 50) + 15);
        chord.viterbiCorrected = true;
        changes++;
      }
      
      smoothed.push(chord);
    }
    
    if (changes > 0) console.log(`🎼 Viterbi: corrected ${changes}/${n} chords`);
    return smoothed;
  }
  
  getEmissionProb(state, observation, chord) {
    if (state === observation) return 0.9;
    const dist = Math.min(Math.abs(state - observation), 12 - Math.abs(state - observation));
    if (dist <= 1) return 0.5;
    if (dist === 5 || dist === 7) return 0.3;
    return 0.1 / (dist + 1);
  }
}

console.log('✅ ChordEngine Pro ULTIMATE (v2.2.0) loaded!');
console.log('🎵 ALL OPTIONS ENABLED: Harmonic Series, Spectral Centroid, Rhythmic Patterns, Modulation Detection');
