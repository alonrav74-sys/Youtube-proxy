/**
 * ChordEngine - UNIFIED Edition
 * Combines base detection + conservative chromatic filtering
 * 
 * Features:
 * ✅ Full chord detection (triads, 7ths, 9ths, 11ths, 13ths)
 * ✅ Key detection with Krumhansl-Schmuckler
 * ✅ Bass note detection & inversions
 * ✅ Harmonic validation (Circle of Fifths)
 * ✅ Conservative chromatic filtering (no fast inventions!)
 * ✅ Template-based quality detection
 * 
 * @version 3.0.0 - UNIFIED
 */

class ChordEngine {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    this.CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    
    this.CHORD_TEMPLATES = {
      major: { intervals: [0, 4, 7], weights: [1.0, 0.9, 0.8], label: '' },
      minor: { intervals: [0, 3, 7], weights: [1.0, 0.9, 0.8], label: 'm' },
      dim: { intervals: [0, 3, 6], weights: [1.0, 0.9, 0.8], label: 'dim' },
      aug: { intervals: [0, 4, 8], weights: [1.0, 0.9, 0.8], label: 'aug' },
      sus2: { intervals: [0, 2, 7], weights: [1.0, 0.85, 0.8], label: 'sus2' },
      sus4: { intervals: [0, 5, 7], weights: [1.0, 0.85, 0.8], label: 'sus4' },
      
      // 🔥 Add chords (no 7th required)
      add9: { intervals: [0, 4, 7, 14], weights: [1.0, 0.9, 0.8, 0.6], label: 'add9' },
      madd9: { intervals: [0, 3, 7, 14], weights: [1.0, 0.9, 0.8, 0.6], label: 'madd9' },
      add11: { intervals: [0, 4, 7, 17], weights: [1.0, 0.9, 0.8, 0.5], label: 'add11' },
      
      maj7: { intervals: [0, 4, 7, 11], weights: [1.0, 0.9, 0.8, 0.85], label: 'maj7' },
      dom7: { intervals: [0, 4, 7, 10], weights: [1.0, 0.9, 0.8, 0.85], label: '7' },
      m7: { intervals: [0, 3, 7, 10], weights: [1.0, 0.9, 0.8, 0.85], label: 'm7' },
      dim7: { intervals: [0, 3, 6, 9], weights: [1.0, 0.9, 0.8, 0.75], label: 'dim7' },
      m7b5: { intervals: [0, 3, 6, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7b5' },
      dom9: { intervals: [0, 4, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: '9' },
      maj9: { intervals: [0, 4, 7, 11, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'maj9' },
      m9: { intervals: [0, 3, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'm9' },
      dom11: { intervals: [0, 4, 7, 10, 14, 17], weights: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], label: '11' },
      dom13: { intervals: [0, 4, 7, 10, 14, 21], weights: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], label: '13' }
    };
    
    console.log('✅ ChordEngine UNIFIED (v3.0.0) loaded');
  }

  // ============================================
  // 🔥 HMM CHORD TRACKING (from old working code)
  // ============================================
  
  /**
   * 🔥 HYBRID: HMM + Bass Detection
   * HMM determines root chord, then we check bass for inversions
   */
  chordTrackingWithHMM(feats, key) {
    const { chroma, bassPc, hop, sr, frameE } = feats;
    
    // Build candidate chords (diatonic + common borrowed)
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    // Add borrowed chords for minor/major
    const borrowed = [];
    if (key.minor) {
      borrowed.push(this.toPc(key.root + 7));  // V (major in minor)
      borrowed.push(this.toPc(key.root + 11)); // VII (major in minor)
    } else {
      borrowed.push(this.toPc(key.root + 5));  // iv (minor in major)
      borrowed.push(this.toPc(key.root + 10)); // bVII
    }
    
    const allRoots = [...new Set([...diatonic, ...borrowed])];
    const candidates = [];
    
    for (const r of allRoots) {
      candidates.push({ root: r, label: this.nameSharp(r) });
      candidates.push({ root: r, label: this.nameSharp(r) + 'm' });
    }
    
    console.log(`🎯 HMM tracking with ${candidates.length} candidates`);
    
    // Emission score: chroma similarity + STRONG BASS BOOST
    const emitScore = (i, cand) => {
      const c = chroma[i];
      if (!c) return -Infinity;
      
      const isMinor = /m$/.test(cand.label);
      const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
      
      // Build mask vector
      const mask = new Array(12).fill(0);
      for (const iv of intervals) {
        mask[this.toPc(cand.root + iv)] = 1;
      }
      
      // Cosine similarity
      let dot = 0, normC = 0, normM = 0;
      for (let p = 0; p < 12; p++) {
        dot += c[p] * mask[p];
        normC += c[p] * c[p];
        normM += mask[p] * mask[p];
      }
      let score = dot / (Math.sqrt(normC) * Math.sqrt(normM) + 1e-9);
      
      // 🔥 STRONG BASS BOOST - if bass matches root, big bonus!
      if (bassPc[i] >= 0 && cand.root === bassPc[i]) {
        score += 0.25; // Increased from 0.15!
      }
      
      // Check if bass matches any chord tone (not just root)
      if (bassPc[i] >= 0 && cand.root !== bassPc[i]) {
        const bassInterval = this.toPc(bassPc[i] - cand.root);
        if (intervals.includes(bassInterval)) {
          score += 0.10; // Small bonus for bass matching chord tone
        }
      }
      
      // Energy penalty for weak frames
      if (frameE[i] < this.percentileLocal(frameE, 30)) {
        score -= 0.10;
      }
      
      return score;
    };
    
    // Transition penalty: penalize jumps
    const transitionPenalty = (candA, candB) => {
      if (candA.label === candB.label) return 0.0;
      
      const dist = Math.min((candB.root - candA.root + 12) % 12, (candA.root - candB.root + 12) % 12);
      const sameQual = /m$/.test(candA.label) === /m$/.test(candB.label);
      
      // Penalize large jumps more
      let penalty = 0.5 + 0.15 * dist + (sameQual ? 0.0 : 0.08);
      
      // Circle of fifths bonus (common progressions)
      if (dist === 7 || dist === 5) { // Fifth up or down
        penalty -= 0.15;
      }
      
      return penalty;
    };
    
    // Viterbi DP
    const N = candidates.length;
    const M = chroma.length;
    const dp = new Array(N).fill(0);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));
    
    // Initialize
    for (let s = 0; s < N; s++) {
      dp[s] = emitScore(0, candidates[s]);
    }
    
    // Forward pass
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      
      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity, bestJ = -1;
        
        for (let j = 0; j < N; j++) {
          const val = dp[j] - transitionPenalty(candidates[j], candidates[s]);
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
    
    // Backtrack
    let bestS = 0, bestVal = -Infinity;
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
    
    // Convert states to timeline WITH BASS INFO
    const tl = [];
    const secPerHop = hop / sr;
    let cur = states[0], start = 0;
    
    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        tl.push({
          t: start * secPerHop,
          label: candidates[cur].label,
          fi: start,
          endFrame: i - 1  // Store end frame for bass analysis
        });
        cur = states[i];
        start = i;
      }
    }
    tl.push({
      t: start * secPerHop,
      label: candidates[cur].label,
      fi: start,
      endFrame: M - 1
    });
    
    console.log(`🎵 HMM produced ${tl.length} chord segments`);
    return tl;
  }
  
  /**
   * Finalize timeline: merge short chords, snap to grid
   */
  finalizeTimeline(tl, key, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.45 * spb);
    const out = [];
    
    for (let i = 0; i < tl.length; i++) {
      const a = tl[i];
      const b = tl[i + 1];
      const dur = (b ? b.t : a.t + 4 * spb) - a.t;
      
      if (dur < minDur && out.length) {
        const fiA = a.fi, fiB = (b ? b.fi : fiA + 1);
        const bpA = feats.bassPc[fiA] ?? -1;
        const bpB = feats.bassPc[Math.min(feats.bassPc.length - 1, fiB)] ?? -1;
        const bassChanged = (bpA >= 0 && bpB >= 0 && bpA !== bpB);
        
        if (!bassChanged) {
          const prev = out[out.length - 1];
          const r = this.parseRoot(a.label), pr = this.parseRoot(prev.label);
          const inA = this.isDiatonic(a.label, key), inP = this.isDiatonic(prev.label, key);
          if (!inA || inP) { continue; }
        }
      }
      out.push(a);
    }
    
    // Snap to grid
    const snapped = [];
    for (const ev of out) {
      const q = Math.max(0, Math.round(ev.t / spb) * spb);
      if (!snapped.length || snapped.at(-1).label !== ev.label) {
        snapped.push({ t: q, label: ev.label, fi: ev.fi });
      }
    }
    
    return snapped;
  }

  // ============================================
  // MAIN DETECTION METHOD
  // ============================================
  
  async detect(audioBuffer, options = {}) {
    const startTime = performance.now();
    console.log('🎸 Starting UNIFIED chord detection with HMM...');
    
    const mode = options.mode || 'balanced';
    const harmonyMode = options.harmonyMode || 'jazz';
    const decorationSensitivity = options.decorationSensitivity || 1.0;
    let bpm = options.bpm;
    
    console.log(`🎚️ Decoration sensitivity: ${decorationSensitivity.toFixed(2)}`);
    
    const mono = (audioBuffer.numberOfChannels === 1) ? 
      audioBuffer.getChannelData(0) : this.mixStereo(audioBuffer);
    
    const sr0 = audioBuffer.sampleRate;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    
    if (!bpm) {
      bpm = this.estimateTempo(x, sr);
      console.log(`🎵 Estimated BPM: ${bpm}`);
    }
    
    const audioData = { x, sr, bpm, duration: x.length / sr };
    const feats = this.extractFeatures(audioData, bpm);
    
    const key = this.estimateKey(feats.chroma);
    console.log(`🎼 Detected key: ${this.nameSharp(key.root)}${key.minor ? 'm' : ''}`);
    
    // Enhanced key detection integration
    if (typeof EnhancedKeyDetection !== 'undefined') {
      try {
        const rawTimeline = this.chordTrackingWithHMM(feats, key);
        const enhancedResult = EnhancedKeyDetection.detectKey(rawTimeline, key);
        if (enhancedResult && enhancedResult.key) {
          console.log(`🎼 Enhanced key: ${this.nameSharp(enhancedResult.key.root)}${enhancedResult.key.minor ? 'm' : ''} (confidence: ${enhancedResult.confidence}%)`);
          key.root = enhancedResult.key.root;
          key.minor = enhancedResult.key.minor;
        }
      } catch (e) {
        console.warn('⚠️ Enhanced key detection failed:', e.message);
      }
    }
    
    const detectedMode = this.detectMode(feats, key);
    
    // 🔥 Use HMM tracking (much better than buildChordsFromBass!)
    let timeline = this.chordTrackingWithHMM(feats, key);
    
    // Post-processing
    timeline = this.finalizeTimeline(timeline, key, bpm, feats);
    
    // Add chromatic filtering BEFORE decorations
    timeline = this.filterFastChromaticChords(timeline, key);
    
    timeline = this.decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, decorationSensitivity);
    timeline = this.addInversionsIfNeeded(timeline, feats, 1.25);
    
    // Validation and refinement (only in accurate mode)
    if (mode === 'accurate') {
      timeline = this.validateChords(timeline, key, feats);
    }
    
    timeline = this.classifyOrnamentsByDuration(timeline, bpm);
    
    if (feats.onsets && feats.onsets.length > 0) {
      timeline = this.quantizeChordsToBeats(timeline, feats.onsets, bpm);
    }
    
    timeline = this.removeRedundantChords(timeline, bpm);
    
    const gateFrameIdx = this.detectStartGate(feats);
    const gateTime = gateFrameIdx * (feats.hop / feats.sr);
    
    const processingTime = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Detection complete: ${timeline.length} chords in ${processingTime}s`);
    
    return {
      chords: timeline,
      key: key,
      mode: detectedMode,
      bpm: bpm,
      gateTime: gateTime,
      stats: {
        processingTime: `${processingTime}s`,
        totalChords: timeline.length,
        diatonicChords: timeline.filter(ch => this.isDiatonic(ch.label, key)).length,
        chromaticChords: timeline.filter(ch => !this.isDiatonic(ch.label, key)).length
      }
    };
  }

  // ============================================
  // 🔥 CONSERVATIVE CHROMATIC FILTERING
  // ============================================
  
  /**
   * Filter fast chromatic chords - ULTRA CONSERVATIVE!
   * 
   * Philosophy: Better to miss a chromatic than to invent one!
   * Only allow chromatic if ALL conditions are met:
   * 1. Duration >= 0.8s (even longer!)
   * 2. Confidence >= 80 (very high!)
   * 3. Strong harmonic function (V7→I or modal borrowing)
   */
  filterFastChromaticChords(chords, key) {
    if (!chords || chords.length === 0) return chords;
    
    const filtered = [];
    const MIN_CHROMATIC_DURATION = 0.8; // 🔥 Increased from 0.5s!
    const MIN_CHROMATIC_CONFIDENCE = 80; // 🔥 Increased from 70!
    
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const prevChord = filtered[filtered.length - 1];
      
      const duration = nextChord ? (nextChord.t - chord.t) : 1.0;
      const isChromatic = !this.isDiatonic(chord.label, key);
      
      if (isChromatic) {
        // Rule 1: Duration check - STRICT!
        if (duration < MIN_CHROMATIC_DURATION) {
          console.log(`❌ Removed short chromatic: ${chord.label} (${duration.toFixed(2)}s - need ${MIN_CHROMATIC_DURATION}s)`);
          continue;
        }
        
        // Rule 2: Confidence check - STRICT!
        if (!chord.confidence || chord.confidence < MIN_CHROMATIC_CONFIDENCE) {
          console.log(`❌ Removed weak chromatic: ${chord.label} (conf: ${chord.confidence || 0} - need ${MIN_CHROMATIC_CONFIDENCE})`);
          continue;
        }
        
        // Rule 3: Between same chords
        if (prevChord && nextChord) {
          const prevRoot = this.parseRoot(prevChord.label);
          const nextRoot = this.parseRoot(nextChord.label);
          if (prevRoot === nextRoot && this.isDiatonic(prevChord.label, key)) {
            console.log(`❌ Removed passing chromatic: ${chord.label} (between ${prevChord.label})`);
            continue;
          }
        }
        
        // Rule 4: 🔥 NEW! Must be a valid harmonic function
        const hasValidFunction = this.isStrongChromaticFunction(chord, key, nextChord);
        if (!hasValidFunction) {
          console.log(`❌ Removed invalid chromatic: ${chord.label} (no strong harmonic function)`);
          continue;
        }
        
        console.log(`✅ Kept STRONG chromatic: ${chord.label} (${duration.toFixed(2)}s, conf: ${chord.confidence})`);
      }
      
      filtered.push(chord);
    }
    
    const removed = chords.length - filtered.length;
    if (removed > 0) {
      console.log(`🔍 Chromatic filter: ${chords.length} → ${filtered.length} chords (removed ${removed} weak chromatics)`);
    }
    return filtered;
  }
  
  /**
   * 🔥 NEW: Check if chromatic chord has STRONG harmonic function
   * Only allow:
   * 1. V7 → I (secondary dominant with resolution)
   * 2. Common modal borrowing (iv in major, VI in major)
   */
  isStrongChromaticFunction(chord, key, nextChord) {
    const root = this.parseRoot(chord.label);
    if (root === null) return false;
    
    const keyRoot = key.root;
    const interval = this.toPc(root - keyRoot);
    
    // 1. Secondary dominant - MUST have 7 AND resolve
    if (chord.label.includes('7') && nextChord) {
      const nextRoot = this.parseRoot(nextChord.label);
      if (nextRoot !== null) {
        const resolution = this.toPc(nextRoot - root);
        if (resolution === 5 || resolution === 7) {
          // V7 → I resolution detected
          console.log(`   ✓ Valid secondary dominant: ${chord.label} → ${nextChord.label}`);
          return true;
        }
      }
    }
    
    // 2. Modal borrowing - ONLY the most common ones
    if (!key.minor) {
      // In major key: only allow iv (from parallel minor)
      if (interval === 5 && chord.label.includes('m')) {
        console.log(`   ✓ Valid modal borrowing: ${chord.label} (iv in major)`);
        return true;
      }
    } else {
      // In minor key: only allow VI (major VI from parallel major)
      if (interval === 8 && !chord.label.includes('m') && !chord.label.includes('dim')) {
        console.log(`   ✓ Valid modal borrowing: ${chord.label} (VI in minor)`);
        return true;
      }
    }
    
    // 3. Reject everything else!
    console.log(`   ✗ No strong harmonic function for ${chord.label}`);
    return false;
  }
  
  /**
   * Check if chord is diatonic to key
   */
  isDiatonic(label, key) {
    const root = this.parseRoot(label);
    if (root === null || root < 0) return false;
    
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const relativePitch = this.toPc(root - key.root);
    
    return scale.includes(relativePitch);
  }

  // ============================================
  // AUDIO PROCESSING
  // ============================================

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

  detectOnsets(x, sr) {
    const hopSize = Math.floor(sr * 0.01);
    const windowSize = Math.floor(sr * 0.046);
    
    const energy = [];
    for (let i = 0; i + windowSize < x.length; i += hopSize) {
      let e = 0;
      for (let j = 0; j < windowSize; j++) {
        e += x[i + j] * x[i + j];
      }
      energy.push(Math.sqrt(e / windowSize));
    }
    
    const diff = [];
    for (let i = 1; i < energy.length; i++) {
      diff.push(Math.max(0, energy[i] - energy[i - 1]));
    }
    
    const meanDiff = diff.reduce((a, b) => a + b, 0) / diff.length;
    const threshold = meanDiff * 2.5;
    
    const onsets = [];
    for (let i = 1; i < diff.length - 1; i++) {
      if (diff[i] > threshold && diff[i] > diff[i - 1] && diff[i] > diff[i + 1]) {
        const time = i * hopSize / sr;
        onsets.push(time);
      }
    }
    
    return onsets;
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
    const chroma = [], bassCand = [], frameE = [];
    const spectralCentroids = []; // 🔥 QUICK WIN #3
    
    for (let i = 0; i < frames.length; i++) {
      const y = new Float32Array(win);
      for (let k = 0; k < win; k++) y[k] = frames[i][k] * hann[k];
      
      let en = 0;
      for (let k = 0; k < win; k++) en += y[k] * y[k];
      frameE.push(en);
      
      const { mags, N } = fft(y);
      
      // 🔥 QUICK WIN #3: Calculate spectral centroid
      let centroidNum = 0, centroidDen = 0;
      for (let b = 1; b < mags.length; b++) {
        const f = hz(b, N);
        if (f >= 80 && f <= 5000) {
          centroidNum += f * mags[b];
          centroidDen += mags[b];
        }
      }
      const centroid = centroidDen > 0 ? centroidNum / centroidDen : 2000;
      spectralCentroids.push(centroid);
      
      // Chroma
      const c = new Float32Array(12);
      for (let b = 1; b < mags.length; b++) {
        const f = hz(b, N);
        if (f < 80 || f > 5000) continue;
        const midi = 69 + 12 * Math.log2(f / 440);
        const pc = this.toPc(Math.round(midi));
        c[pc] += mags[b];
      }
      let s = 0;
      for (let k = 0; k < 12; k++) s += c[k];
      if (s > 0) { for (let k = 0; k < 12; k++) c[k] /= s; }
      chroma.push(c);
      
      // 🔥 OLD WORKING BASS DETECTION - ACF on LPF signal
      const magsLP = new Float32Array(mags.length);
      const fmax = 150; // Changed from 250 to 150Hz for better bass detection
      for (let b = 1; b < mags.length; b++) {
        const f = hz(b, N);
        if (f <= fmax) magsLP[b] = mags[b];
      }
      
      // Reconstruct time-domain LPF signal
      const yLP = new Float32Array(win);
      for (let b = 1; b < magsLP.length; b++) {
        const f = hz(b, N);
        if (f <= fmax) {
          const omega = 2 * Math.PI * f / sr;
          for (let n = 0; n < win; n++) {
            yLP[n] += magsLP[b] * Math.cos(omega * n);
          }
        }
      }
      
      // ACF for F0 detection
      const fmin = 40;
      const f0minLag = Math.floor(sr / fmax), f0maxLag = Math.floor(sr / Math.max(1, fmin));
      let bestLag = -1, bestR = -1;
      const mean = yLP.reduce((s, v) => s + v, 0) / win;
      let denom = 0;
      for (let n = 0; n < win; n++) {
        const d = yLP[n] - mean;
        denom += d * d;
      }
      denom = Math.max(denom, 1e-9);
      
      for (let lag = f0minLag; lag <= f0maxLag; lag++) {
        let r = 0;
        for (let n = 0; n < win - lag; n++) {
          const a = yLP[n] - mean, b = yLP[n + lag] - mean;
          r += a * b;
        }
        r /= denom;
        if (r > bestR) { bestR = r; bestLag = lag; }
      }
      
      let pcBass = -1;
      if (bestLag > 0) {
        const f0 = sr / bestLag;
        if (f0 >= fmin && f0 <= fmax) {
          const midiF0 = 69 + 12 * Math.log2(f0 / 440);
          pcBass = this.toPc(Math.round(midiF0));
        }
      }
      bassCand.push(pcBass);
    }
    
    // 🔥 OLD WORKING TEMPORAL SMOOTHING
    const thrE = this.percentileLocal(frameE, 40);
    const bassPc = new Array(bassCand.length).fill(-1);
    
    // First pass: require agreement with neighbors
    for (let i = 1; i < bassCand.length - 1; i++) {
      const v = bassCand[i];
      if (v < 0) continue;
      if (frameE[i] < thrE) continue;
      if ((bassCand[i - 1] === v) || (bassCand[i + 1] === v)) {
        bassPc[i] = v;
      }
    }
    
    // Second pass: close short runs
    let runStart = -1, runVal = -2;
    for (let i = 0; i < bassPc.length; i++) {
      const v = bassPc[i];
      if (v >= 0 && runStart < 0) { runStart = i; runVal = v; }
      const end = (i === bassPc.length - 1) || (bassPc[i + 1] !== v);
      if (runStart >= 0 && end) {
        if (i - runStart + 1 >= 2) {
          for (let k = runStart; k <= i; k++) bassPc[k] = runVal;
        } else {
          for (let k = runStart; k <= i; k++) bassPc[k] = -1;
        }
        runStart = -1; runVal = -2;
      }
    }
    
    const onsets = this.detectOnsets(frameE, hop, sr);
    
    return { chroma, bassPc, frameE, onsets, hop, sr, spectralCentroids };
  }

  // ============================================
  // KEY & MODE DETECTION
  // ============================================

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

  // ============================================
  // CHORD BUILDING & DECORATION
  // ============================================

  buildAllowedChords(key) {
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root + s));
    
    const borrowed = [];
    if (key.minor) {
      borrowed.push(this.toPc(key.root + 7));
      borrowed.push(this.toPc(key.root + 11));
    } else {
      borrowed.push(this.toPc(key.root + 5));
      borrowed.push(this.toPc(key.root + 10));
    }
    
    const secondaryDominants = diatonic.map(note => this.toPc(note + 7));
    
    return {
      diatonic: diatonic,
      borrowed: borrowed,
      secondaryDominants: secondaryDominants,
      allAllowed: [...new Set([...diatonic, ...borrowed])]
    };
  }

  scoreChordConfidence(root, label, key, avgChroma, duration) {
    const allowed = this.buildAllowedChords(key);
    let score = 0;
    
    // 🔥 MUCH STRONGER diatonic bonus!
    if (allowed.diatonic.includes(root)) {
      score += 70; // 🔥 Increased from 50!
    } else if (allowed.borrowed.includes(root)) {
      score += 25; // 🔥 Decreased from 30
    } else if (allowed.secondaryDominants.includes(root) && label.includes('7')) {
      score += 15; // 🔥 Decreased from 20
    } else {
      score -= 50; // 🔥 Increased penalty from -30!
    }
    
    // Root strength
    const rootStrength = avgChroma[root] || 0;
    score += rootStrength * 40; // 🔥 Decreased from 50
    
    // Duration bonus
    if (duration > 1.5) score += 15; // 🔥 Decreased from 20
    else if (duration > 0.75) score += 8; // 🔥 Decreased from 10
    else if (duration < 0.3) score -= 30; // 🔥 Increased penalty from -20
    
    // Valid triad check
    const hasValidTriad = this.hasValidTriad(root, label, avgChroma);
    if (hasValidTriad) {
      score += 20; // 🔥 Increased from 15
    } else {
      score -= 35; // 🔥 Increased penalty from -25
    }
    
    // 🔥 NEW: Check if quality matches expected diatonic quality
    if (allowed.diatonic.includes(root)) {
      const expectedQuality = this.getExpectedQuality(root, key);
      const actualIsMinor = label.includes('m') && !label.includes('maj');
      
      if (expectedQuality === 'minor' && actualIsMinor) {
        score += 15; // Quality matches!
      } else if (expectedQuality === 'major' && !actualIsMinor && !label.includes('dim')) {
        score += 15; // Quality matches!
      } else if (expectedQuality === 'dim' && label.includes('dim')) {
        score += 15; // Quality matches!
      } else {
        score -= 20; // Quality doesn't match - suspicious!
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 🔥 NEW: Get expected chord quality for a root in the key
   */
  getExpectedQuality(root, key) {
    const diatonic = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const scaleNotes = diatonic.map(interval => this.toPc(key.root + interval));
    const degree = scaleNotes.indexOf(root);
    
    if (degree === -1) return null;
    
    if (key.minor) {
      // Natural minor: i, ii°, III, iv, v, VI, VII
      if ([0, 3, 4].includes(degree)) return 'minor'; // i, iv, v
      if (degree === 1) return 'dim'; // ii°
      return 'major'; // III, VI, VII
    } else {
      // Major: I, ii, iii, IV, V, vi, vii°
      if ([1, 2, 5].includes(degree)) return 'minor'; // ii, iii, vi
      if (degree === 6) return 'dim'; // vii°
      return 'major'; // I, IV, V
    }
  }

  hasValidTriad(root, label, avgChroma) {
    const rootStrength = avgChroma[root] || 0;
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    
    const isMinor = label.includes('m') && !label.includes('maj');
    const third = isMinor ? minor3rd : major3rd;
    
    return rootStrength > 0.12 && third > 0.08 && fifth > 0.08;
  }

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
      
      if(!allowed.allAllowed.includes(root)){
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
      
      const bassVotes = new Array(12).fill(0);
      for(let j = startFrame; j < endFrame; j++){
        if(bassPc[j] >= 0) bassVotes[bassPc[j]]++;
      }
      const votedRoot = bassVotes.indexOf(Math.max(...bassVotes));
      const finalRoot = votedRoot >= 0 ? votedRoot : root;
      
      if(!allowed.allAllowed.includes(finalRoot)){
        i = endFrame;
        continue;
      }
      
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
      
      const minor3rd = avgChroma[this.toPc(finalRoot + 3)] || 0;
      const major3rd = avgChroma[this.toPc(finalRoot + 4)] || 0;
      const fifth = avgChroma[this.toPc(finalRoot + 7)] || 0;
      
      const minor3rdHarmonic = avgChroma[this.toPc(finalRoot + 6)] || 0;
      const major3rdHarmonic = avgChroma[this.toPc(finalRoot + 8)] || 0;
      
      const minorScore = (minor3rd * 2.0) + (minor3rdHarmonic * 0.8) + (fifth * 1.0);
      const majorScore = (major3rd * 2.0) + (major3rdHarmonic * 0.8) + (fifth * 1.0);
      
      let isMinor = false;
      
      // 🔥 SPECIAL CASE: V chord in minor key (Harmonic minor)
      // Check if this is degree V (5th) in a minor key
      const degreeInScale = allowed.diatonic.indexOf(finalRoot);
      const isVinMinor = key.minor && degreeInScale === 4; // v/V in minor
      
      if (isVinMinor) {
        // Check for leading tone (D# in Em = raised 7th)
        const leadingTone = this.toPc(key.root + 11); // Major 7th
        const leadingTonePresent = avgChroma[leadingTone] > 0.10;
        
        if (leadingTonePresent) {
          console.log(`   🎼 Detected harmonic minor: V chord is MAJOR (leading tone present)`);
          isMinor = false; // Force major V
        } else {
          isMinor = minorScore > majorScore; // Natural minor → could be minor
        }
      } else {
        // Normal logic
        const scoreDiff = Math.abs(majorScore - minorScore);
        
        if (scoreDiff < 0.15) {
          // Ambiguous - use diatonic expectation!
          const expectedQuality = this.getExpectedQuality(finalRoot, key);
          console.log(`   🎯 Ambiguous ${this.nameSharp(finalRoot)}: using diatonic quality (${expectedQuality})`);
          isMinor = expectedQuality === 'minor';
        } else if(majorScore > minorScore * 1.3) {
          isMinor = false;
        } else if(minorScore > majorScore * 1.3) {
          isMinor = true;
        } else {
          // Still close - prefer diatonic
          const expectedQuality = this.getExpectedQuality(finalRoot, key);
          if (expectedQuality) {
            isMinor = expectedQuality === 'minor';
            console.log(`   🎯 Close call for ${this.nameSharp(finalRoot)}: using diatonic (${expectedQuality})`);
          } else {
            isMinor = minorScore >= majorScore * 0.9;
          }
        }
      }
      
      let label = this.nameSharp(finalRoot) + (isMinor ? 'm' : '');
      const duration = (endFrame - startFrame) * (hop / sr);
      
      const confidence = this.scoreChordConfidence(finalRoot, label, key, avgChroma, duration);
      
      // 🚫 Reject weak chords - STRICT!
      if (confidence < 40) { // 🔥 Increased from 30!
        console.log(`❌ Rejected weak chord: ${label} (confidence: ${confidence})`);
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

  decideMajorMinorFromChroma(root, avgChroma) {
    const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
    const major3rd = avgChroma[this.toPc(root + 4)] || 0;
    const fifth = avgChroma[this.toPc(root + 7)] || 0;
    const rootStrength = avgChroma[root] || 0;
    
    // 🔥 QUICK WIN #2: Power Chord Detection
    // If both 3rds are very weak but 5th is strong → power chord
    if (fifth > 0.15 && major3rd < 0.06 && minor3rd < 0.06 && rootStrength > 0.10) {
      console.log(`   🎸 Power chord detected (R+5, no 3rd)`);
      return 'power'; // Special marker for power chord
    }
    
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

  detectChordQuality(root, avgChroma, mode = 'balanced', sensitivity = 1.0) {
    const results = [];
    
    for (const [templateName, template] of Object.entries(this.CHORD_TEMPLATES)) {
      let score = 0;
      let present = 0;
      
      for (let i = 0; i < template.intervals.length; i++) {
        const interval = template.intervals[i];
        const pc = this.toPc(root + interval);
        const strength = avgChroma[pc] || 0;
        const weight = template.weights[i];
        
        score += strength * weight;
        // 🎚️ Lower threshold = easier to detect extensions
        if (strength > (0.12 / sensitivity)) present++;
      }
      
      const maxScore = template.weights.reduce((sum, w) => sum + w, 0);
      const normalizedScore = score / maxScore;
      
      const minPresent = Math.min(3, template.intervals.length);
      if (present >= minPresent) {
        results.push({
          template: templateName,
          label: template.label,
          score: normalizedScore,
          present: present,
          total: template.intervals.length
        });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    
    // 🎚️ Apply sensitivity to acceptance threshold
    const acceptanceThreshold = 0.4 / sensitivity;
    
    // 🔥 EXPLICIT 7th CHECK: If triad wins but 7th is strong, prefer 7th chord
    if (results.length >= 2) {
      const best = results[0];
      const second = results[1];
      
      // Check if best is triad and second is 7th version
      const isBestTriad = !best.label.includes('7') && !best.label.includes('9');
      const isSecond7th = second.label.includes('7') && !second.label.includes('9');
      
      if (isBestTriad && isSecond7th && second.score > acceptanceThreshold * 0.8) {
        // Check if 7th note is STRONG in chroma
        const seventh = isSecond7th && second.label.includes('maj7') ? 11 : 10;
        const seventhPc = this.toPc(root + seventh);
        const seventhStrength = avgChroma[seventhPc] || 0;
        
        // If 7th is strong (> 0.15), prefer 7th chord over triad
        if (seventhStrength > 0.15 / sensitivity) {
          console.log(`   🎵 Prefer 7th: ${best.label || 'major'} → ${second.label} (7th strength: ${seventhStrength.toFixed(3)})`);
          return {
            label: second.label,
            confidence: second.score,
            alternatives: [best, ...results.slice(2, 3)]
          };
        }
      }
    }
    
    if (results.length > 0 && results[0].score > acceptanceThreshold) {
      return {
        label: results[0].label,
        confidence: results[0].score,
        alternatives: results.slice(1, 3)
      };
    }
    
    // Fallback to simple major/minor/power
    const quality = this.decideMajorMinorFromChroma(root, avgChroma);
    
    // Handle power chord
    if (quality === 'power') {
      return {
        label: '5',
        confidence: 0.8,
        alternatives: []
      };
    }
    
    return {
      label: quality ? 'm' : '',
      confidence: 0.5,
      alternatives: []
    };
  }

  decorateQualitiesBassFirst(tl, feats, key, mode, decMul = 1.0) {
    if (mode === 'basic') return tl;
    
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
      
      // 🔥 QUICK WIN #3: Adaptive Threshold
      // Calculate average spectral centroid for this chord
      const startFi = ev.fi;
      const endFi = ev.endFrame || Math.min(startFi + 10, feats.spectralCentroids.length - 1);
      let avgCentroid = 0, count = 0;
      
      for (let i = startFi; i <= endFi && i < feats.spectralCentroids.length; i++) {
        avgCentroid += feats.spectralCentroids[i];
        count++;
      }
      avgCentroid = count > 0 ? avgCentroid / count : 2000;
      
      // Adapt sensitivity based on spectral content
      // Bright sound (high centroid) → increase sensitivity (easier to detect extensions)
      // Dark sound (low centroid) → decrease sensitivity (harder to hear extensions)
      let adaptedSensitivity = decMul;
      if (avgCentroid < 1500) {
        adaptedSensitivity *= 0.8; // Dark → less sensitive
        console.log(`   🎚️ Dark timbre (${avgCentroid.toFixed(0)}Hz) → sensitivity ×0.8`);
      } else if (avgCentroid > 3000) {
        adaptedSensitivity *= 1.2; // Bright → more sensitive
        console.log(`   🎚️ Bright timbre (${avgCentroid.toFixed(0)}Hz) → sensitivity ×1.2`);
      }
      
      const quality = this.detectChordQuality(root, avg, mode, adaptedSensitivity);
      const rootName = this.nameSharp(root);
      let label = rootName + quality.label;
      
      // 🔥 QUICK WIN #1: Extension Validation
      // 9th requires 7th, otherwise it's add9
      if (label.includes('9') && !label.includes('7') && !label.includes('maj')) {
        label = label.replace('9', 'add9');
        console.log(`   ✓ Corrected: 9 → add9 (no 7th present)`);
      }
      
      // 13th should have 7th
      if (label.includes('13') && !label.includes('7') && !label.includes('maj')) {
        label = label.replace('13', 'add13');
        console.log(`   ✓ Corrected: 13 → add13 (no 7th present)`);
      }
      
      // 11th should have 7th (and ideally 9th)
      if (label.includes('11') && !label.includes('7') && !label.includes('maj')) {
        label = label.replace('11', 'add11');
        console.log(`   ✓ Corrected: 11 → add11 (no 7th present)`);
      }
      
      // 🔥 DISAMBIGUATION: dim7 vs m7b5
      // dim7: symmetrical (all minor 3rds) - very rare
      // m7b5: more common in jazz (ii° in minor)
      if (label.includes('dim7')) {
        const bb7 = this.toPc(root + 9);  // dim7 (bb7)
        const b7 = this.toPc(root + 10);   // m7b5 (b7)
        
        const bb7Strength = avg[bb7] || 0;
        const b7Strength = avg[b7] || 0;
        
        // If b7 is stronger than bb7, it's m7b5
        if (b7Strength > bb7Strength * 1.2) {
          label = label.replace('dim7', 'm7b5');
          console.log(`   ✓ Disambiguated: dim7 → m7b5 (b7 stronger)`);
        }
      }
      
      ev.qualityConfidence = quality.confidence;
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  addInversionsIfNeeded(tl, feats, bassSens = 1.25) {
    // 🔥 Conservative inversion detection
    
    return tl.map(ev => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return ev;
      
      const { bassPc } = feats;
      const i0 = Math.max(0, ev.fi);
      const i1 = Math.min(bassPc.length - 1, ev.endFrame || ev.fi + 3);
      
      // Vote for bass notes
      const bassVotes = new Array(12).fill(0);
      for (let i = i0; i <= i1; i++) {
        if (bassPc[i] >= 0) bassVotes[bassPc[i]]++;
      }
      
      const dominantBass = bassVotes.indexOf(Math.max(...bassVotes));
      if (dominantBass < 0 || dominantBass === root) return ev;
      
      const rootVotes = bassVotes[root] || 0;
      const bassNotVotes = bassVotes[dominantBass] || 0;
      
      // 🎯 CONSERVATIVE: Require bass to be MUCH stronger than root
      // If B has F# bass, but B also appears in bass → don't invert
      if (bassNotVotes < rootVotes * 1.5) {
        console.log(`   ⚠️ Inversion rejected: bass not dominant enough (${bassNotVotes} vs ${rootVotes})`);
        return ev;
      }
      
      // Check if bass is a chord tone
      const isMinor = /m(?!aj)/.test(ev.label);
      const has7 = /7/.test(ev.label);
      const hasMaj7 = /maj7/.test(ev.label);
      
      let chordTones = isMinor ? [0, 3, 7] : [0, 4, 7];
      if (has7 && !hasMaj7) chordTones.push(10);
      if (hasMaj7) chordTones.push(11);
      
      const bassInterval = this.toPc(dominantBass - root);
      
      // Only add inversion if bass is actually a chord tone
      if (chordTones.includes(bassInterval)) {
        const bassNote = this.nameSharp(dominantBass);
        console.log(`   🎸 Inversion: ${ev.label} → ${ev.label}/${bassNote} (votes: ${bassNotVotes} vs ${rootVotes})`);
        return { ...ev, label: ev.label + '/' + bassNote };
      }
      
      return ev;
    });
  }

  validateChords(tl, key, feats) {
    const allowed = this.buildAllowedChords(key);
    
    return tl.filter((ev, idx) => {
      const root = this.parseRoot(ev.label);
      if (root < 0) return false;
      
      const isDiatonic = allowed.diatonic.includes(root);
      const isBorrowed = allowed.borrowed.includes(root);
      const isSecondaryDom = allowed.secondaryDominants.includes(root) && ev.label.includes('7');
      
      if (!isDiatonic && !isBorrowed && !isSecondaryDom) {
        return false;
      }
      
      const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
      
      if (isDiatonic) {
        return chromaStrength >= 0.12;
      } else if (isBorrowed) {
        return chromaStrength >= 0.18;
      } else {
        return chromaStrength >= 0.25;
      }
    });
  }

  classifyOrnamentsByDuration(tl, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const structuralThreshold = spb * 0.75;
    
    return tl.map((ev, i) => {
      const nextEv = tl[i + 1];
      const duration = nextEv ? (nextEv.t - ev.t) : (spb * 2);
      
      let ornamentType = 'structural';
      
      if (duration < spb * 0.25) {
        if (ev.confidence && ev.confidence < 70) {
          ornamentType = 'passing';
        } else {
          ornamentType = 'ornament';
        }
      } else if (duration < structuralThreshold) {
        ornamentType = 'ornament';
      }
      
      return { ...ev, ornamentType };
    });
  }

  quantizeChordsToBeats(timeline, onsets, bpm) {
    if (!onsets || onsets.length === 0) return timeline;
    
    const quantized = [];
    
    for (const chord of timeline) {
      let nearestOnset = onsets[0];
      let minDist = Math.abs(chord.t - nearestOnset);
      
      for (const onset of onsets) {
        const dist = Math.abs(chord.t - onset);
        if (dist < minDist) {
          minDist = dist;
          nearestOnset = onset;
        }
      }
      
      const newT = minDist < 0.2 ? nearestOnset : chord.t;
      quantized.push({ ...chord, t: newT });
    }
    
    const filtered = [];
    for (let i = 0; i < quantized.length; i++) {
      if (i === 0 || quantized[i].label !== quantized[i-1].label || 
          quantized[i].t - quantized[i-1].t > 0.1) {
        filtered.push(quantized[i]);
      }
    }
    
    return filtered;
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

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

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

  getDiatonicChords(tonic, mode) {
    const noteNames = this.NOTES_SHARP;
    const tonicRoot = this.parseRoot(tonic);
    if (tonicRoot < 0) return [];
    
    const chords = [];
    
    if (mode === 'major') {
      const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
      const scale = [0, 2, 4, 5, 7, 9, 11];
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        const rootName = noteNames[root];
        chords.push(rootName + qualities[i]);
      }
    } else {
      const qualities = ['m', 'dim', '', 'm', 'm', '', ''];
      const scale = [0, 2, 3, 5, 7, 8, 10];
      
      for (let i = 0; i < scale.length; i++) {
        const root = this.toPc(tonicRoot + scale[i]);
        const rootName = noteNames[root];
        chords.push(rootName + qualities[i]);
      }
    }
    
    return chords;
  }

  parseRoot(label) {
    const m = label?.match?.(/^([A-G](?:#|b)?)/);
    if (!m) return -1;
    const nm = m[1].replace('b', '#');
    return this.NOTES_SHARP.indexOf(nm);
  }

  toPc(n) { return ((n % 12) + 12) % 12; }
  nameSharp(pc) { return this.NOTES_SHARP[this.toPc(pc)]; }
  nameFlat(pc) { return this.NOTES_FLAT[this.toPc(pc)]; }

  percentileLocal(arr, pct) {
    const sorted = [...arr].filter(x => Number.isFinite(x)).sort((a,b) => a-b);
    const idx = Math.floor(sorted.length * pct / 100);
    return sorted[idx] || 0;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.ChordEngine = ChordEngine;
  console.log('✅ ChordEngine UNIFIED (v3.0.0) - Single file with filtering!');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}
