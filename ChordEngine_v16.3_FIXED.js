/**
 * ChordEngine v16.4 
 * 
 * מבוסס על v16.2 + תיקונים מ-v14.36:
 * 1. finalizeTimeline - סינון אקורדים מהירים (minDur = 0.5s)
 * 2. enforceEarlyDiatonic - טיפול ברעש בהתחלה (15 שניות ראשונות)
 * 3. borrowed chords - חריגים הרמוניים עם inKey משופר
 */

class ChordEngineUltimate {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    
    this._hannCache = {};
  }

  async detect(audioBuffer, options = {}) {
    const t0 = this.now();
    console.log('🎵 ChordEngine v16.4 (v16.2 + v14.36 fixes)');

    const audio = this.processAudio(audioBuffer);
    console.log(`✅ Audio: ${audio.duration.toFixed(1)}s @ ${audio.bpm} BPM`);

    const features = this.extractFeatures(audio);
    console.log(`✅ Features: ${features.numFrames} frames`);

    const musicStart = this.findMusicStart(features);
    console.log(`✅ Music starts at ${musicStart.time.toFixed(2)}s`);

    const tonicResult = this.detectTonic(features, musicStart.frame);
    const modeResult = this.detectMode(features, tonicResult.root, musicStart.frame);
    
    let key = {
      root: tonicResult.root,
      minor: modeResult.isMinor,
      confidence: Math.min(tonicResult.confidence, modeResult.confidence) / 100
    };
    
    console.log(`✅ Key: ${this.NOTES_SHARP[key.root]}${key.minor ? 'm' : ''}`);

    let timeline = this.buildChords(features, key, musicStart.frame);
    console.log(`✅ Raw chords: ${timeline.length}`);

    // 🎯 תיקון #2 מ-v14.36: כפה אקורדים דיאטוניים בהתחלה
    timeline = this.enforceEarlyDiatonic(timeline, key, features, audio.bpm);
    
    timeline = this.addExtensions(timeline, features, key);
    timeline = this.addInversions(timeline, features, key);
    
    // 🎯 תיקון #1 מ-v14.36: סינון אקורדים מהירים
    timeline = this.finalizeTimeline(timeline, audio.bpm, features, key);

    const totalTime = this.now() - t0;
    console.log(`🎉 Final: ${timeline.length} chords in ${totalTime.toFixed(0)}ms`);

    return {
      chords: timeline,
      key,
      tonic: { root: tonicResult.root, label: this.NOTES_SHARP[tonicResult.root] + (key.minor ? 'm' : ''), confidence: tonicResult.confidence },
      mode: modeResult,
      musicStart: musicStart.time,
      bpm: audio.bpm,
      duration: audio.duration,
      stats: this.buildStats(timeline, key)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎯 תיקון #1 מ-v14.36: finalizeTimeline משופר
  // ═══════════════════════════════════════════════════════════
  
  finalizeTimeline(timeline, bpm, features, key) {
    if (!timeline.length) return [];
    
    const spb = 60 / Math.max(60, Math.min(200, bpm));
    const minDur = Math.max(0.5, 0.50 * spb); // 🎯 מינימום 0.5 שניות!
    const energyMedian = this.percentile(features.energy, 50);
    
    const filtered = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = features.energy[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.85;
      
      const r = this.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);
      
      // 🎯 סינון אגרסיבי של אקורדים חלשים/לא דיאטוניים
      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic)) continue;
      
      // 🎯 גם אקורדים דיאטוניים חלשים מסוננים אם קצרים מאוד
      if (dur < minDur * 0.6 && isWeak) continue;
      
      filtered.push(a);
    }
    
    // Snap to grid
    const snapped = [];
    for (const ev of filtered) {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const snapTol = 0.35 * spb;
      const t = Math.abs(grid - raw) <= snapTol ? grid : raw;
      
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ ...ev, t: Math.max(0, t) });
      }
    }
    
    return snapped.filter(ev => ev && ev.label);
  }

  // ═══════════════════════════════════════════════════════════
  // 🎯 תיקון #2 מ-v14.36: enforceEarlyDiatonic
  // ═══════════════════════════════════════════════════════════
  
  enforceEarlyDiatonic(timeline, key, features, bpm) {
    if (!timeline || !timeline.length) return timeline;
    
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const earlyWindow = Math.max(15.0, 6 * spb); // 🎯 15 שניות או 6 פעימות
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    const qualities = key.minor 
      ? ['m','dim','','m','m','',''] 
      : ['','m','m','','','m','dim'];
    
    const getQuality = (pc) => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === this.toPc(pc)) return qualities[i];
      }
      return '';
    };
    
    const snapToDiatonic = (pc) => {
      let best = diatonicPcs[0];
      let bestD = 99;
      for (const d of diatonicPcs) {
        const dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      return best;
    };
    
    const out = [];
    
    for (const ev of timeline) {
      let label = ev.label;
      
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        const isInKey = r >= 0 && this.inKey(r, key.root, key.minor);
        
        if (!isInKey) {
          const bp = features.bass[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          
          // 🎯 כפייה לטוניקה ב-3 שניות ראשונות
          if (ev.t < Math.min(3.0, 2.0 * spb)) {
            newRoot = key.root;
          }
          
          const q = getQuality(newRoot);
          label = this.NOTES_SHARP[this.toPc(newRoot)] + q;
          console.log(`🎯 Early fix: ${ev.label} → ${label} at ${ev.t.toFixed(2)}s`);
        }
      }
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  // ═══════════════════════════════════════════════════════════
  // 🎯 תיקון #3 מ-v14.36: inKey עם borrowed chords
  // ═══════════════════════════════════════════════════════════
  
  inKey(pc, keyRoot, minor) {
    pc = this.toPc(pc);
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(iv => this.toPc(keyRoot + iv));
    
    if (diatonic.includes(pc)) return true;
    
    // 🎯 borrowed chords מקובלים מ-v14.36
    const rel = this.toPc(pc - keyRoot);
    
    if (minor) {
      // מינור: V מז'ור (7), VII (11)
      if (rel === 7 || rel === 11) return true;
    } else {
      // מז'ור: bVII (10), bVI (8), bIII (3), II (2)
      if (rel === 2 || rel === 10 || rel === 8 || rel === 3) return true;
    }
    
    return false;
  }

  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#{1}|b{1})?/);
    if (!m) return -1;
    const note = m[1] + (m[2] || '');
    const sharpIndex = this.NOTES_SHARP.indexOf(note);
    if (sharpIndex >= 0) return sharpIndex;
    const flatIndex = this.NOTES_FLAT.indexOf(note);
    if (flatIndex >= 0) return flatIndex;
    return -1;
  }

  percentile(arr, p) {
    const sorted = [...arr].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    return sorted[Math.floor((p / 100) * (sorted.length - 1))];
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIO PROCESSING (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  processAudio(audioBuffer) {
    let mono;
    if (audioBuffer.numberOfChannels === 1) {
      mono = audioBuffer.getChannelData(0);
    } else {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      const len = Math.min(left.length, right.length);
      mono = new Float32Array(len);
      for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    }

    const sr0 = audioBuffer.sampleRate || 44100;
    const sr = 22050;
    const x = this.resample(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);

    return { x, sr, bpm, duration: x.length / sr };
  }

  resample(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLen = Math.floor(samples.length / ratio);
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const t = srcIdx - i0;
      out[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
    return out;
  }

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const energy = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      energy.push(e);
    }
    if (energy.length < 4) return 120;

    const minLag = Math.floor(0.3 / (hop / sr));
    const maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < energy.length - lag; i++) r += energy[i] * energy[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    const bpm = 60 / (bestLag * hop / sr);
    return isFinite(bpm) ? Math.max(60, Math.min(200, Math.round(bpm))) : 120;
  }

  // ═══════════════════════════════════════════════════════════
  // FEATURE EXTRACTION (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  extractFeatures(audio) {
    const { x, sr } = audio;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;

    if (!this._hannCache[win]) {
      const hann = new Float32Array(win);
      for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
      this._hannCache[win] = hann;
    }
    const hann = this._hannCache[win];

    const chroma = [], bassRaw = [], energy = [];

    for (let start = 0; start + win <= x.length; start += hop) {
      const frame = x.subarray(start, start + win);
      const windowed = new Float32Array(win);
      let frameEnergy = 0;
      
      for (let i = 0; i < win; i++) {
        windowed[i] = frame[i] * hann[i];
        frameEnergy += windowed[i] * windowed[i];
      }
      energy.push(frameEnergy);

      const { mags, N } = this.fft(windowed);

      const chromaFrame = new Float32Array(12);
      for (let bin = 1; bin < mags.length; bin++) {
        const freq = bin * sr / N;
        if (freq < 80 || freq > 5000) continue;
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = this.toPc(Math.round(midi));
        chromaFrame[pc] += mags[bin];
      }
      const chromaSum = chromaFrame.reduce((a, b) => a + b, 0) || 1;
      for (let i = 0; i < 12; i++) chromaFrame[i] /= chromaSum;
      chroma.push(chromaFrame);

      bassRaw.push(this.detectBassNote(mags, sr, N));
    }

    const bass = [];
    for (let i = 0; i < bassRaw.length; i++) {
      const bp = bassRaw[i];
      if (bp < 0) { bass.push(-1); continue; }
      let stable = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(bassRaw.length - 1, i + 2); j++) {
        if (bassRaw[j] === bp) stable++;
      }
      bass.push(stable >= 2 ? bp : -1);
    }

    const globalChroma = new Float32Array(12);
    let totalE = 0;
    for (let i = 0; i < chroma.length; i++) {
      const w = energy[i];
      for (let p = 0; p < 12; p++) globalChroma[p] += chroma[i][p] * w;
      totalE += w;
    }
    if (totalE > 0) for (let p = 0; p < 12; p++) globalChroma[p] /= totalE;

    const sortedE = [...energy].sort((a, b) => a - b);
    const percentile = (p) => sortedE[Math.floor(p / 100 * (sortedE.length - 1))] || 0;

    return {
      chroma, bass, energy, globalChroma,
      hop, sr, numFrames: chroma.length,
      secPerFrame: hop / sr,
      energyP50: percentile(50),
      energyP70: percentile(70)
    };
  }

  detectBassNote(mags, sr, N) {
    const fmin = 40, fmax = 250;
    const yLP = new Float32Array(N);

    for (let bin = 1; bin < mags.length; bin++) {
      const freq = bin * sr / N;
      if (freq > fmax) break;
      if (freq >= fmin) {
        const omega = 2 * Math.PI * freq / sr;
        for (let n = 0; n < N; n++) yLP[n] += mags[bin] * Math.cos(omega * n);
      }
    }

    const minLag = Math.floor(sr / fmax);
    const maxLag = Math.floor(sr / fmin);
    let bestLag = -1, bestR = 0;

    let mean = 0;
    for (let n = 0; n < N; n++) mean += yLP[n];
    mean /= N;

    let variance = 0;
    for (let n = 0; n < N; n++) variance += (yLP[n] - mean) ** 2;
    variance = variance || 1e-9;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < N - lag; n++) r += (yLP[n] - mean) * (yLP[n + lag] - mean);
      r /= variance;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }

    if (bestLag > 0 && bestR > 0.25) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        return this.toPc(Math.round(69 + 12 * Math.log2(f0 / 440)));
      }
    }
    return -1;
  }

  fft(input) {
    let n = input.length, N = 1;
    while (N < n) N <<= 1;

    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);

    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      let m = N >> 1;
      while (m >= 1 && j >= m) { j -= m; m >>= 1; }
      j += m;
    }

    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang), wli = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < len / 2; k++) {
          const uRe = re[i + k], uIm = im[i + k];
          const vRe = re[i + k + len/2] * wr - im[i + k + len/2] * wi;
          const vIm = re[i + k + len/2] * wi + im[i + k + len/2] * wr;
          re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
          re[i + k + len/2] = uRe - vRe; im[i + k + len/2] = uIm - vIm;
          const nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr; wr = nwr;
        }
      }
    }

    const mags = new Float32Array(N >> 1);
    for (let k = 0; k < mags.length; k++) mags[k] = Math.hypot(re[k], im[k]);
    return { mags, N };
  }

  // ═══════════════════════════════════════════════════════════
  // MUSIC START (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  findMusicStart(features) {
    const { energy, bass, secPerFrame, energyP50 } = features;
    
    for (let i = 0; i < energy.length; i++) {
      if (energy[i] >= energyP50 && bass[i] >= 0) {
        return { frame: i, time: i * secPerFrame };
      }
    }
    return { frame: 0, time: 0 };
  }

  // ═══════════════════════════════════════════════════════════
  // TONIC & MODE DETECTION (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  detectTonic(features, startFrame) {
    const { bass, energy, energyP70, numFrames, globalChroma } = features;
    
    const bassHist = new Array(12).fill(0);
    let totalWeight = 0;
    
    for (let i = startFrame; i < numFrames; i++) {
      if (bass[i] >= 0 && energy[i] >= energyP70 * 0.5) {
        const w = energy[i] / energyP70;
        bassHist[bass[i]] += w;
        totalWeight += w;
      }
    }
    
    let bestKS = { root: 0, score: -Infinity };
    for (let root = 0; root < 12; root++) {
      let score = 0;
      for (let i = 0; i < 12; i++) {
        score += globalChroma[this.toPc(root + i)] * this.KS_MAJOR[i];
      }
      if (score > bestKS.score) bestKS = { root, score };
    }
    
    let best = { root: 0, score: -Infinity };
    for (let root = 0; root < 12; root++) {
      let score = (bassHist[root] / (totalWeight || 1)) * 50;
      if (root === bestKS.root) score += 20;
      if (score > best.score) best = { root, score };
    }
    
    return { root: best.root, confidence: Math.min(95, Math.round(50 + best.score)) };
  }

  detectMode(features, tonic, startFrame) {
    const { chroma, energy, energyP50 } = features;
    
    let m3 = 0, M3 = 0, total = 0;
    const m3pc = this.toPc(tonic + 3);
    const M3pc = this.toPc(tonic + 4);
    
    for (let i = startFrame; i < chroma.length; i++) {
      if (energy[i] < energyP50 * 0.3) continue;
      m3 += chroma[i][m3pc];
      M3 += chroma[i][M3pc];
      total++;
    }
    
    if (total > 0) { m3 /= total; M3 /= total; }
    
    const isMinor = m3 > M3 * 1.1;
    const confidence = Math.min(95, Math.round(60 + Math.abs(m3 - M3) * 200));
    
    return { isMinor, confidence, m3, M3 };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD CHORDS (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  buildChords(features, key, startFrame) {
    const { bass, chroma, energy, energyP70, secPerFrame } = features;
    const timeline = [];
    const diatonic = this.getDiatonicInfo(key);
    
    let currentBass = -1, currentStart = startFrame;
    
    for (let i = startFrame; i < bass.length; i++) {
      if (energy[i] < energyP70 * 0.3) continue;
      
      if (bass[i] >= 0 && bass[i] !== currentBass) {
        if (currentBass >= 0) {
          const chord = this.determineChord(chroma, currentStart, i, key, diatonic, currentBass);
          if (chord) {
            timeline.push({
              t: currentStart * secPerFrame,
              fi: currentStart,
              label: chord.label,
              root: chord.root,
              type: chord.type,
              bassNote: currentBass,
              inScale: chord.inScale,
              confidence: chord.confidence
            });
          }
        }
        currentBass = bass[i];
        currentStart = i;
      }
    }
    
    if (currentBass >= 0) {
      const chord = this.determineChord(chroma, currentStart, chroma.length, key, diatonic, currentBass);
      if (chord) {
        timeline.push({
          t: currentStart * secPerFrame,
          fi: currentStart,
          label: chord.label,
          root: chord.root,
          type: chord.type,
          bassNote: currentBass,
          inScale: chord.inScale,
          confidence: chord.confidence
        });
      }
    }
    
    return timeline;
  }

  determineChord(chroma, startFrame, endFrame, key, diatonic, bassNote) {
    const avg = this.getAvgChroma(chroma, startFrame, endFrame);
    
    const m3 = avg[this.toPc(bassNote + 3)];
    const M3 = avg[this.toPc(bassNote + 4)];
    const p5 = avg[this.toPc(bassNote + 7)];
    const root = avg[bassNote];
    
    const diatonicChord = diatonic.chords.find(dc => dc.root === bassNote);
    
    let isMinor;
    let inScale = false;
    
    if (diatonicChord) {
      if (M3 > m3 * 1.4) {
        isMinor = false;
        inScale = !diatonicChord.minor;
      } else if (m3 > M3 * 1.4) {
        isMinor = true;
        inScale = diatonicChord.minor;
      } else {
        isMinor = diatonicChord.minor;
        inScale = true;
      }
    } else {
      isMinor = m3 > M3;
      inScale = this.inKey(bassNote, key.root, key.minor);
    }
    
    const noteName = this.getNoteName(bassNote, key);
    let label = noteName + (isMinor ? 'm' : '');
    
    const b5 = avg[this.toPc(bassNote + 6)];
    if (isMinor && b5 > p5 * 1.3 && b5 > 0.06) {
      label = noteName + 'dim';
    }
    
    const score = root * 40 + (isMinor ? m3 : M3) * 30 + p5 * 20;
    
    return {
      root: bassNote,
      label,
      type: isMinor ? 'minor' : 'major',
      inScale,
      confidence: Math.min(100, Math.round(score))
    };
  }

  getAvgChroma(chroma, startFrame, endFrame) {
    const avg = new Float32Array(12);
    const count = endFrame - startFrame;
    for (let i = startFrame; i < endFrame && i < chroma.length; i++) {
      for (let p = 0; p < 12; p++) avg[p] += chroma[i][p];
    }
    if (count > 0) for (let p = 0; p < 12; p++) avg[p] /= count;
    return avg;
  }

  getDiatonicInfo(key) {
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = key.minor 
      ? [true, false, false, true, true, false, false]
      : [false, true, true, false, false, true, false];
    
    const pcs = scale.map(deg => this.toPc(key.root + deg));
    const chords = scale.map((deg, i) => ({
      root: this.toPc(key.root + deg),
      minor: qualities[i],
      degree: i + 1
    }));
    
    return { pcs, chords };
  }

  // ═══════════════════════════════════════════════════════════
  // EXTENSIONS (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  addExtensions(timeline, features, key) {
    const { chroma } = features;
    
    return timeline.map(ev => {
      if (ev.fi == null || ev.fi >= chroma.length) return ev;
      
      const avg = this.getAvgChroma(chroma, Math.max(0, ev.fi - 1), Math.min(chroma.length, ev.fi + 2));
      const root = ev.root;
      const isMinor = ev.type === 'minor';
      
      const b7 = avg[this.toPc(root + 10)];
      const M7 = avg[this.toPc(root + 11)];
      
      let label = ev.label;
      
      if (!isMinor && M7 > 0.10 && M7 > b7 * 1.3) {
        label = label.replace(/m$/, '') + 'maj7';
      } else if (b7 > 0.08) {
        if (!label.includes('7')) label += '7';
      }
      
      return { ...ev, label };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // INVERSIONS (מ-v16.2)
  // ═══════════════════════════════════════════════════════════
  
  addInversions(timeline, features, key) {
    return timeline.map(ev => {
      const root = ev.root;
      const actualBass = ev.bassNote;
      
      if (actualBass >= 0 && actualBass !== root) {
        const isMinor = ev.type === 'minor';
        const chordTones = isMinor ? [0, 3, 7] : [0, 4, 7];
        if (ev.label.includes('7')) chordTones.push(10);
        if (ev.label.includes('maj7')) chordTones[chordTones.length - 1] = 11;
        
        const bassInterval = this.toPc(actualBass - root);
        
        if (chordTones.includes(bassInterval)) {
          const bassName = this.getNoteName(actualBass, key);
          return { ...ev, label: ev.label + '/' + bassName, isInversion: true };
        }
      }
      
      return ev;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════
  
  now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  toPc(n) { return ((n % 12) + 12) % 12; }
  
  getNoteName(pc, key) {
    pc = this.toPc(pc);
    const flatRoots = [5, 10, 3, 8, 1, 6, 11];
    return flatRoots.includes(key.root) ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }

  buildStats(timeline, key) {
    return {
      totalChords: timeline.length,
      inScale: timeline.filter(e => e.inScale).length,
      borrowed: timeline.filter(e => !e.inScale).length,
      inversions: timeline.filter(e => e.label && e.label.includes('/')).length,
      extensions: timeline.filter(e => e.label && /7|9|11|13|sus|dim|aug/.test(e.label)).length
    };
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => this.NOTES_SHARP[this.toPc(tonicPc + deg)] + qualities[i]);
  }

  buildCircleOfFifths(key) {
    const keyName = this.getNoteName(key.root, key) + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(keyName.replace(/m$/, ''), key.minor ? 'minor' : 'major');
    const functions = key.minor ? ['i','ii°','III','iv','v','VI','VII'] : ['I','ii','iii','IV','V','vi','vii°'];
    return chords.map((label, i) => ({ label, function: functions[i] }));
  }

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) mono[i] = 0.5 * (left[i] + right[i]);
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) { return this.resample(samples, fromRate, toRate); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineUltimate;
}
