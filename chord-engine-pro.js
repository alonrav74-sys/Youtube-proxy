/**
 * ChordEngine Pro - WRAPPER Edition
 * 
 * Instead of extending, we wrap the original ChordEngine
 * and add filtering on top.
 */

class ChordEnginePro {
  constructor() {
    // Create instance of original engine
    this.baseEngine = new ChordEngine();
    this.version = 'v2.3.1 - WRAPPER';
    console.log(`✅ ChordEngine Pro WRAPPER (${this.version}) loaded!`);
  }

  /**
   * Main detect - wraps base engine and filters results
   */
  async detect(audioBuffer, options = {}) {
    console.log('🎸 ChordEnginePro.detect() called (wrapper mode)');
    
    // Call base engine's detect
    const baseResult = await this.baseEngine.detect(audioBuffer, options);
    console.log(`📊 Base detection: ${baseResult.chords.length} chords`);
    
    // Enhanced key detection
    if (typeof EnhancedKeyDetection !== 'undefined') {
      try {
        const enhancedResult = EnhancedKeyDetection.detectKey(baseResult.chords, baseResult.key);
        if (enhancedResult && enhancedResult.key) {
          console.log(`🎼 Enhanced key: ${this.nameSharp(enhancedResult.key.root)}${enhancedResult.key.minor ? 'm' : ''}`);
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
   * Filter fast chromatic chords - CONSERVATIVE
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
   * Delegate all other methods to base engine
   */
  mixStereo(...args) { return this.baseEngine.mixStereo(...args); }
  resampleLinear(...args) { return this.baseEngine.resampleLinear(...args); }
  estimateTempo(...args) { return this.baseEngine.estimateTempo(...args); }
  getDiatonicChords(...args) { return this.baseEngine.getDiatonicChords(...args); }
  buildCircleOfFifths(...args) { return this.baseEngine.buildCircleOfFifths(...args); }
  
  // Add constants
  get NOTES_SHARP() { return this.baseEngine.NOTES_SHARP; }
  get NOTES_FLAT() { return this.baseEngine.NOTES_FLAT; }
  get MAJOR_SCALE() { return this.baseEngine.MAJOR_SCALE; }
  get MINOR_SCALE() { return this.baseEngine.MINOR_SCALE; }
}

console.log('✅ ChordEngine Pro WRAPPER loaded - no inheritance issues!');
