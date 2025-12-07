/**
 * MajorMinorRefiner v4.3
 * תיקון החלטות מז'ור/מינור
 */
class MajorMinorRefiner {
  constructor(options = {}) {
    this.minConfidenceToOverride = options.minConfidenceToOverride || 0.40;
    this.decisionThreshold = options.decisionThreshold || 0.15;
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  }

  refine(chords, audioBuffer, options = {}) {
    const results = [];
    
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const result = this.analyzeChord(chord, i, chords);
      results.push(result);
      
      // Apply override if confident
      if (result.shouldOverride && chord.label) {
        chord.label = this.applyQualityChange(chord.label, result.newQuality);
        chord.refinedBy = 'MajorMinorRefiner';
      }
    }
    
    return results;
  }

  analyzeChord(chord, index, allChords) {
    if (!chord || !chord.label) {
      return { shouldOverride: false, decision: null };
    }
    
    const currentQuality = this.detectQuality(chord.label);
    const chroma = chord.chroma || chord._chroma || null;
    
    if (!chroma) {
      return { 
        shouldOverride: false, 
        decision: currentQuality,
        originalQuality: currentQuality 
      };
    }
    
    // Analyze third interval
    const rootPc = this.getRootPc(chord.label);
    if (rootPc < 0) {
      return { shouldOverride: false, decision: currentQuality };
    }
    
    const majorThird = (rootPc + 4) % 12;
    const minorThird = (rootPc + 3) % 12;
    
    const majorStrength = chroma[majorThird] || 0;
    const minorStrength = chroma[minorThird] || 0;
    
    const diff = majorStrength - minorStrength;
    let suggestedQuality = currentQuality;
    let confidence = 0;
    
    if (Math.abs(diff) > this.decisionThreshold) {
      suggestedQuality = diff > 0 ? 'major' : 'minor';
      confidence = Math.abs(diff);
    }
    
    const shouldOverride = 
      confidence >= this.minConfidenceToOverride && 
      suggestedQuality !== currentQuality;
    
    return {
      shouldOverride,
      originalQuality: currentQuality,
      newQuality: suggestedQuality,
      decision: suggestedQuality,
      confidence,
      majorStrength,
      minorStrength
    };
  }

  detectQuality(label) {
    if (!label) return 'major';
    const cleanLabel = label.replace(/\/.*$/, ''); // Remove bass note
    if (/m(?!aj)/.test(cleanLabel)) return 'minor';
    return 'major';
  }

  getRootPc(label) {
    if (!label) return -1;
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) return -1;
    const note = match[1].replace('b', '#');
    return this.NOTES.indexOf(note);
  }

  applyQualityChange(label, newQuality) {
    if (!label) return label;
    
    const match = label.match(/^([A-G][#b]?)(.*?)(\/.+)?$/);
    if (!match) return label;
    
    const root = match[1];
    let suffix = match[2] || '';
    const bass = match[3] || '';
    
    // Remove existing quality markers
    suffix = suffix.replace(/^m(?!aj)/, '').replace(/^maj/, '');
    
    if (newQuality === 'minor') {
      return root + 'm' + suffix + bass;
    } else {
      return root + suffix + bass;
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MajorMinorRefiner;
} else {
  window.MajorMinorRefiner = MajorMinorRefiner;
}

console.log('✅ MajorMinorRefiner v4.3 loaded');
