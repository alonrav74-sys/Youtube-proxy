/**
 * ChordEngine - Fixed Harmonic Version
 * 🎯 חיזוק ההרמוניה לפי מעגל החמישיות
 */

class ChordEngine {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    // 🎯 מעגל החמישיות - סדר החשיבות
    this.CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    
    // 🎸 Chord Quality Templates - Harmonic Fingerprints
    this.CHORD_TEMPLATES = {
      // Triads
      major: { intervals: [0, 4, 7], weights: [1.0, 0.9, 0.8], label: '' },
      minor: { intervals: [0, 3, 7], weights: [1.0, 0.9, 0.8], label: 'm' },
      dim: { intervals: [0, 3, 6], weights: [1.0, 0.9, 0.8], label: 'dim' },
      aug: { intervals: [0, 4, 8], weights: [1.0, 0.9, 0.8], label: 'aug' },
      sus2: { intervals: [0, 2, 7], weights: [1.0, 0.85, 0.8], label: 'sus2' },
      sus4: { intervals: [0, 5, 7], weights: [1.0, 0.85, 0.8], label: 'sus4' },
      
      // 7th chords
      maj7: { intervals: [0, 4, 7, 11], weights: [1.0, 0.9, 0.8, 0.75], label: 'maj7' },
      dom7: { intervals: [0, 4, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: '7' },
      m7: { intervals: [0, 3, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7' },
      dim7: { intervals: [0, 3, 6, 9], weights: [1.0, 0.9, 0.8, 0.75], label: 'dim7' },
      m7b5: { intervals: [0, 3, 6, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7b5' },
      
      // Extended
      dom9: { intervals: [0, 4, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: '9' },
      maj9: { intervals: [0, 4, 7, 11, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'maj9' },
      m9: { intervals: [0, 3, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'm9' },
      dom11: { intervals: [0, 4, 7, 10, 14, 17], weights: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], label: '11' },
      dom13: { intervals: [0, 4, 7, 10, 14, 21], weights: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], label: '13' }
    };
  }
  /* ... rest of user's ChordEngine code ... */
}

// Export
if (typeof window !== 'undefined') {
  window.ChordEngine = ChordEngine;
  console.log('✅ ChordEngine (Harmonic Fixed) loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}
