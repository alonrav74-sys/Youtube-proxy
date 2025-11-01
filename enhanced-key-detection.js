/**
 * 🎹 Enhanced Key Detection Module - SIMPLE VERSION
 * Uses: Last chord + Most frequent chord = Key
 */

class EnhancedKeyDetection {
  
  /**
   * 🎯 Main function: Simple key detection
   * The key is where the song RESTS - last chord + most frequent chord
   */
  static detectKeyEnhanced(chroma, timeline, key) {
    console.log(`🎹 Enhanced Key Detection: Initial guess = ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    
    if (!timeline || timeline.length === 0) {
      return { key, confidence: 0 };
    }
    
    // 🎯 Step 1: Count chord frequencies
    const chordCounts = {};
    for (const chord of timeline) {
      if (!chord || !chord.label) continue;
      
      // Extract base chord (remove inversions /X and extensions 7,9,11,13)
      let baseChord = chord.label.split('/')[0];
      baseChord = baseChord.replace(/[0-9]/g, '').trim();
      
      chordCounts[baseChord] = (chordCounts[baseChord] || 0) + 1;
    }
    
    // Find most common chord
    let mostCommonChord = '';
    let maxCount = 0;
    for (const [chord, count] of Object.entries(chordCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonChord = chord;
      }
    }
    
    // 🎯 Step 2: Last chord (where song rests)
    let lastChord = '';
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i] && timeline[i].label) {
        lastChord = timeline[i].label.split('/')[0].replace(/[0-9]/g, '').trim();
        break;
      }
    }
    
    console.log('📊 Chord frequencies:', chordCounts);
    console.log(`🎯 Most common: ${mostCommonChord} (${maxCount}x), Last: ${lastChord}`);
    
    // 🎯 Step 3: Decide key
    // If last chord = most common chord → that's the key!
    // Otherwise, prefer last chord (where song rests)
    const keyChord = (lastChord && lastChord === mostCommonChord) ? lastChord : (lastChord || mostCommonChord);
    
    if (keyChord) {
      const root = this.parseRoot(keyChord);
      const isMinor = keyChord.includes('m') && !keyChord.includes('maj');
      
      if (root >= 0) {
        const oldKey = `${this.noteNames[key.root]}${key.minor ? 'm' : ''}`;
        key.root = root;
        key.minor = isMinor;
        const newKey = `${this.noteNames[root]}${isMinor ? 'm' : ''}`;
        
        if (oldKey !== newKey) {
          console.log(`✅ Key corrected: ${oldKey} → ${newKey} (last chord + frequency)`);
        }
        
        return { key, confidence: Math.round((maxCount / timeline.length) * 100) };
      }
    }
    
    // Fallback to original
    return { key, confidence: 50 };
  }
  
  /**
   * Parse root note from chord label
   */
  static parseRoot(label) {
    if (!label) return -1;
    const match = label.match(/^([A-G](?:#|b)?)/);
    if (!match) return -1;
    const note = match[1].replace('b', '#');
    return this.noteNames.indexOf(note);
  }
  
  /**
   * Pitch class modulo
   */
  static toPc(n) {
    return ((n % 12) + 12) % 12;
  }
  
  static noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
}

// Export
if (typeof window !== 'undefined') {
  window.EnhancedKeyDetection = EnhancedKeyDetection;
  console.log('✅ Enhanced Key Detection Module loaded!');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedKeyDetection;
}
