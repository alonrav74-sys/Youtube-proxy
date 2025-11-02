/**
 * 🎯 BassTonicDetector - Precise Key Detection
 * 
 * Fixes the "Hallelujah problem" where C major is detected as G major.
 * 
 * Method: 4-step weighted analysis
 * 1. Final bass (last 10%) - songs END on tonic (weight: 1000)
 * 2. First bass (first 10%) - songs START on tonic (weight: 100)
 * 3. Agreement bonus - if first == last (weight: +500)
 * 4. Cadences (V→I patterns) - (weight: 50 per cadence)
 * 5. Most common bass - (weight: 2× percentage)
 * 
 * Usage in ChordEngine:
 * 
 * // In estimateKey() - BEFORE the final return statement:
 * if (bassPc && bassPc.length > 10) {
 *   const detector = new BassTonicDetector();
 *   const bassResult = detector.detect(bassPc, chroma, this);
 *   
 *   if (bassResult.confidence > 0.7) {
 *     console.log(`✅ Using BASS detection: ${this.nameSharp(bassResult.root)}${bassResult.minor ? 'm' : ''}`);
 *     return bassResult;
 *   }
 * }
 * 
 * @version 1.0.0
 */

class BassTonicDetector {
  /**
   * Detect tonic from bass notes
   * @param {Array<number>} bassPc - Bass pitch classes per frame (-1 = no bass)
   * @param {Array<Float32Array>} chroma - Chroma vectors per frame
   * @param {ChordEngine} engine - Reference to ChordEngine for utility functions
   * @returns {Object} { root, minor, confidence }
   */
  detect(bassPc, chroma, engine) {
    console.log('\n🎯 === BASS-BASED TONIC DETECTION ===\n');
    
    const scores = new Array(12).fill(0);
    
    // ============================================
    // 1️⃣ FINAL BASS (Most Important!)
    // ============================================
    const finalStartIdx = Math.floor(bassPc.length * 0.90);
    const finalHist = new Array(12).fill(0);
    
    for (let i = finalStartIdx; i < bassPc.length; i++) {
      if (bassPc[i] >= 0) finalHist[bassPc[i]]++;
    }
    
    let finalBass = -1, finalBassCount = 0;
    for (let p = 0; p < 12; p++) {
      if (finalHist[p] > finalBassCount) {
        finalBassCount = finalHist[p];
        finalBass = p;
      }
    }
    
    if (finalBass >= 0 && finalBassCount >= 5) {
      scores[finalBass] += 1000; // 🔥 DOMINANT SCORE!
      console.log(`✅ Final bass (last 10%): ${engine.nameSharp(finalBass)} (${finalBassCount} frames) → +1000`);
    } else {
      console.log(`⚠️ Final bass unclear (best: ${finalBassCount} frames)`);
    }
    
    // ============================================
    // 2️⃣ FIRST BASS
    // ============================================
    const skipIntro = Math.floor(bassPc.length * 0.01); // Skip first 1% (intro noise)
    const firstEndIdx = Math.floor(bassPc.length * 0.10);
    const firstHist = new Array(12).fill(0);
    
    for (let i = skipIntro; i < firstEndIdx; i++) {
      if (bassPc[i] >= 0) firstHist[bassPc[i]]++;
    }
    
    let firstBass = -1, firstBassCount = 0;
    for (let p = 0; p < 12; p++) {
      if (firstHist[p] > firstBassCount) {
        firstBassCount = firstHist[p];
        firstBass = p;
      }
    }
    
    if (firstBass >= 0 && firstBassCount >= 3) {
      scores[firstBass] += 100;
      console.log(`✅ First bass (first 10%): ${engine.nameSharp(firstBass)} (${firstBassCount} frames) → +100`);
    }
    
    // ============================================
    // 3️⃣ FIRST + LAST AGREEMENT - Huge Bonus!
    // ============================================
    if (finalBass >= 0 && firstBass >= 0 && finalBass === firstBass) {
      scores[finalBass] += 500;
      console.log(`🎯 First & Last AGREE: ${engine.nameSharp(finalBass)} → +500 BONUS!`);
    }
    
    // ============================================
    // 4️⃣ CADENCE ANALYSIS (V→I)
    // ============================================
    const cadences = new Array(12).fill(0);
    
    for (let i = 1; i < bassPc.length; i++) {
      const prev = bassPc[i - 1];
      const curr = bassPc[i];
      
      if (prev >= 0 && curr >= 0 && prev !== curr) {
        const interval = engine.toPc(curr - prev);
        
        // Perfect 5th down (V→I) or Perfect 4th up
        if (interval === 5 || interval === 7) {
          cadences[curr]++;
        }
      }
    }
    
    let cadenceTonic = -1, maxCadence = 0;
    for (let p = 0; p < 12; p++) {
      if (cadences[p] > maxCadence) {
        maxCadence = cadences[p];
        cadenceTonic = p;
      }
    }
    
    if (cadenceTonic >= 0 && maxCadence > 0) {
      const cadencePoints = maxCadence * 50;
      scores[cadenceTonic] += cadencePoints;
      console.log(`✅ Cadences (V→I): ${engine.nameSharp(cadenceTonic)} (${maxCadence}×) → +${cadencePoints}`);
    }
    
    // ============================================
    // 5️⃣ BASS HISTOGRAM (entire song)
    // ============================================
    const totalHist = new Array(12).fill(0);
    
    for (let i = 0; i < bassPc.length; i++) {
      if (bassPc[i] >= 0) totalHist[bassPc[i]]++;
    }
    
    let mostCommon = -1, maxCount = 0;
    for (let p = 0; p < 12; p++) {
      if (totalHist[p] > maxCount) {
        maxCount = totalHist[p];
        mostCommon = p;
      }
    }
    
    if (mostCommon >= 0) {
      const histPoints = Math.floor((maxCount / bassPc.length) * 100);
      scores[mostCommon] += histPoints;
      console.log(`✅ Most common bass: ${engine.nameSharp(mostCommon)} (${(maxCount/bassPc.length*100).toFixed(1)}%) → +${histPoints}`);
    }
    
    // ============================================
    // FIND WINNER
    // ============================================
    let winner = 0, bestScore = scores[0];
    for (let p = 1; p < 12; p++) {
      if (scores[p] > bestScore) {
        bestScore = scores[p];
        winner = p;
      }
    }
    
    // Show top 3 candidates
    const sorted = scores
      .map((score, pc) => ({ pc, score, name: engine.nameSharp(pc) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    console.log(`\n📊 Top 3 candidates: ${sorted.map(x => `${x.name}(${x.score})`).join(', ')}`);
    
    // ============================================
    // MAJOR vs MINOR?
    // ============================================
    // Look at final section chroma
    const finalChroma = new Float32Array(12);
    let count = 0;
    
    const finalChromaStart = Math.floor(chroma.length * 0.90);
    for (let i = finalChromaStart; i < chroma.length; i++) {
      if (chroma[i]) {
        for (let p = 0; p < 12; p++) {
          finalChroma[p] += chroma[i][p];
        }
        count++;
      }
    }
    
    if (count > 0) {
      for (let p = 0; p < 12; p++) finalChroma[p] /= count;
    }
    
    const minor3rd = finalChroma[engine.toPc(winner + 3)] || 0;
    const major3rd = finalChroma[engine.toPc(winner + 4)] || 0;
    
    const isMinor = minor3rd > major3rd * 1.2;
    
    console.log(`\n🎵 Quality analysis:`);
    console.log(`   Minor 3rd: ${minor3rd.toFixed(3)}`);
    console.log(`   Major 3rd: ${major3rd.toFixed(3)}`);
    console.log(`   → ${isMinor ? 'MINOR' : 'MAJOR'}`);
    
    const confidence = Math.min(1.0, bestScore / 1500);
    
    console.log(`\n🎯 FINAL RESULT: ${engine.nameSharp(winner)}${isMinor ? 'm' : ''} (confidence: ${confidence.toFixed(2)})\n`);
    
    return {
      root: winner,
      minor: isMinor,
      confidence: confidence
    };
  }
}

// Export for both browser and Node.js
if (typeof window !== 'undefined') {
  window.BassTonicDetector = BassTonicDetector;
  console.log('✅ BassTonicDetector loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassTonicDetector;
}
