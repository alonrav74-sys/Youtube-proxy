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
  }

  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.NOTES_SHARP[this.toPc(pc)]; }
  nameFlat(pc) { return this.NOTES_FLAT[this.toPc(pc)]; }

  /**
   * 🎯 בניית אקורדים מותרים לפי הסולם
   * מחזיר רשימה של pitch classes מותרים + אקורדים מושאלים נפוצים
   */
  buildAllowedChords(key) {
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    // 🎵 אקורדים מושאלים נפוצים (Modal Interchange)
    const borrowed = [];
    
    if (key.minor) {
      // במינור: V מז'ור (דומיננטה), VII מז'ור
      borrowed.push(this.toPc(key.root + 7));  // V
      borrowed.push(this.toPc(key.root + 11)); // VII (leading tone)
    } else {
      // במז'ור: iv מינור, bVII, bVI (modal borrowing)
      borrowed.push(this.toPc(key.root + 5));  // iv (borrowed from minor)
      borrowed.push(this.toPc(key.root + 10)); // bVII
    }
    
    // 🔥 דומיננטות משניות (Secondary Dominants) - אבל רק אם יש 7!
    const secondaryDominants = diatonic.map(note => this.toPc(note + 7)); // V of each scale degree
    
    return {
      diatonic: diatonic,           // הכי חזק
      borrowed: borrowed,            // חזק
      secondaryDominants: secondaryDominants, // בינוני (רק עם 7)
      allAllowed: [...new Set([...diatonic, ...borrowed])]
    };
  }

  /**
   * 🎯 ציון אמינות לאקורד
   * מחזיר ציון 0-100 עבור כל אקורד לפי ההקשר ההרמוני
   */
  scoreChordConfidence(root, label, key, avgChroma, duration) {
    const allowed = this.buildAllowedChords(key);
    let score = 0;
    
    // 1️⃣ האם האקורד בסולם?
    if (allowed.diatonic.includes(root)) {
      score += 50; // בונוס חזק
    } else if (allowed.borrowed.includes(root)) {
      score += 30; // בונוס בינוני
    } else if (allowed.secondaryDominants.includes(root) && label.includes('7')) {
      score += 20; // דומיננט משני רק עם 7
    } else {
      score -= 30; // קנס כבד על אקורד לא לוגי
    }
    
    // 2️⃣ חוזק הכרומה
    const rootStrength = avgChroma[root] || 0;
    score += rootStrength * 50; // 0-50 נקודות
    
    // 3️⃣ משך האקורד (ארוך = יותר מהימן)
    if (duration > 1.5) score += 20;
    else if (duration > 0.75) score += 10;
    else if (duration < 0.3) score -= 20; // אקורדים קצרים מאוד = חשודים
    
    // 4️⃣ בדיקת טריאד תקין
    const hasValidTriad = this.hasValidTriad(root, label, avgChroma);
    if (hasValidTriad) {
      score += 15;
    } else {
      score -= 25; // אין טריאד = לא אקורד אמיתי
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 🎵 בדיקה אם יש טריאד תקין (root + 3rd + 5th)
   */
  hasValidTriad(root, label, avgChroma) {
    const rootStrength = avgChroma[root] || 0;
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    
    const isMinor = label.includes('m') && !label.includes('maj');
    const third = isMinor ? minor3rd : major3rd;
    
    // צריך root + 3rd + 5th מעל סף מינימלי
    return rootStrength > 0.12 && third > 0.08 && fifth > 0.08;
  }

  /**
   * 2. בניית טבלת קווינטות (Circle of Fifths)
   */
  buildCircleOfFifths(key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const scaleNotes = scale.map(interval => this.toPc(key.root + interval));
    
    const fifthsOrder = [];
    let currentNote = key.root;
    
    for (let i = 0; i < 7; i++) {
      fifthsOrder.push(currentNote);
      currentNote = this.toPc(currentNote + 7);
    }
    
    const naturalChords = fifthsOrder.map(note => {
      const degreeInScale = scaleNotes.indexOf(note);
      if (degreeInScale === -1) return null;
      
      let quality = '';
      if (key.minor) {
        if ([0, 3, 4].includes(degreeInScale)) quality = 'm';
        if (degreeInScale === 1) quality = 'dim';
      } else {
        if ([1, 2, 5].includes(degreeInScale)) quality = 'm';
        if (degreeInScale === 6) quality = 'dim';
      }
      
      return {
        root: note,
        label: this.nameSharp(note) + quality,
        degree: degreeInScale + 1,
        function: this.getChordFunction(degreeInScale, key.minor)
      };
    }).filter(x => x !== null);
    
    return naturalChords;
  }

  getChordFunction(degree, isMinor) {
    if (isMinor) {
      const functions = ['Tonic', 'Subdominant', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Subtonic'];
      return functions[degree] || 'Unknown';
    } else {
      const functions = ['Tonic', 'Supertonic', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Leading Tone'];
      return functions[degree] || 'Unknown';
    }
  }
  
  /**
   * 🎼 Get diatonic chord names for display
   * Returns the 7 natural chords in the key
   */
  getDiatonicChords(tonic, mode) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const tonicRoot = this.parseRoot(tonic);
    if (tonicRoot < 0) return [];
    
    const chords = [];
    
    if (mode === 'major') {
      // Major scale chord qualities: I, ii, iii, IV, V, vi, vii°
      const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
      const scale = [0, 2, 4, 5, 7, 9, 11]; // intervals from tonic
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        const rootName = noteNames[root];
        chords.push(rootName + qualities[i]);
      }
    } else {
      // Natural minor scale chord qualities: i, ii°, III, iv, v, VI, VII
      const qualities = ['m', 'dim', '', 'm', 'm', '', ''];
      const scale = [0, 2, 3, 5, 7, 8, 10]; // intervals from tonic
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        const rootName = noteNames[root];
        chords.push(rootName + qualities[i]);
      }
    }
    
    return chords;
  }

  percentileLocal(arr, pct) {
    const sorted = [...arr].filter(x => Number.isFinite(x)).sort((a,b) => a-b);
    const idx = Math.floor(sorted.length * pct / 100);
    return sorted[idx] || 0;
  }

  /**
   * 1. זיהוי טוניקה עם Krumhansl-Schmuckler profiles
   */
  estimateKey(chroma) {
    const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    const agg = new Array(12).fill(0);
    for (const c of chroma) {
      for (let p = 0; p < 12; p++) agg[p] += c[p];
    }
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;
    
    let bestRoot = 0, bestScore = -Infinity, bestMinor = false;
    
    for (let root = 0; root < 12; root++) {
      let scoreMaj = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += agg[this.toPc(root + i)] * KS_MAJOR[i];
      }
      
      let scoreMin = 0;
      for (let i = 0; i < 12; i++) {
        scoreMin += agg[this.toPc(root + i)] * KS_MINOR[i];
      }
      
      if (scoreMaj > bestScore) {
        bestScore = scoreMaj;
        bestRoot = root;
        bestMinor = false;
      }
      
      if (scoreMin > bestScore) {
        bestScore = scoreMin;
        bestRoot = root;
        bestMinor = true;
      }
    }
    
    return { 
      root: bestRoot, 
      minor: bestMinor,
      confidence: bestScore
    };
  }

  // Audio Processing Functions

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const frames = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      frames.push(e);
    }
    const minLag = Math.floor(0.3 / (hop / sr));
    const maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const bpm = 60 / (bestLag * (hop / sr));
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  mixStereo(buf) {
    const a = buf.getChannelData(0);
    const b = buf.getChannelData(1) || a;
    const m = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) m[i] = (a[i] + b[i]) * 0.5;
    return m;
  }

  resampleLinear(x, sr, target) {
    const r = target / sr;
    const L = Math.floor(x.length * r);
    const y = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const t = i / r;
      const i0 = Math.floor(t);
      const i1 = Math.min(x.length - 1, i0 + 1);
      y[i] = x[i0] * (1 - (t - i0)) + x[i1] * (t - i0);
    }
    return y;
  }

  extractFeatures(audioData, bpm) {
    const { x, sr } = audioData;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
    
    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) frames.push(x.subarray(s, s + win));
    
    const fft = (input) => {
      let n = input.length, N = 1;
      while (N < n) N <<= 1;
      const re = new Float32Array(N), im = new Float32Array(N);
      re.set(input);
      let j = 0;
      for (let i = 0; i < N; i++) {
        if (i < j) {
          [re[i], re[j]] = [re[j], re[i]];
          [im[i], im[j]] = [im[j], im[i]];
        }
        let m = N >> 1;
        while (m >= 1 && j >= m) { j -= m; m >>= 1; }
        j += m;
      }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = -2 * Math.PI / len, wlr = Math.cos(ang), wli = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
          let wr = 1, wi = 0;
          for (let k = 0; k < (len >> 1); k++) {
            const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi;
            const vi = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr;
            re[i + k] = ur + vr; im[i + k] = ui + vi;
            re[i + k + (len >> 1)] = ur - vr; im[i + k + (len >> 1)] = ui - vi;
            const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr;
          }
        }
      }
      const mags = new Float32Array(N >> 1);
      for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
      return { mags, N };
    };
    
    const hz = (b, N) => b * sr / N;
    const chroma = [], bassPc = [], bassEnergy = [], frameE = [];
    const arpeggioWindow = Math.max(4, Math.min(8, Math.round(60 / bpm * sr / hop)));
    
    for (let i = 0; i < frames.length; i++) {
      const y = new Float32Array(win);
      for (let k = 0; k < win; k++) y[k] = frames[i][k] * hann[k];
      let en = 0;
      for (let k = 0; k < win; k++) en += y[k] * y[k];
      frameE.push(en);
      
      const accumulated = new Float32Array(12);
      const startIdx = Math.max(0, i - arpeggioWindow + 1);
      
      for (let j = startIdx; j <= i; j++) {
        const frame = frames[j];
        const tempY = new Float32Array(win);
        for (let k = 0; k < win; k++) tempY[k] = frame[k] * hann[k];
        const { mags, N } = fft(tempY);
        const weight = Math.pow(0.7, i - j);
        
        for (let b = 1; b < mags.length; b++) {
          const f = hz(b, N);
          if (f < 80 || f > 5000) continue;
          const midi = 69 + 12 * Math.log2(f / 440);
          const pc = this.toPc(Math.round(midi));
          const freqWeight = f < 300 ? 2.5 : 1.0;
          accumulated[pc] += mags[b] * freqWeight * weight;
        }
      }
      
      let s = 0;
      for (let k = 0; k < 12; k++) s += accumulated[k];
      if (s > 0) { for (let k = 0; k < 12; k++) accumulated[k] /= s; }
      chroma.push(accumulated);
      
      const bassChroma = new Float32Array(12);
      let bassEn = 0;
      
      for (let j = startIdx; j <= i; j++) {
        const frame = frames[j];
        const tempY = new Float32Array(win);
        for (let k = 0; k < win; k++) tempY[k] = frame[k] * hann[k];
        const { mags, N } = fft(tempY);
        const weight = Math.pow(0.8, i - j);
        
        for (let b = 1; b < mags.length; b++) {
          const f = hz(b, N);
          if (f >= 50 && f <= 200) {
            const midi = 69 + 12 * Math.log2(f / 440);
            const pc = this.toPc(Math.round(midi));
            const fundamental = f < 100 ? 10.0 : (f < 150 ? 5.0 : 2.0);
            bassChroma[pc] += mags[b] * fundamental * weight * 1.8;
            bassEn += mags[b] * weight;
          }
        }
      }
      
      let maxBass = -1, maxVal = 0;
      for (let pc = 0; pc < 12; pc++) {
        const score = bassChroma[pc];
        if (score > maxVal) { maxVal = score; maxBass = pc; }
      }
      
      const threshold = bassEn * 0.20;
      bassPc.push(bassChroma[maxBass] > threshold ? maxBass : -1);
      bassEnergy.push(bassEn);
    }
    
    const thrE = this.percentileLocal(frameE, 15);
    const bassPcFinal = new Array(bassPc.length).fill(-1);
    for (let i = 3; i < bassPc.length - 3; i++) {
      const v = bassPc[i];
      if (v < 0 || frameE[i] < thrE || bassEnergy[i] < this.percentileLocal(bassEnergy, 10)) continue;
      const window = [bassPc[i - 3], bassPc[i - 2], bassPc[i - 1], v, bassPc[i + 1], bassPc[i + 2], bassPc[i + 3]];
      const votes = window.filter(x => x === v).length;
      if (votes >= 3) bassPcFinal[i] = v;
    }
    
    return { chroma, bassPc: bassPcFinal, frameE, hop, sr };
  }

  detectMode(feats, key) {
    const { chroma } = feats;
    const agg = new Array(12).fill(0);
    for (const c of chroma) for (let p = 0; p < 12; p++) agg[p] += c[p];
    const s = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= s;
    if (!key.minor) {
      if (agg[this.toPc(key.root + 10)] > 0.15) return 'Mixolydian';
      if (agg[this.toPc(key.root + 6)] > 0.12) return 'Lydian';
      return 'Major';
    } else {
      if (agg[this.toPc(key.root + 9)] > 0.15 && agg[this.toPc(key.root + 11)] < 0.08) return 'Dorian';
      if (agg[this.toPc(key.root + 11)] > 0.15) return 'Harmonic Minor';
      return 'Natural Minor';
    }
  }

  /**
   * 🔥 בניית אקורדים מבס - גרסה מתוקנת עם הרמוניה חזקה
   */
  buildChordsFromBass(feats, key, bpm){
    const {bassPc, chroma, frameE, hop, sr} = feats;
    const allowed = this.buildAllowedChords(key);
    
    const spb = 60/Math.max(60, bpm||120);
    const minFrames = Math.max(2, Math.floor((spb * 0.3) / (hop/sr)));
    
    const timeline = [];
    let i = 0;
    
    while(i < bassPc.length){
      if(bassPc[i] < 0 || frameE[i] < this.percentileLocal(frameE, 15)){
        i++;
        continue;
      }
      
      const root = bassPc[i];
      const startFrame = i;
      const startTime = i * (hop/sr);
      
      // 🔥 בדיקה חזקה: האם הבס מותר בהקשר ההרמוני?
      if(!allowed.allAllowed.includes(root)){
        // אם הבס לא בסולם ולא מושאל - דלג עליו
        i++;
        continue;
      }
      
      let endFrame = startFrame;
      let gapCounter = 0;
      const maxGap = 3;
      
      while(endFrame < bassPc.length){
        if(bassPc[endFrame] === root){
          gapCounter = 0;
          endFrame++;
        } else if(bassPc[endFrame] < 0 || gapCounter < maxGap){
          gapCounter++;
          endFrame++;
        } else {
          break;
        }
      }
      
      if((endFrame - startFrame) < minFrames){
        i = endFrame;
        continue;
      }
      
      // Voting: מצא את הבס הכי שכיח
      const bassVotes = new Array(12).fill(0);
      for(let j = startFrame; j < endFrame; j++){
        if(bassPc[j] >= 0) bassVotes[bassPc[j]]++;
      }
      const votedRoot = bassVotes.indexOf(Math.max(...bassVotes));
      const finalRoot = votedRoot >= 0 ? votedRoot : root;
      
      // 🔥 בדיקה נוספת: האם הבס הסופי מותר?
      if(!allowed.allAllowed.includes(finalRoot)){
        i = endFrame;
        continue;
      }
      
      // חשב כרומה ממוצעת
      const avgChroma = new Float32Array(12);
      let totalWeight = 0;
      
      for(let j=startFrame; j<endFrame; j++){
        if(chroma[j]){
          const weight = Math.sqrt(frameE[j] || 1);
          for(let p=0; p<12; p++) avgChroma[p] += chroma[j][p] * weight;
          totalWeight += weight;
        }
      }
      
      if(totalWeight > 0){
        for(let p=0; p<12; p++) avgChroma[p] /= totalWeight;
      }
      
      // זהה major/minor
      const minor3rd = avgChroma[this.toPc(finalRoot + 3)] || 0;
      const major3rd = avgChroma[this.toPc(finalRoot + 4)] || 0;
      const fifth = avgChroma[this.toPc(finalRoot + 7)] || 0;
      
      const minor3rdHarmonic = avgChroma[this.toPc(finalRoot + 6)] || 0;
      const major3rdHarmonic = avgChroma[this.toPc(finalRoot + 8)] || 0;
      
      const minorScore = (minor3rd * 2.0) + (minor3rdHarmonic * 0.8) + (fifth * 1.0);
      const majorScore = (major3rd * 2.0) + (major3rdHarmonic * 0.8) + (fifth * 1.0);
      
      let isMinor = false;
      if(majorScore > minorScore * 1.2) {
        isMinor = false;
      } else if(minorScore > majorScore * 1.2) {
        isMinor = true;
      } else {
        isMinor = minorScore >= majorScore * 0.9;
      }
      
      // 🎯 קבע איכות לפי הסולם אם לא ברור
      if (Math.abs(majorScore - minorScore) < 0.05) {
        // השתמש בידע של הסולם
        const degreeInScale = allowed.diatonic.indexOf(finalRoot);
        if (degreeInScale >= 0) {
          if (key.minor) {
            isMinor = [0, 3, 4].includes(degreeInScale); // i, iv, v
          } else {
            isMinor = [1, 2, 5].includes(degreeInScale); // ii, iii, vi
          }
        }
      }
      
      let label = this.nameSharp(finalRoot) + (isMinor ? 'm' : '');
      const duration = (endFrame - startFrame) * (hop / sr);
      
      // 🔥 חישוב ציון אמינות
      const confidence = this.scoreChordConfidence(finalRoot, label, key, avgChroma, duration);
      
      // 🚫 דחה אקורדים חלשים
      if (confidence < 30) {
        i = endFrame;
        continue;
      }
      
      timeline.push({
        t: startTime,
        label: label,
        fi: startFrame,
        endFrame: endFrame,
        avgChroma: avgChroma,
        confidence: confidence,
        words: []
      });
      
      i = endFrame;
    }
    
    return timeline;
  }

  chromaDifference(chroma1, chroma2) {
    let diff = 0;
    for (let i = 0; i < 12; i++) {
      diff += Math.abs((chroma1[i] || 0) - (chroma2[i] || 0));
    }
    return diff / 12;
  }

  decideMajorMinorFromChroma(root, avgChroma) {
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    const rootStrength = avgChroma[root] || 0;
    
    if (minor3rd < 0.05 && major3rd < 0.05) {
      return fifth > 0.2;
    }
    
    if (major3rd > minor3rd * 1.3) return false;
    if (minor3rd > major3rd * 1.3) return true;
    
    const major3rdRatio = major3rd / (rootStrength + 0.001);
    const minor3rdRatio = minor3rd / (rootStrength + 0.001);
    
    if (major3rdRatio > minor3rdRatio * 1.1) return false;
    if (minor3rdRatio > major3rdRatio * 1.1) return true;
    
    return minor3rd >= major3rd * 0.85;
  }

  /**
   * 🔥 קישוטים - רק אם יש בסיס הרמוני חזק
   */
  decorateQualitiesBassFirst(tl, feats, key, mode, decMul = 1.0) {
    if (mode === 'basic') return tl;
    
    const allowed = this.buildAllowedChords(key);
    const out = [];
    
    for (const ev of tl) {
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }
      
      let avg;
      if (ev.avgChroma) {
        avg = ev.avgChroma;
      } else if (feats && feats.chroma && ev.fi !== undefined) {
        const startFi = ev.fi;
        const endFi = ev.endFrame || Math.min(startFi + 10, feats.chroma.length - 1);
        
        avg = new Float32Array(12);
        let count = 0;
        for (let i = startFi; i <= endFi && i < feats.chroma.length; i++) {
          if (feats.chroma[i]) {
            for (let p = 0; p < 12; p++) {
              avg[p] += feats.chroma[i][p] || 0;
            }
            count++;
          }
        }
        if (count > 0) {
          for (let p = 0; p < 12; p++) avg[p] /= count;
        }
      } else {
        out.push(ev);
        continue;
      }
      
      let label = ev.label;
      
      const minor3rd = avg[this.toPc(root + 3)] || 0;
      const major3rd = avg[this.toPc(root + 4)] || 0;
      const isMinor = label.includes('m') && !label.includes('maj');
      
      const fifth = avg[this.toPc(root + 7)] || 0;
      const dimFifth = avg[this.toPc(root + 6)] || 0;
      
      if (dimFifth > fifth * 1.4 && dimFifth > 0.15) {
        if (isMinor) {
          label = label.replace('m', 'dim');
        } else {
          label += 'dim';
        }
      }
      
      // 🔥 קישוטים רק אם יש טריאד תקין!
      const hasTriad = this.hasValidTriad(root, label, avg);
      
      if (!hasTriad) {
        // אין טריאד = לא מוסיפים קישוטים
        out.push({ ...ev, label });
        continue;
      }
      
      const seventh = avg[this.toPc(root + 10)] || 0;
      const maj7 = avg[this.toPc(root + 11)] || 0;
      const ninth = avg[this.toPc(root + 2)] || 0;
      const eleventh = avg[this.toPc(root + 5)] || 0;
      const thirteenth = avg[this.toPc(root + 9)] || 0;
      
      const threshold7 = 0.15 / decMul;
      const threshold9 = 0.12 / decMul;
      const thresholdExt = 0.10 / decMul;
      
      if (mode === 'jazz' || mode === 'pro') {
        // 🎵 7th
        if (seventh > threshold7 && seventh > maj7 * 1.2 && !/7/.test(label)) {
          // 🔥 בדיקה: אם זה דומיננט משני, חייב 7!
          if (allowed.secondaryDominants.includes(root) && !allowed.diatonic.includes(root)) {
            label += '7'; // דומיננט משני תמיד עם 7
          } else if (allowed.diatonic.includes(root)) {
            label += '7'; // דיאטוני גם יכול
          }
        } else if (maj7 > threshold7 && maj7 > seventh * 1.2 && !/7/.test(label)) {
          label += 'maj7';
        }
        
        // 9th רק אם יש 7
        if (mode === 'pro' && /7/.test(label) && ninth > threshold9) {
          label = label.replace('7', '9');
          label = label.replace('maj7', 'maj9');
        }
        
        // 11th רק אם יש 9
        if (mode === 'pro' && /9/.test(label) && eleventh > thresholdExt) {
          label = label.replace('9', '11');
          label = label.replace('maj9', 'maj11');
        }
        
        // 13th
        if (mode === 'pro' && /7/.test(label) && thirteenth > thresholdExt) {
          if (/11/.test(label)) {
            label = label.replace('11', '13');
          } else if (/9/.test(label)) {
            label = label.replace('9', '13');
          }
        }
      }
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  parseRoot(label) {
    const m = label?.match?.(/^([A-G](?:#|b)?)/);
    if (!m) return -1;
    const nm = m[1].replace('b', '#');
    return this.NOTES_SHARP.indexOf(nm);
  }

  addInversionsIfNeeded(tl, feats, bassSens = 1.25) {
    if (bassSens < 1.6) return tl;
    
    return tl.map(ev => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      const { bassPc } = feats;
      const i0 = Math.max(0, ev.fi);
      const i1 = Math.min(bassPc.length - 1, ev.endFrame || ev.fi + 3);
      
      const bassVotes = new Array(12).fill(0);
      for (let i = i0; i <= i1; i++) {
        if (bassPc[i] >= 0) bassVotes[bassPc[i]]++;
      }
      
      const dominantBass = bassVotes.indexOf(Math.max(...bassVotes));
      if (dominantBass < 0 || dominantBass === root) return ev;
      
      const intervals = [0, 3, 4, 7, 10, 11];
      const bassInterval = this.toPc(dominantBass - root);
      
      if (intervals.includes(bassInterval)) {
        const bassNote = this.nameSharp(dominantBass);
        return { ...ev, label: ev.label + '/' + bassNote };
      }
      
      return ev;
    });
  }

  /**
   * 🔥 ואלידציה חזקה - מסיר אקורדים לא הגיוניים
   */
  validateChords(tl, key, feats) {
    const allowed = this.buildAllowedChords(key);
    
    return tl.filter((ev, idx) => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return false;
      
      // 1️⃣ בדיקה: האם האקורד מותר?
      const isDiatonic = allowed.diatonic.includes(root);
      const isBorrowed = allowed.borrowed.includes(root);
      const isSecondaryDom = allowed.secondaryDominants.includes(root) && ev.label.includes('7');
      
      if (!isDiatonic && !isBorrowed && !isSecondaryDom) {
        // אקורד לא הגיוני - דחה
        return false;
      }
      
      // 2️⃣ בדיקת חוזק
      const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
      
      if (isDiatonic) {
        return chromaStrength >= 0.12; // סף נמוך לדיאטוניים
      } else if (isBorrowed) {
        return chromaStrength >= 0.18; // סף בינוני למושאלים
      } else {
        return chromaStrength >= 0.25; // סף גבוה לדומיננטות משניות
      }
    });
  }

  /**
   * 🔥 סיווג אקורדים - רק אקורדים ארוכים = structural
   */
  classifyOrnamentsByDuration(tl, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const structuralThreshold = spb * 0.75; // 3/4 תיבה = מבני (יותר מקל)
    
    return tl.map((ev, i) => {
      const nextEv = tl[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : (spb * 2);
      
      let ornamentType = 'structural';
      
      // 🔥 רק אקורדים קצרים מאוד (< 1/4 תיבה) = קישוטים
      if (duration < spb * 0.25) {
        if (ev.confidence && ev.confidence < 70) {
          ornamentType = 'passing'; // אקורד חלש וקצר מאוד = passing
        } else {
          ornamentType = 'ornament';
        }
      } else if (duration < structuralThreshold) {
        ornamentType = 'ornament';
      }
      
      return { ...ev, ornamentType };
    });
  }

  quantizeToGrid(tl, bpm, quantValue = 4) {
    const spb = 60 / Math.max(60, bpm || 120);
    const gridSize = spb / quantValue;
    
    return tl.map((ev, i) => {
      const quantized = Math.round(ev.t / gridSize) * gridSize;
      const nextEv = tl[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : spb;
      const beats = Math.max(1, Math.round(duration / spb));
      
      return { ...ev, t: quantized, beats };
    });
  }

  removeRedundantChords(tl, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const barDuration = spb * 4;
    
    const out = [];
    let lastLabel = null;
    let lastBar = -1;
    
    for (const ev of tl) {
      const currentBar = Math.floor(ev.t / barDuration);
      
      if (!lastLabel || ev.label !== lastLabel) {
        out.push(ev);
        lastLabel = ev.label;
        lastBar = currentBar;
        continue;
      }
      
      if (currentBar > lastBar) {
        out.push(ev);
        lastBar = currentBar;
      }
    }
    
    return out;
  }

  detectStartGate(feats) {
    const { frameE, bassPc } = feats;
    const energies = [...frameE].filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    const median = energies[Math.floor(energies.length * 0.5)] || 0;
    const energyThreshold = median * 0.8;
    for (let i = 0; i < frameE.length; i++) {
      if (frameE[i] < energyThreshold) continue;
      if (bassPc[i] >= 0) return Math.max(0, i - 1);
    }
    return 0;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.ChordEngine = ChordEngine;
  console.log('✅ ChordEngine (Harmonic Fixed) loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}
