/**
 * 🎸 ChordEngine Pro - Musical Intelligence Edition
 * 
 * Enhanced version with improved musical logic:
 * - Better tonic detection using cadences and harmonic weight
 * - Smarter key detection with multiple validation methods
 * - Improved secondary dominant and modal borrowing detection
 * - Better handling of chord inversions
 * - More accurate confidence scoring based on musical context
 * 
 * @requires chord-engine.js (must be loaded first!)
 * @version 3.0.0
 * @author Alon - Improved Musical Logic
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
      highConfidence: 0,
      corrected: 0,
      avgConfidenceBoost: 0,
      temporalFixes: 0,
      keyConstrainedFixes: 0,
      secondaryDominants: 0,
      modalBorrowings: 0,
      tonicConfidence: 0
    };
    
    // 🎼 HMM: Build transition probability matrix
    this.transitionMatrix = this.buildTransitionMatrix();
    console.log('🎼 HMM transition matrix initialized');
    
    // Common chord progressions for validation
    this.COMMON_PROGRESSIONS = {
      // Major key (intervals from tonic)
      major: [
        [0, 5, 25],    // I → IV (very common)
        [0, 7, 30],    // I → V (extremely common)
        [5, 7, 20],    // IV → V (plagal approach)
        [7, 0, 35],    // V → I (authentic cadence - strongest!)
        [0, 9, 18],    // I → vi (deceptive intro)
        [9, 5, 15],    // vi → IV
        [5, 0, 12],    // IV → I (plagal cadence)
        [7, 5, 8],     // V → IV (less common)
        [2, 7, 22],    // ii → V (strong pre-dominant)
        [7, 9, 10],    // V → vi (deceptive cadence)
        [9, 2, 14],    // vi → ii
        [2, 5, 12],    // ii → IV
        [4, 7, 16],    // iii → V
        [9, 4, 8],     // vi → iii
      ],
      // Minor key (intervals from tonic)
      minor: [
        [0, 7, 28],    // i → v/V (very common)
        [0, 5, 22],    // i → iv/IV
        [5, 7, 18],    // iv → v
        [7, 0, 32],    // v/V → i (authentic cadence)
        [0, 3, 20],    // i → III (relative major)
        [3, 7, 15],    // III → v
        [10, 0, 25],   // VII → i (leading tone)
        [5, 0, 14],    // iv → i (plagal)
        [8, 0, 12],    // VI → i
        [0, 8, 16],    // i → VI
        [2, 7, 18],    // ii° → V (diminished pre-dominant)
        [8, 5, 10],    // VI → iv
      ]
    };
    
    // 🎯 Cadence patterns with weights
    this.CADENCE_PATTERNS = {
      perfect: { interval: 7, weight: 40, type: 'V→I' },      // Strongest resolution
      plagal: { interval: 5, weight: 25, type: 'IV→I' },      // Amen cadence
      deceptive: { interval: 9, weight: 15, type: 'V→vi' },   // Surprise resolution
      halfCadence: { interval: -7, weight: 20, type: 'X→V' }, // Ends on V
    };
  }
  
  /**
   * 🎯 Main detection with improved musical intelligence
   */
  async detect(audioBuffer, options = {}) {
    const mode = options.mode || this.currentMode;
    const bpm = options.bpm || 120;
    const harmonyMode = options.harmonyMode || 'pro';
    
    console.log(`🎼 ChordEngine Pro v3.0: ${mode} mode (Musical Intelligence)`);
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
      tonicConfidence: 0
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
    
    // 3️⃣ Feature extraction
    const feats = super.extractFeatures({ x, sr }, bpm);
    
    // 3.5️⃣ Onset detection for beat tracking
    console.log('🥁 Detecting onsets...');
    const onsets = this.detectOnsets(x, sr);
    feats.onsets = onsets;
    
    // 3.6️⃣ BPM estimation
    let estimatedBPM = bpm;
    if (!options.bpm && onsets.length > 0) {
      estimatedBPM = this.estimateBPMFromOnsets(onsets, x.length / sr);
      console.log(`🎵 BPM estimated: ${estimatedBPM}`);
    }
    
    // 3.7️⃣ Generate beat grid
    const duration = x.length / sr;
    const beatGrid = this.generateBeatGrid(duration, estimatedBPM, onsets);
    console.log(`🎼 Beat grid: ${beatGrid.length} beats`);
    
    // 4️⃣ Initial chord detection (bass-agnostic)
    console.log('🎸 Initial bass-driven detection...');
    let timeline = super.buildChordsFromBass(feats, { root: -1, minor: false }, estimatedBPM);
    console.log(`   Found ${timeline.length} initial chords`);
    
    // 5️⃣ IMPROVED Key detection with validation
    console.log('🎹 Detecting key with multiple methods...');
    const key = this.detectKeyRobust(feats.chroma, timeline);
    console.log(`   Key: ${this.noteNames[key.root]}${key.minor ? 'm' : ''} (confidence: ${(key.confidence * 100).toFixed(0)}%)`);
    
    // Display Circle of Fifths
    const keyTonic = this.noteNames[key.root];
    const keyMode = key.minor ? 'minor' : 'major';
    const diatonicChords = this.getDiatonicChords(keyTonic, keyMode);
    console.log(`🎼 Circle of Fifths: [${diatonicChords.join(', ')}]`);
    
    // Store key
    this.currentKey = key;
    
    // 6️⃣ Re-detect with KEY CONSTRAINTS
    console.log('🎸 Re-detecting with key constraints...');
    timeline = this.buildChordsFromBassConstrained(feats, key, estimatedBPM);
    
    // 7️⃣ IMPROVED Tonic Detection using cadences and harmonic analysis
    console.log('🎯 Detecting tonic...');
    const tonicInfo = this.detectTonicAdvanced(timeline, key, duration);
    console.log(`   Tonic: ${tonicInfo.label} (confidence: ${tonicInfo.confidence.toFixed(0)}%)`);
    console.log(`   Evidence: ${tonicInfo.evidence.join(', ')}`);
    
    this.stats.tonicConfidence = tonicInfo.confidence;
    
    // Update key if tonic detection suggests different root
    if (tonicInfo.root !== key.root && tonicInfo.confidence > 75) {
      console.log(`🔄 Updating key based on strong tonic evidence`);
      key.root = tonicInfo.root;
      key.confidence = Math.max(key.confidence, tonicInfo.confidence / 100);
      this.currentKey = key;
    }
    
    // 8️⃣ Ensure tonic chord at beginning if needed
    if (timeline.length === 0 || (timeline.length < 3 && duration > 30)) {
      const tonicLabel = tonicInfo.label;
      timeline.unshift({
        t: 0,
        label: tonicLabel,
        fi: 0,
        endFrame: Math.min(10, feats.chroma.length),
        avgChroma: feats.chroma[0] || new Float32Array(12),
        ornamentType: 'structural',
        confidence: tonicInfo.confidence,
        isTonic: true,
        words: []
      });
    }
    
    // 9️⃣ Decoration with improved harmonic analysis
    console.log('🎨 Decorating with qualities...');
    const decorated = this.decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, 1.0);
    
    // 9.5️⃣ Classify structural vs ornamental
    console.log('🎨 Classifying by duration and harmonic function...');
    const classified = this.classifyOrnamentsByDuration(decorated, estimatedBPM);
    
    // Further classify by harmonic function
    const functionallyClassified = this.classifyByHarmonicFunction(classified, key);
    
    const structuralCount = functionallyClassified.filter(c => c.ornamentType === 'structural').length;
    const ornamentCount = functionallyClassified.filter(c => c.ornamentType !== 'structural').length;
    console.log(`   - Structural: ${structuralCount}, Ornaments: ${ornamentCount}`);
    
    // 🔟 Confidence Boosting (in Accurate mode)
    let final = functionallyClassified;
    
    if (mode === this.MODE.ACCURATE) {
      console.log('✨ Boosting confidence with musical context...');
      final = this.boostConfidenceMusical(final, key, feats, tonicInfo);
      
      console.log('🔧 Temporal smoothing with harmonic logic...');
      final = this.temporalSmoothingMusical(final, key);
      
      console.log('🎼 HMM/Viterbi smoothing...');
      final = this.viterbiSmoothing(final, key);
      
      console.log('⚡ Quantizing to beat grid...');
      final = this.quantizeChordsToBeats(final, beatGrid, 0.15);
    }
    
    // Mark tonic occurrences
    final = this.markTonicOccurrences(final, tonicInfo);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Calculate stats
    this.stats.totalChords = final.length;
    this.stats.highConfidence = final.filter(c => (c.confidence || 50) > 80).length;
    const avgConfidence = final.reduce((sum, c) => sum + (c.confidence || 50), 0) / final.length;
    
    console.log(`✅ Detection complete in ${elapsed}s: ${final.length} chords`);
    console.log(`📊 Stats:`);
    console.log(`   - High confidence: ${this.stats.highConfidence}/${this.stats.totalChords} (${((this.stats.highConfidence/this.stats.totalChords)*100).toFixed(0)}%)`);
    console.log(`   - Tonic confidence: ${this.stats.tonicConfidence.toFixed(0)}%`);
    console.log(`   - Key-constrained fixes: ${this.stats.keyConstrainedFixes}`);
    console.log(`   - Secondary dominants: ${this.stats.secondaryDominants}`);
    console.log(`   - Modal borrowings: ${this.stats.modalBorrowings}`);
    console.log(`   - Corrected: ${this.stats.corrected}`);
    console.log(`   - Temporal fixes: ${this.stats.temporalFixes}`);
    
    return {
      chords: final,
      key: key,
      tonic: tonicInfo,
      bpm: estimatedBPM,
      mode: this.detectMode(feats, key),
      stats: {
        processingTime: elapsed,
        avgConfidence: avgConfidence.toFixed(1),
        highConfidenceRate: ((this.stats.highConfidence/this.stats.totalChords)*100).toFixed(0) + '%',
        tonicConfidence: this.stats.tonicConfidence.toFixed(0) + '%',
        keyConstrainedFixes: this.stats.keyConstrainedFixes,
        secondaryDominants: this.stats.secondaryDominants,
        modalBorrowings: this.stats.modalBorrowings,
        corrected: this.stats.corrected,
        temporalFixes: this.stats.temporalFixes
      }
    };
  }
  
  /**
   * 🎹 IMPROVED Key Detection - Multiple methods with validation
   */
  detectKeyRobust(chromaArray, timeline) {
    console.log('🔍 Running multiple key detection algorithms...');
    
    // Method 1: Krumhansl-Schmuckler (original)
    const ksKey = super.estimateKey(chromaArray);
    console.log(`   [1] K-S Algorithm: ${this.noteNames[ksKey.root]}${ksKey.minor ? 'm' : ''} (${(ksKey.confidence * 100).toFixed(0)}%)`);
    
    // Method 2: Strongest chroma peaks
    const peaksKey = this.detectKeyByPeaks(chromaArray);
    console.log(`   [2] Chroma Peaks: ${this.noteNames[peaksKey.root]}${peaksKey.minor ? 'm' : ''} (${(peaksKey.confidence * 100).toFixed(0)}%)`);
    
    // Method 3: Chord progression analysis
    const progKey = this.detectKeyByProgressions(timeline);
    console.log(`   [3] Progressions: ${this.noteNames[progKey.root]}${progKey.minor ? 'm' : ''} (${(progKey.confidence * 100).toFixed(0)}%)`);
    
    // Weighted voting
    const candidates = [
      { ...ksKey, weight: 0.40 },
      { ...peaksKey, weight: 0.30 },
      { ...progKey, weight: 0.30 }
    ];
    
    // Vote by root note
    const votes = {};
    candidates.forEach(c => {
      const keyStr = `${c.root}-${c.minor}`;
      if (!votes[keyStr]) {
        votes[keyStr] = { root: c.root, minor: c.minor, score: 0 };
      }
      votes[keyStr].score += c.confidence * c.weight;
    });
    
    // Find winner
    let bestKey = null;
    let bestScore = 0;
    
    Object.values(votes).forEach(v => {
      if (v.score > bestScore) {
        bestScore = v.score;
        bestKey = v;
      }
    });
    
    const finalKey = {
      root: bestKey.root,
      minor: bestKey.minor,
      confidence: bestScore
    };
    
    console.log(`   ✅ Final: ${this.noteNames[finalKey.root]}${finalKey.minor ? 'm' : ''} (consensus: ${(bestScore * 100).toFixed(0)}%)`);
    
    return finalKey;
  }
  
  /**
   * 🎵 Detect key by analyzing strongest chroma peaks
   */
  detectKeyByPeaks(chromaArray) {
    if (!chromaArray || chromaArray.length === 0) {
      return { root: 0, minor: false, confidence: 0.3 };
    }
    
    // Average chromagram
    const avgChroma = new Float32Array(12);
    chromaArray.forEach(frame => {
      for (let i = 0; i < 12; i++) {
        avgChroma[i] += frame[i];
      }
    });
    
    for (let i = 0; i < 12; i++) {
      avgChroma[i] /= chromaArray.length;
    }
    
    // Find strongest note (likely tonic or dominant)
    let maxVal = 0;
    let maxIdx = 0;
    
    for (let i = 0; i < 12; i++) {
      if (avgChroma[i] > maxVal) {
        maxVal = avgChroma[i];
        maxIdx = i;
      }
    }
    
    // Check if major or minor by looking at third
    const majorThird = avgChroma[(maxIdx + 4) % 12];
    const minorThird = avgChroma[(maxIdx + 3) % 12];
    const isMinor = minorThird > majorThird;
    
    // Calculate confidence based on peak strength
    const avgStrength = Array.from(avgChroma).reduce((a, b) => a + b, 0) / 12;
    const confidence = Math.min(0.95, maxVal / (avgStrength * 2));
    
    return {
      root: maxIdx,
      minor: isMinor,
      confidence: confidence
    };
  }
  
  /**
   * 🎼 Detect key by analyzing chord progressions
   */
  detectKeyByProgressions(timeline) {
    if (!timeline || timeline.length < 3) {
      return { root: 0, minor: false, confidence: 0.2 };
    }
    
    // Count chord occurrences and durations
    const chordStats = {};
    
    timeline.forEach(chord => {
      const root = this.parseRoot(chord.label);
      if (root < 0) return;
      
      const isMinor = chord.label && chord.label.match(/m(?!aj)/);
      const duration = chord.duration || 1.0;
      
      if (!chordStats[root]) {
        chordStats[root] = { major: 0, minor: 0, totalDuration: 0 };
      }
      
      if (isMinor) {
        chordStats[root].minor += duration;
      } else {
        chordStats[root].major += duration;
      }
      chordStats[root].totalDuration += duration;
    });
    
    // Find most prominent chord
    let maxDuration = 0;
    let tonicCandidate = 0;
    let isMajor = true;
    
    Object.entries(chordStats).forEach(([root, stats]) => {
      if (stats.totalDuration > maxDuration) {
        maxDuration = stats.totalDuration;
        tonicCandidate = parseInt(root);
        isMajor = stats.major > stats.minor;
      }
    });
    
    // Calculate confidence
    const totalDuration = Object.values(chordStats).reduce((sum, s) => sum + s.totalDuration, 0);
    const confidence = Math.min(0.9, maxDuration / totalDuration);
    
    return {
      root: tonicCandidate,
      minor: !isMajor,
      confidence: confidence
    };
  }
  
  /**
   * 🎯 ADVANCED Tonic Detection using multiple musical heuristics
   */
  detectTonicAdvanced(timeline, key, duration) {
    console.log('🔍 Analyzing tonic with multiple methods...');
    
    const evidence = [];
    let tonicRoot = key.root;
    let confidenceScore = 0;
    
    // Method 1: Find cadences (V→I, IV→I)
    const cadences = this.findCadencesWeighted(timeline, key);
    if (cadences.length > 0) {
      const cadenceMap = {};
      cadences.forEach(cad => {
        const targetRoot = this.parseRoot(cad.target);
        if (targetRoot >= 0) {
          if (!cadenceMap[targetRoot]) cadenceMap[targetRoot] = 0;
          cadenceMap[targetRoot] += cad.weight;
        }
      });
      
      // Find most common cadence target
      let maxWeight = 0;
      let cadenceTonic = -1;
      Object.entries(cadenceMap).forEach(([root, weight]) => {
        if (weight > maxWeight) {
          maxWeight = weight;
          cadenceTonic = parseInt(root);
        }
      });
      
      if (cadenceTonic >= 0) {
        tonicRoot = cadenceTonic;
        confidenceScore += 35;
        evidence.push(`cadences (${cadences.length}×, +35%)`);
        console.log(`   ✓ Cadences point to: ${this.noteNames[tonicRoot]}`);
      }
    }
    
    // Method 2: First and last chords (strong indicators)
    if (timeline.length > 0) {
      const firstRoot = this.parseRoot(timeline[0].label);
      const lastRoot = this.parseRoot(timeline[timeline.length - 1].label);
      
      if (firstRoot === lastRoot && firstRoot >= 0) {
        confidenceScore += 25;
        evidence.push('first=last (+25%)');
        console.log(`   ✓ First and last chord: ${this.noteNames[firstRoot]}`);
        
        if (tonicRoot !== firstRoot && confidenceScore < 40) {
          tonicRoot = firstRoot;
        }
      } else if (firstRoot >= 0) {
        confidenceScore += 12;
        evidence.push('opening (+12%)');
      }
    }
    
    // Method 3: Most frequent chord (by duration)
    const durationMap = {};
    timeline.forEach(chord => {
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        if (!durationMap[root]) durationMap[root] = 0;
        durationMap[root] += chord.duration || 1.0;
      }
    });
    
    let maxDur = 0;
    let mostFreqRoot = -1;
    Object.entries(durationMap).forEach(([root, dur]) => {
      if (dur > maxDur) {
        maxDur = dur;
        mostFreqRoot = parseInt(root);
      }
    });
    
    if (mostFreqRoot >= 0) {
      const durRatio = maxDur / duration;
      const durConfidence = Math.min(20, durRatio * 40);
      confidenceScore += durConfidence;
      evidence.push(`duration (${(durRatio * 100).toFixed(0)}%, +${durConfidence.toFixed(0)}%)`);
      console.log(`   ✓ Most frequent: ${this.noteNames[mostFreqRoot]} (${(durRatio * 100).toFixed(0)}%)`);
      
      if (tonicRoot !== mostFreqRoot && confidenceScore < 30) {
        tonicRoot = mostFreqRoot;
      }
    }
    
    // Method 4: Key center from harmonic analysis
    if (tonicRoot === key.root) {
      confidenceScore += 15;
      evidence.push('matches key (+15%)');
    }
    
    // Cap confidence at 95%
    confidenceScore = Math.min(95, confidenceScore);
    
    const tonicLabel = this.noteNames[tonicRoot] + (key.minor ? 'm' : '');
    
    return {
      label: tonicLabel,
      root: tonicRoot,
      confidence: confidenceScore,
      evidence: evidence
    };
  }
  
  /**
   * 🎵 Find cadences with weighted importance
   */
  findCadencesWeighted(timeline, key) {
    if (!timeline || timeline.length < 2) return [];
    
    const cadences = [];
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      
      if (!curr.label || !next.label) continue;
      
      const currRoot = this.parseRoot(curr.label);
      const nextRoot = this.parseRoot(next.label);
      
      if (currRoot < 0 || nextRoot < 0) continue;
      
      const interval = this.toPc(nextRoot - currRoot);
      
      // Check against cadence patterns
      let cadenceType = null;
      let weight = 0;
      
      // Perfect cadence V→I (strongest)
      if (interval === 7 || interval === 5) {
        const isDominant7 = /7(?!maj)/.test(curr.label);
        if (interval === 7 && isDominant7) {
          cadenceType = 'perfect-strong';
          weight = 40;
        } else if (interval === 7) {
          cadenceType = 'perfect';
          weight = 30;
        } else if (interval === 5) {
          cadenceType = 'plagal';
          weight = 25;
        }
      }
      
      // Deceptive cadence V→vi
      if (interval === 9 || interval === 10) {
        const isDominant = /7(?!maj)/.test(curr.label);
        if (isDominant) {
          cadenceType = 'deceptive';
          weight = 15;
        }
      }
      
      if (cadenceType) {
        cadences.push({
          source: curr.label,
          target: next.label,
          type: cadenceType,
          weight: weight,
          time: next.t
        });
        
        console.log(`   🎵 ${cadenceType} cadence: ${curr.label} → ${next.label} (weight: ${weight})`);
      }
    }
    
    return cadences;
  }
  
  /**
   * 🎨 Classify chords by harmonic function (not just duration)
   */
  classifyByHarmonicFunction(timeline, key) {
    return timeline.map((chord, i) => {
      const root = this.parseRoot(chord.label);
      if (root < 0) return chord;
      
      const interval = this.toPc(root - key.root);
      
      // Check if it's a strong harmonic function chord
      const isTonic = interval === 0;
      const isDominant = interval === 7;
      const isSubdominant = interval === 5;
      
      // Check if it resolves to important chord
      const nextChord = timeline[i + 1];
      let resolvesToImportant = false;
      
      if (nextChord) {
        const nextRoot = this.parseRoot(nextChord.label);
        if (nextRoot >= 0) {
          const nextInterval = this.toPc(nextRoot - key.root);
          resolvesToImportant = [0, 5, 7].includes(nextInterval);
        }
      }
      
      // Upgrade to structural if:
      // 1. It's T, D, or S function
      // 2. It resolves to an important chord
      // 3. It's at a phrase boundary (every ~4 bars)
      
      const isHarmonicallyImportant = isTonic || isDominant || isSubdominant;
      const atPhraseBoundary = i % 8 === 0 || i === timeline.length - 1;
      
      if (chord.ornamentType !== 'structural' && 
          (isHarmonicallyImportant || resolvesToImportant || atPhraseBoundary)) {
        chord.ornamentType = 'structural';
        chord.harmonicFunction = isTonic ? 'tonic' : isDominant ? 'dominant' : isSubdominant ? 'subdominant' : 'other';
      }
      
      return chord;
    });
  }
  
  /**
   * 🔖 Mark tonic occurrences in timeline
   */
  markTonicOccurrences(timeline, tonicInfo) {
    return timeline.map(chord => {
      const root = this.parseRoot(chord.label);
      if (root === tonicInfo.root) {
        chord.isTonic = true;
        chord.harmonicFunction = 'tonic';
      }
      return chord;
    });
  }
  
  /**
   * ✨ IMPROVED Confidence Boosting with musical context
   */
  boostConfidenceMusical(timeline, key, feats, tonicInfo) {
    let totalBoost = 0;
    let count = 0;
    
    timeline.forEach((chord, i) => {
      let boost = 0;
      const baseConfidence = chord.confidence || 50;
      
      // Factor 1: Is it the tonic?
      if (chord.isTonic) {
        boost += 20;
      }
      
      // Factor 2: Is chord in scale? (diatonic)
      if (this.isInScale(chord.label, key)) {
        boost += 15;
      } else {
        boost -= 10; // Penalty for non-diatonic
      }
      
      // Factor 3: Common progression with previous chord (WEIGHTED)
      if (i > 0) {
        const prevChord = timeline[i - 1];
        const progWeight = this.getProgressionWeight(prevChord.label, chord.label, key);
        if (progWeight > 15) {
          boost += progWeight * 0.6; // Scale down to reasonable boost
        }
      }
      
      // Factor 4: Common progression with next chord (WEIGHTED)
      if (i < timeline.length - 1) {
        const nextChord = timeline[i + 1];
        const progWeight = this.getProgressionWeight(chord.label, nextChord.label, key);
        if (progWeight > 15) {
          boost += progWeight * 0.5;
        }
      }
      
      // Factor 5: Bass strength
      if (chord.bassAmplitude && chord.bassAmplitude > 0.7) {
        boost += 15;
      } else if (chord.bassAmplitude && chord.bassAmplitude < 0.4) {
        boost -= 8;
      }
      
      // Factor 6: Harmonic consistency
      const chromaMatch = this.checkChromaMatch(chord, feats.chroma);
      if (chromaMatch > 0.75) {
        boost += 10;
      } else if (chromaMatch < 0.5) {
        boost -= 5;
      }
      
      // Factor 7: Duration (longer = more confident)
      if (chord.duration && chord.duration > 2.0) {
        boost += 8;
      } else if (chord.duration && chord.duration < 0.5) {
        boost -= 5;
      }
      
      // Factor 8: Structural chords get boost
      if (chord.ornamentType === 'structural') {
        boost += 10;
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
   * 🎵 Get progression weight from lookup table
   */
  getProgressionWeight(chord1Label, chord2Label, key) {
    const root1 = this.parseRoot(chord1Label);
    const root2 = this.parseRoot(chord2Label);
    
    if (root1 < 0 || root2 < 0) return 0;
    
    const interval1 = this.toPc(root1 - key.root);
    const interval2 = this.toPc(root2 - key.root);
    
    const progressions = key.minor ? 
      this.COMMON_PROGRESSIONS.minor : 
      this.COMMON_PROGRESSIONS.major;
    
    const match = progressions.find(([a, b]) => a === interval1 && b === interval2);
    return match ? match[2] : 0;
  }
  
  /**
   * 🔧 IMPROVED Temporal smoothing with musical logic
   */
  temporalSmoothingMusical(timeline, key) {
    for (let i = 1; i < timeline.length - 1; i++) {
      const prev = timeline[i - 1];
      const curr = timeline[i];
      const next = timeline[i + 1];
      
      // Check if current chord is an outlier
      const isOutlier = 
        !this.isInScale(curr.label, key) &&
        this.isInScale(prev.label, key) &&
        this.isInScale(next.label, key) &&
        (curr.confidence || 50) < 70 &&
        (curr.duration || 1.0) < 1.0; // Short duration
      
      if (isOutlier) {
        // Check if prev → next makes sense without curr
        const directProgWeight = this.getProgressionWeight(prev.label, next.label, key);
        
        if (directProgWeight > 15) {
          // Try to find a better chord
          const alternative = this.findBetterAlternativeMusical(curr, prev, next, key);
          if (alternative) {
            console.log(`🔧 Fixed outlier: ${curr.label} → ${alternative} (better progression)`);
            curr.label = alternative;
            curr.confidence = 75;
            curr.wasSmoothed = true;
            this.stats.temporalFixes++;
            this.stats.corrected++;
          }
        }
      }
    }
    
    return timeline;
  }
  
  /**
   * 🔍 Find better alternative chord with musical intelligence
   */
  findBetterAlternativeMusical(curr, prev, next, key) {
    const prevRoot = this.parseRoot(prev.label);
    const nextRoot = this.parseRoot(next.label);
    
    if (prevRoot < 0 || nextRoot < 0) {
      return this.findBetterAlternative(curr, prev, next, key);
    }
    
    // Try all diatonic chords and find best fit
    const diatonicRoots = this.getDiatonicRoots(key);
    let bestAlternative = null;
    let bestScore = 0;
    
    diatonicRoots.forEach(diaRoot => {
      const score1 = this.getProgressionWeight(prev.label, this.noteNames[diaRoot], key) || 5;
      const score2 = this.getProgressionWeight(this.noteNames[diaRoot], next.label, key) || 5;
      const totalScore = score1 + score2;
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestAlternative = diaRoot;
      }
    });
    
    if (bestAlternative !== null) {
      const quality = curr.label && typeof curr.label === 'string' ? 
        curr.label.match(/^[A-G](#|b)?(.*)$/) : null;
      return this.noteNames[bestAlternative] + (quality ? quality[2] : '');
    }
    
    return this.findBetterAlternative(curr, prev, next, key);
  }
  
  /**
   * 🎵 Get diatonic roots for key
   */
  getDiatonicRoots(key) {
    const scale = key.minor ? 
      [0, 2, 3, 5, 7, 8, 10] : 
      [0, 2, 4, 5, 7, 9, 11];
    
    return scale.map(interval => this.toPc(key.root + interval));
  }
  
  /**
   * 🆕 Key-Constrained Bass-Driven Detection
   */
  buildChordsFromBassConstrained(feats, key, bpm) {
    const originalTimeline = super.buildChordsFromBass(feats, key, bpm);
    
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
    
    if (root < 0) return chord;
    
    const inScale = this.isInScale(originalLabel, key);
    
    if (inScale) {
      return chord;
    }
    
    console.log(`🔍 Checking out-of-scale chord: ${originalLabel}`);
    
    // Exception 1: Secondary dominant
    if (this.isSecondaryDominant(originalLabel, nextChord, key)) {
      console.log(`   ✅ Secondary dominant: ${originalLabel} → ${nextChord?.label}`);
      this.stats.secondaryDominants++;
      chord.isSecondaryDominant = true;
      return chord;
    }
    
    // Exception 2: Modal borrowing
    if (this.isModalBorrowing(originalLabel, key)) {
      console.log(`   ✅ Modal borrowing: ${originalLabel}`);
      this.stats.modalBorrowings++;
      chord.isModalBorrowing = true;
      return chord;
    }
    
    // Exception 3: Slash chord with in-scale root
    if (originalLabel.includes('/')) {
      const [chordPart] = originalLabel.split('/');
      if (this.isInScale(chordPart, key)) {
        console.log(`   ✅ Slash chord: ${originalLabel}`);
        return chord;
      }
    }
    
    // Exception 4: Very strong chromagram evidence
    const strength = this.getChordStrength(chroma, root);
    const inScaleAlternative = this.findBestInScaleAlternative(root, key, chroma);
    const altStrength = this.getChordStrength(chroma, this.parseRoot(inScaleAlternative));
    
    if (strength > altStrength * 1.5) {
      console.log(`   ✅ Strong evidence: ${originalLabel}`);
      chord.isChromatic = true;
      return chord;
    }
    
    // Replace with in-scale alternative
    const quality = originalLabel.replace(/^[A-G](#|b)?/, '');
    const newLabel = inScaleAlternative + quality;
    
    console.log(`   🔧 Replacing ${originalLabel} → ${newLabel}`);
    
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
    
    if (!chordLabel.includes('7') || chordLabel.includes('maj7') || chordLabel.includes('m7')) {
      return false;
    }
    
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
  
  /**
   * 🎹 Check if chord is modal borrowing
   */
  isModalBorrowing(chordLabel, key) {
    if (!chordLabel || typeof chordLabel !== 'string') return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const interval = this.toPc(root - key.root);
    const isMinor = chordLabel.match(/m(?!aj)/);
    
    if (key.minor) {
      const majorBorrows = [
        { interval: 5, major: true },
        { interval: 0, major: true },
        { interval: 7, major: true }
      ];
      
      return majorBorrows.some(b => 
        b.interval === interval && !isMinor
      );
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
  
  /**
   * 🎼 Check if chord is in key
   */
  isInKey(chordLabel, key) {
    if (!chordLabel || !key) return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const scale = this.buildCircleOfFifths(key);
    const interval = this.toPc(root - key.root);
    return scale.includes(interval);
  }
  
  /**
   * 🎵 Check if chord is in scale (with quality)
   */
  isInScale(chordLabel, key) {
    if (!chordLabel || !key) return false;
    
    const root = this.parseRoot(chordLabel);
    if (root < 0) return false;
    
    const diatonicChords = this.getDiatonicChords(
      this.noteNames[key.root],
      key.minor ? 'minor' : 'major'
    );
    
    const normalized = chordLabel.replace(/maj7|7|sus4|sus2|add9|6/g, '');
    
    return diatonicChords.some(dc => {
      const dcNormalized = dc.replace(/maj7|7|sus4|sus2|add9|6/g, '');
      return normalized === dcNormalized || normalized.startsWith(dcNormalized);
    });
  }
  
  /**
   * 🎵 Build Circle of Fifths
   */
  buildCircleOfFifths(key) {
    if (!key) return [0, 2, 4, 5, 7, 9, 11];
    
    if (key.minor) {
      return [0, 2, 3, 5, 7, 8, 10];
    } else {
      return [0, 2, 4, 5, 7, 9, 11];
    }
  }
  
  /**
   * 🎼 Get diatonic chord names
   */
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
  
  /**
   * 📊 Get chord strength from chromagram
   */
  getChordStrength(chroma, root) {
    if (!chroma || root < 0) return 0;
    
    const rootStrength = chroma[root % 12];
    const thirdMajor = chroma[(root + 4) % 12];
    const thirdMinor = chroma[(root + 3) % 12];
    const fifth = chroma[(root + 7) % 12];
    
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
   * 📊 Check chromagram match
   */
  checkChromaMatch(chord, chromaArray) {
    if (!chord.fi || !chromaArray || chord.fi >= chromaArray.length) {
      return 0.5;
    }
    
    const chroma = chromaArray[chord.fi];
    if (!chroma) return 0.5;
    
    const root = this.parseRoot(chord.label);
    if (root < 0) return 0.5;
    
    const rootStrength = chroma[root % 12];
    const avgStrength = Array.from(chroma).reduce((a, b) => a + b, 0) / 12;
    
    return rootStrength / (avgStrength + 0.01);
  }
  
  /**
   * 🔍 Find better alternative chord (fallback)
   */
  findBetterAlternative(curr, prev, next, key) {
    const root = this.parseRoot(curr.label);
    if (root < 0) return null;
    
    const scale = key.minor ? 
      [0, 2, 3, 5, 7, 8, 10] : 
      [0, 2, 4, 5, 7, 9, 11];
    
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
    const quality = curr.label && typeof curr.label === 'string' ? 
      curr.label.match(/^[A-G](#|b)?(.*)$/) : null;
    return this.nameSharp(newRoot) + (quality ? quality[2] : '');
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
   * 🔧 Get note name
   */
  nameSharp(pc) {
    return this.noteNames[this.toPc(pc)];
  }
  
  /**
   * 🎼 Build HMM Transition Matrix
   */
  buildTransitionMatrix() {
    const matrix = [];
    
    for (let i = 0; i < 12; i++) {
      matrix[i] = new Array(12).fill(0.005);
    }
    
    for (let from = 0; from < 12; from++) {
      matrix[from][from] = 0.30;
      
      const down5th = (from + 7) % 12;
      matrix[from][down5th] = 0.25;
      
      const down4th = (from + 5) % 12;
      matrix[from][down4th] = 0.18;
      
      const up2nd = (from + 2) % 12;
      matrix[from][up2nd] = 0.12;
      
      const down3rd = (from + 9) % 12;
      matrix[from][down3rd] = 0.08;
      
      const up3rd = (from + 4) % 12;
      matrix[from][up3rd] = 0.04;
      
      const down2nd = (from + 10) % 12;
      matrix[from][down2nd] = 0.02;
      
      matrix[from][(from + 1) % 12] = 0.005;
      matrix[from][(from + 11) % 12] = 0.005;
      matrix[from][(from + 6) % 12] = 0.003;
    }
    
    for (let i = 0; i < 12; i++) {
      const sum = matrix[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < 12; j++) {
        matrix[i][j] /= sum;
      }
    }
    
    return matrix;
  }
  
  /**
   * 🎯 Viterbi Algorithm
   */
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
    for (let t = n-2; t >= 0; t--) {
      bestPath[t] = path[t+1][bestPath[t+1]];
    }
    
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
    
    if (changes > 0) {
      console.log(`🎼 Viterbi: corrected ${changes}/${n} chords`);
    }
    
    return smoothed;
  }
  
  /**
   * 📊 Get emission probability
   */
  getEmissionProb(state, observation, chord) {
    if (state === observation) {
      return 0.9;
    }
    
    const dist = Math.min(Math.abs(state - observation), 12 - Math.abs(state - observation));
    if (dist <= 1) return 0.5;
    if (dist === 5 || dist === 7) return 0.3;
    
    return 0.1 / (dist + 1);
  }
  
  /**
   * 🎵 Estimate BPM from onsets
   */
  estimateBPMFromOnsets(onsets, duration) {
    if (onsets.length < 4) return 120;
    
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i - 1]);
    }
    
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    
    let bpm = 60 / medianInterval;
    
    while (bpm < 60) bpm *= 2;
    while (bpm > 200) bpm /= 2;
    
    return Math.round(bpm);
  }
  
  /**
   * 🎛️ Preprocessing
   */
  preprocessAudio(audioBuffer, options = {}) {
    const { filtering = false } = options;
    
    let x = this.mixStereo(audioBuffer);
    const sr = audioBuffer.sampleRate;
    
    if (!filtering) {
      return { x, sr };
    }
    
    console.log('🔊 Preprocessing: filtering + guitar isolation');
    
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
    
    for (let i = 1; i < x.length; i++) {
      y[i] = alpha * (y[i-1] + x[i] - x[i-1]);
    }
    
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
    
    for (let i = 1; i < x.length; i++) {
      y[i] = y[i-1] + alpha * (x[i] - y[i-1]);
    }
    
    return y;
  }
  
  estimateNoiseFloor(x) {
    const sorted = Array.from(x).map(Math.abs).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.1)];
  }
  
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
  
  getStats() {
    return this.stats;
  }
  
  classifyOrnamentsByDuration(tl, bpm) {
    return super.classifyOrnamentsByDuration(tl, bpm);
  }
  
  decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, bassConfidence) {
    if (!timeline || timeline.length === 0) return timeline;
    return super.decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, bassConfidence);
  }
}

console.log('✅ ChordEngine Pro v3.0 (Musical Intelligence Edition) loaded!');
