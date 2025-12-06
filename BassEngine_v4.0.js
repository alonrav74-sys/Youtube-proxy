/**
 * BassEngine v4.0 - INDEPENDENT BASS ANALYZER
 * 
 * 🎯 NEW APPROACH:
 * - Independent bass detection (not tied to chord root)
 * - ONLY adds slash chords when bass is CLEARLY different
 * - Returns "NO_BASS" when bass is unclear
 * - Handles fade-ins/fade-outs by ignoring unclear bass
 * - Can play detected bass note for verification
 */

class BassEngine {
  constructor() {
    this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.audioContext = null;
  }

  /**
   * Main method: Analyze bass for entire timeline
   */
  async refineBassInTimeline(audioBuffer, timeline, key, options = {}) {
    const opts = {
      minBassConfidence: options.minBassConfidence || 0.65,      // How clear bass must be
      minBassStrength: options.minBassStrength || 0.20,          // Minimum amplitude
      stabilityFrames: options.stabilityFrames || 4,             // How stable bass must be
      allowBassChordChange: options.allowBassChordChange !== false,  // Can change chord based on bass
      debug: options.debug || false
    };

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;

    const refined = [];

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const nextChord = timeline[i + 1];
      
      const startTime = chord.t;
      const endTime = nextChord ? nextChord.t : duration;
      const chordDuration = endTime - startTime;

      // Skip very short chords
      if (chordDuration < 0.4) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          reason: 'too_short'
        });
        continue;
      }

      // Parse chord root
      const chordRoot = this.parseRoot(chord.label);
      if (chordRoot === null) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          reason: 'cannot_parse'
        });
        continue;
      }

      // Extract audio segment
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      const segment = channelData.slice(startSample, endSample);

      // Detect bass note
      const bassResult = this.detectBassNote(segment, sampleRate, opts);

      // No clear bass detected
      if (bassResult.note === null || bassResult.confidence < opts.minBassConfidence) {
        refined.push({
          ...chord,
          bassDetected: 'NO_BASS',
          bassConfidence: bassResult.confidence,
          reason: 'unclear_bass'
        });
        continue;
      }

      const detectedBass = bassResult.note;
      const bassNoteName = this.NOTES[detectedBass];

      // Bass matches chord root - no change needed
      if (detectedBass === chordRoot) {
        refined.push({
          ...chord,
          bassDetected: bassNoteName,
          bassConfidence: bassResult.confidence,
          reason: 'bass_matches_root'
        });
        continue;
      }

      // Bass is different from root
      const toPc = n => ((n % 12) + 12) % 12;
      
      // Check if bass is part of the chord
      const isMinor = /m(?!aj)/.test(chord.label);
      const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
      const chordPcs = intervals.map(iv => toPc(chordRoot + iv));
      const bassInChord = chordPcs.includes(detectedBass);

      let newLabel = chord.label;
      let reason = 'no_change';

      // Bass is in chord → Add slash chord (inversion)
      if (bassInChord) {
        const match = chord.label.match(/^([A-G][#b]?)/);
        const rootName = match ? match[1] : '';
        const suffix = chord.label.slice(rootName.length);
        
        newLabel = rootName + suffix + '/' + bassNoteName;
        reason = 'inversion';
      }
      // Bass NOT in chord → Change the chord entirely (if allowed)
      else if (opts.allowBassChordChange && bassResult.confidence > 0.75) {
        // Build new chord with bass as root
        const quality = isMinor ? 'm' : '';
        newLabel = bassNoteName + quality;
        reason = 'bass_override';
      }

      refined.push({
        ...chord,
        label: newLabel,
        bassDetected: bassNoteName,
        bassConfidence: bassResult.confidence,
        bassFrequency: bassResult.frequency,
        changedByBass: newLabel !== chord.label,
        reason
      });

      if (opts.debug && newLabel !== chord.label) {
        console.log(
          `🎸 ${chord.label} → ${newLabel} ` +
          `(bass: ${bassNoteName}, conf: ${(bassResult.confidence * 100).toFixed(0)}%, ` +
          `freq: ${bassResult.frequency.toFixed(1)} Hz, ` +
          `reason: ${reason})`
        );
      }
    }

    return refined;
  }

  /**
   * Detect bass note with high precision
   */
  detectBassNote(audioSegment, sampleRate, opts) {
    if (!audioSegment || audioSegment.length < 2048) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    const bassFreqMin = 40;   // E1
    const bassFreqMax = 250;  // B3

    // Split segment into frames
    const frameSize = 4096;
    const hopSize = 2048;
    const frames = [];

    for (let i = 0; i + frameSize <= audioSegment.length; i += hopSize) {
      frames.push(audioSegment.slice(i, i + frameSize));
    }

    if (frames.length < 3) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Detect bass in each frame
    const detections = frames.map(frame => this.detectBassInFrame(frame, sampleRate, bassFreqMin, bassFreqMax));

    // Filter out weak detections
    const strongDetections = detections.filter(d => 
      d.note !== null && 
      d.confidence > opts.minBassConfidence * 0.8 &&
      d.strength > opts.minBassStrength
    );

    if (strongDetections.length < opts.stabilityFrames) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    // Find most common bass note
    const noteCounts = {};
    for (const det of strongDetections) {
      noteCounts[det.note] = (noteCounts[det.note] || 0) + 1;
    }

    let mostCommonNote = null;
    let maxCount = 0;
    for (const note in noteCounts) {
      if (noteCounts[note] > maxCount) {
        maxCount = noteCounts[note];
        mostCommonNote = parseInt(note);
      }
    }

    // Calculate average confidence and frequency for this note
    const sameNoteDetections = strongDetections.filter(d => d.note === mostCommonNote);
    const avgConfidence = sameNoteDetections.reduce((sum, d) => sum + d.confidence, 0) / sameNoteDetections.length;
    const avgFrequency = sameNoteDetections.reduce((sum, d) => sum + d.frequency, 0) / sameNoteDetections.length;

    // Stability check: note must appear in at least X% of frames
    const stability = maxCount / frames.length;
    if (stability < 0.4) {
      return { note: null, confidence: 0, frequency: 0 };
    }

    return {
      note: mostCommonNote,
      confidence: avgConfidence * stability,
      frequency: avgFrequency
    };
  }

  /**
   * Detect bass in single frame using autocorrelation
   */
  detectBassInFrame(frame, sampleRate, fMin, fMax) {
    // Apply window
    const windowed = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frame.length - 1)));
      windowed[i] = frame[i] * window;
    }

    // Calculate energy
    let energy = 0;
    for (let i = 0; i < windowed.length; i++) {
      energy += windowed[i] * windowed[i];
    }
    energy = Math.sqrt(energy / windowed.length);

    // Too quiet → no bass
    if (energy < 0.01) {
      return { note: null, confidence: 0, frequency: 0, strength: energy };
    }

    // Autocorrelation
    const minLag = Math.floor(sampleRate / fMax);
    const maxLag = Math.floor(sampleRate / fMin);

    let bestLag = -1;
    let bestCorr = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < windowed.length - lag; i++) {
        corr += windowed[i] * windowed[i + lag];
      }
      
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag < 0) {
      return { note: null, confidence: 0, frequency: 0, strength: energy };
    }

    // Calculate frequency
    const frequency = sampleRate / bestLag;

    // Calculate confidence based on autocorrelation peak
    let autocorrMax = 0;
    for (let i = 0; i < windowed.length; i++) {
      autocorrMax += windowed[i] * windowed[i];
    }
    const confidence = Math.min(1.0, bestCorr / (autocorrMax + 1e-9));

    // Convert to MIDI note
    const midiNote = 69 + 12 * Math.log2(frequency / 440);
    const pitchClass = Math.round(midiNote) % 12;

    return {
      note: pitchClass,
      confidence: confidence,
      frequency: frequency,
      strength: energy
    };
  }

  /**
   * Parse chord root from label
   */
  parseRoot(label) {
    if (!label || typeof label !== 'string') return null;
    
    const match = label.match(/^([A-G][#b]?)/);
    if (!match) return null;

    let note = match[1];
    note = note.replace('b', '#')
               .replace('Db', 'C#')
               .replace('Eb', 'D#')
               .replace('Gb', 'F#')
               .replace('Ab', 'G#')
               .replace('Bb', 'A#');

    return this.NOTES.indexOf(note);
  }

  /**
   * Play detected bass note (for debugging)
   */
  playBassNote(frequency, duration = 0.5) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;
    
    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BassEngine;
}
