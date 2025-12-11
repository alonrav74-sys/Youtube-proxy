/**
 * BassEngine v5.0 - מחזיר רק תו בס + confidence
 */
class BassEngine {
  constructor() {
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.bassRange = { min: 40, max: 250 };
  }
  analyze(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const results = [];
    const hopSamples = Math.round(sr * 0.1);
    const windowSize = Math.round(sr * 0.2);
    for (let i = 0; i < channelData.length - windowSize; i += hopSamples) {
      const segment = channelData.slice(i, i + windowSize);
      const bass = this.detectBass(segment, sr);
      results.push({ t: i / sr, bassNote: bass?.note || null, bassPc: bass?.pc ?? -1, confidence: bass?.confidence || 0 });
    }
    return results;
  }
  detectBass(samples, sr) {
    const minPeriod = Math.floor(sr / this.bassRange.max);
    const maxPeriod = Math.floor(sr / this.bassRange.min);
    let bestCorr = 0, bestPeriod = 0;
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let corr = 0, norm1 = 0, norm2 = 0;
      const len = Math.min(samples.length - period, 1000);
      for (let i = 0; i < len; i++) { corr += samples[i] * samples[i + period]; norm1 += samples[i] * samples[i]; norm2 += samples[i + period] * samples[i + period]; }
      const normCorr = corr / Math.sqrt(norm1 * norm2 + 1e-10);
      if (normCorr > bestCorr) { bestCorr = normCorr; bestPeriod = period; }
    }
    if (bestCorr < 0.25 || bestPeriod === 0) return null;
    const freq = sr / bestPeriod;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    return { note: this.NOTES[pc], pc, confidence: bestCorr };
  }

  /**
   * NEW: Refine bass in timeline - required by ChordEngineEnhanced v14.36
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const bassResults = this.analyze(audioBuffer);
    const sr = audioBuffer.sampleRate;
    const hopSamples = Math.round(sr * 0.1);
    
    const refinedTimeline = timeline.map((chord, i) => {
      const chordTime = chord.t || 0;
      const frameIndex = Math.floor(chordTime / (hopSamples / sr));
      const bassData = bassResults[frameIndex] || {};
      
      return {
        ...chord,
        bassDetected: bassData.bassNote || 'NO_BASS',
        bassConfidence: bassData.confidence || 0,
        bassFrequency: bassData.bassPc >= 0 ? bassData.bassPc : 0,
        changedByBass: false
      };
    });
    
    return refinedTimeline;
  }
}
window.BassEngine = BassEngine;
