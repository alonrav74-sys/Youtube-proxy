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
   * 1. זיהוי טוניקה עם Krumhansl-Schmuckler profiles (מדויק יותר!)
   */
  estimateKey(chroma) {
    // Krumhansl-Schmuckler profiles - מדויקים יותר מהפרופילים הפשוטים
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
      // Major score
      let scoreMaj = 0;
      for (let i = 0; i < 12; i++) {
        scoreMaj += agg[this.toPc(root + i)] * KS_MAJOR[i];
      }
      
      // Minor score
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
   * 🔥 HMM Chord Tracking - רצף אקורדים חלק יותר
   * משתמש ב-Viterbi algorithm למצוא את הרצף המסתבר ביותר
   */
  chordTrackingWithHMM(feats, key) {
    const { chroma, bassPc, frameE, hop, sr } = feats;
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    // בנה מועמדים: כל root דיאטוני + major/minor
    const candidates = [];
    for (const r of diatonic) {
      candidates.push({ root: r, label: this.nameSharp(r) });
      candidates.push({ root: r, label: this.nameSharp(r) + 'm' });
    }
    
    const N = candidates.length;
    const M = chroma.length;
    
    // פונקציית emission: כמה טוב הכרומה מתאימה לאקורד
    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      
      const isMinor = /m$/.test(cand.label);
      const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
      
      // חשב cosine similarity לטריאד
      let score = 0;
      let norm = 0;
      for (const iv of intervals) {
        const pc = this.toPc(cand.root + iv);
        score += c[pc] || 0;
        norm += 1;
      }
      score /= norm;
      
      // בונוס אם הבס מתאים
      if (bassPc[i] >= 0 && cand.root === bassPc[i]) {
        score += 0.15;
      }
      
      // קנס אם אנרגיה נמוכה
      if (frameE[i] < this.percentileLocal(frameE, 30)) {
        score -= 0.10;
      }
      
      return score;
    };
    
    // פונקציית transition: עלות מעבר בין אקורדים
    const transitionCost = (a, b) => {
      if (a.label === b.label) return 0.0; // אותו אקורד - בחינם
      
      const dist = Math.min((b.root - a.root + 12) % 12, (a.root - b.root + 12) % 12);
      const sameQuality = /m$/.test(a.label) === /m$/.test(b.label);
      
      let penalty = 0.6 + 0.1 * dist;
      if (!sameQuality) penalty += 0.05;
      
      return penalty;
    };
    
    // Viterbi algorithm
    const dp = new Array(N).fill(0);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    
    // אתחול
    for (let s = 0; s < N; s++) {
      dp[s] = emitScore(0, candidates[s]);
    }
    
    // forward pass
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      
      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestJ = -1;
        
        for (let j = 0; j < N; j++) {
          const val = dp[j] - transitionCost(candidates[j], candidates[s]);
          if (val > bestVal) {
            bestVal = val;
            bestJ = j;
          }
        }
        
        newdp[s] = bestVal + emitScore(i, candidates[s]);
        backptr[i][s] = bestJ;
      }
      
      for (let s = 0; s < N; s++) dp[s] = newdp[s];
    }
    
    // backtrack
    let bestS = 0;
    let bestVal = -Infinity;
    for (let s = 0; s < N; s++) {
      if (dp[s] > bestVal) {
        bestVal = dp[s];
        bestS = s;
      }
    }
    
    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) {
      states[i - 1] = backptr[i][states[i]];
    }
    
    // המר ל-timeline
    const tl = [];
    const secPerHop = hop / sr;
    let cur = states[0];
    let start = 0;
    
    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        // חשב confidence score לאקורד
        const duration = i - start;
        const avgScore = dp[cur] / duration; // ממוצע של emission scores
        const confidence = Math.min(1.0, Math.max(0.0, avgScore));
        
        tl.push({
          t: start * secPerHop,
          label: candidates[cur].label,
          fi: start,
          endFrame: i - 1,  // 🔥 הוסף endFrame
          confidence: confidence
        });
        cur = states[i];
        start = i;
      }
    }
    
    // אקורד אחרון
    const duration = M - start;
    const avgScore = dp[cur] / duration;
    const confidence = Math.min(1.0, Math.max(0.0, avgScore));
    
    tl.push({
      t: start * secPerHop,
      label: candidates[cur].label,
      fi: start,
      endFrame: M - 1,  // 🔥 הוסף endFrame
      confidence: confidence
    });
    
    return tl;
  }

  /**
   * בניית אקורדים - משתמש ב-HMM לזיהוי מדויק יותר
   */
  /**
   * 🧠 Hybrid Refinement - משפר אקורדים לא ברורים עם AI
   */
  async refineWithAI(timeline, feats, audioBuffer) {
    // סמן אקורדים עם confidence נמוך
    const uncertainChords = timeline.filter(ev => (ev.confidence || 1.0) < 0.6);
    
    if (uncertainChords.length === 0) {
      return timeline;
    }
    
    // אם יש Basic Pitch - השתמש בו
    if (window.basicPitch) {
      return await this.refineWithBasicPitch(timeline, uncertainChords, audioBuffer);
    }
    
    // אחרת - השתמש בניתוח מקומי משופר
    return this.refineWithLocalAI(timeline, uncertainChords, feats);
  }

  /**
   * ניתוח מקומי משופר - temporal context + majority voting
   */
  refineWithLocalAI(timeline, uncertainChords, feats) {
    const { chroma, bassPc, frameE } = feats;
    
    for (const chord of uncertainChords) {
      const fi = chord.fi;
      const nextFi = timeline[timeline.indexOf(chord) + 1]?.fi || chroma.length;
      
      // חלון רחב יותר - 5 frames לפני ואחרי
      const contextStart = Math.max(0, fi - 5);
      const contextEnd = Math.min(chroma.length - 1, nextFi + 5);
      
      // אגרגציה משוקללת של כרומה
      const weightedChroma = new Float32Array(12);
      let totalWeight = 0;
      
      for (let i = contextStart; i < contextEnd; i++) {
        // משקל גבוה יותר למרכז
        const distFromCenter = Math.abs(i - fi);
        const weight = Math.exp(-distFromCenter / 3) * Math.sqrt(frameE[i] || 1);
        
        for (let p = 0; p < 12; p++) {
          weightedChroma[p] += (chroma[i][p] || 0) * weight;
        }
        totalWeight += weight;
      }
      
      if (totalWeight > 0) {
        for (let p = 0; p < 12; p++) {
          weightedChroma[p] /= totalWeight;
        }
      }
      
      // זיהוי מחדש עם כרומה משופרת
      const refined = this.detectBestChord(weightedChroma, bassPc[fi]);
      
      if (refined && refined.confidence > chord.confidence) {
        chord.label = refined.label;
        chord.confidence = refined.confidence;
        chord.refined = true;
      }
    }
    
    return timeline;
  }

  /**
   * זיהוי האקורד הטוב ביותר מכרומה נתונה
   */
  detectBestChord(chroma, bassNote) {
    const candidates = [];
    
    // נסה כל root אפשרי
    for (let root = 0; root < 12; root++) {
      const rootStrength = chroma[root] || 0;
      if (rootStrength < 0.08) continue;
      
      // בדוק major
      const major3 = chroma[this.toPc(root + 4)] || 0;
      const fifth = chroma[this.toPc(root + 7)] || 0;
      const majorScore = rootStrength * 2.0 + major3 * 1.5 + fifth * 1.0;
      
      if (major3 > 0.08 || fifth > 0.12) {
        candidates.push({
          root,
          label: this.nameSharp(root),
          score: majorScore,
          isMinor: false
        });
      }
      
      // בדוק minor
      const minor3 = chroma[this.toPc(root + 3)] || 0;
      const minorScore = rootStrength * 2.0 + minor3 * 1.5 + fifth * 1.0;
      
      if (minor3 > 0.08 || fifth > 0.12) {
        candidates.push({
          root,
          label: this.nameSharp(root) + 'm',
          score: minorScore,
          isMinor: true
        });
      }
    }
    
    if (candidates.length === 0) return null;
    
    // מיין לפי score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    // בונוס אם הבס מתאים
    if (bassNote >= 0 && bassNote === best.root) {
      best.score += 0.2;
    }
    
    // המר score ל-confidence (0-1)
    const confidence = Math.min(1.0, best.score / 4.0);
    
    return {
      label: best.label,
      root: best.root,
      confidence: confidence
    };
  }

  buildChordsFromBass(feats, key, bpm) {
    // נסה HMM קודם
    let tl = [];
    try {
      tl = this.chordTrackingWithHMM(feats, key);
    } catch (e) {
      console.warn('⚠️ HMM failed:', e.message);
    }
    
    // 🔥 אם HMM נכשל או החזיר מעט מדי אקורדים - השתמש בשיטה פשוטה!
    if(tl.length < 3) {
      tl = this.simpleBassChordDetection(feats, key, bpm);
    }
    
    if(tl.length === 0) {
      console.warn('⚠️ No chords detected!');
      return [];
    }
    
    // סנן אקורדים קצרים מדי
    const spb = 60 / Math.max(60, bpm || 120);
    const minDur = Math.max(0.5, 0.45 * spb);
    
    const out = [];
    for (let i = 0; i < tl.length; i++) {
      const a = tl[i];
      const b = tl[i + 1];
      const dur = (b ? b.t : a.t + 4 * spb) - a.t;
      
      if (dur < minDur && out.length) {
        // אקורד קצר מדי - בדוק אם לשמור או לדלג
        const fiA = a.fi;
        const fiB = b ? b.fi : fiA + 1;
        const bpA = feats.bassPc[fiA] ?? -1;
        const bpB = feats.bassPc[Math.min(feats.bassPc.length - 1, fiB)] ?? -1;
        
        const bassChanged = (bpA >= 0 && bpB >= 0 && bpA !== bpB);
        
        if (!bassChanged) {
          const prev = out[out.length - 1];
          const r = this.parseRoot(a.label);
          const pr = this.parseRoot(prev.label);
          const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
          const inA = diatonic.includes(r);
          const inP = diatonic.includes(pr);
          
          if (!inA || inP) {
            continue; // דלג על האקורד הקצר
          }
        }
      }
      
      out.push(a);
    }
    
    return out;
  }

  /**
   * 🔥 Simple Bass Chord Detection - fallback אם HMM נכשל
   */
  simpleBassChordDetection(feats, key, bpm) {
    const { bassPc, chroma, frameE, hop, sr } = feats;
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    const spb = 60 / Math.max(60, bpm || 120);
    const minFrames = Math.max(2, Math.floor((spb * 0.3) / (hop / sr)));
    
    const timeline = [];
    let i = 0;
    
    while (i < bassPc.length) {
      // מצא בס שמספיק חזק
      if (frameE[i] < this.percentileLocal(frameE, 20)) {
        i++;
        continue;
      }
      
      const startFrame = i;
      const startTime = i * (hop / sr);
      
      // מצא כמה זמן הבס הזה נמשך
      const currentBass = bassPc[i];
      let endFrame = startFrame;
      
      while (endFrame < bassPc.length - 1 && endFrame - startFrame < 20) {
        if (bassPc[endFrame + 1] !== currentBass && bassPc[endFrame + 1] >= 0) break;
        endFrame++;
      }
      
      if ((endFrame - startFrame) < minFrames) {
        i = endFrame + 1;
        continue;
      }
      
      // חשב כרומה ממוצעת
      const avgChroma = new Float32Array(12);
      for (let j = startFrame; j <= endFrame && j < chroma.length; j++) {
        if (chroma[j]) {
          for (let p = 0; p < 12; p++) {
            avgChroma[p] += chroma[j][p] || 0;
          }
        }
      }
      const count = endFrame - startFrame + 1;
      for (let p = 0; p < 12; p++) avgChroma[p] /= count;
      
      // זהה אקורד
      let bestLabel = null;
      let bestScore = -1;
      
      for (const root of diatonic) {
        // בדוק major
        const major3 = avgChroma[this.toPc(root + 4)] || 0;
        const fifth = avgChroma[this.toPc(root + 7)] || 0;
        const rootStr = avgChroma[root] || 0;
        const majorScore = rootStr * 2.0 + major3 * 1.5 + fifth * 1.0;
        
        if (majorScore > bestScore) {
          bestScore = majorScore;
          bestLabel = this.nameSharp(root);
        }
        
        // בדוק minor
        const minor3 = avgChroma[this.toPc(root + 3)] || 0;
        const minorScore = rootStr * 2.0 + minor3 * 1.5 + fifth * 1.0;
        
        if (minorScore > bestScore) {
          bestScore = minorScore;
          bestLabel = this.nameSharp(root) + 'm';
        }
      }
      
      if (bestLabel) {
        timeline.push({
          t: startTime,
          label: bestLabel,
          fi: startFrame,
          endFrame: endFrame,
          avgChroma: avgChroma,
          confidence: Math.min(1.0, bestScore / 3.0),
          words: []
        });
      }
      
      i = endFrame + 1;
    }
    
    return timeline;
  }

  
  /**
   * מחשב הבדל בין שני וקטורי כרומה
   */
  chromaDifference(chroma1, chroma2) {
    let diff = 0;
    for (let i = 0; i < 12; i++) {
      diff += Math.abs((chroma1[i] || 0) - (chroma2[i] || 0));
    }
    return diff / 12;
  }


  /**
   * מחשב הבדל בין שני וקטורי כרומה
   */
  chromaDifference(chroma1, chroma2) {
    let diff = 0;
    for (let i = 0; i < 12; i++) {
      diff += Math.abs((chroma1[i] || 0) - (chroma2[i] || 0));
    }
    return diff / 12;
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
      
      // 🔥 אם אין avgChroma, חשב אותו מ-feats!
      let avg;
      if (ev.avgChroma) {
        avg = ev.avgChroma;
      } else if (feats && feats.chroma && ev.fi !== undefined) {
        // חשב ממוצע כרומה לאזור האקורד
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
        // אין מספיק מידע - דלג על הקישוט
        out.push(ev);
        continue;
      }
      
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
