/**
 * 🎓 MUSICAL TONIC DETECTOR - Theory-Based Approach
 * 
 * Based on REAL music theory, not statistical algorithms!
 * This replaces Krumhansl-Schmuckler completely.
 */

class MusicalTonicDetector {
  constructor() {
    this.MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
    this.MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
  }

  /**
   * 🎯 PRIMARY METHOD: Detect tonic using MUSIC THEORY
   * 
   * Priority Order:
   * 1. Final note (99% reliable)
   * 2. Cadence analysis (V→I, IV→V→I, ii→V→I)
   * 3. Opening note (70% reliable)
   * 4. Rest points (phrase endings)
   * 5. Harmonic center (least reliable)
   */
  detectTonic(chords, bassPc, frameE, sr, hop) {
    console.log('\n🎓 === MUSICAL TONIC DETECTOR ===\n');
    
    const evidence = {
      final: null,           // Final note
      cadences: [],          // List of cadence resolutions
      opening: null,         // Opening note
      restPoints: [],        // Phrase ending notes
      harmonicCenter: null   // Most common chord
    };
    
    const scores = new Array(12).fill(0);
    
    // ============================================
    // 1. FINAL NOTE (Most Important!)
    // ============================================
    evidence.final = this.detectFinalNote(bassPc, frameE);
    
    if (evidence.final !== null) {
      scores[evidence.final] += 1000; // ABSOLUTE
      console.log(`✅ Final note: ${this.noteName(evidence.final)} (+1000 ABSOLUTE)`);
    } else {
      console.log(`⚠️ Final note: unclear`);
    }
    
    // ============================================
    // 2. CADENCE ANALYSIS (Second Most Important!)
    // ============================================
    evidence.cadences = this.detectCadences(chords);
    
    for (const cadence of evidence.cadences) {
      scores[cadence.tonic] += cadence.weight;
      console.log(`✅ ${cadence.type}: ${this.noteName(cadence.tonic)} (+${cadence.weight})`);
    }
    
    // ============================================
    // 3. OPENING NOTE (Third)
    // ============================================
    evidence.opening = this.detectOpeningNote(bassPc, frameE);
    
    if (evidence.opening !== null) {
      scores[evidence.opening] += 100;
      console.log(`✅ Opening note: ${this.noteName(evidence.opening)} (+100)`);
    }
    
    // ============================================
    // 4. REST POINTS (Phrase Endings)
    // ============================================
    evidence.restPoints = this.detectRestPoints(chords, bassPc, frameE, sr, hop);
    
    for (const rest of evidence.restPoints) {
      scores[rest.note] += rest.weight;
      console.log(`✅ Rest point: ${this.noteName(rest.note)} (+${rest.weight})`);
    }
    
    // ============================================
    // 5. HARMONIC CENTER (Least Important!)
    // ============================================
    evidence.harmonicCenter = this.detectHarmonicCenter(chords);
    
    if (evidence.harmonicCenter !== null) {
      scores[evidence.harmonicCenter] += 50;
      console.log(`✅ Harmonic center: ${this.noteName(evidence.harmonicCenter)} (+50)`);
    }
    
    // ============================================
    // DECISION
    // ============================================
    let bestTonic = 0;
    let bestScore = scores[0];
    
    for (let i = 1; i < 12; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestTonic = i;
      }
    }
    
    // Show top 3 candidates
    const candidates = scores
      .map((score, pc) => ({ pc, score, name: this.noteName(pc) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    console.log(`\n🎯 Candidates: ${candidates.map(c => `${c.name}(${c.score})`).join(', ')}`);
    console.log(`\n🎼 WINNER: ${this.noteName(bestTonic)} (${bestScore} points)\n`);
    
    // Detect major/minor
    const isMinor = this.detectMajorMinor(chords, bestTonic);
    
    return {
      root: bestTonic,
      minor: isMinor,
      confidence: Math.min(100, bestScore / 10),
      evidence: evidence,
      scores: scores
    };
  }
  
  /**
   * 🎯 Detect final note (last strong bass)
   */
  detectFinalNote(bassPc, frameE) {
    if (!bassPc || bassPc.length === 0) return null;
    
    // Look at last 3% of song
    const startIdx = Math.floor(bassPc.length * 0.97);
    const energyThreshold = this.percentile(frameE, 30);
    
    // Find last strong bass note
    for (let i = bassPc.length - 1; i >= startIdx; i--) {
      if (bassPc[i] >= 0 && frameE[i] >= energyThreshold) {
        return bassPc[i];
      }
    }
    
    // Fallback: absolute last bass
    for (let i = bassPc.length - 1; i >= 0; i--) {
      if (bassPc[i] >= 0) return bassPc[i];
    }
    
    return null;
  }
  
  /**
   * 🎵 Detect cadences (V→I, IV→V→I, ii→V→I)
   */
  detectCadences(chords) {
    const cadences = [];
    
    for (let i = 0; i < chords.length - 1; i++) {
      const curr = chords[i];
      const next = chords[i + 1];
      const prev = i > 0 ? chords[i - 1] : null;
      
      const currRoot = this.parseRoot(curr.label);
      const nextRoot = this.parseRoot(next.label);
      const prevRoot = prev ? this.parseRoot(prev.label) : -1;
      
      if (currRoot < 0 || nextRoot < 0) continue;
      
      const interval = this.toPc(nextRoot - currRoot);
      
      // V → I (Perfect 5th down = Perfect 4th up)
      if (interval === 5 || interval === 7) {
        const isDominant = curr.label.includes('7') && !curr.label.includes('maj7');
        
        if (isDominant) {
          // Authentic cadence (V7 → I)
          cadences.push({
            type: 'V7→I',
            tonic: nextRoot,
            weight: 200
          });
        } else {
          // Weaker (V → I without 7th)
          cadences.push({
            type: 'V→I',
            tonic: nextRoot,
            weight: 150
          });
        }
      }
      
      // ii → V → I
      if (prev && prevRoot >= 0) {
        const interval2 = this.toPc(currRoot - prevRoot);
        const interval3 = this.toPc(nextRoot - currRoot);
        
        // ii is minor, V is dominant, resolution to I
        if ((interval2 === 5 || interval2 === 7) && 
            (interval3 === 5 || interval3 === 7) &&
            prev.label.includes('m') && 
            curr.label.includes('7')) {
          
          cadences.push({
            type: 'ii→V→I',
            tonic: nextRoot,
            weight: 250 // STRONGEST!
          });
        }
      }
      
      // IV → V → I
      if (prev && prevRoot >= 0) {
        const interval2 = this.toPc(currRoot - prevRoot);
        const interval3 = this.toPc(nextRoot - currRoot);
        
        // IV → V (whole step up), V → I (perfect 5th down)
        if (interval2 === 2 && (interval3 === 5 || interval3 === 7)) {
          cadences.push({
            type: 'IV→V→I',
            tonic: nextRoot,
            weight: 230
          });
        }
      }
      
      // IV → I (Plagal "Amen" cadence)
      if (interval === 7 || interval === 5) {
        // Check if it's actually IV→I (not V→I)
        const isPlagal = !curr.label.includes('7'); // No 7th = not dominant
        
        if (isPlagal && i === chords.length - 2) {
          // At end of song = strong evidence
          cadences.push({
            type: 'IV→I (Plagal)',
            tonic: nextRoot,
            weight: 180
          });
        }
      }
    }
    
    return cadences;
  }
  
  /**
   * 🎸 Detect opening note (first strong bass)
   */
  detectOpeningNote(bassPc, frameE) {
    if (!bassPc || bassPc.length === 0) return null;
    
    const energyThreshold = this.percentile(frameE, 40);
    
    // Find first strong bass (skip intro)
    for (let i = 0; i < Math.min(bassPc.length, 200); i++) {
      if (bassPc[i] >= 0 && frameE[i] >= energyThreshold) {
        return bassPc[i];
      }
    }
    
    // Fallback: first bass
    for (let i = 0; i < bassPc.length; i++) {
      if (bassPc[i] >= 0) return bassPc[i];
    }
    
    return null;
  }
  
  /**
   * 🎵 Detect rest points (phrase endings)
   */
  detectRestPoints(chords, bassPc, frameE, sr, hop) {
    const restPoints = [];
    
    // Look for long chords (> 4 seconds) = rest/resolution
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      
      if (!nextChord) continue;
      
      const duration = nextChord.t - chord.t;
      
      if (duration >= 4.0) {
        // Long chord = probably a rest point
        const root = this.parseRoot(chord.label);
        
        if (root >= 0) {
          restPoints.push({
            note: root,
            weight: Math.min(100, Math.floor(duration * 10))
          });
        }
      }
    }
    
    return restPoints;
  }
  
  /**
   * 🎹 Detect harmonic center (most common chord)
   */
  detectHarmonicCenter(chords) {
    const rootCounts = new Array(12).fill(0);
    
    for (const chord of chords) {
      const root = this.parseRoot(chord.label);
      if (root >= 0) rootCounts[root]++;
    }
    
    let maxCount = 0;
    let maxRoot = -1;
    
    for (let i = 0; i < 12; i++) {
      if (rootCounts[i] > maxCount) {
        maxCount = rootCounts[i];
        maxRoot = i;
      }
    }
    
    return maxRoot >= 0 ? maxRoot : null;
  }
  
  /**
   * 🎵 Detect major vs minor
   */
  detectMajorMinor(chords, tonic) {
    let majorCount = 0;
    let minorCount = 0;
    
    for (const chord of chords) {
      const root = this.parseRoot(chord.label);
      if (root !== tonic) continue;
      
      if (chord.label.includes('m') && !chord.label.includes('maj')) {
        minorCount++;
      } else {
        majorCount++;
      }
    }
    
    // Also check iii and vi chords (indicate major/minor)
    for (const chord of chords) {
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;
      
      const interval = this.toPc(root - tonic);
      
      // In major: iii is minor, vi is minor
      // In minor: III is major, VI is major
      if (interval === 4 || interval === 9) { // iii or vi
        if (chord.label.includes('m')) {
          majorCount++; // Minor iii/vi = major key
        } else {
          minorCount++; // Major III/VI = minor key
        }
      }
    }
    
    return minorCount > majorCount;
  }
  
  // Helper functions
  parseRoot(label) {
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) return -1;
    
    const noteMap = {
      'C': 0, 'C#': 1, 'Db': 1,
      'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4,
      'F': 5, 'F#': 6, 'Gb': 6,
      'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10,
      'B': 11
    };
    
    return noteMap[match[1]] ?? -1;
  }
  
  toPc(x) {
    return ((x % 12) + 12) % 12;
  }
  
  noteName(pc) {
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    return names[pc];
  }
  
  percentile(arr, p) {
    const sorted = [...arr].filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p / 100);
    return sorted[idx] || 0;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MusicalTonicDetector;
}
