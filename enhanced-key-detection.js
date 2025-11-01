/**
 * 🎹 Enhanced Key Detection Module
 * 
 * Fixes the Am/C (relative minor/major) confusion problem
 * Uses multiple analysis methods:
 * 1. Cadence analysis (V→I resolution)
 * 2. First/last chord analysis
 * 3. Chord progression patterns
 * 4. Leading tone presence
 * 
 * @version 1.0.0
 */

class EnhancedKeyDetection {
  
  /**
   * 🎯 Main function: Detect key with Am/C disambiguation
   */
  static detectKeyEnhanced(chroma, timeline, key) {
    console.log(`🎹 Enhanced Key Detection: Initial guess = ${key.root} ${key.minor ? 'minor' : 'major'}`);
    
    // If not Am/C confusion, return as-is
    if (!this.isRelativeMinorConfusion(key)) {
      return key;
    }
    
    console.log('🔍 Detected Am/C relative minor confusion - analyzing...');
    
    // Run multiple tests
    const scores = {
      major: 0,
      minor: 0
    };
    
    // Test 1: Cadence analysis (most reliable!)
    const cadenceResult = this.analyzeCadences(timeline, key);
    scores.major += cadenceResult.majorScore;
    scores.minor += cadenceResult.minorScore;
    console.log(`   Cadence: Major=${cadenceResult.majorScore}, Minor=${cadenceResult.minorScore}`);
    
    // Test 2: First/Last chord analysis
    const boundaryResult = this.analyzeBoundaryChords(timeline, key);
    scores.major += boundaryResult.majorScore;
    scores.minor += boundaryResult.minorScore;
    console.log(`   Boundary: Major=${boundaryResult.majorScore}, Minor=${boundaryResult.minorScore}`);
    
    // Test 3: Leading tone analysis (G# for Am, B for C)
    const leadingToneResult = this.analyzeLeadingTone(chroma, key);
    scores.major += leadingToneResult.majorScore;
    scores.minor += leadingToneResult.minorScore;
    console.log(`   Leading tone: Major=${leadingToneResult.majorScore}, Minor=${leadingToneResult.minorScore}`);
    
    // Test 4: Dominant chord analysis (E7 for Am, G7 for C)
    const dominantResult = this.analyzeDominants(timeline, key);
    scores.major += dominantResult.majorScore;
    scores.minor += dominantResult.minorScore;
    console.log(`   Dominant: Major=${dominantResult.majorScore}, Minor=${dominantResult.minorScore}`);
    
    // Test 5: Chord progression patterns
    const progressionResult = this.analyzeProgressions(timeline, key);
    scores.major += progressionResult.majorScore;
    scores.minor += progressionResult.minorScore;
    console.log(`   Progressions: Major=${progressionResult.majorScore}, Minor=${progressionResult.minorScore}`);
    
    // Decision
    console.log(`📊 Total scores: Major=${scores.major}, Minor=${scores.minor}`);
    
    const finalIsMinor = scores.minor > scores.major;
    
    if (finalIsMinor !== key.minor) {
      const oldKey = `${this.noteNames[key.root]}${key.minor ? 'm' : ''}`;
      key.minor = finalIsMinor;
      const newKey = `${this.noteNames[key.root]}${key.minor ? 'm' : ''}`;
      
      // Adjust root for relative minor/major
      if (finalIsMinor && !key.minor) {
        // C → Am: root - 3 semitones
        key.root = this.toPc(key.root - 3);
      } else if (!finalIsMinor && key.minor) {
        // Am → C: root + 3 semitones
        key.root = this.toPc(key.root + 3);
      }
      
      console.log(`✅ Corrected key: ${oldKey} → ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    } else {
      console.log(`✅ Key confirmed: ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    }
    
    return key;
  }
  
  /**
   * Check if this is Am/C confusion (or any relative minor/major pair)
   */
  static isRelativeMinorConfusion(key) {
    // For now, only handle C/Am confusion
    // Can expand to all keys later
    return (key.root === 0 || key.root === 9); // C or A
  }
  
  /**
   * 🎵 Test 1: Cadence Analysis (V→I resolution)
   * This is the MOST RELIABLE test!
   */
  static analyzeCadences(timeline, key) {
    if (!timeline || timeline.length < 2) {
      return { majorScore: 0, minorScore: 0 };
    }
    
    let majorScore = 0;
    let minorScore = 0;
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1];
      
      if (!current.label || !next.label) continue;
      
      // Parse chords
      const currRoot = this.parseRoot(current.label);
      const nextRoot = this.parseRoot(next.label);
      
      if (currRoot < 0 || nextRoot < 0) continue;
      
      // Check for V→I cadences
      
      // For C major: G7 → C (or G → C)
      // G = 7, C = 0
      if (currRoot === 7 && nextRoot === 0) {
        majorScore += 30; // Strong evidence for C major
        if (current.label.includes('7')) majorScore += 10; // G7 → even stronger
        console.log(`      Found G→C cadence (C major evidence)`);
      }
      
      // For A minor: E7 → Am (or E → Am)
      // E = 4, A = 9
      if (currRoot === 4 && nextRoot === 9) {
        minorScore += 30; // Strong evidence for A minor
        if (current.label.includes('7')) minorScore += 10; // E7 → even stronger
        console.log(`      Found E→Am cadence (Am evidence)`);
      }
      
      // Deceptive cadence: V→vi (C major: G→Am)
      if (currRoot === 7 && nextRoot === 9) {
        majorScore += 15; // Medium evidence for C major
        console.log(`      Found G→Am (deceptive cadence, C major evidence)`);
      }
      
      // Plagal cadence: IV→I
      // C major: F→C
      if (currRoot === 5 && nextRoot === 0) {
        majorScore += 20;
        console.log(`      Found F→C (plagal cadence, C major evidence)`);
      }
      
      // A minor: Dm→Am
      if (currRoot === 2 && nextRoot === 9) {
        minorScore += 20;
        console.log(`      Found Dm→Am (plagal cadence, Am evidence)`);
      }
    }
    
    return { majorScore, minorScore };
  }
  
  /**
   * 🎵 Test 2: Boundary Chords (first/last)
   */
  static analyzeBoundaryChords(timeline, key) {
    if (!timeline || timeline.length === 0) {
      return { majorScore: 0, minorScore: 0 };
    }
    
    let majorScore = 0;
    let minorScore = 0;
    
    // First chord
    const firstChord = timeline[0];
    if (firstChord && firstChord.label) {
      const root = this.parseRoot(firstChord.label);
      const isMinor = firstChord.label.includes('m') && !firstChord.label.includes('maj');
      
      // C major: first chord = C
      if (root === 0 && !isMinor) {
        majorScore += 15;
        console.log(`      First chord is C (C major evidence)`);
      }
      
      // A minor: first chord = Am
      if (root === 9 && isMinor) {
        minorScore += 15;
        console.log(`      First chord is Am (Am evidence)`);
      }
    }
    
    // Last chord (stronger evidence!)
    const lastChord = timeline[timeline.length - 1];
    if (lastChord && lastChord.label) {
      const root = this.parseRoot(lastChord.label);
      const isMinor = lastChord.label.includes('m') && !lastChord.label.includes('maj');
      
      // C major: last chord = C
      if (root === 0 && !isMinor) {
        majorScore += 25; // Stronger weight
        console.log(`      Last chord is C (strong C major evidence)`);
      }
      
      // A minor: last chord = Am
      if (root === 9 && isMinor) {
        minorScore += 25;
        console.log(`      Last chord is Am (strong Am evidence)`);
      }
    }
    
    return { majorScore, minorScore };
  }
  
  /**
   * 🎵 Test 3: Leading Tone Analysis
   * C major → B (11) should be present
   * A minor → G# (8) should be present (in harmonic minor)
   */
  static analyzeLeadingTone(chroma, key) {
    let majorScore = 0;
    let minorScore = 0;
    
    // Aggregate chroma
    const agg = new Array(12).fill(0);
    for (const c of chroma) {
      for (let p = 0; p < 12; p++) {
        agg[p] += c[p] || 0;
      }
    }
    
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) {
      agg[p] /= sum;
    }
    
    // C major leading tone: B (11)
    const bStrength = agg[11];
    if (bStrength > 0.08) {
      majorScore += 10;
      console.log(`      B (leading tone) present: ${(bStrength * 100).toFixed(1)}% (C major evidence)`);
    }
    
    // A minor leading tone: G# (8) - only in harmonic minor
    const gSharpStrength = agg[8];
    if (gSharpStrength > 0.06) {
      minorScore += 8; // Slightly weaker because not always present
      console.log(`      G# (leading tone) present: ${(gSharpStrength * 100).toFixed(1)}% (Am evidence)`);
    }
    
    return { majorScore, minorScore };
  }
  
  /**
   * 🎵 Test 4: Dominant Chord Analysis
   * C major → G, G7 should be common
   * A minor → E, E7 should be common
   */
  static analyzeDominants(timeline, key) {
    if (!timeline || timeline.length === 0) {
      return { majorScore: 0, minorScore: 0 };
    }
    
    let majorScore = 0;
    let minorScore = 0;
    
    let gCount = 0;
    let eCount = 0;
    
    for (const chord of timeline) {
      if (!chord.label) continue;
      
      const root = this.parseRoot(chord.label);
      
      // G or G7 (dominant of C)
      if (root === 7) {
        gCount++;
        if (chord.label.includes('7')) gCount += 0.5; // G7 is stronger evidence
      }
      
      // E or E7 (dominant of Am)
      if (root === 4) {
        eCount++;
        if (chord.label.includes('7')) eCount += 0.5;
      }
    }
    
    if (gCount > 0) {
      majorScore += Math.min(20, gCount * 5);
      console.log(`      G/G7 appears ${gCount} times (C major evidence)`);
    }
    
    if (eCount > 0) {
      minorScore += Math.min(20, eCount * 5);
      console.log(`      E/E7 appears ${eCount} times (Am evidence)`);
    }
    
    return { majorScore, minorScore };
  }
  
  /**
   * 🎵 Test 5: Chord Progression Pattern Analysis
   */
  static analyzeProgressions(timeline, key) {
    if (!timeline || timeline.length < 3) {
      return { majorScore: 0, minorScore: 0 };
    }
    
    let majorScore = 0;
    let minorScore = 0;
    
    // Common C major progressions
    const majorProgressions = [
      [0, 5, 7, 0],    // C → F → G → C
      [0, 9, 5, 7],    // C → Am → F → G
      [0, 7, 0],       // C → G → C
      [2, 7, 0]        // Dm → G → C
    ];
    
    // Common A minor progressions
    const minorProgressions = [
      [9, 2, 4, 9],    // Am → Dm → E → Am
      [9, 5, 4, 9],    // Am → F → E → Am
      [9, 7, 0, 9],    // Am → G → C → Am
      [9, 4, 9]        // Am → E → Am
    ];
    
    // Check for major progressions
    for (const progression of majorProgressions) {
      const count = this.countProgressionOccurrences(timeline, progression);
      if (count > 0) {
        majorScore += count * 10;
        console.log(`      Found C major progression (${progression.join('→')}) ${count} times`);
      }
    }
    
    // Check for minor progressions
    for (const progression of minorProgressions) {
      const count = this.countProgressionOccurrences(timeline, progression);
      if (count > 0) {
        minorScore += count * 10;
        console.log(`      Found Am progression (${progression.join('→')}) ${count} times`);
      }
    }
    
    return { majorScore, minorScore };
  }
  
  /**
   * Count how many times a progression appears
   */
  static countProgressionOccurrences(timeline, progression) {
    let count = 0;
    
    for (let i = 0; i <= timeline.length - progression.length; i++) {
      let matches = true;
      
      for (let j = 0; j < progression.length; j++) {
        const chord = timeline[i + j];
        if (!chord || !chord.label) {
          matches = false;
          break;
        }
        
        const root = this.parseRoot(chord.label);
        if (root !== progression[j]) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Parse root from chord label
   */
  static parseRoot(label) {
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
   * Convert to pitch class
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
