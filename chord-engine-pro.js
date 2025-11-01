/**
 * ChordEngine Pro - FIXED Edition
 * 
 * תיקונים:
 * ✅ לא ממציא אקורדים מהירים מחוץ לסולם
 * ✅ דורש אקורד להיות קונסיסטנטי לפני שמכניסים אותו
 * ✅ אקורדים כרומטיים רק אם הם חזקים מאוד
 * ✅ Enhanced Key Detection (Am/C) - המשך לעבוד
 * ✅ 7ths/9ths - רק אם ברור
 */

class ChordEnginePro extends ChordEngine {
  constructor() {
    super();
    this.version = 'v2.3.0 - FIXED';
    console.log(`✅ ChordEngine Pro FIXED (${this.version}) loaded!`);
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
   * Resample audio
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
   * Estimate tempo
   */
  estimateTempo(x, sr) {
    // Simple tempo estimation
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
    
    // Detect peaks
    const peaks = [];
    for (let i = 1; i < energy.length - 1; i++) {
      if (energy[i] > energy[i - 1] && energy[i] > energy[i + 1] && energy[i] > 0.1) {
        peaks.push(i);
      }
    }
    
    if (peaks.length < 2) return 120; // Default
    
    // Calculate average interval
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = (60 * sr) / (avgInterval * hopSize);
    
    // Clamp to reasonable range
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  /**
   * Main detection - CONSERVATIVE with chromatic chords
   */
  async detect(audioBuffer, options = {}) {
    const startTime = performance.now();
    
    const mode = options.mode || 'balanced';
    const harmonyMode = options.harmonyMode || 'jazz';
    
    console.log(`🎸 Starting detection (mode: ${mode}, harmony: ${harmonyMode})`);
    
    // Step 1: Base detection from parent
    const result = await super.detect(audioBuffer, options);
    
    // Step 2: Enhanced key detection
    if (typeof EnhancedKeyDetection !== 'undefined') {
      const enhancedKey = EnhancedKeyDetection.detectKey(result.chords, result.key);
      if (enhancedKey && enhancedKey.confidence > 85) {
        console.log(`🎼 Enhanced key: ${this.nameSharp(enhancedKey.key.root)}${enhancedKey.key.minor ? 'm' : ''} (${enhancedKey.confidence.toFixed(1)}%)`);
        result.key = enhancedKey.key;
        result.mode = enhancedKey.key.minor ? 'Natural Minor' : 'Major';
      }
    }
    
    // Step 3: CRITICAL - Filter fast chromatic chords
    const filtered = this.filterFastChromaticChords(result.chords, result.key);
    
    // Step 4: Add harmonic context (but don't add chords!)
    this.addHarmonicContext(filtered, result.key);
    
    const processingTime = ((performance.now() - startTime) / 1000).toFixed(1);
    
    const diatonicCount = filtered.filter(ch => this.isDiatonic(ch.label, result.key)).length;
    const chromaticCount = filtered.length - diatonicCount;
    
    console.log(`📊 Result: ${filtered.length} chords (${diatonicCount} diatonic, ${chromaticCount} chromatic)`);
    
    return {
      chords: filtered,
      key: result.key,
      mode: result.mode,
      bpm: result.bpm,
      stats: {
        processingTime: `${processingTime}s`,
        totalChords: filtered.length,
        avgConfidence: this.calculateAvgConfidence(filtered),
        highConfidenceRate: this.calculateHighConfidenceRate(filtered),
        diatonicChords: diatonicCount,
        chromaticChords: chromaticCount
      }
    };
  }

  /**
   * CRITICAL: Filter fast chromatic chords
   * 
   * כללים:
   * 1. אקורד מחוץ לסולם שנמשך פחות מ-0.5 שניות → מחק אותו
   * 2. אקורד מחוץ לסולם עם confidence < 70 → מחק אותו
   * 3. אקורד מחוץ לסולם בין שני אקורדים דיאטוניים זהים → מחק אותו
   * 4. אקורד מחוץ לסולם שלא מתאים להרמוניה → מחק אותו
   */
  filterFastChromaticChords(chords, key) {
    if (!chords || chords.length === 0) return chords;
    
    const filtered = [];
    const MIN_CHROMATIC_DURATION = 0.5; // אקורד כרומטי חייב להימשך לפחות חצי שנייה
    const MIN_CHROMATIC_CONFIDENCE = 70; // אקורד כרומטי חייב להיות בטוח
    
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const prevChord = filtered[filtered.length - 1];
      
      // Calculate duration
      const duration = nextChord ? (nextChord.t - chord.t) : 1.0;
      
      // Check if chromatic (outside key)
      const isChromatic = !this.isDiatonic(chord.label, key);
      
      if (isChromatic) {
        // Rule 1: Too short → DELETE
        if (duration < MIN_CHROMATIC_DURATION) {
          console.log(`❌ Removed fast chromatic: ${chord.label} (${duration.toFixed(2)}s)`);
          continue;
        }
        
        // Rule 2: Low confidence → DELETE
        if (chord.confidence < MIN_CHROMATIC_CONFIDENCE) {
          console.log(`❌ Removed uncertain chromatic: ${chord.label} (conf: ${chord.confidence})`);
          continue;
        }
        
        // Rule 3: Between same diatonic chords → DELETE
        if (prevChord && nextChord) {
          const prevDiatonic = this.isDiatonic(prevChord.label, key);
          const nextDiatonic = this.isDiatonic(nextChord.label, key);
          const sameChord = this.getRoot(prevChord.label) === this.getRoot(nextChord.label);
          
          if (prevDiatonic && nextDiatonic && sameChord) {
            console.log(`❌ Removed passing chromatic: ${chord.label} (between ${prevChord.label})`);
            continue;
          }
        }
        
        // Rule 4: Check if valid chromatic function
        if (!this.isValidChromaticFunction(chord, key, prevChord, nextChord)) {
          console.log(`❌ Removed invalid chromatic: ${chord.label}`);
          continue;
        }
        
        console.log(`✅ Kept strong chromatic: ${chord.label} (${duration.toFixed(2)}s, conf: ${chord.confidence})`);
      }
      
      filtered.push(chord);
    }
    
    console.log(`🔍 Filter result: ${chords.length} → ${filtered.length} chords`);
    return filtered;
  }

  /**
   * Check if chromatic chord has valid harmonic function
   */
  isValidChromaticFunction(chord, key, prevChord, nextChord) {
    const root = this.getRoot(chord.label);
    if (root === null) return false;
    
    const keyRoot = key.root;
    const interval = this.toPc(root - keyRoot);
    
    // Valid chromatic functions:
    // 1. Secondary dominants (e.g., D7→G in C major)
    if (chord.label.includes('7') && nextChord) {
      const nextRoot = this.getRoot(nextChord.label);
      if (nextRoot !== null) {
        const resolution = this.toPc(nextRoot - root);
        if (resolution === 5 || resolution === 7) { // V→I resolution
          return true; // Secondary dominant
        }
      }
    }
    
    // 2. Modal borrowing - only common ones
    const commonBorrowings = key.minor 
      ? [9, 10] // Major VI, Major VII in minor
      : [3, 8, 10]; // bIII, bVI, bVII in major
    
    if (commonBorrowings.includes(interval)) {
      return true;
    }
    
    // 3. Chromatic passing chords (but we already filtered short ones)
    // Allow only if confidence is very high
    if (chord.confidence > 80) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if chord is diatonic to key
   */
  isDiatonic(label, key) {
    const root = this.getRoot(label);
    if (root === null) return false;
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const relativePitch = this.toPc(root - key.root);
    
    return scale.includes(relativePitch);
  }

  /**
   * Get root note from chord label
   */
  getRoot(label) {
    if (!label) return null;
    const match = label.match(/^([A-G](?:#|b)?)/);
    if (!match) return null;
    const note = match[1].replace('b', '#');
    return this.NOTES_SHARP.indexOf(note);
  }

  /**
   * Add harmonic context WITHOUT adding new chords
   */
  addHarmonicContext(chords, key) {
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      
      // Mark if diatonic or chromatic
      chord.isDiatonic = this.isDiatonic(chord.label, key);
      
      // Check for secondary dominant
      if (chord.label.includes('7') && nextChord) {
        const root = this.getRoot(chord.label);
        const nextRoot = this.getRoot(nextChord.label);
        if (root !== null && nextRoot !== null) {
          const resolution = this.toPc(nextRoot - root);
          if (resolution === 5 || resolution === 7) {
            chord.isSecondaryDominant = true;
          }
        }
      }
      
      // Check for modal borrowing
      if (!chord.isDiatonic) {
        const root = this.getRoot(chord.label);
        if (root !== null) {
          const interval = this.toPc(root - key.root);
          const commonBorrowings = key.minor 
            ? [9, 10] 
            : [3, 8, 10];
          
          if (commonBorrowings.includes(interval)) {
            chord.isModalBorrowing = true;
          }
        }
      }
      
      // Ornament type (structural vs ornament)
      chord.ornamentType = chord.isDiatonic ? 'structural' : 'ornament';
    }
  }

  /**
   * Calculate average confidence
   */
  calculateAvgConfidence(chords) {
    if (!chords || chords.length === 0) return '0';
    const avg = chords.reduce((sum, ch) => sum + (ch.confidence || 0), 0) / chords.length;
    return avg.toFixed(1) + '%';
  }

  /**
   * Calculate high confidence rate
   */
  calculateHighConfidenceRate(chords) {
    if (!chords || chords.length === 0) return '0%';
    const high = chords.filter(ch => (ch.confidence || 0) >= 70).length;
    return ((high / chords.length) * 100).toFixed(0) + '%';
  }
}

// Inherit from ChordEngine
if (typeof ChordEngine !== 'undefined') {
  ChordEnginePro.prototype = Object.create(ChordEngine.prototype);
  ChordEnginePro.prototype.constructor = ChordEnginePro;
  console.log('✅ ChordEnginePro inheritance configured');
}

console.log('✅ ChordEngine Pro FIXED loaded - no more fast chromatic chords!');
