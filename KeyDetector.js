/**
 * KeyDetector v1.0
 * מודול נפרד לזיהוי סולם/מפתח
 * הופרד מ-ChordEngineEnhanced v14.37
 */

class KeyDetector {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  }

  /**
   * זיהוי טוניקה מהבס
   */
  detectTonicFromBass(feats) {
    const { bassPc, frameE, introSkipFrames, percentiles } = feats;
    const threshold = (percentiles && percentiles.p80) || this.percentile(frameE, 80);
    const bassHist = new Array(12).fill(0);
    const start = introSkipFrames || 0;
    const toPc = n => ((n % 12) + 12) % 12;

    for (let i = start; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        const w = frameE[i] / threshold;
        bassHist[bp] += w;
      }
    }

    let tonicPc = 0;
    let maxVal = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (bassHist[pc] > maxVal) {
        maxVal = bassHist[pc];
        tonicPc = pc;
      }
    }

    const total = bassHist.reduce((a, b) => a + b, 0) || 1;
    const confidence = maxVal / total;
    const root = tonicPc;

    const m3_bass = bassHist[toPc(root + 3)] / total;
    const M3_bass = bassHist[toPc(root + 4)] / total;
    const m6_bass = bassHist[toPc(root + 8)] / total;
    const M6_bass = bassHist[toPc(root + 9)] / total;
    const m7_bass = bassHist[toPc(root + 10)] / total;
    const M7_bass = bassHist[toPc(root + 11)] / total;

    let minorBassScore = 0;
    let majorBassScore = 0;

    if (m6_bass > 0.05) minorBassScore += 3.0;
    if (m7_bass > 0.05) minorBassScore += 2.5;
    if (m3_bass > 0.04) minorBassScore += 2.0;
    
    if (M6_bass > 0.05) majorBassScore += 3.0;
    if (M7_bass > 0.05) majorBassScore += 2.5;
    if (M3_bass > 0.04) majorBassScore += 2.0;

    if (m6_bass > M6_bass * 1.5 && m6_bass > 0.03) minorBassScore += 2.0;
    if (M6_bass > m6_bass * 1.5 && M6_bass > 0.03) majorBassScore += 2.0;

    if (m7_bass > M7_bass * 1.5 && m7_bass > 0.03) minorBassScore += 1.5;
    if (M7_bass > m7_bass * 1.5 && M7_bass > 0.03) majorBassScore += 1.5;

    if (m3_bass > M3_bass * 1.5 && m3_bass > 0.03) minorBassScore += 1.5;
    if (M3_bass > m3_bass * 1.5 && M3_bass > 0.03) majorBassScore += 1.5;

    let minorHint = undefined;
    let bassMinorConfidence = 0;

    if (minorBassScore > 2.0 || majorBassScore > 2.0) {
      minorHint = minorBassScore > majorBassScore;
      bassMinorConfidence = Math.min(1.0, Math.abs(minorBassScore - majorBassScore) / 8.0);
    }

    return { root: tonicPc, confidence, minorHint, bassMinorConfidence };
  }

  /**
   * זיהוי סולם משופר (KS + Bass)
   */
  detectKeyEnhanced(feats) {
    const { chroma, frameE, introSkipFrames, percentiles } = feats;
    if (!chroma || !chroma.length) return { root: 0, minor: false, confidence: 0.5 };

    const bassTonic = this.detectTonicFromBass(feats);
    const toPc = n => ((n % 12) + 12) % 12;

    if (bassTonic.confidence > 0.25) {
      const root = bassTonic.root;
      const start = introSkipFrames || 0;
      const thr = (percentiles && percentiles.p80) || this.percentile(frameE, 80);

      const agg = new Array(12).fill(0);
      let totalW = 0;

      const opening = new Array(12).fill(0);
      const closing = new Array(12).fill(0);
      let openingW = 0;
      let closingW = 0;

      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= thr) {
          const w = frameE[i] / thr;
          const c = chroma[i];
          
          for (let p = 0; p < 12; p++) agg[p] += c[p] * w;
          totalW += w;

          if (i < start + 5) {
            for (let p = 0; p < 12; p++) opening[p] += c[p] * w * 3.0;
            openingW += w * 3.0;
          }

          if (i >= chroma.length - 5) {
            for (let p = 0; p < 12; p++) closing[p] += c[p] * w * 3.0;
            closingW += w * 3.0;
          }
        }
      }

      if (totalW > 0) for (let p = 0; p < 12; p++) agg[p] /= totalW;
      if (openingW > 0) for (let p = 0; p < 12; p++) opening[p] /= openingW;
      if (closingW > 0) for (let p = 0; p < 12; p++) closing[p] /= closingW;

      const m3 = agg[toPc(root + 3)] || 0;
      const M3 = agg[toPc(root + 4)] || 0;
      const m6 = agg[toPc(root + 8)] || 0;
      const M6 = agg[toPc(root + 9)] || 0;
      const m7 = agg[toPc(root + 10)] || 0;
      const M7 = agg[toPc(root + 11)] || 0;

      const opening_m3 = opening[toPc(root + 3)] || 0;
      const opening_M3 = opening[toPc(root + 4)] || 0;
      const closing_m3 = closing[toPc(root + 3)] || 0;
      const closing_M3 = closing[toPc(root + 4)] || 0;

      let minorScore = 0;
      let majorScore = 0;

      const thirdRatio = (m3 + 0.0001) / (M3 + 0.0001);
      if (thirdRatio >= 1.03) minorScore += 5.0 * Math.min(3.0, thirdRatio - 1.0);
      else if (thirdRatio <= 0.97) majorScore += 5.0 * Math.min(3.0, 1.0 / thirdRatio - 1.0);

      const sixthRatio = (m6 + 0.0001) / (M6 + 0.0001);
      if (sixthRatio >= 1.08) minorScore += 3.0 * Math.min(2.5, sixthRatio - 1.0);
      else if (sixthRatio <= 0.93) majorScore += 3.0 * Math.min(2.5, 1.0 / sixthRatio - 1.0);

      const seventhRatio = (m7 + 0.0001) / (M7 + 0.0001);
      if (seventhRatio >= 1.08) minorScore += 2.0 * Math.min(2.0, seventhRatio - 1.0);
      else if (seventhRatio <= 0.93) majorScore += 2.0 * Math.min(2.0, 1.0 / seventhRatio - 1.0);

      const openingThirdRatio = (opening_m3 + 0.0001) / (opening_M3 + 0.0001);
      if (openingThirdRatio > 1.05) minorScore += 4.0;
      else if (openingThirdRatio < 0.95) majorScore += 4.0;

      const closingThirdRatio = (closing_m3 + 0.0001) / (closing_M3 + 0.0001);
      if (closingThirdRatio > 1.05) minorScore += 4.0;
      else if (closingThirdRatio < 0.95) majorScore += 4.0;

      if (bassTonic.minorHint !== undefined) {
        if (bassTonic.minorHint) minorScore += bassTonic.bassMinorConfidence * 3.0;
        else majorScore += bassTonic.bassMinorConfidence * 3.0;
      }

      if (Math.abs(minorScore - majorScore) < 2.0) {
        if (m6 > 0.08 && m6 >= M6) minorScore += 2.0;
        if (m3 > 0.10 && m3 >= M3 * 0.95) minorScore += 1.5;
      }

      const isMinor = minorScore > majorScore;
      const separation = Math.abs(minorScore - majorScore);
      const spread = Math.abs(m3 - M3) + Math.abs(m6 - M6) + Math.abs(m7 - M7);
      let confidence = 0.25 + bassTonic.confidence * 0.25 + separation * 0.15 + spread * 0.8;
      confidence = Math.min(1.0, confidence);

      return { root, minor: !!isMinor, confidence };
    }

    // Fallback to Krumhansl-Schmuckler
    const agg = new Array(12).fill(0);

    for (let i = 0; i < chroma.length; i++) {
      const pos = i / chroma.length;
      let w = 1.0;
      if (pos < 0.10) w = 5.0;
      else if (pos > 0.90) w = 3.0;

      const c = chroma[i];
      for (let p = 0; p < 12; p++) agg[p] += c[p] * w;
    }

    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;

    let best = { score: -Infinity, root: 0, minor: false };

    for (let r = 0; r < 12; r++) {
      let scoreMaj = 0;
      let scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        const idx = toPc(r + i);
        scoreMaj += agg[idx] * this.KS_MAJOR[i];
        scoreMin += agg[idx] * this.KS_MINOR[i];
      }
      if (scoreMaj > best.score) best = { score: scoreMaj, root: r, minor: false };
      if (scoreMin > best.score) best = { score: scoreMin, root: r, minor: true };
    }

    const confidence = Math.min(1.0, best.score / 10);
    return { root: best.root, minor: best.minor, confidence };
  }

  /**
   * זיהוי מושלם עם מערכת הצבעות
   */
  detectTonicPerfect(feats, timeline, duration, helpers) {
    const toPc = n => ((n % 12) + 12) % 12;
    const { parseRoot, getChordDuration } = helpers;
    
    const votes = {};
    for (let pc = 0; pc < 12; pc++) {
      votes[pc] = { major: 0, minor: 0 };
    }

    const bassResult = this.detectTonicFromBass(feats);
    if (bassResult.confidence > 0.15) {
      const bassWeight = 50 * bassResult.confidence;
      
      if (bassResult.minorHint === true) {
        votes[bassResult.root].minor += bassWeight;
      } else if (bassResult.minorHint === false) {
        votes[bassResult.root].major += bassWeight;
      } else {
        votes[bassResult.root].major += bassWeight * 0.5;
        votes[bassResult.root].minor += bassWeight * 0.5;
      }
    }

    const { chroma, frameE, introSkipFrames, percentiles } = feats;
    if (chroma?.length) {
      const start = introSkipFrames || 0;
      const threshold = percentiles?.p70 || this.percentile(frameE, 70);
      
      for (let pc = 0; pc < 12; pc++) {
        let minorThirdCount = 0;
        let majorThirdCount = 0;
        let totalWeight = 0;
        
        for (let i = start; i < chroma.length; i++) {
          if (frameE[i] >= threshold && chroma[i]) {
            const root = chroma[i][pc] || 0;
            const m3 = chroma[i][toPc(pc + 3)] || 0;
            const M3 = chroma[i][toPc(pc + 4)] || 0;
            
            const weight = frameE[i] / threshold;
            
            if (root > 0.3 && m3 > 0.2 && m3 > M3 * 1.2) {
              minorThirdCount += weight;
            }
            if (root > 0.3 && M3 > 0.2 && M3 > m3 * 1.2) {
              majorThirdCount += weight;
            }
            
            totalWeight += weight;
          }
        }
        
        if (totalWeight > 0) {
          const minorRatio = minorThirdCount / totalWeight;
          const majorRatio = majorThirdCount / totalWeight;
          
          if (minorRatio > 0.15) votes[pc].minor += 20 * minorRatio;
          if (majorRatio > 0.15) votes[pc].major += 20 * majorRatio;
        }
      }
    }

    if (timeline?.length > 0) {
      let firstSignificantChord = null;
      for (let i = 0; i < Math.min(5, timeline.length); i++) {
        const ch = timeline[i];
        if (ch?.label) {
          const dur = getChordDuration(ch, timeline, duration);
          if (dur >= 0.5) {
            firstSignificantChord = ch;
            break;
          }
        }
      }
      
      if (firstSignificantChord) {
        const root = parseRoot(firstSignificantChord.label);
        if (root >= 0) {
          const isMinor = /m(?!aj)/.test(firstSignificantChord.label);
          if (isMinor) votes[root].minor += 15;
          else votes[root].major += 15;
        }
      }
    }

    if (timeline?.length > 1) {
      const lastChord = timeline[timeline.length - 1];
      if (lastChord?.label) {
        const root = parseRoot(lastChord.label);
        if (root >= 0) {
          const isMinor = /m(?!aj)/.test(lastChord.label);
          if (isMinor) votes[root].minor += 15;
          else votes[root].major += 15;
        }
      }
    }

    if (timeline?.length > 1) {
      for (let i = 0; i < timeline.length - 1; i++) {
        const current = timeline[i];
        const next = timeline[i + 1];
        if (!current?.label || !next?.label) continue;
        
        const currentRoot = parseRoot(current.label);
        const nextRoot = parseRoot(next.label);
        if (currentRoot < 0 || nextRoot < 0) continue;
        
        const interval = toPc(currentRoot - nextRoot);
        const nextIsMinor = /m(?!aj)/.test(next.label);
        
        let cadenceStrength = 0;
        if (interval === 7) cadenceStrength = 10;
        else if (interval === 5) cadenceStrength = 7;
        else if (interval === 1) cadenceStrength = 8;
        else if (interval === 10) cadenceStrength = 5;
        else if (interval === 8) cadenceStrength = 6;
        
        if (cadenceStrength > 0) {
          if (nextIsMinor) votes[nextRoot].minor += cadenceStrength;
          else votes[nextRoot].major += cadenceStrength;
        }
      }
    }

    if (chroma?.length) {
      const melodyHist = new Array(12).fill(0);
      const start = introSkipFrames || 0;
      const threshold = percentiles?.p75 || this.percentile(frameE, 75);
      
      for (let i = start; i < chroma.length; i++) {
        if (frameE[i] >= threshold && chroma[i]) {
          for (let pc = 0; pc < 12; pc++) {
            if (chroma[i][pc] > 0.4) {
              melodyHist[pc] += chroma[i][pc] * (frameE[i] / threshold);
            }
          }
        }
      }
      
      let maxMelody = 0, melodyPc = -1;
      for (let pc = 0; pc < 12; pc++) {
        if (melodyHist[pc] > maxMelody) {
          maxMelody = melodyHist[pc];
          melodyPc = pc;
        }
      }
      
      if (melodyPc >= 0) {
        votes[melodyPc].major += 2.5;
        votes[melodyPc].minor += 2.5;
      }
    }

    let bestRoot = 0, bestMode = false, bestScore = -Infinity;
    
    for (let pc = 0; pc < 12; pc++) {
      if (votes[pc].major > bestScore) {
        bestScore = votes[pc].major;
        bestRoot = pc;
        bestMode = false;
      }
      if (votes[pc].minor > bestScore) {
        bestScore = votes[pc].minor;
        bestRoot = pc;
        bestMode = true;
      }
    }

    const totalPossibleVotes = 50 + 20 + 15 + 15 + 10 + 5;
    const confidence = Math.min(1.0, bestScore / totalPossibleVotes);

    return {
      root: bestRoot,
      minor: bestMode,
      confidence: confidence,
      method: 'perfect_voting',
      votes: votes
    };
  }

  /**
   * זיהוי טוניקה מוזיקלי מה-timeline
   */
  detectTonicMusically(timeline, key, duration, helpers) {
    const { parseRoot, getChordDuration, getNoteName } = helpers;
    
    if (!timeline || timeline.length < 3) {
      return {
        root: key.root,
        label: getNoteName(key.root, key) + (key.minor ? 'm' : ''),
        confidence: 50
      };
    }

    const candidates = {};
    let totalDuration = 0;
    const toPc = n => ((n % 12) + 12) % 12;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const root = parseRoot(chord.label);
      if (root < 0) continue;

      const dur = getChordDuration(chord, timeline, duration);
      totalDuration += dur;

      if (!candidates[root]) {
        candidates[root] = { duration: 0, openingScore: 0, closingScore: 0, cadenceScore: 0 };
      }
      candidates[root].duration += dur;
    }

    let realStart = 0;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].t >= 1.5) {
        realStart = i;
        break;
      }
    }
    
    const opening = timeline.slice(realStart, Math.min(realStart + 3, timeline.length));
    
    for (let i = 0; i < opening.length; i++) {
      const root = parseRoot(opening[i].label);
      if (root >= 0 && candidates[root]) {
        const w = i === 0 ? 60 : (3 - i) * 8;
        candidates[root].openingScore += w;
      }
    }

    const closing = timeline.slice(Math.max(0, timeline.length - 3));
    for (let i = 0; i < closing.length; i++) {
      const root = parseRoot(closing[i].label);
      if (root >= 0 && candidates[root]) {
        candidates[root].closingScore += (i + 1) * 12;
      }
    }

    for (let i = 0; i < timeline.length - 1; i++) {
      const r1 = parseRoot(timeline[i].label);
      const r2 = parseRoot(timeline[i + 1].label);
      if (r1 < 0 || r2 < 0) continue;
      const interval = toPc(r2 - r1);
      if ((interval === 5 || interval === 7) && candidates[r2]) {
        const dur = getChordDuration(timeline[i + 1], timeline, duration);
        candidates[r2].cadenceScore += 3 * dur;
      }
    }

    let bestRoot = key.root;
    let bestScore = -Infinity;

    for (const rootStr in candidates) {
      const root = parseInt(rootStr, 10);
      const c = candidates[root];
      const durScore = (c.duration / (totalDuration || 1)) * 40;
      const score = durScore + c.openingScore + c.closingScore + c.cadenceScore;
      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
      }
    }

    const confidence = Math.max(30, Math.min(100, bestScore));
    return {
      root: bestRoot,
      label: this.NOTES_SHARP[((bestRoot % 12) + 12) % 12] + (key.minor ? 'm' : ''),
      confidence
    };
  }

  // Helper
  percentile(arr, p) {
    const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    const idx = Math.floor((p / 100) * (a.length - 1));
    return a[idx];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeyDetector;
}
