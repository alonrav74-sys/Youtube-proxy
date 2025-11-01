/**
 * ChordEngine - Fixed Harmonic Version
 * 🎯 כולל mixStereo מובנה למניעת שגיאות בערוצים
 */

class ChordEngine {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this.CIRCLE_OF_FIFTHS = [0,7,2,9,4,11,6,1,8,3,10,5];
  }

  // 🎧 mixStereo - Merge stereo channels into mono safely
  mixStereo(buf) {
    try {
      const ch0 = buf.getChannelData(0);
      const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
      const mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        mono[i] = (ch0[i] + ch1[i]) * 0.5;
      }
      return mono;
    } catch (e) {
      console.warn("⚠️ mixStereo fallback:", e);
      return buf.getChannelData(0); // fallback to left channel
    }
  }
}

// ✅ טעינה גלובלית
if (typeof window !== 'undefined') {
  window.ChordEngine = ChordEngine;
  console.log('✅ ChordEngine (with mixStereo) loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}