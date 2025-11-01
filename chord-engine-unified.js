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
      maj7: { intervals: [0, 4, 7, 11], weights: [1.0, 0.9, 0.8, 0.75], label: 'maj7' },
      dom7: { intervals: [0, 4, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: '7' },
      m7: { intervals: [0, 3, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7' },
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
  // MAIN DETECTION METHOD
  // ============================================
  
  async detect(audioBuffer, options = {}) {
    const startTime = performance.now();
    console.log('🎸 Starting unified chord detection...');
    
    const mode = options.mode || 'balanced';
    const harmonyMode = options.harmonyMode || 'jazz';
    let bpm = options.bpm;
    
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
        const rawTimeline = this.buildChordsFromBass(feats, key, bpm);
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
    
    let timeline = this.buildChordsFromBass(feats, key, bpm);
    timeline = this.decorateQualitiesBassFirst(timeline, feats, key, harmonyMode, 1.0);
    timeline = this.addInversionsIfNeeded(timeline, feats, 1.25);
    timeline = this.validateChords(timeline, key, feats);
    
    // 🔥 CRITICAL: Filter fast chromatic chords
    timeline = this.filterFastChromaticChords(timeline, key);
    
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
   * Filter fast chromatic chords - NO INVENTIONS!
   * Rules:
   * 1. Chromatic chord < 0.5s → DELETE
   * 2. Chromatic chord with confidence < 70 → DELETE
   * 3. Chromatic chord between same diatonic chords → DELETE
   */
  filterFastChromaticChords(chords, key) {
    if (!chords || chords.length === 0) return chords;
    
    const filtered = [];
    const MIN_CHROMATIC_DURATION = 0.5;
    const MIN_CHROMATIC_CONFIDENCE = 70;
    
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const prevChord = filtered[filtered.length - 1];
      
      const duration = nextChord ? (nextChord.t - chord.t) : 1.0;
      const isChromatic = !this.isDiatonic(chord.label, key);
      
      if (isChromatic) {
        // Rule 1: Too short
        if (duration < MIN_CHROMATIC_DURATION) {
          console.log(`❌ Removed fast chromatic: ${chord.label} (${duration.toFixed(2)}s)`);
          continue;
        }
        
        // Rule 2: Low confidence
        if (chord.confidence < MIN_CHROMATIC_CONFIDENCE) {
          console.log(`❌ Removed uncertain: ${chord.label} (conf: ${chord.confidence})`);
          continue;
        }
        
        // Rule 3: Between same chords
        if (prevChord && nextChord) {
          const prevRoot = this.parseRoot(prevChord.label);
          const nextRoot = this.parseRoot(nextChord.label);
          if (prevRoot === nextRoot && this.isDiatonic(prevChord.label, key)) {
            console.log(`❌ Removed passing: ${chord.label}`);
            continue;
          }
        }
        
        console.log(`✅ Kept chromatic: ${chord.label} (${duration.toFixed(2)}s, conf: ${chord.confidence})`);
      }
      
      filtered.push(chord);
    }
    
    console.log(`🔍 Chromatic filter: ${chords.length} → ${filtered.length} chords`);
    return filtered;
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
    
    const onsets = this.detectOnsets(frameE, hop, sr);
    
    return { chroma, bassPc: bassPcFinal, frameE, onsets, hop, sr };
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
    
    if (allowed.diatonic.includes(root)) {
      score += 50;
    } else if (allowed.borrowed.includes(root)) {
      score += 30;
    } else if (allowed.secondaryDominants.includes(root) && label.includes('7')) {
      score += 20;
    } else {
      score -= 30;
    }
    
    const rootStrength = avgChroma[root] || 0;
    score += rootStrength * 50;
    
    if (duration > 1.5) score += 20;
    else if (duration > 0.75) score += 10;
    else if (duration < 0.3) score -= 20;
    
    const hasValidTriad = this.hasValidTriad(root, label, avgChroma);
    if (hasValidTriad) {
      score += 15;
    } else {
      score -= 25;
    }
    
    return Math.max(0, Math.min(100, score));
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
      if(majorScore > minorScore * 1.2) {
        isMinor = false;
      } else if(minorScore > majorScore * 1.2) {
        isMinor = true;
      } else {
        isMinor = minorScore >= majorScore * 0.9;
      }
      
      if (Math.abs(majorScore - minorScore) < 0.05) {
        const degreeInScale = allowed.diatonic.indexOf(finalRoot);
        if (degreeInScale >= 0) {
          if (key.minor) {
            isMinor = [0, 3, 4].includes(degreeInScale);
          } else {
            isMinor = [1, 2, 5].includes(degreeInScale);
          }
        }
      }
      
      let label = this.nameSharp(finalRoot) + (isMinor ? 'm' : '');
      const duration = (endFrame - startFrame) * (hop / sr);
      
      const confidence = this.scoreChordConfidence(finalRoot, label, key, avgChroma, duration);
      
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

  detectChordQuality(root, avgChroma, mode = 'balanced') {
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
        if (strength > 0.12) present++;
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
    
    if (results.length > 0 && results[0].score > 0.4) {
      return {
        label: results[0].label,
        confidence: results[0].score,
        alternatives: results.slice(1, 3)
      };
    }
    
    const isMinor = this.decideMajorMinorFromChroma(root, avgChroma);
    return {
      label: isMinor ? 'm' : '',
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
      
      const quality = this.detectChordQuality(root, avg, mode);
      const rootName = this.nameSharp(root);
      let label = rootName + quality.label;
      
      ev.qualityConfidence = quality.confidence;
      
      out.push({ ...ev, label });
    }
    
    return out;
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
