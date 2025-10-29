/**
 * ChordEngine - Extended Version
 * Includes all audio processing and chord detection logic
 * Extracted from ChordFinder Pro HTML
 */

class ChordEngine {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    // הערה: מנגנון הקאפו מטופל ב-index.html דרך הפונקציה applyCapoToLabel()
    // הוא פועל על התוצאות אחרי הזיהוי, ולא משפיע על לוגיקת הזיהוי עצמה
  }

  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.NOTES_SHARP[this.toPc(pc)]; }
  nameFlat(pc) { return this.NOTES_FLAT[this.toPc(pc)]; }

  /**
   * 2. בניית טבלת קווינטות (Circle of Fifths)
   * מחזיר את כל האקורדים הטבעיים בסולם לפי סדר הקווינטות
   */
  buildCircleOfFifths(key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const scaleNotes = scale.map(interval => this.toPc(key.root + interval));
    
    // סדר הקווינטות החל מהטוניקה
    const fifthsOrder = [];
    let currentNote = key.root;
    
    for (let i = 0; i < 7; i++) {
      fifthsOrder.push(currentNote);
      currentNote = this.toPc(currentNote + 7); // קפיצה של קווינטה (7 חצאי-טונים)
    }
    
    // בניית אקורדים לפי הקווינטות
    const naturalChords = fifthsOrder.map(note => {
      const degreeInScale = scaleNotes.indexOf(note);
      if (degreeInScale === -1) return null;
      
      // קביעה אם האקורד מז'ור או מינור לפי המבנה של הסולם
      let quality = '';
      if (key.minor) {
        // מינור טבעי: i, ii°, III, iv, v, VI, VII
        if ([0, 3, 4].includes(degreeInScale)) quality = 'm'; // i, iv, v
        if (degreeInScale === 1) quality = 'dim'; // ii°
      } else {
        // מז'ור: I, ii, iii, IV, V, vi, vii°
        if ([1, 2, 5].includes(degreeInScale)) quality = 'm'; // ii, iii, vi
        if (degreeInScale === 6) quality = 'dim'; // vii°
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

  percentileLocal(arr, pct) {
    const sorted = [...arr].filter(x => Number.isFinite(x)).sort((a,b) => a-b);
    const idx = Math.floor(sorted.length * pct / 100);
    return sorted[idx] || 0;
  }

  /**
   * 1. זיהוי טוניקה משופר - מציאת הנקודה שאליה השיר מתכנס
   * בודק גם את תחילת וסוף השיר + אקורד הכי שכיח
   */
  estimateKey(chroma) {
    const profiles = {
      major: [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],
      minor: [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
    };
    
    // צבירת כל הכרומה
    const agg = new Array(12).fill(0);
    for (const c of chroma) {
      for (let p = 0; p < 12; p++) agg[p] += c[p];
    }
    const sum = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) agg[p] /= sum;
    
    // ניתוח משקל נוסף לתחילה וסוף (השיר בדרך כלל מתחיל ומסתיים בטוניקה)
    const startWeight = 2.0; // משקל כפול לתחילה
    const endWeight = 1.5;   // משקל x1.5 לסוף
    const startFrames = Math.min(10, Math.floor(chroma.length * 0.05)); // 5% ראשונים
    const endFrames = Math.min(10, Math.floor(chroma.length * 0.05));   // 5% אחרונים
    
    const weightedAgg = new Array(12).fill(0);
    for (let i = 0; i < chroma.length; i++) {
      let weight = 1.0;
      if (i < startFrames) weight = startWeight;
      else if (i >= chroma.length - endFrames) weight = endWeight;
      
      for (let p = 0; p < 12; p++) {
        weightedAgg[p] += chroma[i][p] * weight;
      }
    }
    
    const weightedSum = weightedAgg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) weightedAgg[p] /= weightedSum;
    
    // חישוב קורלציה עם פרופילים
    let bestRoot = 0, bestScore = -Infinity, bestMinor = false;
    for (let root = 0; root < 12; root++) {
      for (const [mode, prof] of Object.entries(profiles)) {
        let corr = 0;
        for (let i = 0; i < 12; i++) {
          // משקלול של אגרגציה רגילה + אגרגציה משוקללת
          const combined = (agg[this.toPc(root + i)] * 0.6 + weightedAgg[this.toPc(root + i)] * 0.4);
          corr += combined * prof[i];
        }
        if (corr > bestScore) {
          bestScore = corr;
          bestRoot = root;
          bestMinor = (mode === 'minor');
        }
      }
    }
    
    return { 
      root: bestRoot, 
      minor: bestMinor,
      confidence: bestScore // רמת הביטחון בזיהוי
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

  buildChordsFromBass(feats, key, bpm) {
    const { bassPc, chroma, frameE, hop, sr } = feats;
    
    // 1. בניית סולם טבעי (natural scale chords)
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    // 2. אקורדים מושאלים נפוצים (borrowed chords)
    const borrowedPcs = key.minor 
      ? [
          this.toPc(key.root + 2),  // II מז'ור (Dorian II)
          this.toPc(key.root + 7),  // V מז'ור (Harmonic minor V)
          this.toPc(key.root + 8),  // bVI (Modal borrowing)
          this.toPc(key.root + 10)  // bVII (Modal borrowing)
        ]
      : [
          this.toPc(key.root + 5),  // iv מינור (Modal borrowing from parallel minor)
          this.toPc(key.root + 8),  // bVI (Modal borrowing)
          this.toPc(key.root + 10), // bVII (Modal borrowing)
          this.toPc(key.root + 3)   // bIII (Modal borrowing)
        ];
    
    const allowedPcs = [...new Set([...diatonic, ...borrowedPcs])];
    
    const spb = 60 / Math.max(60, bpm || 120);
    const minFrames = Math.max(2, Math.floor((spb * 0.3) / (hop / sr)));
    
    // 6. סינון רעשי רקע - הגדרת סף אנרגיה גבוה יותר לתחילת שיר
    const energyThreshold = this.percentileLocal(frameE, 15);
    const startGateThreshold = this.percentileLocal(frameE, 35); // סף גבוה יותר לתחילה
    
    const timeline = [];
    let i = 0;
    let songStarted = false; // דגל שמסמן שהשיר התחיל
    
    while (i < bassPc.length) {
      const currentThreshold = songStarted ? energyThreshold : startGateThreshold;
      
      // דילוג על פריימים חלשים או רעש
      if (bassPc[i] < 0 || frameE[i] < currentThreshold) {
        i++;
        continue;
      }
      
      songStarted = true; // השיר התחיל אחרי שמצאנו אקורד ראשון חזק
      
      const root = bassPc[i];
      const startFrame = i;
      const startTime = i * (hop / sr);
      
      // 4. בדיקת מובהקות - האם זה באמת אקורד מהסולם?
      if (!allowedPcs.includes(root)) {
        i++;
        continue;
      }
      
      let endFrame = startFrame;
      let gapCounter = 0;
      const maxGap = 3;
      
      while (endFrame < bassPc.length) {
        if (bassPc[endFrame] === root) {
          gapCounter = 0;
          endFrame++;
        } else if (bassPc[endFrame] < 0 || gapCounter < maxGap) {
          gapCounter++;
          endFrame++;
        } else {
          break;
        }
      }
      
      if ((endFrame - startFrame) < minFrames) {
        i = endFrame;
        continue;
      }
      
      const avgChroma = new Float32Array(12);
      let totalWeight = 0;
      
      for (let j = startFrame; j < endFrame; j++) {
        if (chroma[j]) {
          const weight = Math.sqrt(frameE[j] || 1);
          for (let p = 0; p < 12; p++) avgChroma[p] += chroma[j][p] * weight;
          totalWeight += weight;
        }
      }
      
      if (totalWeight > 0) {
        for (let p = 0; p < 12; p++) avgChroma[p] /= totalWeight;
      }
      
      const isMinor = this.decideMajorMinorFromChroma(root, avgChroma);
      let label = this.nameSharp(root) + (isMinor ? 'm' : '');
      
      timeline.push({
        t: startTime,
        label: label,
        fi: startFrame,
        endFrame: endFrame,
        avgChroma: avgChroma,
        words: []
      });
      
      i = endFrame;
    }
    
    return timeline;
  }

  /**
   * 2. החלטה מדויקת יותר על מז'ור/מינור
   * בודק לא רק את ה-3, אלא גם את הקשר שלו לבס וסכום הכרומה
   */
  decideMajorMinorFromChroma(root, avgChroma) {
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    const rootStrength = avgChroma[root] || 0;
    
    // אם אין כמעט 3, ברירת מחדל לפי הסולם
    if (minor3rd < 0.05 && major3rd < 0.05) {
      return fifth > 0.2; // אם יש קווינטה חזקה, כנראה מז'ור
    }
    
    // השוואה ברורה
    if (major3rd > minor3rd * 1.3) return false; // מז'ור
    if (minor3rd > major3rd * 1.3) return true;  // מינור
    
    // מקרה גבולי - בדוק את היחס לבס
    const major3rdRatio = major3rd / (rootStrength + 0.001);
    const minor3rdRatio = minor3rd / (rootStrength + 0.001);
    
    if (major3rdRatio > minor3rdRatio * 1.1) return false;
    if (minor3rdRatio > major3rdRatio * 1.1) return true;
    
    // ברירת מחדל: מינור אם הם קרובים מדי (אומר לנו שיש אי-בהירות)
    return minor3rd >= major3rd * 0.85;
  }

  decorateQualitiesBassFirst(tl, feats, key, mode, decMul = 1.0) {
    if (mode === 'basic') return tl;
    
    const out = [];
    
    for (const ev of tl) {
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }
      
      const avg = ev.avgChroma;
      let label = ev.label;
      
      // 2. בדיקת אם האקורד כולל את ה-3 (Major/Minor כבר נקבע)
      const minor3rd = avg[this.toPc(root + 3)] || 0;
      const major3rd = avg[this.toPc(root + 4)] || 0;
      const isMinor = label.includes('m');
      
      // 2. בדיקת ה-5 (Perfect 5th vs Diminished 5th)
      const fifth = avg[this.toPc(root + 7)] || 0;
      const dimFifth = avg[this.toPc(root + 6)] || 0;
      
      // אם ה-5 מופחת חזק יותר מה-5 רגיל → אקורד מופחת
      if (dimFifth > fifth * 1.4 && dimFifth > 0.15) {
        if (isMinor) {
          label = label.replace('m', 'dim'); // Cm → Cdim
        } else {
          label += 'dim'; // C → Cdim (נדיר)
        }
      }
      
      // 3. חיפוש קישוטים (7, 9, 11, 13, maj7, etc.)
      const seventh = avg[this.toPc(root + 10)] || 0;
      const maj7 = avg[this.toPc(root + 11)] || 0;
      const ninth = avg[this.toPc(root + 2)] || 0;
      const eleventh = avg[this.toPc(root + 5)] || 0;
      const thirteenth = avg[this.toPc(root + 9)] || 0;
      
      const threshold7 = 0.15 / decMul;
      const threshold9 = 0.12 / decMul;
      const thresholdExt = 0.10 / decMul;
      
      if (mode === 'jazz' || mode === 'pro') {
        // זיהוי 7th
        if (seventh > threshold7 && seventh > maj7 * 1.2 && !/7/.test(label)) {
          label += '7';
        } else if (maj7 > threshold7 && maj7 > seventh * 1.2 && !/7/.test(label)) {
          label += 'maj7';
        }
        
        // זיהוי 9th (רק אם יש כבר 7)
        if (mode === 'pro' && /7/.test(label) && ninth > threshold9) {
          label = label.replace('7', '9');
          label = label.replace('maj7', 'maj9');
        }
        
        // זיהוי 11th (רק במצב pro ואם יש 9)
        if (mode === 'pro' && /9/.test(label) && eleventh > thresholdExt) {
          label = label.replace('9', '11');
          label = label.replace('maj9', 'maj11');
        }
        
        // זיהוי 13th (רק במצב pro)
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
   * 4. מסנן אקורדים חלשים/מיותרים - לא ממציא אקורדים באמצע
   * מוודא שאקורדים הם מובהקים ולא רק רעש בין אקורדים אמיתיים
   */
  validateChords(tl, key, feats) {
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    return tl.filter((ev, idx) => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return false;
      
      const isInKey = diatonic.includes(root);
      
      // אקורדים בתוך הסולם - תמיד מקובלים
      if (isInKey) {
        const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
        // אבל דורש מינימום חוזק של בס
        return chromaStrength >= 0.15;
      }
      
      // אקורדים מחוץ לסולם - צריכים להיות חזקים מאוד
      const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
      const isVeryStrong = chromaStrength >= 0.30;
      
      // בדיקה נוספת: האם זה אקורד מושאל ידוע?
      const borrowedRoots = key.minor 
        ? [this.toPc(key.root + 2), this.toPc(key.root + 7)]  // II, V במינור
        : [this.toPc(key.root + 5), this.toPc(key.root + 10)]; // iv, bVII במז'ור
      
      if (borrowedRoots.includes(root)) {
        return chromaStrength >= 0.20; // סף נמוך יותר לאקורדים מושאלים נפוצים
      }
      
      return isVeryStrong;
    });
  }

  classifyOrnamentsByDuration(tl, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const structuralThreshold = spb * 1.5;
    
    return tl.map((ev, i) => {
      const nextEv = tl[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : (spb * 2);
      
      let ornamentType = 'structural';
      if (duration < spb * 0.75) {
        ornamentType = 'passing';
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
  console.log('✅ ChordEngine (Extended) loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}
