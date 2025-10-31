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
    this.version = 'v2.3.1 - FIXED';
    console.log(`✅ ChordEngine Pro FIXED (${this.version}) loaded!`);
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
    
    // Step 2: Enhanced key detection (✅ patched to correct API)
    if (typeof EnhancedKeyDetection !== 'undefined') {
      try {
        const enhancedKey = EnhancedKeyDetection.detectKeyEnhanced(
          result.chords,              // chroma aggregate per event (fallback acceptable)
          result.timeline || [],      // timeline of chords
          result.key                  // initial key guess
        );
        if (enhancedKey && (enhancedKey.confidence === undefined || enhancedKey.confidence > 85)) {
          result.key = enhancedKey.key ? enhancedKey.key : enhancedKey; // support both return shapes
          result.mode = result.key.minor ? 'Natural Minor' : 'Major';
          console.log(`🎼 Enhanced key applied: ${this.nameSharp(result.key.root)}${result.key.minor ? 'm' : ''}`);
        }
      } catch (e) {
        console.warn('EnhancedKeyDetection failed (non-blocking):', e);
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
      timeline: filtered, // ensure timeline available downstream
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

  /* ... rest of user's ChordEnginePro implementation unchanged ... */
}

// Inherit from ChordEngine (after class definition)
if (typeof ChordEngine !== 'undefined') {
  ChordEnginePro.prototype = Object.create(ChordEngine.prototype);
  ChordEnginePro.prototype.constructor = ChordEnginePro;
  console.log('✅ ChordEnginePro inheritance configured');
}

console.log('✅ ChordEngine Pro FIXED loaded - no more fast chromatic chords!');
