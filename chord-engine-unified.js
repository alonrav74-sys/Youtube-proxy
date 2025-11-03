/**
 * 🎹 ChordEngine UNIFIED v12.0 BASS-FIRST APPROACH
 * 
 * 🎯 THE MUSICIAN'S WAY:
 * 1. Bass gives ROOT (fundamental frequency)
 * 2. Harmonics confirm 5th (validates it's a chord)
 * 3. 3rd determines major vs minor (E→C major, Eb→Cm minor)
 * 4. Infer key from detected chords (C, Am, F, G → C major!)
 * 
 * For "Hallelujah":
 * - Bass: C → 5th(G)✓ → 3rd: E strong → C major ✅
 * - Bass: A → 5th(E)✓ → 3rd: C strong → Am minor ✅
 * - Bass: F → 5th(C)✓ → 3rd: A strong → F major ✅
 * - Bass: G → 5th(D)✓ → 3rd: B strong → G major ✅
 * → Chords: C, Am, F, G → Key: C major! ✅
 * 
 * TARGET: 100% on simple diatonic songs!
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
  }

  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      validationMultiplier: options.validationMultiplier || 1.0,
      channelData: options.channelData || null,
      sampleRate: options.sampleRate || null
    };

    const audioData = this.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    const feats = this.extractFeatures(audioData);
    
    // 🎯 STEP 1: Detect chords from bass + harmonics + 3rd
    let timeline = this.detectChordsFromBass(feats, opts.bassMultiplier);
    
    // 🎯 STEP 2: Infer key from detected chords
    const key = this.inferKeyFromChords(timeline, feats);
    
    // 🎯 STEP 3: Refine with HMM if needed (for complex passages)
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    timeline = this.enforceEarlyDiatonic(timeline, key, feats, audioData.bpm);
    
    // 🎯 STEP 4: Add musical details
    timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier);
    timeline = this.adjustMinorMajors(timeline, feats, key);
    timeline = this.addInversionsUltimate(timeline, feats, opts.bassMultiplier);
    timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
    timeline = this.classifyOrnaments(timeline, audioData.bpm, feats);
    timeline = this.analyzeModalContext(timeline, key);
    
    const tonic = this.detectTonicMusically(timeline, key, audioData.duration);
    
    if (tonic.root !== key.root && tonic.confidence > 95) {
      key.root = tonic.root;
    }
    
    const stats = {
      totalChords: timeline.length,
      structural: timeline.filter(e => e.ornamentType === 'structural').length,
      ornaments: timeline.filter(e => e.ornamentType !== 'structural').length,
      secondaryDominants: timeline.filter(e => e.modalContext === 'secondary_dominant').length,
      modalBorrowings: timeline.filter(e => e.modalContext && e.modalContext !== 'secondary_dominant').length,
      inversions: timeline.filter(e => e.label.includes('/')).length,
      extensions: timeline.filter(e => /[679]|11|13|sus|dim|aug/.test(e.label)).length,
      modulations: 0
    };
    
    return {
      chords: timeline,
      key: key,
      tonic: tonic,
      bpm: audioData.bpm,
      duration: audioData.duration,
      stats: stats,
      mode: this.detectMode(key)
    };
  }

  detectMode(key) {
    return key.minor ? 'Natural Minor (Aeolian)' : 'Major (Ionian)';
  }

  processAudio(audioBuffer, channelData, sampleRate) {
    let mono;
    if (channelData && sampleRate) {
      mono = channelData;
      const sr0 = sampleRate, sr = 22050;
      const x = this.resampleLinear(mono, sr0, sr);
      const bpm = this.estimateTempo(x, sr);
      return { x, sr, bpm, duration: x.length / sr };
    }
    const channels = audioBuffer.numberOfChannels;
    mono = channels === 1 ? audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    const sr0 = audioBuffer.sampleRate, sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);
    return { x, sr, bpm, duration: x.length / sr };
  }

  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr), frames = [];
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) e += x[s + i] * x[s + i];
      frames.push(e);
    }
    const minLag = Math.floor(0.3 / (hop / sr)), maxLag = Math.floor(2.0 / (hop / sr));
    let bestLag = minLag, bestR = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < frames.length - lag; i++) r += frames[i] * frames[i + lag];
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const bpm = 60 / (bestLag * (hop / sr));
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  extractFeatures(audioData) {
    const { x, sr } = audioData, hop = Math.floor(0.10 * sr), win = 4096;
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) frames.push(x.subarray(s, s + win));
    const chroma = [], bassPc = [], frameE = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i], windowed = new Float32Array(win);
      for (let k = 0; k < win; k++) windowed[k] = frame[k] * hann[k];
      let en = 0;
      for (let k = 0; k < win; k++) en += windowed[k] * windowed[k];
      frameE.push(en);
      const { mags, N } = this.fft(windowed), c = new Float32Array(12);
      for (let b = 1; b < mags.length; b++) {
        const f = b * sr / N;
        if (f < 80 || f > 5000) continue;
        const midi = 69 + 12 * Math.log2(f / 440), pc = this.toPc(Math.round(midi));
        c[pc] += mags[b];
      }
      const sum = c.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < 12; k++) c[k] /= sum;
      chroma.push(c);
      bassPc.push(this.estimateBassF0(mags, sr, N));
    }
    const thrE = this.percentile(frameE, 40);
    for (let i = 1; i < bassPc.length - 1; i++) {
      const v = bassPc[i];
      if (v < 0 || frameE[i] < thrE || (bassPc[i - 1] !== v && bassPc[i + 1] !== v)) bassPc[i] = -1;
    }
    return { chroma, bassPc, frameE, hop, sr };
  }

  estimateBassF0(mags, sr, N) {
    const fmin = 40, fmax = 250, magsLP = new Float32Array(mags.length);
    for (let b = 1; b < mags.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) magsLP[b] = mags[b];
    }
    const win = N, yLP = new Float32Array(win);
    for (let b = 1; b < magsLP.length; b++) {
      const f = b * sr / N;
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < win; n++) yLP[n] += magsLP[b] * Math.cos(omega * n);
      }
    }
    const f0minLag = Math.floor(sr / fmax), f0maxLag = Math.floor(sr / Math.max(1, fmin));
    let bestLag = -1, bestR = -1;
    const mean = yLP.reduce((s, v) => s + v, 0) / win;
    let denom = 0;
    for (let n = 0; n < win; n++) { const d = yLP[n] - mean; denom += d * d; }
    denom = Math.max(denom, 1e-9);
    for (let lag = f0minLag; lag <= f0maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < win - lag; n++) { const a = yLP[n] - mean, b = yLP[n + lag] - mean; r += a * b; }
      r /= denom;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    if (bestLag > 0) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        const midiF0 = 69 + 12 * Math.log2(f0 / 440);
        return this.toPc(Math.round(midiF0));
      }
    }
    return -1;
  }

  fft(input) {
    let n = input.length, N = 1;
    while (N < n) N <<= 1;
    const re = new Float32Array(N), im = new Float32Array(N);
    re.set(input);
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
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
  }

  // ========================================
  // 🎯 BASS-FIRST CHORD DETECTION
  // ========================================
  
  detectChordsFromBass(feats, bassMultiplier) {
    const { chroma, bassPc, hop, sr, frameE } = feats;
    const timeline = [];
    const secPerHop = hop / sr;
    
    let currentChord = null;
    let chordStart = 0;
    
    for (let i = 0; i < chroma.length; i++) {
      const bass = bassPc[i];
      const c = chroma[i];
      
      // Skip if no bass or low energy
      if (bass < 0 || frameE[i] < this.percentile(frameE, 30)) {
        continue;
      }
      
      // Detect chord from bass + harmonics + 3rd
      const chord = this.detectChordFromBassAndHarmonics(bass, c, bassMultiplier);
      
      if (!chord) continue;
      
      // New chord?
      if (!currentChord || currentChord.label !== chord.label) {
        // Save previous chord
        if (currentChord) {
          timeline.push({
            t: chordStart * secPerHop,
            label: currentChord.label,
            fi: Math.floor(chordStart)
          });
        }
        
        currentChord = chord;
        chordStart = i;
      }
    }
    
    // Add last chord
    if (currentChord) {
      timeline.push({
        t: chordStart * secPerHop,
        label: currentChord.label,
        fi: Math.floor(chordStart)
      });
    }
    
    return timeline;
  }

  detectChordFromBassAndHarmonics(bassPc, chroma, bassMultiplier) {
    const root = bassPc;
    
    // Get note strengths
    const s = (interval) => chroma[this.toPc(root + interval)] || 0;
    
    const rootStrength = s(0);
    const minor3rd = s(3);
    const major3rd = s(4);
    const fifth = s(7);
    const minor7th = s(10);
    const major7th = s(11);
    const second = s(2);
    const fourth = s(5);
    const dim5th = s(6);
    
    // 1. Check if 5th is present (fundamental requirement)
    const has5th = fifth > 0.10;
    const hasDim5th = dim5th > 0.15 && dim5th > fifth * 1.3;
    
    if (!has5th && !hasDim5th) {
      return null; // Not a valid chord
    }
    
    // 2. Determine major vs minor from 3rd
    const ratio = major3rd > 0.001 ? (major3rd / (minor3rd + 0.001)) : 0;
    
    let quality = '';
    
    // Check for sus chords (no 3rd, but 2nd or 4th)
    const has3rd = (major3rd > 0.10 || minor3rd > 0.10);
    const hasSus2 = second > 0.18 && second > major3rd && second > minor3rd;
    const hasSus4 = fourth > 0.18 && fourth > major3rd && fourth > minor3rd;
    
    if (!has3rd && hasSus4) {
      quality = 'sus4';
    } else if (!has3rd && hasSus2) {
      quality = 'sus2';
    } else if (hasDim5th && minor3rd > 0.12) {
      quality = 'dim';
    } else if (ratio > 1.5 && major3rd > 0.10) {
      // Major 3rd is clearly stronger
      quality = '';
    } else if (ratio < 0.65 && minor3rd > 0.10) {
      // Minor 3rd is clearly stronger
      quality = 'm';
    } else if (major3rd > minor3rd * 1.2 && major3rd > 0.08) {
      // Major wins
      quality = '';
    } else if (minor3rd > major3rd * 1.2 && minor3rd > 0.08) {
      // Minor wins
      quality = 'm';
    } else {
      // Ambiguous - default to major
      quality = '';
    }
    
    const label = this.nameSharp(root) + quality;
    
    return {
      root: root,
      label: label,
      quality: quality,
      confidence: Math.min(1.0, (rootStrength + fifth) * bassMultiplier)
    };
  }

  // ========================================
  // 🎯 INFER KEY FROM DETECTED CHORDS
  // ========================================
  
  inferKeyFromChords(timeline, feats) {
    if (!timeline || timeline.length < 3) {
      return { root: 0, minor: false, confidence: 0.5 };
    }
    
    // Extract unique chords
    const chordRoots = [];
    timeline.forEach(chord => {
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        const isMinor = /^[A-G](#|b)?m(?!aj)/.test(chord.label);
        const isDim = /dim/.test(chord.label);
        chordRoots.push({ root, isMinor, isDim, label: chord.label });
      }
    });
    
    if (chordRoots.length === 0) {
      return { root: 0, minor: false, confidence: 0.5 };
    }
    
    // Find keys that contain ALL these chords
    const candidates = [];
    
    for (let keyRoot = 0; keyRoot < 12; keyRoot++) {
      for (let keyMinor of [false, true]) {
        const scale = keyMinor ? this.MINOR_SCALE : this.MAJOR_SCALE;
        const qualities = keyMinor ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
        
        const diatonicChords = scale.map((degree, i) => ({
          root: this.toPc(keyRoot + degree),
          quality: qualities[i]
        }));
        
        // Check if all chords fit
        let matchCount = 0;
        let totalChords = 0;
        
        for (const songChord of chordRoots) {
          totalChords++;
          
          // Sus chords can appear anywhere
          if (/sus/.test(songChord.label)) {
            matchCount++;
            continue;
          }
          
          const found = diatonicChords.some(dc => {
            if (dc.root !== songChord.root) return false;
            
            if (songChord.isDim) return dc.quality === 'dim';
            if (songChord.isMinor) return dc.quality === 'm';
            return dc.quality === '';
          });
          
          if (found) matchCount++;
        }
        
        // Valid if 80%+ match
        if (matchCount >= totalChords * 0.8) {
          candidates.push({
            root: keyRoot,
            minor: keyMinor,
            score: matchCount / totalChords * 10
          });
        }
      }
    }
    
    if (candidates.length === 0) {
      return { root: 0, minor: false, confidence: 0.5 };
    }
    
    if (candidates.length === 1) {
      return { root: candidates[0].root, minor: candidates[0].minor, confidence: 0.95 };
    }
    
    // Multiple candidates - use cadences
    
    // Check V→I
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      const currRoot = this.parseRoot(curr.label);
      const nextRoot = this.parseRoot(next.label);
      
      if (currRoot >= 0 && nextRoot >= 0) {
        const interval = this.toPc(nextRoot - currRoot);
        
        if (interval === 5 || interval === 7) {
          for (const cand of candidates) {
            if (nextRoot === cand.root) {
              cand.score += 10.0;
            }
          }
        }
      }
    }
    
    // Check IV→V→I
    for (let i = 0; i < timeline.length - 2; i++) {
      const chord1 = this.parseRoot(timeline[i].label);
      const chord2 = this.parseRoot(timeline[i + 1].label);
      const chord3 = this.parseRoot(timeline[i + 2].label);
      
      if (chord1 >= 0 && chord2 >= 0 && chord3 >= 0) {
        for (const cand of candidates) {
          const scale = cand.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
          const IV = this.toPc(cand.root + scale[3]);
          const V = this.toPc(cand.root + scale[4]);
          const I = cand.root;
          
          if (chord1 === IV && chord2 === V && chord3 === I) {
            cand.score += 15.0;
          }
        }
      }
    }
    
    // First chord
    const firstChord = this.parseRoot(timeline[0].label);
    if (firstChord >= 0) {
      for (const cand of candidates) {
        if (firstChord === cand.root) {
          cand.score += 5.0;
        }
      }
    }
    
    // Last chord (strongest!)
    const lastChord = this.parseRoot(timeline[timeline.length - 1].label);
    if (lastChord >= 0) {
      for (const cand of candidates) {
        if (lastChord === cand.root) {
          cand.score += 10.0;
        }
      }
    }
    
    // Find best
    let best = candidates[0];
    for (const cand of candidates) {
      if (cand.score > best.score) {
        best = cand;
      }
    }
    
    return {
      root: best.root,
      minor: best.minor,
      confidence: Math.min(0.99, 0.7 + best.score / 50)
    };
  }

  detectTonicMusically(timeline, key, duration) {
    if (timeline.length < 3) {
      return { root: key.root, label: this.nameSharp(key.root) + (key.minor ? 'm' : ''), confidence: 50 };
    }
    
    const candidates = {};
    let totalDuration = 0;
    
    timeline.forEach(chord => {
      const root = this.parseRoot(chord.label);
      if (root < 0) return;
      const dur = this.getChordDuration(chord, timeline, duration);
      totalDuration += dur;
      if (!candidates[root]) {
        candidates[root] = { duration: 0, count: 0, openingScore: 0, closingScore: 0, cadenceScore: 0, finalScore: 0 };
      }
      candidates[root].duration += dur;
      candidates[root].count++;
    });
    
    const openingChords = timeline.slice(0, Math.min(3, timeline.length));
    openingChords.forEach((chord, idx) => {
      const root = this.parseRoot(chord.label);
      if (root >= 0 && candidates[root]) candidates[root].openingScore += (3 - idx) * 5;
    });
    
    const closingChords = timeline.slice(Math.max(0, timeline.length - 3));
    closingChords.forEach((chord, idx) => {
      const root = this.parseRoot(chord.label);
      if (root >= 0 && candidates[root]) candidates[root].closingScore += (idx + 1) * 10;
    });
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i], next = timeline[i + 1];
      const currRoot = this.parseRoot(curr.label), nextRoot = this.parseRoot(next.label);
      if (currRoot < 0 || nextRoot < 0) continue;
      const interval = this.toPc(nextRoot - currRoot);
      if (interval === 5 || interval === 7) {
        const dur = this.getChordDuration(next, timeline, duration);
        candidates[nextRoot].cadenceScore += 5.0 * dur;
      }
    }
    
    Object.keys(candidates).forEach(root => {
      const cand = candidates[root];
      cand.finalScore = (cand.duration / totalDuration) * 40 + cand.openingScore + cand.closingScore + cand.cadenceScore;
    });
    
    let tonicRoot = key.root, maxScore = 0;
    Object.entries(candidates).forEach(([root, cand]) => {
      if (cand.finalScore > maxScore) {
        maxScore = cand.finalScore;
        tonicRoot = parseInt(root);
      }
    });
    
    const confidence = Math.min(100, maxScore);
    const label = this.nameSharp(tonicRoot) + (key.minor ? 'm' : '');
    return { root: tonicRoot, label, confidence };
  }

  getChordDuration(chord, timeline, totalDuration) {
    const idx = timeline.indexOf(chord);
    if (idx < 0) return 0.5;
    const next = timeline[idx + 1];
    return next ? (next.t - chord.t) : Math.max(0.5, totalDuration - chord.t);
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120)), minDur = Math.max(0.5, 0.45 * spb), out = [];
    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i], b = timeline[i + 1], dur = (b ? b.t : a.t + 4 * spb) - a.t;
      if (dur < minDur && out.length) {
        const fiA = a.fi, fiB = b ? b.fi : fiA + 1;
        const bpA = feats.bassPc[fiA] ?? -1, bpB = feats.bassPc[Math.min(feats.bassPc.length - 1, fiB)] ?? -1;
        if (!(bpA >= 0 && bpB >= 0 && bpA !== bpB)) {
          const prev = out[out.length - 1], r = this.parseRoot(a.label), pr = this.parseRoot(prev.label);
          if (!this.inKey(r, key.root, key.minor) || this.inKey(pr, key.root, key.minor)) continue;
        }
      }
      out.push(a);
    }
    const snapped = [];
    for (const ev of out) {
      const q = Math.max(0, Math.round(ev.t / spb) * spb);
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) snapped.push({ t: q, label: ev.label, fi: ev.fi });
    }
    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline || !timeline.length) return timeline;
    const spb = 60 / (bpm || 120), earlyWindow = Math.max(3.5, 2 * spb);
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => this.toPc(key.root + s));
    
    const qualities = key.minor ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    
    const getCorrectQuality = (pc) => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === this.toPc(pc)) return qualities[i];
      }
      return '';
    };
    
    const snapToDiatonic = (pc) => {
      let best = diatonicPcs[0], bestD = 99;
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
        const isIn = r >= 0 && this.inKey(r, key.root, key.minor);
        
        if (!isIn) {
          const bp = feats.bassPc[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          const veryEarly = ev.t < Math.min(2.0, spb * 1.5);
          if (veryEarly) newRoot = key.root;
          const q = getCorrectQuality(newRoot);
          label = this.nameSharp(newRoot) + q;
        } else {
          const q = getCorrectQuality(r);
          label = this.nameSharp(r) + q;
        }
      }
      out.push({ ...ev, label });
    }
    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));
    const mul = extensionMul, out = [];
    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) { out.push(ev); continue; }
      const baseTriadMinor = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|11|13|6|m7b5|alt|b9|#9|b5|#5)$/, '');
      if (baseTriadMinor) base += 'm';
      const i0 = Math.max(0, ev.fi - 2), i1 = Math.min(feats.chroma.length - 1, ev.fi + 2), avg = new Float32Array(12);
      for (let i = i0; i <= i1; i++) { const c = feats.chroma[i]; for (let p = 0; p < 12; p++) avg[p] += c[p] || 0; }
      for (let p = 0; p < 12; p++) avg[p] /= (i1 - i0 + 1);
      const s = d => avg[this.toPc(root + d)] || 0;
      const sR = s(0), sM3 = s(4), s_m3 = s(3), s5 = s(7), s_b5 = s(6), s_sharp5 = s(8);
      const s2 = s(2), s4 = s(5), s_b7 = s(10), s7 = s(11), s6 = s(9);
      let label = base;
      
      const thirdStrong = baseTriadMinor ? (s_m3 > 0.13 * mul) : (sM3 > 0.13 * mul), thirdWeak = !thirdStrong;
      const sus2Strong = s2 > 0.22 / mul && s2 > s4 * 0.9 && s5 > 0.10, sus4Strong = s4 > 0.22 / mul && s4 > s2 * 0.9 && s5 > 0.10;
      if (!baseTriadMinor && thirdWeak) {
        if (sus4Strong) label = base.replace(/m$/, '') + 'sus4';
        else if (sus2Strong) label = base.replace(/m$/, '') + 'sus2';
      }
      
      const sixth6Strong = s6 > 0.18 / mul && s6 > s_b7 * 1.2;
      if (sixth6Strong && !/sus/.test(label) && (baseTriadMinor ? s_m3 : sM3) > 0.12 / mul) label = base + '6';
      
      const domContext = this.degreeOfChord(label, key) === 4, majContext = !/m$/.test(label) && !/sus/.test(label);
      const b7Confident = s_b7 > 0.16 / mul && s_b7 > (baseTriadMinor ? s_m3 : sM3) * 0.7 && sR > 0.10 / mul;
      const maj7Confident = majContext && s7 > 0.20 / mul && s7 > s_b7 * 1.2 && (baseTriadMinor ? s_m3 : sM3) > 0.12 / mul;
      if (!/6$/.test(label)) {
        if (maj7Confident) label = base.replace(/m$/, '') + 'maj7';
        else if (!/sus/.test(label) && (domContext ? (s_b7 > 0.15 / mul) : b7Confident) && !/7$/.test(label) && !/maj7$/.test(label)) label += '7';
      }
      
      const dimTriad = (baseTriadMinor && s_b5 > 0.26 / mul && s5 < 0.12 * mul && s_m3 > 0.14 / mul) || (!baseTriadMinor && s_b5 > 0.30 / mul && s5 < 0.10 * mul && sM3 < 0.08 * mul);
      if (dimTriad) label = (baseTriadMinor && s_b7 > 0.18 / mul) ? base.replace(/m$/, 'm7b5') : base.replace(/m$/, '') + 'dim';
      
      const augTriad = !baseTriadMinor && s_sharp5 > 0.24 / mul && s5 < 0.10 * mul && sM3 > 0.12 / mul;
      if (augTriad) label = base.replace(/m$/, '') + 'aug';
      
      if (mode === 'jazz' || mode === 'pro') {
        const has7 = /7$/.test(label) || /maj7$/.test(label), nineStrong = s2 > 0.25 / mul && sR > 0.10 / mul;
        if (has7 && nineStrong) label = label.replace(/7$/, '9');
        else if (!/sus/.test(label) && nineStrong && (baseTriadMinor ? s_m3 : sM3) > 0.10 / mul && !/maj7|7|9|add9/.test(label)) label += 'add9';
      }
      
      out.push({ ...ev, label });
    }
    return out;
  }

  adjustMinorMajors(timeline, feats, key) {
    if (!key.minor) return timeline;
    const out = [];
    for (const ev of timeline) {
      let label = ev.label;
      const r = this.parseRoot(label);
      if (r < 0 || /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label) || !/(^[A-G](?:#|b)?)(m)(?!aj)/.test(label)) { out.push(ev); continue; }
      const rel = this.toPc(r - key.root);
      if (!(rel === this.MINOR_SCALE[2] || rel === this.MINOR_SCALE[4] || rel === this.MINOR_SCALE[6])) { out.push(ev); continue; }
      const i0 = Math.max(0, ev.fi - 2), i1 = Math.min(feats.chroma.length - 1, ev.fi + 2), avg = new Float32Array(12);
      for (let i = i0; i <= i1; i++) { const c = feats.chroma[i]; for (let p = 0; p < 12; p++) avg[p] += c[p] || 0; }
      for (let p = 0; p < 12; p++) avg[p] /= (i1 - i0 + 1);
      const s = (d) => avg[this.toPc(r + d)] || 0, M3 = s(4), m3 = s(3);
      if (M3 > m3 * 1.25 && M3 > 0.08) label = label.replace(/m(?!aj)/, '');
      out.push({ ...ev, label });
    }
    return out;
  }

  addInversionsUltimate(timeline, feats, bassMultiplier) {
    const out = [];
    for (const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if (r < 0) { out.push(ev); continue; }
      const isMinor = /m(?!aj)/.test(ev.label), isSus2 = /sus2/.test(ev.label), isSus4 = /sus4/.test(ev.label);
      const has7 = /7/.test(ev.label), hasMaj7 = /maj7/.test(ev.label);
      const has9 = /9/.test(ev.label) || /add9/.test(ev.label), has6 = /6/.test(ev.label);
      let triad = isSus2 ? [0, 2, 7] : (isSus4 ? [0, 5, 7] : (isMinor ? [0, 3, 7] : [0, 4, 7]));
      if (has7 && !hasMaj7) triad.push(10);
      if (hasMaj7) triad.push(11);
      if (has9) triad.push(2);
      if (has6) triad.push(9);
      const bassPc = feats.bassPc[ev.fi] ?? -1;
      if (bassPc < 0 || bassPc === r) { out.push(ev); continue; }
      const rel = this.toPc(bassPc - r), inChord = triad.includes(rel);
      if (inChord) {
        const c = feats.chroma[ev.fi] || new Float32Array(12), bassStrength = c[bassPc] || 0, rootStrength = c[r] || 0;
        const bassIsStronger = bassStrength > rootStrength * 0.7;
        let stableCount = 0;
        for (let j = Math.max(0, ev.fi - 2); j <= Math.min(feats.bassPc.length - 1, ev.fi + 2); j++) if (feats.bassPc[j] === bassPc) stableCount++;
        if (bassStrength > 0.15 / Math.max(1, bassMultiplier * 0.9) && stableCount >= 3 && bassIsStronger) {
          const rootName = ev.label.match(/^([A-G](?:#|b)?)/)?.[1] || '', suffix = ev.label.slice(rootName.length);
          out.push({ ...ev, label: rootName + suffix + '/' + this.nameSharp(bassPc) });
          continue;
        }
      }
      out.push(ev);
    }
    return out;
  }

  validateAndRefine(timeline, key, feats, valMultiplier) {
    const out = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i], prev = i > 0 ? timeline[i - 1] : null, next = i < timeline.length - 1 ? timeline[i + 1] : null, r = this.parseRoot(ev.label);
      if (r < 0) { out.push(ev); continue; }
      const c = feats.chroma[ev.fi] || new Float32Array(12);
      const sR = c[this.toPc(r)] || 0, s5 = c[this.toPc(r + 7)] || 0, sM3 = c[this.toPc(r + 4)] || 0, sm3 = c[this.toPc(r + 3)] || 0;
      
      if (sR > 0.15 && s5 > 0.15 && sM3 < 0.08 && sm3 < 0.08 && /m/.test(ev.label)) {
        const base = ev.label.match(/^([A-G](?:#|b)?)/)?.[1] || '';
        out.push({ ...ev, label: base });
        continue;
      }
      
      out.push(ev);
    }
    return out;
  }

  classifyOrnaments(timeline, bpm, feats) {
    const spb = 60 / (bpm || 120), out = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i], prev = i > 0 ? timeline[i - 1] : null, next = i < timeline.length - 1 ? timeline[i + 1] : null;
      const dur = next ? (next.t - ev.t) : spb;
      let ornamentType = 'structural';
      if (dur < 0.35 * spb && prev && next) {
        const rPrev = this.parseRoot(prev.label), r = this.parseRoot(ev.label), rNext = this.parseRoot(next.label);
        if (rPrev >= 0 && r >= 0 && rNext >= 0) {
          const d1 = Math.abs(r - rPrev), d2 = Math.abs(rNext - r);
          if ((d1 <= 2 || d1 >= 10) && (d2 <= 2 || d2 >= 10)) ornamentType = 'passing';
        }
      }
      if (dur < 0.4 * spb && prev && next && prev.label === next.label) ornamentType = 'neighbor';
      if (prev) {
        const bassCur = feats.bassPc[ev.fi] ?? -1, bassPrev = feats.bassPc[prev.fi] ?? -1;
        if (bassCur >= 0 && bassPrev >= 0 && bassCur === bassPrev) {
          const rCur = this.parseRoot(ev.label), rPrev = this.parseRoot(prev.label);
          if (rCur >= 0 && rPrev >= 0 && rCur !== rPrev) ornamentType = 'pedal';
        }
      }
      out.push({ ...ev, ornamentType });
    }
    return out;
  }

  analyzeModalContext(timeline, key) {
    const out = [];
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i], r = this.parseRoot(ev.label);
      if (r < 0) { out.push({ ...ev, modalContext: null }); continue; }
      const rel = this.toPc(r - key.root);
      let modalContext = null;
      if (/7$/.test(ev.label) && !/maj7/.test(ev.label)) {
        const targetRoot = this.toPc(r + 7), nextChord = timeline[i + 1];
        if (nextChord) {
          const nextRoot = this.parseRoot(nextChord.label);
          if (nextRoot >= 0 && nextRoot === targetRoot && this.inKey(targetRoot, key.root, key.minor)) modalContext = 'secondary_dominant';
        }
      }
      if (!key.minor) {
        if (rel === 8) modalContext = 'borrowed_bVI';
        if (rel === 10) modalContext = 'borrowed_bVII';
        if (rel === 5 && /m/.test(ev.label)) modalContext = 'borrowed_iv';
        if (rel === 3) modalContext = 'borrowed_bIII';
      } else if (rel === 5 && !/m/.test(ev.label)) modalContext = 'borrowed_IV_major';
      if (rel === 1 && !/m/.test(ev.label)) modalContext = 'neapolitan';
      out.push({ ...ev, modalContext });
    }
    return out;
  }

  degreeOfChord(label, key) {
    const rootPc = this.parseRoot(label);
    if (rootPc < 0) return null;
    const rel = this.toPc(rootPc - key.root), scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    let bestDeg = null, bestDist = 999;
    for (let d = 0; d < scale.length; d++) {
      const dist = Math.min((rel - scale[d] + 12) % 12, (scale[d] - rel + 12) % 12);
      if (dist < bestDist) { bestDist = dist; bestDeg = d; }
    }
    return bestDeg;
  }

  inKey(pc, keyRoot, minor) {
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    return scale.map(interval => this.toPc(keyRoot + interval)).includes(this.toPc(pc));
  }

  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#|b)?/);
    if (!m) return -1;
    return this.NOTES_SHARP.indexOf((m[1] + (m[2] || '')).replace('b', '#'));
  }

  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.NOTES_SHARP[this.toPc(pc)]; }
  nameFlat(pc) { return this.NOTES_FLAT[this.toPc(pc)]; }

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0), right = audioBuffer.getChannelData(1), mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2;
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate, newLength = Math.floor(samples.length / ratio), resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio, srcIndexFloor = Math.floor(srcIndex), srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1), t = srcIndex - srcIndexFloor;
      resampled[i] = samples[srcIndexFloor] * (1 - t) + samples[srcIndexCeil] * t;
    }
    return resampled;
  }

  percentile(arr, p) {
    const a = [...arr].filter(x => Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[Math.floor((p / 100) * (a.length - 1))];
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    return scale.map((degree, i) => this.nameSharp(this.toPc(tonicPc + degree)) + qualities[i]);
  }

  buildCircleOfFifths(key) {
    const chords = this.getDiatonicChords(this.nameSharp(key.root), key.minor ? 'minor' : 'major');
    const functions = key.minor ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    return chords.map((label, i) => ({ label, function: functions[i] }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
