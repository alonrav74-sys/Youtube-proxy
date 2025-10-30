/**
 * ChordEngine Pro - Practical AI Enhancement
 * 🎯 Chromagram + Essentia.js + Ensemble Voting
 * 🔊 Noise filtering, guitar isolation, smart voting
 * 
 * @requires chord-engine.js (must be loaded first!)
 * @version 2.0.0
 * @author Alon
 */

class ChordEnginePro extends ChordEngine {
  constructor() {
    super();
    
    this.models = {
      essentia: null,
      initialized: false
    };
    
    this.MODE = {
      FAST: 'fast',           // Chromagram only
      BALANCED: 'balanced',   // Chromagram + Essentia
      ACCURATE: 'accurate'    // All + advanced filtering
    };
    
    this.currentMode = this.MODE.BALANCED;
    
    this.stats = {
      chromagram: { used: 0, avgConfidence: 0, wins: 0 },
      essentia: { used: 0, avgConfidence: 0, wins: 0 },
      ensemble: { totalVotes: 0, agreements: 0 }
    };
  }
  
  /**
   * 🎛️ Initialize Essentia.js (lazy loading)
   */
  async initAIModels() {
    if (this.models.initialized) return;
    
    console.log('🔄 Loading Essentia.js...');
    
    try {
      await this.loadEssentia();
      this.models.initialized = true;
      console.log('✅ Essentia.js loaded successfully');
    } catch (err) {
      console.warn('⚠️ Essentia.js not available, using chromagram only:', err);
      this.currentMode = this.MODE.FAST;
    }
  }
  
  async loadEssentia() {
    // Check if already loaded
    if (typeof Essentia !== 'undefined') {
      const EssentiaWASM = window.EssentiaWASM;
      const essentiaWasm = new EssentiaWASM();
      
      await new Promise((resolve) => {
        if (essentiaWasm.ready) {
          resolve();
        } else {
          const checkReady = setInterval(() => {
            if (essentiaWasm.ready) {
              clearInterval(checkReady);
              resolve();
            }
          }, 100);
        }
      });
      
      this.models.essentia = new Essentia(essentiaWasm);
      return;
    }
    
    // Load from CDN
    console.log('📦 Loading Essentia from CDN...');
    
    await this.loadScript('https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js');
    await this.loadScript('https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (typeof Essentia === 'undefined') {
      throw new Error('Essentia failed to load');
    }
    
    const EssentiaWASM = window.EssentiaWASM;
    const essentiaWasm = new EssentiaWASM();
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (essentiaWasm.ready) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    
    this.models.essentia = new Essentia(essentiaWasm);
  }
  
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  /**
   * 🔊 Audio preprocessing: noise filtering + guitar isolation
   */
  preprocessAudio(audioBuffer, options = {}) {
    const applyFiltering = options.filtering !== false;
    
    if (!applyFiltering || this.currentMode === this.MODE.FAST) {
      return {
        x: this.mixStereo(audioBuffer),
        sr: audioBuffer.sampleRate
      };
    }
    
    console.log('🔊 Preprocessing: noise reduction + guitar isolation...');
    
    const x = this.mixStereo(audioBuffer);
    const sr = audioBuffer.sampleRate;
    
    // 1. High-pass filter (remove < 80Hz)
    const filtered = this.highPassFilter(x, sr, 80);
    
    // 2. Guitar bandpass (200Hz - 5kHz)
    const guitarBand = this.bandpassFilter(filtered, sr, 200, 5000);
    
    // 3. Noise gate
    const gated = this.noiseGate(guitarBand, 0.015);
    
    // 4. Soft compression
    const compressed = this.compress(gated, 2.5, 0.7);
    
    return { x: compressed, sr };
  }
  
  highPassFilter(x, sr, cutoff) {
    const RC = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / sr;
    const alpha = RC / (RC + dt);
    
    const y = new Float32Array(x.length);
    y[0] = x[0];
    
    for (let i = 1; i < x.length; i++) {
      y[i] = alpha * (y[i-1] + x[i] - x[i-1]);
    }
    
    return y;
  }
  
  bandpassFilter(x, sr, lowCut, highCut) {
    const lowPassed = this.lowPassFilter(x, sr, highCut);
    return this.highPassFilter(lowPassed, sr, lowCut);
  }
  
  lowPassFilter(x, sr, cutoff) {
    const RC = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / sr;
    const alpha = dt / (RC + dt);
    
    const y = new Float32Array(x.length);
    y[0] = x[0];
    
    for (let i = 1; i < x.length; i++) {
      y[i] = y[i-1] + alpha * (x[i] - y[i-1]);
    }
    
    return y;
  }
  
  noiseGate(x, threshold) {
    const rms = Math.sqrt(x.reduce((sum, val) => sum + val*val, 0) / x.length);
    const gateThreshold = rms * threshold;
    
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      y[i] = Math.abs(x[i]) > gateThreshold ? x[i] : x[i] * 0.05;
    }
    
    return y;
  }
  
  compress(x, ratio, threshold) {
    const y = new Float32Array(x.length);
    
    for (let i = 0; i < x.length; i++) {
      const abs = Math.abs(x[i]);
      if (abs > threshold) {
        const excess = abs - threshold;
        const compressed = threshold + (excess / ratio);
        y[i] = Math.sign(x[i]) * compressed;
      } else {
        y[i] = x[i];
      }
    }
    
    return y;
  }
  
  /**
   * 🎵 Detect with Essentia.js
   */
  detectWithEssentia(audioData, key, bpm) {
    if (!this.models.essentia) return null;
    
    try {
      const signal = this.models.essentia.arrayToVector(audioData.x);
      
      // Key validation
      const keyResult = this.models.essentia.KeyExtractor(
        signal, true, 4096, 4096, 12, 25, 3500, 60, 'bgate', 16000, 0.0001, 440, 'cosine', 'hann'
      );
      
      // HPCP - Harmonic Pitch Class Profile
      const hpcp = this.models.essentia.HPCP(
        signal, true, 40, 12, 'A', 5000, true, 'squared', 440, 100, 'hann', 0, 500, 4096
      );
      
      // Convert HPCP to timeline
      const timeline = this.createTimelineFromHPCP(hpcp, audioData, key, bpm);
      
      return {
        timeline: timeline,
        keyConfidence: keyResult.strength,
        detectedKey: this.parseNoteName(keyResult.key)
      };
      
    } catch (err) {
      console.warn('⚠️ Essentia detection failed:', err);
      return null;
    }
  }
  
  createTimelineFromHPCP(hpcp, audioData, key, bpm) {
    const hopSize = Math.floor(0.1 * audioData.sr);
    const numFrames = Math.floor(audioData.x.length / hopSize);
    
    const timeline = [];
    const chromaArray = Array.from(hpcp);
    
    const spb = 60 / Math.max(60, bpm || 120);
    const framesPerBeat = Math.max(1, Math.floor(spb / (hopSize / audioData.sr)));
    
    for (let i = 0; i < numFrames; i += framesPerBeat) {
      const t = i * (hopSize / audioData.sr);
      
      const maxIdx = chromaArray.indexOf(Math.max(...chromaArray));
      
      const thirdMajor = chromaArray[(maxIdx + 4) % 12];
      const thirdMinor = chromaArray[(maxIdx + 3) % 12];
      const fifth = chromaArray[(maxIdx + 7) % 12];
      
      const isMinor = thirdMinor > thirdMajor * 1.1;
      const confidence = Math.max(...chromaArray) * 100;
      
      if (fifth < 0.08 || Math.max(thirdMajor, thirdMinor) < 0.08) {
        continue;
      }
      
      timeline.push({
        t: t,
        label: this.nameSharp(maxIdx) + (isMinor ? 'm' : ''),
        confidence: confidence,
        source: 'essentia'
      });
    }
    
    return timeline;
  }
  
  parseNoteName(noteName) {
    const noteMap = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    
    const note = noteName.split(' ')[0];
    return noteMap[note] || 0;
  }
  
  /**
   * 🎯 Main detection - Ensemble method
   */
  async detect(audioBuffer, options = {}) {
    const mode = options.mode || this.currentMode;
    const bpm = options.bpm || await this.estimateBPM(audioBuffer);
    const harmonyMode = options.harmonyMode || 'pro';
    
    console.log(`🎼 ChordEngine Pro: ${mode} mode`);
    console.log(`🥁 BPM: ${bpm}`);
    
    // Initialize Essentia if needed
    if (mode !== this.MODE.FAST && !this.models.initialized) {
      await this.initAIModels();
    }
    
    const startTime = Date.now();
    
    // 1️⃣ Preprocessing
    const cleanAudio = this.preprocessAudio(audioBuffer, {
      filtering: mode === this.MODE.ACCURATE
    });
    
    // 2️⃣ Feature extraction
    const feats = this.extractFeatures(cleanAudio, bpm);
    
    // 3️⃣ Key detection
    const key = this.estimateKey(feats.chroma);
    console.log(`🎹 Key: ${this.nameSharp(key.root)} ${key.minor ? 'minor' : 'major'} (confidence: ${(key.confidence * 100).toFixed(0)}%)`);
    
    // 4️⃣ Chord detection
    let finalChords;
    
    if (mode === this.MODE.FAST) {
      // Chromagram only
      console.log('⚡ Fast mode: Chromagram only');
      finalChords = this.buildChordsFromBass(feats, key, bpm);
      this.stats.chromagram.used++;
      this.stats.chromagram.wins++;
      
    } else {
      // Ensemble: Chromagram + Essentia
      console.log('🎯 Running ensemble detection...');
      
      const chromaChords = this.buildChordsFromBass(feats, key, bpm);
      this.stats.chromagram.used++;
      
      const essentiaResult = this.detectWithEssentia(cleanAudio, key, bpm);
      
      if (essentiaResult && essentiaResult.timeline.length > 0) {
        this.stats.essentia.used++;
        console.log(`📊 Chromagram: ${chromaChords.length} chords`);
        console.log(`📊 Essentia: ${essentiaResult.timeline.length} chords`);
        
        // Voting
        finalChords = this.ensembleVote(
          chromaChords,
          essentiaResult.timeline,
          key,
          feats,
          bpm
        );
      } else {
        console.log('⚠️ Essentia failed, using Chromagram only');
        finalChords = chromaChords;
        this.stats.chromagram.wins++;
      }
    }
    
    // 5️⃣ Decoration
    const decorated = this.decorateQualitiesBassFirst(finalChords, feats, key, harmonyMode, 1.0);
    
    // 6️⃣ Validation
    const validated = this.validateChords(decorated, key, feats);
    
    // 7️⃣ Classification
    const classified = this.classifyOrnamentsByDuration(validated, bpm);
    
    // 8️⃣ Quantize
    const quantized = this.quantizeToGrid(classified, bpm, 4);
    
    // 9️⃣ Remove redundancy
    const final = this.removeRedundantChords(quantized, bpm);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Detection complete in ${elapsed}s: ${final.length} chords`);
    
    // Calculate average confidence
    const avgConfidence = final.reduce((sum, c) => sum + (c.confidence || 50), 0) / final.length;
    
    return {
      chords: final,
      key: key,
      bpm: bpm,
      mode: this.detectMode(feats, key),
      stats: {
        ...this.stats,
        avgConfidence: avgConfidence.toFixed(1),
        processingTime: elapsed
      }
    };
  }
  
  async estimateBPM(audioBuffer) {
    const x = this.mixStereo(audioBuffer);
    const sr = audioBuffer.sampleRate;
    return this.estimateTempo(x, sr);
  }
  
  /**
   * 🗳️ Smart voting between methods
   */
  ensembleVote(chromaChords, essentiaChords, key, feats, bpm) {
    console.log('🗳️ Ensemble voting...');
    
    const allowed = this.buildAllowedChords(key);
    const spb = 60 / Math.max(60, bpm || 120);
    
    // Build unified timeline
    const allTimes = new Set();
    chromaChords.forEach(c => allTimes.add(Math.round(c.t * 10) / 10));
    essentiaChords.forEach(c => allTimes.add(Math.round(c.t * 10) / 10));
    
    const timeline = [];
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
    
    for (const t of sortedTimes) {
      const votes = {};
      
      // Chromagram vote
      const chromaChord = chromaChords.find(c => Math.abs(c.t - t) < spb * 0.25);
      if (chromaChord) {
        const label = this.normalizeLabel(chromaChord.label);
        votes[label] = votes[label] || { count: 0, confidence: 0, sources: [] };
        votes[label].count++;
        votes[label].confidence += (chromaChord.confidence || 70);
        votes[label].sources.push('chromagram');
      }
      
      // Essentia vote
      const essentiaChord = essentiaChords.find(c => Math.abs(c.t - t) < spb * 0.25);
      if (essentiaChord) {
        const label = this.normalizeLabel(essentiaChord.label);
        votes[label] = votes[label] || { count: 0, confidence: 0, sources: [] };
        votes[label].count++;
        votes[label].confidence += (essentiaChord.confidence || 70);
        votes[label].sources.push('essentia');
      }
      
      if (Object.keys(votes).length === 0) continue;
      
      // Select winner
      const winner = this.selectWinnerVote(votes, allowed, t);
      
      if (winner) {
        this.stats.ensemble.totalVotes++;
        if (winner.sources.length > 1) {
          this.stats.ensemble.agreements++;
        }
        
        timeline.push({
          t: t,
          label: winner.label,
          confidence: winner.confidence,
          votedBy: winner.sources,
          fi: Math.floor(t / (feats.hop / feats.sr)),
          words: []
        });
      }
    }
    
    console.log(`✅ Ensemble: ${timeline.length} chords (${this.stats.ensemble.agreements}/${this.stats.ensemble.totalVotes} agreements)`);
    
    return timeline;
  }
  
  selectWinnerVote(votes, allowed, time) {
    // Sort by: harmonic context > vote count > confidence
    const candidates = Object.entries(votes).map(([label, data]) => {
      const root = this.parseRoot(label);
      
      let harmonicBonus = 0;
      if (allowed.diatonic.includes(root)) {
        harmonicBonus = 40;
      } else if (allowed.borrowed.includes(root)) {
        harmonicBonus = 20;
      } else if (allowed.secondaryDominants.includes(root) && label.includes('7')) {
        harmonicBonus = 10;
      }
      
      const avgConf = data.confidence / data.count;
      const score = (data.count * 60) + avgConf + harmonicBonus;
      
      return {
        label: label,
        score: score,
        confidence: avgConf,
        sources: data.sources
      };
    });
    
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length === 0) return null;
    
    const winner = candidates[0];
    
    // Update stats
    if (winner.sources.includes('chromagram')) this.stats.chromagram.wins++;
    if (winner.sources.includes('essentia')) this.stats.essentia.wins++;
    
    return winner;
  }
  
  normalizeLabel(label) {
    return label
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b')
      .toUpperCase()
      .trim();
  }
  
  /**
   * 🎛️ Public API
   */
  setMode(mode) {
    if (!Object.values(this.MODE).includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    this.currentMode = mode;
    console.log(`🎛️ Mode: ${mode}`);
  }
  
  getStats() {
    return {
      ...this.stats,
      modelsLoaded: {
        essentia: !!this.models.essentia
      },
      currentMode: this.currentMode,
      agreementRate: this.stats.ensemble.totalVotes > 0 ?
        ((this.stats.ensemble.agreements / this.stats.ensemble.totalVotes) * 100).toFixed(1) + '%' :
        'N/A'
    };
  }
}

// Export
if (typeof window !== 'undefined') {
  window.ChordEnginePro = ChordEnginePro;
  console.log('✅ ChordEngine Pro loaded');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEnginePro;
}
