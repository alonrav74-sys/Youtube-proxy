
/**
 * ChordEngine Pro - FIXED Edition
 * כולל תיקון קריאה ל-EnhancedKeyDetection.detectKeyEnhanced()
 */

class ChordEnginePro extends ChordEngine {
  constructor() {
    super();
    this.version = 'v2.3.1 - FIXED';
    console.log(`✅ ChordEngine Pro FIXED (${this.version}) loaded!`);
  }

  async detect(audioBuffer, options = {}) {
    const startTime = performance.now();
    const mode = options.mode || 'balanced';
    const harmonyMode = options.harmonyMode || 'jazz';
    console.log(`🎸 Starting detection (mode: ${mode}, harmony: ${harmonyMode})`);
    
    const result = await super.detect(audioBuffer, options);

    // ✅ תיקון כאן
    if (typeof EnhancedKeyDetection !== 'undefined') {
      const enhancedKey = EnhancedKeyDetection.detectKeyEnhanced(result.chords, result.timeline || [], result.key);
      if (enhancedKey && enhancedKey.confidence > 85) {
        console.log(`🎼 Enhanced key: ${this.nameSharp(enhancedKey.key.root)}${enhancedKey.key.minor ? 'm' : ''} (${enhancedKey.confidence.toFixed(1)}%)`);
        result.key = enhancedKey.key;
        result.mode = enhancedKey.key.minor ? 'Natural Minor' : 'Major';
      }
    }

    const filtered = this.filterFastChromaticChords(result.chords, result.key);
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

  // ... (שאר הקוד נשאר זהה, ללא שינוי) ...
}

if (typeof ChordEngine !== 'undefined') {
  ChordEnginePro.prototype = Object.create(ChordEngine.prototype);
  ChordEnginePro.prototype.constructor = ChordEnginePro;
  console.log('✅ ChordEnginePro inheritance configured');
}

console.log('✅ ChordEngine Pro FIXED loaded - no more fast chromatic chords!');
