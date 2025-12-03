/**
 * 🎼 ChordIntegrator - Combines ChordEngine + BassEngine + MajorMinorRefiner
 * 
 * Flow:
 * 1. ChordEngine runs (v14.50) - produces initial timeline
 * 2. BassEngine analyzes bass independently
 * 3. MajorMinorRefiner analyzes major/minor independently
 * 4. Integrator compares and resolves conflicts:
 *    - If engines AGREE → strengthen confidence
 *    - If engines DISAGREE → pick stronger evidence
 * 
 * Usage:
 *   const integrator = new ChordIntegrator(chordEngine, bassEngine, refiner);
 *   const result = await integrator.analyze(audioBuffer, options);
 */

class ChordIntegrator {
  constructor(chordEngine, bassEngine, majorMinorRefiner) {
    this.chordEngine = chordEngine;
    this.bassEngine = bassEngine;
    this.refiner = majorMinorRefiner;
    
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  }
  
  /**
   * Main analysis - runs all engines and integrates results
   */
  async analyze(audioBuffer, options = {}) {
    const opts = {
      debug: options.debug || false,
      useBassEngine: options.useBassEngine !== false,
      useMajorMinorRefiner: options.useMajorMinorRefiner !== false,
      ...options
    };
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎼 CHORD INTEGRATOR v1.0');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // ═══════════════════════════════════════════════════════
    // STEP 1: Run ChordEngine (v14.50) - baseline
    // ═══════════════════════════════════════════════════════
    console.log('1️⃣ Running ChordEngine v14.50...');
    const chordResult = await this.chordEngine.detect(audioBuffer, opts);
    
    console.log(`   ✅ Key: ${chordResult.key ? this.NOTES[chordResult.key.root] + (chordResult.key.minor ? 'm' : '') : 'unknown'}`);
    console.log(`   ✅ Chords: ${chordResult.chords.length}`);
    
    // If engines disabled, return ChordEngine result only
    if (!opts.useBassEngine && !opts.useMajorMinorRefiner) {
      console.log('\n⚠️ All engines disabled - returning ChordEngine result only\n');
      return chordResult;
    }
    
    // ═══════════════════════════════════════════════════════
    // STEP 2: Run BassEngine independently
    // ═══════════════════════════════════════════════════════
    let bassTimeline = null;
    
    if (opts.useBassEngine && this.bassEngine) {
      console.log('\n2️⃣ Running BassEngine...');
      try {
        bassTimeline = await this.bassEngine.analyzeBass(audioBuffer, {
          energyPercentile: 60,
          debug: opts.debug
        });
        console.log(`   ✅ Bass segments: ${bassTimeline.length}`);
      } catch(e) {
        console.warn('   ❌ BassEngine error:', e.message);
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // STEP 3: Run MajorMinorRefiner independently
    // ═══════════════════════════════════════════════════════
    let refinerResult = null;
    
    if (opts.useMajorMinorRefiner && this.refiner) {
      console.log('\n3️⃣ Running MajorMinorRefiner...');
      try {
        refinerResult = await this.refiner.refineChordTimeline(
          audioBuffer, 
          chordResult.chords,
          {
            decisionThreshold: 0.20,
            minConfidenceToOverride: 0.65,
            debug: opts.debug
          }
        );
        
        const corrections = refinerResult.filter(r => r.shouldOverride).length;
        console.log(`   ✅ Analyzed ${refinerResult.length} chords, ${corrections} corrections suggested`);
      } catch(e) {
        console.warn('   ❌ MajorMinorRefiner error:', e.message);
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // STEP 4: INTEGRATE - compare and resolve conflicts
    // ═══════════════════════════════════════════════════════
    console.log('\n4️⃣ Integrating results...');
    
    const integrated = this.integrateResults(
      chordResult.chords,
      bassTimeline,
      refinerResult,
      chordResult.key,
      opts
    );
    
    console.log(`   ✅ Final timeline: ${integrated.length} chords`);
    console.log(`   📊 Agreements: ${integrated.filter(c => c.engineAgreement).length}`);
    console.log(`   ⚠️ Conflicts resolved: ${integrated.filter(c => c.conflictResolved).length}`);
    
    console.log('\n═══════════════════════════════════════════════════════\n');
    
    return {
      ...chordResult,
      chords: integrated,
      bassTimeline,
      refinerResult,
      integrationStats: {
        total: integrated.length,
        agreements: integrated.filter(c => c.engineAgreement).length,
        conflictsResolved: integrated.filter(c => c.conflictResolved).length,
        bassOverrides: integrated.filter(c => c.bassOverride).length,
        refinerOverrides: integrated.filter(c => c.refinerOverride).length
      }
    };
  }
  
  /**
   * Integrate results from all engines
   */
  integrateResults(chordTimeline, bassTimeline, refinerResult, key, opts) {
    const integrated = [];
    const toPc = n => ((n % 12) + 12) % 12;
    
    for (let i = 0; i < chordTimeline.length; i++) {
      const chord = chordTimeline[i];
      if (!chord || !chord.label) {
        integrated.push(chord);
        continue;
      }
      
      // Parse ChordEngine result
      const chordRoot = this.parseRoot(chord.label);
      const chordIsMinor = /m(?!aj)/.test(chord.label);
      
      // Default: keep ChordEngine result
      let finalLabel = chord.label;
      let engineAgreement = false;
      let conflictResolved = false;
      let bassOverride = false;
      let refinerOverride = false;
      let confidence = 'medium';
      
      // ═══════════════════════════════════════════════════════
      // Check BassEngine
      // ═══════════════════════════════════════════════════════
      let bassRoot = -1;
      let bassConfidence = 0;
      
      if (bassTimeline) {
        // Find bass note at this chord's time
        for (const bassSegment of bassTimeline) {
          if (chord.t >= bassSegment.tStart && chord.t < bassSegment.tEnd) {
            bassRoot = bassSegment.pc;
            bassConfidence = bassSegment.confidence || 0;
            break;
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════
      // Check MajorMinorRefiner
      // ═══════════════════════════════════════════════════════
      let refinerSuggestion = null;
      let refinerConfidence = 0;
      
      if (refinerResult && refinerResult[i]) {
        const ref = refinerResult[i];
        if (ref.shouldOverride) {
          refinerSuggestion = ref.suggestedQuality;
          refinerConfidence = ref.confidence;
        }
      }
      
      // ═══════════════════════════════════════════════════════
      // DECISION LOGIC
      // ═══════════════════════════════════════════════════════
      
      // Case 1: Bass root matches chord root
      if (bassRoot >= 0 && bassRoot === chordRoot && bassConfidence > 0.5) {
        // Bass AGREES with root - strengthen confidence
        engineAgreement = true;
        confidence = 'high';
        
        // Now check major/minor with refiner
        if (refinerSuggestion) {
          const refinerIsMinor = refinerSuggestion === 'minor';
          
          if (refinerIsMinor !== chordIsMinor && refinerConfidence >= 0.65) {
            // Refiner disagrees on quality - CONFLICT
            // Trust refiner if confidence is high
            const suffix = this.extractSuffix(chord.label);
            const newQuality = refinerIsMinor ? 'm' : '';
            finalLabel = this.NOTES[chordRoot] + newQuality + suffix;
            
            conflictResolved = true;
            refinerOverride = true;
            
            if (opts.debug) {
              console.log(`   🔄 ${chord.label} → ${finalLabel} (refiner: ${(refinerConfidence * 100).toFixed(0)}%)`);
            }
          } else {
            // Refiner AGREES
            engineAgreement = true;
            confidence = 'very_high';
          }
        }
      }
      // Case 2: Bass root DIFFERS from chord root
      else if (bassRoot >= 0 && bassRoot !== chordRoot && bassConfidence > 0.7) {
        // Bass suggests DIFFERENT root - major CONFLICT
        
        // Check if bass root makes sense in key
        const bassInKey = this.isInKey(bassRoot, key);
        const chordInKey = this.isInKey(chordRoot, key);
        
        if (bassInKey && !chordInKey && bassConfidence > 0.75) {
          // Bass is in key, chord is not - trust bass
          const suffix = this.extractSuffix(chord.label);
          finalLabel = this.NOTES[bassRoot] + suffix;
          
          conflictResolved = true;
          bassOverride = true;
          confidence = 'medium';
          
          if (opts.debug) {
            console.log(`   🎸 ${chord.label} → ${finalLabel} (bass root: ${this.NOTES[bassRoot]}, confidence: ${(bassConfidence * 100).toFixed(0)}%)`);
          }
        } else if (chordInKey && !bassInKey) {
          // Chord is in key, bass is not - trust chord
          confidence = 'medium';
        } else {
          // Both in key or both not in key - keep chord, but note disagreement
          confidence = 'low';
        }
      }
      // Case 3: No bass or bass is ambiguous
      else {
        // Rely on MajorMinorRefiner only
        if (refinerSuggestion && refinerConfidence >= 0.70) {
          const refinerIsMinor = refinerSuggestion === 'minor';
          
          if (refinerIsMinor !== chordIsMinor) {
            const suffix = this.extractSuffix(chord.label);
            const newQuality = refinerIsMinor ? 'm' : '';
            finalLabel = this.NOTES[chordRoot] + newQuality + suffix;
            
            refinerOverride = true;
            confidence = 'medium';
            
            if (opts.debug) {
              console.log(`   🎹 ${chord.label} → ${finalLabel} (refiner only: ${(refinerConfidence * 100).toFixed(0)}%)`);
            }
          }
        }
      }
      
      integrated.push({
        ...chord,
        label: finalLabel,
        originalLabel: chord.label !== finalLabel ? chord.label : undefined,
        engineAgreement,
        conflictResolved,
        bassOverride,
        refinerOverride,
        confidence,
        bassRoot: bassRoot >= 0 ? this.NOTES[bassRoot] : undefined,
        bassConfidence: bassRoot >= 0 ? bassConfidence : undefined,
        refinerSuggestion,
        refinerConfidence
      });
    }
    
    return integrated;
  }
  
  /**
   * Check if pitch class is in key
   */
  isInKey(pc, key) {
    if (!key) return false;
    
    const toPc = n => ((n % 12) + 12) % 12;
    const MAJOR_SCALE = [0,2,4,5,7,9,11];
    const MINOR_SCALE = [0,2,3,5,7,8,10];
    
    const scale = key.minor ? MINOR_SCALE : MAJOR_SCALE;
    const diatonic = scale.map(s => toPc(key.root + s));
    
    return diatonic.includes(toPc(pc));
  }
  
  /**
   * Parse root from chord label
   */
  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#{1}|b{1})?/);
    if (!m) return -1;
    const note = m[1] + (m[2] || '');
    return this.NOTES.indexOf(note);
  }
  
  /**
   * Extract suffix (7, maj7, etc.) from chord label
   */
  extractSuffix(label) {
    if (!label) return '';
    const m = label.match(/^[A-G](?:#|b)?m?(.*)/);
    return m ? m[1] : '';
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordIntegrator;
}
