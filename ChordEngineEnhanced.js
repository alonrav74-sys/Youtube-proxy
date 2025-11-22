/**
 * ChordEngineEnhanced.js - Main Entry Point
 * 
 * קובץ ראשי שמשלב את:
 * - ChordDetectionCore.js (עיבוד אודיו + HMM)
 * - ChordEnhancer.js (post-processing + analysis)
 * 
 * שימוש:
 * const engine = new ChordEngineEnhanced();
 * const result = await engine.detect(audioBuffer, options);
 */

class ChordEngineEnhanced {
  constructor() {
    // יצירת אינסטנסים של שני המודולים
    this.core = new ChordDetectionCore();
    this.enhancer = new ChordEnhancer(this.core);
    
    // העברת קבועים למעלה לתאימות לאחור
    this.NOTES_SHARP = this.core.NOTES_SHARP;
    this.NOTES_FLAT = this.core.NOTES_FLAT;
    this.MAJOR_SCALE = this.core.MAJOR_SCALE;
    this.MINOR_SCALE = this.core.MINOR_SCALE;
  }

  // ============================================================================
  // MAIN API - מעביר ל-ChordEnhancer
  // ============================================================================

  async detect(audioBuffer, options = {}) {
    return await this.enhancer.detect(audioBuffer, options);
  }

  // ============================================================================
  // UTILITY FUNCTIONS - לתאימות לאחור
  // ============================================================================

  parseRoot(label) {
    return this.core.parseRoot(label);
  }

  toPc(n) {
    return this.core.toPc(n);
  }

  getNoteName(pc, key) {
    return this.core.getNoteName(pc, key);
  }

  inKey(pc, keyRoot, minor) {
    return this.core.inKey(pc, keyRoot, minor);
  }

  percentile(arr, p) {
    return this.core.percentile(arr, p);
  }

  getDiatonicChords(tonic, mode) {
    return this.enhancer.getDiatonicChords(tonic, mode);
  }

  buildCircleOfFifths(key) {
    return this.enhancer.buildCircleOfFifths(key);
  }

  // Audio processing utilities
  mixStereo(buf) {
    return this.core.mixStereo(buf);
  }

  resampleLinear(x, sr0, sr) {
    return this.core.resampleLinear(x, sr0, sr);
  }

  estimateTempo(x, sr) {
    return this.core.estimateTempo(x, sr);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}

console.log('✅ ChordEngineEnhanced.js loaded - Full engine ready');
console.log('📦 Modules: ChordDetectionCore + ChordEnhancer');
