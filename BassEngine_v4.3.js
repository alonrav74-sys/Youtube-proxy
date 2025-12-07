/**
 * BassEngine v4.3
 * זיהוי תווי בס מאודיו
 */
class BassEngine {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 44100;
    this.hopSize = options.hopSize || 512;
    this.fftSize = options.fftSize || 4096;
    this.bassRange = { min: 60, max: 250 }; // Hz
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  }

  analyze(audioBuffer, options = {}) {
    const channelData = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const results = [];
    
    const hopSamples = Math.round(sr * 0.1); // 100ms hops
    const windowSize = Math.round(sr * 0.2); // 200ms window
    
    for (let i = 0; i < channelData.length - windowSize; i += hopSamples) {
      const segment = channelData.slice(i, i + windowSize);
      const bassNote = this.detectBassInSegment(segment, sr);
      const time = i / sr;
      
      results.push({
        t: time,
        bassNote: bassNote?.note || null,
        bassPc: bassNote?.pc ?? -1,
        confidence: bassNote?.confidence || 0,
        frequency: bassNote?.freq || 0
      });
    }
    
    return results;
  }

  detectBassInSegment(samples, sr) {
    // Simple autocorrelation for bass detection
    const minPeriod = Math.floor(sr / this.bassRange.max);
    const maxPeriod = Math.floor(sr / this.bassRange.min);
    
    let bestCorr = 0;
    let bestPeriod = 0;
    
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let corr = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      const len = Math.min(samples.length - period, 1000);
      for (let i = 0; i < len; i++) {
        corr += samples[i] * samples[i + period];
        norm1 += samples[i] * samples[i];
        norm2 += samples[i + period] * samples[i + period];
      }
      
      const normCorr = corr / Math.sqrt(norm1 * norm2 + 1e-10);
      if (normCorr > bestCorr) {
        bestCorr = normCorr;
        bestPeriod = period;
      }
    }
    
    if (bestCorr < 0.3 || bestPeriod === 0) return null;
    
    const freq = sr / bestPeriod;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc = Math.round(midi) % 12;
    
    return {
      note: this.NOTES[pc],
      pc: pc,
      freq: freq,
      confidence: bestCorr
    };
  }

  getBassAtTime(results, time) {
    if (!results || results.length === 0) return null;
    
    let closest = results[0];
    let minDiff = Math.abs(results[0].t - time);
    
    for (const r of results) {
      const diff = Math.abs(r.t - time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }
    
    return closest;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
} else {
  window.BassEngine = BassEngine;
}

console.log('✅ BassEngine v4.3 loaded');
