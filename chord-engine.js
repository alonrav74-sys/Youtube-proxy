// chord-engine.js - Complete Chord Detection Engine
// מנוע זיהוי אקורדים מלא - כולל עיבוד אודיו, FFT, וזיהוי אקורדים

(function(window) {
  'use strict';

class ChordEngine {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  }

  // ===== UTILITY FUNCTIONS =====
  
  toPc(n) { return ((n%12)+12)%12; }
  
  nameSharp(i) { return this.NOTES_SHARP[this.toPc(i)]; }
  
  nameFlat(i) { return this.NOTES_FLAT[this.toPc(i)]; }

  parseRoot(label) {
    const m = label?.match?.(/^([A-G](?:#|b)?)/);
    if(!m) return -1;
    const nm = m[1].replace('b','#');
    return this.NOTES_SHARP.indexOf(nm);
  }

  ksScore(chromaAgg, root, isMinor) {
    const prof = isMinor ? this.KS_MINOR : this.KS_MAJOR;
    let s = 0;
    for(let i=0; i<12; i++) s += chromaAgg[this.toPc(i+root)] * prof[i];
    return s;
  }

  percentileLocal(arr, p) {
    const a = [...arr].filter(x => Number.isFinite(x)).sort((x,y) => x-y);
    return a[Math.floor((p/100)*(a.length-1))] || 0;
  }

  // ===== AUDIO UTILITIES =====
  
  mixStereo(buf) {
    const a = buf.getChannelData(0);
    const b = buf.getChannelData(1) || a;
    const m = new Float32Array(buf.length);
    for(let i=0; i<buf.length; i++) m[i] = (a[i] + b[i]) * 0.5;
    return m;
  }

  resampleLinear(x, sr, target) {
    const r = target / sr;
    const L = Math.floor(x.length * r);
    const y = new Float32Array(L);
    for(let i=0; i<L; i++) {
      const t = i / r;
      const i0 = Math.floor(t);
      const i1 = Math.min(x.length-1, i0+1);
      y[i] = x[i0] * (1-(t-i0)) + x[i1] * (t-i0);
    }
    return y;
  }

  // ===== TEMPO ESTIMATION =====
  
  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const frames = [];
    for(let s=0; s+4096<=x.length; s+=hop) {
      let e = 0;
      for(let i=0; i<4096; i++) e += x[s+i] * x[s+i];
      frames.push(e);
    }
    
    const minLag = Math.floor(0.3 / (hop/sr));
    const maxLag = Math.floor(2.0 / (hop/sr));
    let bestLag = minLag;
    let bestR = -Infinity;
    
    for(let lag=minLag; lag<=maxLag; lag++) {
      let r = 0;
      for(let i=0; i<frames.length-lag; i++) r += frames[i] * frames[i+lag];
      if(r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }
    
    const bpm = 60 / (bestLag * (hop/sr));
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  // ===== FFT =====
  
  fft(input) {
    let n = input.length;
    let N = 1;
    while(N < n) N <<= 1;
    
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);
    
    // Bit reversal
    let j = 0;
    for(let i=0; i<N; i++) {
      if(i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
      let m = N >> 1;
      while(m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }
    
    // FFT
    for(let len=2; len<=N; len<<=1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang);
      const wli = Math.sin(ang);
      
      for(let i=0; i<N; i+=len) {
        let wr = 1;
        let wi = 0;
        for(let k=0; k<(len>>1); k++) {
          const ur = re[i+k];
          const ui = im[i+k];
          const vr = re[i+k+(len>>1)] * wr - im[i+k+(len>>1)] * wi;
          const vi = re[i+k+(len>>1)] * wi + im[i+k+(len>>1)] * wr;
          
          re[i+k] = ur + vr;
          im[i+k] = ui + vi;
          re[i+k+(len>>1)] = ur - vr;
          im[i+k+(len>>1)] = ui - vi;
          
          const nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr;
          wr = nwr;
        }
      }
    }
    
    const mags = new Float32Array(N >> 1);
    for(let k=0; k<mags.length; k++) {
      mags[k] = Math.hypot(re[k], im[k]);
    }
    
    return {mags, N};
  }

  // ===== FEATURE EXTRACTION =====
  
  extractFeatures(x, sr, bpm) {
    const hop = Math.floor(0.10 * sr);
    const win = 4096;
    
    // Hann window
    const hann = new Float32Array(win);
    for(let i=0; i<win; i++) {
      hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win-1)));
    }
    
    // Split into frames
    const frames = [];
    for(let s=0; s+win<=x.length; s+=hop) {
      frames.push(x.subarray(s, s+win));
    }
    
    const hz = (b, N) => b * sr / N;
    const chroma = [];
    const bassPc = [];
    const bassEnergy = [];
    const frameE = [];
    
    const arpeggioWindow = Math.max(4, Math.min(8, Math.round(60 / bpm * sr / hop)));
    
    for(let i=0; i<frames.length; i++) {
      // Apply window
      const y = new Float32Array(win);
      for(let k=0; k<win; k++) y[k] = frames[i][k] * hann[k];
      
      // Frame energy
      let en = 0;
      for(let k=0; k<win; k++) en += y[k] * y[k];
      frameE.push(en);
      
      // Accumulated chroma with arpeggio support
      const accumulated = new Float32Array(12);
      const startIdx = Math.max(0, i - arpeggioWindow + 1);
      
      for(let j=startIdx; j<=i; j++) {
        const frame = frames[j];
        const tempY = new Float32Array(win);
        for(let k=0; k<win; k++) tempY[k] = frame[k] * hann[k];
        
        const {mags, N} = this.fft(tempY);
        const weight = Math.pow(0.7, i - j);
        
        for(let b=1; b<mags.length; b++) {
          const f = hz(b, N);
          if(f < 80 || f > 5000) continue;
          
          const midi = 69 + 12 * Math.log2(f / 440);
          const pc = this.toPc(Math.round(midi));
          const freqWeight = f < 300 ? 2.5 : 1.0;
          accumulated[pc] += mags[b] * freqWeight * weight;
        }
      }
      
      // Normalize chroma
      let s = 0;
      for(let k=0; k<12; k++) s += accumulated[k];
      if(s > 0) {
        for(let k=0; k<12; k++) accumulated[k] /= s;
      }
      chroma.push(accumulated);
      
      // Bass extraction
      const bassChroma = new Float32Array(12);
      let bassEn = 0;
      
      for(let j=startIdx; j<=i; j++) {
        const frame = frames[j];
        const tempY = new Float32Array(win);
        for(let k=0; k<win; k++) tempY[k] = frame[k] * hann[k];
        
        const {mags, N} = this.fft(tempY);
        const weight = Math.pow(0.8, i - j);
        
        for(let b=1; b<mags.length; b++) {
          const f = hz(b, N);
          if(f >= 50 && f <= 200) {
            const midi = 69 + 12 * Math.log2(f / 440);
            const pc = this.toPc(Math.round(midi));
            const fundamental = f < 100 ? 10.0 : (f < 150 ? 5.0 : 2.0);
            bassChroma[pc] += mags[b] * fundamental * weight * 1.8;
            bassEn += mags[b] * weight;
          }
        }
      }
      
      // Find dominant bass note
      let maxBass = -1;
      let maxVal = 0;
      for(let pc=0; pc<12; pc++) {
        if(bassChroma[pc] > maxVal) {
          maxVal = bassChroma[pc];
          maxBass = pc;
        }
      }
      
      const threshold = bassEn * 0.20;
      bassPc.push(bassChroma[maxBass] > threshold ? maxBass : -1);
      bassEnergy.push(bassEn);
    }
    
    // Clean up bass with voting
    const thrE = this.percentileLocal(frameE, 15);
    const bassPcFinal = new Array(bassPc.length).fill(-1);
    
    for(let i=3; i<bassPc.length-3; i++) {
      const v = bassPc[i];
      if(v < 0 || frameE[i] < thrE || bassEnergy[i] < this.percentileLocal(bassEnergy, 10)) continue;
      
      const window = [
        bassPc[i-3], bassPc[i-2], bassPc[i-1], 
        v, 
        bassPc[i+1], bassPc[i+2], bassPc[i+3]
      ];
      const votes = window.filter(x => x === v).length;
      if(votes >= 3) bassPcFinal[i] = v;
    }
    
    return {
      chroma,
      bassPc: bassPcFinal,
      frameE,
      hop,
      sr
    };
  }

  // ===== START GATE DETECTION =====
  
  detectStartGate(frameE, bassPc) {
    const energies = [...frameE].filter(x => Number.isFinite(x)).sort((a,b) => a-b);
    const median = energies[Math.floor(energies.length * 0.5)] || 0;
    const energyThreshold = median * 0.8;
    
    for(let i=0; i<frameE.length; i++) {
      if(frameE[i] < energyThreshold) continue;
      if(bassPc[i] >= 0) return Math.max(0, i - 1);
    }
    return 0;
  }

  // ===== KEY ESTIMATION =====
  
  estimateKey(chroma) {
    const agg = new Array(12).fill(0);
    for(let i=0; i<chroma.length; i++) {
      for(let p=0; p<12; p++) agg[p] += chroma[i][p];
    }
    const s = agg.reduce((a,b) => a+b, 0) || 1;
    for(let p=0; p<12; p++) agg[p] /= s;
    
    let best = {score: -1, root: 0, minor: false};
    for(let r=0; r<12; r++) {
      const sMaj = this.ksScore(agg, r, false);
      const sMin = this.ksScore(agg, r, true);
      if(sMaj > best.score) best = {score: sMaj, root: r, minor: false};
      if(sMin > best.score) best = {score: sMin, root: r, minor: true};
    }
    return {root: best.root, minor: best.minor};
  }

  // ===== MODE DETECTION =====
  
  detectMode(chroma, key) {
    const agg = new Array(12).fill(0);
    for(const c of chroma) for(let p=0; p<12; p++) agg[p] += c[p];
    const s = agg.reduce((a,b) => a+b, 0) || 1;
    for(let p=0; p<12; p++) agg[p] /= s;
    
    if(!key.minor) {
      if(agg[this.toPc(key.root+10)] > 0.15) return 'Mixolydian';
      if(agg[this.toPc(key.root+6)] > 0.12) return 'Lydian';
      return 'Major';
    } else {
      if(agg[this.toPc(key.root+9)] > 0.15 && agg[this.toPc(key.root+11)] < 0.08) return 'Dorian';
      if(agg[this.toPc(key.root+11)] > 0.15) return 'Harmonic Minor';
      return 'Natural Minor';
    }
  }

  // ===== BUILD CHORDS FROM BASS =====
  
  buildChordsFromBass(bassPc, chroma, frameE, key, bpm, hop, sr) {
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root+s));
    const borrowedPcs = key.minor ? [this.toPc(key.root+8), this.toPc(key.root+10)] : [];
    const allowedPcs = [...diatonic, ...borrowedPcs];
    
    const spb = 60 / Math.max(60, bpm || 120);
    const minFrames = Math.max(2, Math.floor((spb * 0.3) / (hop/sr)));
    
    const timeline = [];
    let i = 0;
    
    while(i < bassPc.length) {
      if(bassPc[i] < 0 || frameE[i] < this.percentileLocal(frameE, 15)) {
        i++;
        continue;
      }
      
      const root = bassPc[i];
      const startFrame = i;
      const startTime = i * (hop/sr);
      
      if(!allowedPcs.includes(root)) {
        i++;
        continue;
      }
      
      let endFrame = startFrame;
      let gapCounter = 0;
      const maxGap = 3;
      
      while(endFrame < bassPc.length) {
        if(bassPc[endFrame] === root) {
          gapCounter = 0;
          endFrame++;
        } else if(bassPc[endFrame] < 0 || gapCounter < maxGap) {
          gapCounter++;
          endFrame++;
        } else {
          break;
        }
      }
      
      if((endFrame - startFrame) < minFrames) {
        i = endFrame;
        continue;
      }
      
      const avgChroma = new Float32Array(12);
      let totalWeight = 0;
      
      for(let j=startFrame; j<endFrame; j++) {
        if(chroma[j]) {
          const weight = Math.sqrt(frameE[j] || 1);
          for(let p=0; p<12; p++) avgChroma[p] += chroma[j][p] * weight;
          totalWeight += weight;
        }
      }
      
      if(totalWeight > 0) {
        for(let p=0; p<12; p++) avgChroma[p] /= totalWeight;
      }
      
      const minor3rd = avgChroma[this.toPc(root + 3)] || 0;
      const major3rd = avgChroma[this.toPc(root + 4)] || 0;
      let isMinor;
      if(major3rd > minor3rd * 1.3) isMinor = false;
      else if(minor3rd > major3rd * 1.3) isMinor = true;
      else isMinor = minor3rd >= major3rd * 0.85;
      
      const label = this.nameSharp(root) + (isMinor ? 'm' : '');
      
      timeline.push({
        t: startTime,
        label: label,
        fi: startFrame,
        endFrame: endFrame,
        avgChroma: avgChroma,
        ornamentType: 'structural',
        words: []
      });
      
      i = endFrame;
    }
    
    return timeline;
  }

  // ===== ADD EXTENSIONS =====
  
  decorateQualities(timeline, extMode, decSens) {
    if(extMode === 'basic') return timeline;
    
    return timeline.map(ev => {
      const root = this.parseRoot(ev.label);
      if(root < 0) return ev;
      
      const avg = ev.avgChroma;
      let label = ev.label;
      
      const seventh = avg[this.toPc(root + 10)] || 0;
      const maj7 = avg[this.toPc(root + 11)] || 0;
      const ninth = avg[this.toPc(root + 2)] || 0;
      
      const threshold7 = 0.15 / decSens;
      const threshold9 = 0.12 / decSens;
      
      if(extMode === 'jazz' || extMode === 'pro') {
        if(seventh > threshold7 && seventh > maj7 * 1.2 && !/7/.test(label)) {
          label += '7';
        } else if(maj7 > threshold7 && maj7 > seventh * 1.2 && !/7/.test(label)) {
          label += 'maj7';
        }
        
        if(extMode === 'pro' && /7/.test(label) && ninth > threshold9) {
          label = label.replace('7', '9');
          label = label.replace('maj7', 'maj9');
        }
      }
      
      return {...ev, label};
    });
  }

  // ===== ADD INVERSIONS =====
  
  addInversions(timeline, bassPc, bassSens) {
    if(bassSens < 1.6) return timeline;
    
    return timeline.map(ev => {
      const root = this.parseRoot(ev.label);
      if(root < 0) return ev;
      
      const i0 = Math.max(0, ev.fi);
      const i1 = Math.min(bassPc.length-1, ev.endFrame || ev.fi+3);
      
      const bassVotes = new Array(12).fill(0);
      for(let i=i0; i<=i1; i++) {
        if(bassPc[i] >= 0) bassVotes[bassPc[i]]++;
      }
      
      const dominantBass = bassVotes.indexOf(Math.max(...bassVotes));
      if(dominantBass < 0 || dominantBass === root) return ev;
      
      const intervals = [0, 3, 4, 7, 10, 11];
      const bassInterval = this.toPc(dominantBass - root);
      
      if(intervals.includes(bassInterval)) {
        const bassNote = this.nameSharp(dominantBass);
        return {...ev, label: ev.label + '/' + bassNote};
      }
      
      return ev;
    });
  }

  // ===== VALIDATE CHORDS =====
  
  validateChords(timeline, key) {
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root+s));
    
    return timeline.filter(ev => {
      const root = this.parseRoot(ev.label);
      if(root < 0) return false;
      
      const isInKey = diatonic.includes(root);
      if(isInKey) return true;
      
      const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
      return chromaStrength >= 0.25;
    });
  }

  // ===== CLASSIFY ORNAMENTS =====
  
  classifyOrnaments(timeline, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const structuralThreshold = spb * 1.5;
    
    return timeline.map((ev, i) => {
      const nextEv = timeline[i+1];
      const duration = nextEv ? (nextEv.t - ev.t) : (spb * 2);
      
      let ornamentType = 'structural';
      if(duration < spb * 0.75) {
        ornamentType = 'passing';
      } else if(duration < structuralThreshold) {
        ornamentType = 'ornament';
      }
      
      return {...ev, ornamentType};
    });
  }

  // ===== QUANTIZE TO GRID =====
  
  quantizeToGrid(timeline, bpm, quantValue) {
    const spb = 60 / Math.max(60, bpm || 120);
    const gridSize = spb / quantValue;
    
    return timeline.map((ev, i) => {
      const quantized = Math.round(ev.t / gridSize) * gridSize;
      const nextEv = timeline[i+1];
      const duration = nextEv ? (nextEv.t - ev.t) : spb;
      const beats = Math.max(1, Math.round(duration / spb));
      
      return {...ev, t: quantized, beats};
    });
  }

  // ===== REMOVE REDUNDANT =====
  
  removeRedundant(timeline, bpm) {
    const spb = 60 / Math.max(60, bpm || 120);
    const barDuration = spb * 4;
    
    const out = [];
    let lastLabel = null;
    let lastBar = -1;
    
    for(const ev of timeline) {
      const currentBar = Math.floor(ev.t / barDuration);
      
      if(!lastLabel || ev.label !== lastLabel) {
        out.push(ev);
        lastLabel = ev.label;
        lastBar = currentBar;
        continue;
      }
      
      if(currentBar > lastBar) {
        out.push(ev);
        lastBar = currentBar;
      }
    }
    
    return out;
  }

  // ===== CALCULATE METRICS =====
  
  calculateMetrics(timeline, key) {
    const structural = timeline.filter(e => e.ornamentType === 'structural').length;
    const ornaments = timeline.filter(e => e.ornamentType !== 'structural').length;
    
    // Secondary dominants
    let secDom = 0;
    for(let i=0; i<timeline.length-1; i++) {
      if(timeline[i].label.includes('7') && !timeline[i].label.includes('maj7')) {
        const rootI = this.parseRoot(timeline[i].label);
        const rootNext = this.parseRoot(timeline[i+1].label);
        if(rootI >= 0 && rootNext >= 0) {
          const interval = this.toPc(rootNext - rootI);
          if(interval === 5 || interval === 7) secDom++;
        }
      }
    }
    
    // Modal borrowing
    const diatonic = (key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE).map(s => this.toPc(key.root+s));
    let modalBorrow = 0;
    for(const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if(r >= 0 && !diatonic.includes(r)) modalBorrow++;
    }
    
    return {
      structural,
      ornaments,
      secDom,
      modalBorrow,
      total: timeline.length
    };
  }

  // ===== MAIN ANALYSIS FUNCTION =====
  
  analyze(audioBuffer, config = {}) {
    const {
      extMode = 'jazz',
      decSens = 1.0,
      bassSens = 1.25,
      quantValue = 4
    } = config;
    
    console.log('🎵 ChordEngine: Starting analysis...');
    
    // 1. Prepare audio
    const mono = (audioBuffer.numberOfChannels === 1) 
      ? audioBuffer.getChannelData(0) 
      : this.mixStereo(audioBuffer);
    
    const sr0 = audioBuffer.sampleRate;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const duration = x.length / sr;
    
    console.log(`   Duration: ${duration.toFixed(1)}s, SR: ${sr}Hz`);
    
    // 2. Estimate tempo
    const bpm = this.estimateTempo(x, sr);
    console.log(`   BPM: ${bpm}`);
    
    // 3. Extract features
    console.log('   Extracting features...');
    const features = this.extractFeatures(x, sr, bpm);
    
    // 4. Detect start gate
    const gateFrame = this.detectStartGate(features.frameE, features.bassPc);
    const gateTime = gateFrame * (features.hop / features.sr);
    
    // 5. Estimate key
    const key = this.estimateKey(features.chroma);
    console.log(`   Key: ${this.nameSharp(key.root)}${key.minor ? 'm' : ''}`);
    
    // 6. Detect mode
    const mode = this.detectMode(features.chroma, key);
    console.log(`   Mode: ${mode}`);
    
    // 7. Build chords
    let timeline = this.buildChordsFromBass(
      features.bassPc,
      features.chroma,
      features.frameE,
      key,
      bpm,
      features.hop,
      features.sr
    );
    
    // Add tonic if empty
    if(timeline.length === 0 || (timeline.length < 3 && duration > 30)) {
      const tonicLabel = this.nameSharp(key.root) + (key.minor ? 'm' : '');
      timeline.unshift({
        t: 0,
        label: tonicLabel,
        fi: 0,
        endFrame: Math.min(10, features.chroma.length),
        avgChroma: features.chroma[0] || new Array(12).fill(0),
        ornamentType: 'structural',
        words: []
      });
    }
    
    // 8. Process timeline
    timeline = this.decorateQualities(timeline, extMode, decSens);
    timeline = this.addInversions(timeline, features.bassPc, bassSens);
    timeline = this.validateChords(timeline, key);
    timeline = this.classifyOrnaments(timeline, bpm);
    timeline = this.quantizeToGrid(timeline, bpm, quantValue);
    timeline = this.removeRedundant(timeline, bpm);
    
    // Sanitize labels
    timeline = timeline.map(ev => ({
      ...ev,
      label: this.sanitizeLabel(ev.label),
      words: ev.words || []
    }));
    
    // 9. Calculate metrics
    const metrics = this.calculateMetrics(timeline, key);
    
    console.log(`✅ Found ${timeline.length} chords (${metrics.structural} structural, ${metrics.ornaments} ornaments)`);
    
    return {
      bpm,
      duration,
      key,
      mode,
      timeline,
      metrics,
      gateTime,
      features: {
        hop: features.hop,
        sr: features.sr
      }
    };
  }

  // ===== HELPER: SANITIZE LABEL =====
  
  sanitizeLabel(lbl) {
    if(!lbl) return lbl;
    return lbl.replace(/[^A-Ga-g#bm79sus246()/\s+altdim]/g, '').trim();
  }
}

// Export to window
window.ChordEngine = ChordEngine;

console.log('✅ ChordEngine loaded - Full audio processing + chord detection');

})(window);
