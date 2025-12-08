/**
 * MajorMinorRefiner v5.0 - מחזיר רק M/m + confidence + זיכרון 5
 */
class MajorMinorRefiner {
  constructor() {
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.history = [];
  }
  analyze(chords, audioBuffer) {
    this.history = [];
    const results = [];
    const sr = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const result = this.analyzeChord(chord, channelData, sr);
      results.push(result);
      if (result.quality) { this.history.push(result.quality); if (this.history.length > 5) this.history.shift(); }
    }
    return results;
  }
  analyzeChord(chord, channelData, sr) {
    if (!chord?.label) return { quality: null, confidence: 0 };
    const rootPc = this.getRootPc(chord.label);
    if (rootPc < 0) return { quality: null, confidence: 0 };
    const time = chord.t || 0;
    const windowSize = Math.round(sr * 0.15);
    const startSample = Math.floor(time * sr);
    const endSample = Math.min(startSample + windowSize, channelData.length);
    if (endSample - startSample < 1000) return { quality: null, confidence: 0 };
    const segment = channelData.slice(startSample, endSample);
    const chroma = this.computeChroma(segment, sr);
    const m3 = chroma[(rootPc + 3) % 12];
    const M3 = chroma[(rootPc + 4) % 12];
    const fifth = chroma[(rootPc + 7) % 12];
    if (fifth < 0.05) return { quality: null, confidence: 0 };
    const ratio = (M3 + 0.001) / (m3 + 0.001);
    let quality, confidence;
    if (ratio > 1.3) { quality = 'major'; confidence = Math.min(0.95, 0.5 + (ratio - 1) * 0.2); }
    else if (ratio < 0.77) { quality = 'minor'; confidence = Math.min(0.95, 0.5 + (1/ratio - 1) * 0.2); }
    else { quality = null; confidence = 0; }
    const historyVote = this.getHistoryVote();
    if (historyVote && confidence < 0.6) { if (historyVote === quality) confidence += 0.1; }
    return { quality, confidence: Math.min(0.95, confidence), historyVote };
  }
  getHistoryVote() {
    if (this.history.length < 2) return null;
    const majCount = this.history.filter(q => q === 'major').length;
    const minCount = this.history.filter(q => q === 'minor').length;
    if (majCount > minCount + 1) return 'major';
    if (minCount > majCount + 1) return 'minor';
    return null;
  }
  getRootPc(label) {
    const match = label.match(/^([A-G])([#b])?/);
    if (!match) return -1;
    const note = match[1] + (match[2] || '');
    return this.NOTES.indexOf(note.replace('b', this.flatToSharp(note)));
  }
  flatToSharp(note) {
    const map = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'};
    return map[note] || note;
  }
  computeChroma(samples, sr) {
    const chroma = new Array(12).fill(0);
    const N = 4096;
    const padded = new Float32Array(N);
    for (let i = 0; i < Math.min(samples.length, N); i++) padded[i] = samples[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const re = new Float32Array(N), im = new Float32Array(N);
    re.set(padded);
    let j = 0;
    for (let i = 0; i < N; i++) { if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } let m = N >> 1; while (m >= 1 && j >= m) { j -= m; m >>= 1; } j += m; }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < len / 2; k++) {
          const u = re[i + k], v = im[i + k];
          const tr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
          const ti = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
          re[i + k] = u + tr; im[i + k] = v + ti;
          re[i + k + len / 2] = u - tr; im[i + k + len / 2] = v - ti;
          const nwr = wr * Math.cos(ang) - wi * Math.sin(ang);
          wi = wr * Math.sin(ang) + wi * Math.cos(ang); wr = nwr;
        }
      }
    }
    for (let b = 1; b < N / 2; b++) {
      const f = b * sr / N;
      if (f < 80 || f > 4000) continue;
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const midi = 12 * Math.log2(f / 440) + 69;
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
    const sum = chroma.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < 12; i++) chroma[i] /= sum;
    return chroma;
  }
}
window.MajorMinorRefiner = MajorMinorRefiner;
