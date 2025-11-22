/**
 * ChordEnhancer.js - Advanced Chord Processing & Analysis
 * 
 * התפקידים:
 * ✅ Post-processing (Extensions, Inversions, Qualities)
 * ✅ Modal & Harmonic Analysis
 * ✅ Ornament Classification
 * ✅ Theory Enrichment & Predictions
 * ✅ Main orchestration (detect function)
 * 
 * תלוי ב: ChordDetectionCore.js
 */

class ChordEnhancer {
  constructor(core) {
    this.core = core || new ChordDetectionCore();
  }

  // ============================================================================
  // MAIN DETECTION FUNCTION
  // ============================================================================

  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      validationMultiplier: options.validationMultiplier || 1.0,
      bassSensitivity: options.bassSensitivity || 1.0,
      extensionSensitivity: options.extensionSensitivity || 1.0,
      filterWeakChords: options.filterWeakChords !== false,
      channelData: options.channelData || null,
      sampleRate: options.sampleRate || null,
      tonicRerunThreshold: options.tonicRerunThreshold !== undefined ? options.tonicRerunThreshold : 75,
      progressCallback: typeof options.progressCallback === 'function' ? options.progressCallback : null
    };

    const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const timings = {};
    const startTotal = now();

    const tAudio = now();
    const audioData = this.core.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    timings.audioProcessing = now() - tAudio;

    if (opts.progressCallback) opts.progressCallback({ stage: 'extracting', progress: 0.1 });

    const tFeat = now();
    const feats = this.core.extractFeatures(audioData);
    timings.featureExtraction = now() - tFeat;

    if (opts.progressCallback) opts.progressCallback({ stage: 'detecting_key', progress: 0.3 });

    const tKey = now();
    let key = this.core.detectKeyEnhanced(feats);
    timings.keyDetection = now() - tKey;

    if (opts.progressCallback) {
      opts.progressCallback({
        stage: 'key_detected',
        progress: 0.4,
        key: this.core.getNoteName(key.root, key) + (key.minor ? 'm' : ''),
        confidence: key.confidence
      });
    }

    const useFullHMM = key.confidence > 0.80;

    if (opts.progressCallback) {
      opts.progressCallback({
        stage: useFullHMM ? 'analyzing_full' : 'analyzing_simple',
        progress: 0.5
      });
    }

    const tHmm = now();
    let timeline = this.core.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, useFullHMM);
    timings.hmmTracking = now() - tHmm;

    if (opts.progressCallback) opts.progressCallback({ stage: 'refining', progress: 0.7 });

    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    const validatedKey = this.validateKeyFromChords(timeline, key, feats);

    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      const tRe = now();
      timeline = this.core.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timings.rerunKeyValidation = now() - tRe;
    }

    if (opts.progressCallback) opts.progressCallback({ stage: 'decorating', progress: 0.8 });

    const tPost = now();
    timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);
    timings.postProcessing = now() - tPost;

    const tonic = this.detectTonicMusically(timeline, key, audioData.duration);

    if (tonic.root !== key.root && tonic.confidence >= opts.tonicRerunThreshold) {
      const tRe2 = now();
      key = { root: tonic.root, minor: key.minor, confidence: Math.max(key.confidence, tonic.confidence / 100) };
      timeline = this.core.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
      timeline = this.applyPostProcessing(timeline, key, feats, audioData.bpm, opts);
      timings.rerunTonic = now() - tRe2;
    }

    timings.total = now() - startTotal;

    if (opts.progressCallback) opts.progressCallback({ stage: 'complete', progress: 1.0 });

    const modulations = this.quickModulationCheck(timeline, key);

    timeline = timeline.filter(ev => ev && ev.label && typeof ev.label === 'string' && ev.label.trim());

    const stats = {
      totalChords: timeline.length,
      structural: timeline.filter(e => e.ornamentType === 'structural').length,
      ornaments: timeline.filter(e => e.ornamentType && e.ornamentType !== 'structural').length,
      secondaryDominants: timeline.filter(e => e.modalContext === 'secondary_dominant').length,
      modalBorrowings: timeline.filter(e => e.modalContext && e.modalContext !== 'secondary_dominant').length,
      inversions: timeline.filter(e => e.label.includes('/')).length,
      extensions: timeline.filter(e => /[679]|11|13|sus|dim|aug/.test(e.label)).length,
      modulations,
      predictionAccuracy: this.computePredictionAccuracy(timeline)
    };

    return {
      chords: timeline,
      key,
      tonic,
      bpm: audioData.bpm,
      duration: audioData.duration,
      stats,
      mode: key.minor ? 'Natural Minor (Aeolian)' : 'Major (Ionian)',
      timings
    };
  }

  // ============================================================================
  // POST-PROCESSING PIPELINE
  // ============================================================================

  applyPostProcessing(timeline, key, feats, bpm, opts) {
    timeline = this.enforceEarlyDiatonic(timeline, key, feats, bpm);
    timeline = this.decorateQualitiesUltimate(timeline, feats, key, opts.harmonyMode, opts.extensionMultiplier, opts.extensionSensitivity);
    timeline = this.adjustMinorMajors(timeline, feats, key);
    timeline = this.addInversionsUltimate(timeline, feats, key, opts.bassMultiplier);
    timeline = this.validateAndRefine(timeline, key, feats, opts.validationMultiplier);
    timeline = this.classifyOrnaments(timeline, bpm, feats);
    timeline = this.analyzeModalContext(timeline, key);
    timeline = this.enrichTimelineWithTheory(timeline, feats, key);
    return timeline;
  }

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.50 * spb);
    const energyMedian = this.core.percentile(feats.frameE, 50);

    const filtered = [];

    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = feats.frameE[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.85;

      const r = this.core.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.core.inKey(r, key.root, key.minor);

      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic)) continue;
      
      if (dur < minDur * 0.6 && isWeak) continue;

      filtered.push(a);
    }

    const snapped = [];
    for (const ev of filtered) {
      const raw = ev.t;
      const grid = Math.round(raw / spb) * spb;
      const snapTol = 0.35 * spb;

      const t = (Math.abs(grid - raw) <= snapTol) ? grid : raw;

      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: Math.max(0, t), label: ev.label, fi: ev.fi });
      }
    }

    return snapped;
  }

  enforceEarlyDiatonic(timeline, key, feats, bpm) {
    if (!timeline || !timeline.length) return timeline;

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const earlyWindow = Math.max(15.0, 6 * spb);
    
    const toPc = n => ((n % 12) + 12) % 12;

    const scale = key.minor ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));
    const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];

    const getQuality = pc => {
      for (let i = 0; i < diatonicPcs.length; i++) {
        if (diatonicPcs[i] === toPc(pc)) return qualities[i];
      }
      return '';
    };

    const snapToDiatonic = pc => {
      let best = diatonicPcs[0];
      let bestD = 99;
      for (const d of diatonicPcs) {
        const dist = Math.min((pc - d + 12) % 12, (d - pc + 12) % 12);
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
      return best;
    };

    const out = [];

    for (const ev of timeline) {
      let label = ev.label;
      if (ev.t <= earlyWindow) {
        const r = this.core.parseRoot(label);
        const inKey = r >= 0 && this.core.inKey(r, key.root, key.minor);
        if (!inKey) {
          const bp = feats.bassPc[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          
          if (ev.t < Math.min(3.0, 2.0 * spb)) {
            newRoot = key.root;
          }
          
          const q = getQuality(newRoot);
          label = this.core.NOTES_SHARP[toPc(newRoot)] + q;
        } else {
          const q = getQuality(r);
          label = this.core.NOTES_SHARP[toPc(r)] + q;
        }
      }
      out.push({ ...ev, label });
    }

    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul, extensionSensitivity = 1.0) {
    if (mode === 'basic') return timeline.map(e => ({ ...e }));

    const mul = extensionMul / (extensionSensitivity || 1.0);
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      const root = this.core.parseRoot(ev.label);
      if (root < 0) {
        out.push(ev);
        continue;
      }

      const isMinorTriad = /m(?!aj)/.test(ev.label);
      let base = ev.label.replace(/(m|sus2|sus4|dim|aug|7|maj7|add9|9|11|13|6|m7b5|alt|b9|#9|b5|#5).*$/, '');
      if (isMinorTriad) base += 'm';

      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);

      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) avg[p] += c[p];
      }

      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) avg[p] /= len;

      const s = d => avg[toPc(root + d)] || 0;

      const sR = s(0);
      const sM3 = s(4);
      const sm3 = s(3);
      const s5 = s(7);
      const s_b5 = s(6);
      const s_sharp5 = s(8);
      const s2 = s(2);
      const s4 = s(5);
      const s_b7 = s(10);
      const s7 = s(11);
      const s6 = s(9);

      let label = base;

      const thirdStrong = isMinorTriad ? sm3 > 0.13 * mul : sM3 > 0.13 * mul;

      const sus2Strong = s2 > 0.22 / mul && s2 >= s4 * 0.9 && s5 > 0.10;
      const sus4Strong = s4 > 0.22 / mul && s4 >= s2 * 0.9 && s5 > 0.10;

      if (!isMinorTriad && !thirdStrong) {
        if (sus4Strong) label = base.replace(/m$/, '') + 'sus4';
        else if (sus2Strong) label = base.replace(/m$/, '') + 'sus2';
      }

      const sixthStrong = s6 > 0.18 / mul && s6 > s_b7 * 1.2;
      if (sixthStrong && !/sus/.test(label) && (isMinorTriad ? sm3 : sM3) > 0.12 / mul) {
        label = base + '6';
      }

      const degree = this.degreeOfChord(label, key);
      const domLike = degree === 5;
      const majContext = !/m$/.test(label) && !/sus/.test(label);
      const b7Strong = s_b7 > 0.16 / mul && sR > 0.10 / mul;
      const maj7Strong = majContext && s7 > 0.20 / mul && s7 > s_b7 * 1.2;

      if (!/6$/.test(label)) {
        if (maj7Strong) {
          label = base.replace(/m$/, '') + 'maj7';
        } else if (!/sus/.test(label) && (domLike ? s_b7 > 0.15 / mul : b7Strong)) {
          if (!/7$|maj7$/.test(label)) label += '7';
        }
      }

      const dimTriad = (isMinorTriad && s_b5 > 0.26 / mul && s5 < 0.12 * mul && sm3 > 0.14 / mul) ||
                       (!isMinorTriad && s_b5 > 0.30 / mul && s5 < 0.10 * mul && sM3 < 0.08 * mul);

      if (dimTriad) {
        if (isMinorTriad && s_b7 > 0.18 / mul) {
          label = base.replace(/m$/, 'm7b5');
        } else {
          label = base.replace(/m$/, '') + 'dim';
        }
      }

      const augTriad = !isMinorTriad && s_sharp5 > 0.24 / mul && s5 < 0.10 * mul && sM3 > 0.12 / mul;

      if (augTriad) {
        label = base.replace(/m$/, '') + 'aug';
      }

      if (mode === 'jazz' || mode === 'pro') {
        const has7 = /7$|maj7$/.test(label);
        const nineStrong = s2 > 0.25 / mul && sR > 0.10 / mul;

        if (has7 && nineStrong) {
          label = label.replace(/7$/, '9');
        } else if (!/sus/.test(label) && nineStrong && (isMinorTriad ? sm3 : sM3) > 0.10 / mul && !/maj7|7|9|add9/.test(label)) {
          label += 'add9';
        }
      }

      out.push({ ...ev, label });
    }

    return out;
  }

  adjustMinorMajors(timeline, feats, key) {
    if (!key.minor) return timeline;

    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      let label = ev.label;
      const r = this.core.parseRoot(label);

      if (r < 0 || /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label) || !/(^[A-G](?:#|b)?)(m)(?!aj)/.test(label)) {
        out.push(ev);
        continue;
      }

      const rel = toPc(r - key.root);
      if (!(rel === this.core.MINOR_SCALE[2] || rel === this.core.MINOR_SCALE[4] || rel === this.core.MINOR_SCALE[6])) {
        out.push(ev);
        continue;
      }

      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);

      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) avg[p] += c[p];
      }

      const len = i1 - i0 + 1 || 1;
      for (let p = 0; p < 12; p++) avg[p] /= len;

      const M3 = avg[toPc(r + 4)] || 0;
      const m3 = avg[toPc(r + 3)] || 0;

      if (M3 > m3 * 1.25 && M3 > 0.08) {
        label = label.replace(/m(?!aj)/, '');
      }

      out.push({ ...ev, label });
    }

    return out;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      const r = this.core.parseRoot(ev.label);
      if (r < 0) {
        out.push(ev);
        continue;
      }

      const isMinor = /m(?!aj)/.test(ev.label);
      const isSus2 = /sus2/.test(ev.label);
      const isSus4 = /sus4/.test(ev.label);
      const has7 = /7/.test(ev.label);
      const hasMaj7 = /maj7/.test(ev.label);
      const has9 = /9|add9/.test(ev.label);
      const has6 = /6/.test(ev.label);

      let tones = isSus2 ? [0,2,7] : isSus4 ? [0,5,7] : isMinor ? [0,3,7] : [0,4,7];

      if (has7 && !hasMaj7) tones.push(10);
      if (hasMaj7) tones.push(11);
      if (has9) tones.push(2);
      if (has6) tones.push(9);

      const bass = feats.bassPc[ev.fi] ?? -1;
      if (bass < 0 || bass === r) {
        out.push(ev);
        continue;
      }

      const rel = toPc(bass - r);
      const inChord = tones.includes(rel);

      if (inChord) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        const bassStrength = c[bass] || 0;
        const rootStrength = c[r] || 0;
        const bassStrong = bassStrength > rootStrength * 0.7;

        let stable = 0;
        for (let j = Math.max(0, ev.fi - 2); j <= Math.min(feats.bassPc.length - 1, ev.fi + 2); j++) {
          if (feats.bassPc[j] === bass) stable++;
        }

        if (bassStrength > 0.15 / Math.max(1, bassMultiplier) && stable >= 3 && bassStrong) {
          const m = ev.label.match(/^([A-G](?:#|b)?)/);
          const rootName = m ? m[1] : '';
          const suffix = ev.label.slice(rootName.length);
          const slash = this.core.getNoteName(bass, key);
          out.push({ ...ev, label: rootName + suffix + '/' + slash });
          continue;
        }
      }

      out.push(ev);
    }

    return out;
  }

  validateAndRefine(timeline, key, feats) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      const r = this.core.parseRoot(ev.label);
      if (r < 0) {
        out.push(ev);
        continue;
      }

      const c = feats.chroma[ev.fi] || new Float32Array(12);
      const sR = c[toPc(r)] || 0;
      const s5 = c[toPc(r + 7)] || 0;
      const sM3 = c[toPc(r + 4)] || 0;
      const sm3 = c[toPc(r + 3)] || 0;

      if (sR > 0.15 && s5 > 0.15 && sM3 < 0.08 && sm3 < 0.08 && /m(?!aj)/.test(ev.label)) {
        const m = ev.label.match(/^([A-G](?:#|b)?)/);
        const base = m ? m[1] : '';
        out.push({ ...ev, label: base });
        continue;
      }

      out.push(ev);
    }

    return out;
  }

  // ============================================================================
  // ORNAMENT & MODAL ANALYSIS
  // ============================================================================

  classifyOrnaments(timeline, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const out = [];

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = i > 0 ? timeline[i - 1] : null;
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      const dur = next ? (next.t - ev.t) : spb;

      let ornamentType = 'structural';

      if (dur < 0.35 * spb && prev && next) {
        const rPrev = this.core.parseRoot(prev.label);
        const r = this.core.parseRoot(ev.label);
        const rNext = this.core.parseRoot(next.label);
        if (rPrev >= 0 && r >= 0 && rNext >= 0) {
          const d1 = Math.min((r - rPrev + 12) % 12, (rPrev - r + 12) % 12);
          const d2 = Math.min((rNext - r + 12) % 12, (r - rNext + 12) % 12);
          if (d1 <= 2 && d2 <= 2) {
            ornamentType = 'passing';
          }
        }
      }

      if (dur < 0.4 * spb && prev && next && prev.label === next.label && ornamentType === 'structural') {
        ornamentType = 'neighbor';
      }

      if (prev) {
        const bassCur = feats.bassPc[ev.fi] ?? -1;
        const bassPrev = feats.bassPc[prev.fi] ?? -1;
        if (bassCur >= 0 && bassPrev >= 0 && bassCur === bassPrev) {
          const rCur = this.core.parseRoot(ev.label);
          const rPrev = this.core.parseRoot(prev.label);
          if (rCur >= 0 && rPrev >= 0 && rCur !== rPrev) {
            ornamentType = 'pedal';
          }
        }
      }

      out.push({ ...ev, ornamentType });
    }

    return out;
  }

  analyzeModalContext(timeline, key) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const r = this.core.parseRoot(ev.label);
      if (r < 0) {
        out.push({ ...ev, modalContext: null });
        continue;
      }

      const rel = toPc(r - key.root);
      let modalContext = null;

      if (/7$/.test(ev.label) && !/maj7/.test(ev.label)) {
        const targetRoot = toPc(r + 7);
        const next = timeline[i + 1];
        if (next) {
          const nextRoot = this.core.parseRoot(next.label);
          if (nextRoot >= 0 && nextRoot === targetRoot && this.core.inKey(targetRoot, key.root, key.minor)) {
            modalContext = 'secondary_dominant';
          }
        }
      }

      if (!key.minor) {
        if (rel === 8) modalContext = modalContext || 'borrowed_bVI';
        if (rel === 10) modalContext = modalContext || 'borrowed_bVII';
        if (rel === 5 && /m/.test(ev.label)) modalContext = modalContext || 'borrowed_iv';
        if (rel === 3) modalContext = modalContext || 'borrowed_bIII';
      } else {
        if (rel === 5 && !/m/.test(ev.label)) modalContext = modalContext || 'borrowed_IV_major';
      }

      if (rel === 1 && !/m/.test(ev.label)) {
        modalContext = modalContext || 'neapolitan';
      }

      out.push({ ...ev, modalContext });
    }

    return out;
  }

  // ============================================================================
  // KEY & TONIC VALIDATION
  // ============================================================================

  validateKeyFromChords(timeline, currentKey, feats) {
    if (!timeline || timeline.length < 3) return currentKey;

    const toPc = n => ((n % 12) + 12) % 12;
    const chordRoots = [];
    for (const chord of timeline) {
      const root = this.core.parseRoot(chord.label);
      if (root >= 0) {
        const isMinor = /m(?!aj)/.test(chord.label);
        const isDim = /dim/.test(chord.label);
        chordRoots.push({ root, isMinor, isDim });
      }
    }
    if (!chordRoots.length) return currentKey;

    const candidates = [];

    for (let keyRoot = 0; keyRoot < 12; keyRoot++) {
      for (const keyMinor of [false, true]) {
        const scale = keyMinor ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;
        const qualities = keyMinor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];

        const diatonicChords = scale.map((deg, i) => ({
          root: toPc(keyRoot + deg),
          quality: qualities[i]
        }));

        let matchCount = 0;
        for (const sChord of chordRoots) {
          const found = diatonicChords.some(dc => {
            if (dc.root !== sChord.root) return false;
            if (sChord.isDim) return dc.quality === 'dim';
            if (sChord.isMinor) return dc.quality === 'm';
            return dc.quality === '';
          });
          if (found) matchCount++;
        }

        const ratio = matchCount / chordRoots.length;
        if (ratio >= 0.6) {
          let score = ratio * 100;

          const firstRoot = chordRoots[0].root;
          if (firstRoot === keyRoot) score += 20;

          const lastRoot = chordRoots[chordRoots.length - 1].root;
          if (lastRoot === keyRoot) score += 15;

          const harmScore = this.analyzeHarmonicProgressions(feats, keyRoot, keyMinor).score;
          score += harmScore;

          candidates.push({ root: keyRoot, minor: keyMinor, score });
        }
      }
    }

    if (!candidates.length) return currentKey;

    let best = candidates[0];
    for (const c of candidates) {
      if (c.score > best.score) best = c;
    }

    const current = candidates.find(c => c.root === currentKey.root && c.minor === currentKey.minor);
    const currentScore = current ? current.score : 0;

    if (best.minor !== currentKey.minor) return currentKey;

    if (!current || best.score > currentScore + 40) {
      const newConf = Math.min(0.99, Math.max(currentKey.confidence || 0.5, 0.6 + best.score / 200));
      return { root: best.root, minor: best.minor, confidence: newConf };
    }

    return currentKey;
  }

  detectTonicMusically(timeline, key, duration) {
    if (!timeline || timeline.length < 3) {
      return {
        root: key.root,
        label: this.core.getNoteName(key.root, key) + (key.minor ? 'm' : ''),
        confidence: 50
      };
    }

    const candidates = {};
    let totalDuration = 0;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const root = this.core.parseRoot(chord.label);
      if (root < 0) continue;

      const dur = this.getChordDuration(chord, timeline, duration);
      totalDuration += dur;

      if (!candidates[root]) {
        candidates[root] = { duration: 0, openingScore: 0, closingScore: 0, cadenceScore: 0 };
      }
      candidates[root].duration += dur;
    }

    let realStart = 0;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].t >= 1.5) {
        realStart = i;
        break;
      }
    }
    
    const opening = timeline.slice(realStart, Math.min(realStart + 3, timeline.length));
    
    for (let i = 0; i < opening.length; i++) {
      const root = this.core.parseRoot(opening[i].label);
      if (root >= 0 && candidates[root]) {
        const w = i === 0 ? 60 : (3 - i) * 8;
        candidates[root].openingScore += w;
      }
    }

    const closing = timeline.slice(Math.max(0, timeline.length - 3));
    for (let i = 0; i < closing.length; i++) {
      const root = this.core.parseRoot(closing[i].label);
      if (root >= 0 && candidates[root]) {
        candidates[root].closingScore += (i + 1) * 12;
      }
    }

    const toPc = n => ((n % 12) + 12) % 12;
    for (let i = 0; i < timeline.length - 1; i++) {
      const r1 = this.core.parseRoot(timeline[i].label);
      const r2 = this.core.parseRoot(timeline[i + 1].label);
      if (r1 < 0 || r2 < 0) continue;
      const interval = toPc(r2 - r1);
      if ((interval === 5 || interval === 7) && candidates[r2]) {
        const dur = this.getChordDuration(timeline[i + 1], timeline, duration);
        candidates[r2].cadenceScore += 3 * dur;
      }
    }

    let bestRoot = key.root;
    let bestScore = -Infinity;

    for (const rootStr in candidates) {
      const root = parseInt(rootStr, 10);
      const c = candidates[root];
      const durScore = (c.duration / (totalDuration || 1)) * 40;
      const score = durScore + c.openingScore + c.closingScore + c.cadenceScore;
      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
      }
    }

    const confidence = Math.max(30, Math.min(100, bestScore));
    return {
      root: bestRoot,
      label: this.core.NOTES_SHARP[((bestRoot % 12) + 12) % 12] + (key.minor ? 'm' : ''),
      confidence
    };
  }

  getChordDuration(chord, timeline, totalDuration) {
    const idx = timeline.indexOf(chord);
    if (idx < 0) return 0.5;
    const next = timeline[idx + 1];
    if (next) return Math.max(0.1, next.t - chord.t);
    return Math.max(0.5, totalDuration - chord.t);
  }

  analyzeHarmonicProgressions(feats, keyRoot, keyMinor) {
    const { bassPc, frameE } = feats;
    const threshold = this.core.percentile(frameE, 70);
    const toPc = n => ((n % 12) + 12) % 12;

    const bassTimeline = [];
    let current = -1;
    let start = 0;

    for (let i = 0; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        if (bp !== current) {
          if (current >= 0) {
            bassTimeline.push({ root: current, start, end: i });
          }
          current = bp;
          start = i;
        }
      }
    }
    if (current >= 0) {
      bassTimeline.push({ root: current, start, end: bassPc.length });
    }

    if (bassTimeline.length < 3) return { score: 0 };

    const scale = keyMinor ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;
    const I = keyRoot;
    const II = toPc(keyRoot + scale[1]);
    const III = toPc(keyRoot + scale[2]);
    const IV = toPc(keyRoot + scale[3]);
    const V = toPc(keyRoot + scale[4]);
    const VI = toPc(keyRoot + scale[5]);
    const VII = toPc(keyRoot + scale[6]);

    let score = 0;

    for (let i = 0; i < bassTimeline.length - 1; i++) {
      const a = bassTimeline[i].root;
      const b = bassTimeline[i + 1].root;

      if (a === V && b === I) score += 15;
      if (a === IV && b === I) score += 8;
      if (a === VII && b === I) score += 10;
      if (a === III && b === I) score += 5;

      if (i < bassTimeline.length - 2) {
        const c = bassTimeline[i + 2].root;
        if (a === II && b === V && c === I) score += 20;
        if (a === IV && b === V && c === I) score += 18;
        if (a === VI && b === V && c === I) score += 16;
      }
    }

    return { score };
  }

  // ============================================================================
  // THEORY ENRICHMENT & PREDICTIONS
  // ============================================================================

  enrichTimelineWithTheory(timeline, feats, key) {
    const enriched = [];
    const recent = [];
    const MEMORY = 5;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const analyzed = { ...chord };

      if (recent.length >= 2) {
        const prog = this.recognizeProgressionPattern(recent, key);
        if (prog) analyzed.recognizedProgression = prog.name;
      }

      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      if (next) {
        const preds = this.predictNextChord(recent.concat([analyzed]), key);
        if (preds && preds.length) {
          analyzed.predictions = preds;
          const nextRoot = this.core.parseRoot(next.label);
          if (nextRoot >= 0 && preds[0].root === nextRoot) {
            analyzed.predictionMatch = true;
            analyzed.predictionConfidence = preds[0].confidence;
          }
        }
      }

      enriched.push(analyzed);
      recent.push(analyzed);
      if (recent.length > MEMORY) recent.shift();
    }

    return enriched;
  }

  recognizeProgressionPattern(recentChords, key) {
    if (!recentChords || recentChords.length < 2) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;
    const degrees = recentChords.map(chord => {
      const root = this.core.parseRoot(chord.label);
      if (root < 0) return null;
      const rel = toPc(root - key.root);
      for (let i = 0; i < scale.length; i++) {
        if (toPc(scale[i]) === rel) return i + 1;
      }
      return null;
    }).filter(d => d !== null);

    if (degrees.length < 2) return null;

    const pattern = degrees.join('-');

    const progressions = {
      '1-4-5': { name: 'I-IV-V', next: 1, strength: 0.9 },
      '1-5-6-4': { name: 'I-V-vi-IV', next: 1, strength: 0.85 },
      '1-6-4-5': { name: 'I-vi-IV-V', next: 1, strength: 0.9 },
      '2-5': { name: 'ii-V', next: 1, strength: 0.95 },
      '2-5-1': { name: 'ii-V-I', next: null, strength: 1.0 },
      '4-5': { name: 'IV-V', next: 1, strength: 0.9 },
      '5-1': { name: 'V-I', next: null, strength: 1.0 },
      '4-1': { name: 'IV-I', next: null, strength: 0.85 },
      '1-4-5-1': { name: 'I-IV-V-I', next: null, strength: 1.0 },
      '1-5-6-4-1': { name: 'I-V-vi-IV-I', next: null, strength: 0.95 }
    };

    for (let len = Math.min(5, degrees.length); len >= 2; len--) {
      const slice = degrees.slice(-len).join('-');
      if (progressions[slice]) {
        const p = progressions[slice];
        return { pattern: slice, ...p };
      }
    }

    return null;
  }

  predictNextChord(recentChords, key) {
    if (!recentChords || !recentChords.length) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;
    const lastChord = recentChords[recentChords.length - 1];
    const lastRoot = this.core.parseRoot(lastChord.label);
    if (lastRoot < 0) return null;

    const predictions = [];

    const progression = this.recognizeProgressionPattern(recentChords, key);
    if (progression && progression.next !== null) {
      const deg = progression.next;
      const targetRoot = toPc(key.root + scale[deg - 1]);
      predictions.push({ root: targetRoot, label: this.core.getNoteName(targetRoot, key), confidence: progression.strength });
    }

    const fifthUp = toPc(lastRoot + 7);
    const fifthDown = toPc(lastRoot - 7);

    if (this.core.inKey(fifthUp, key.root, key.minor)) {
      predictions.push({ root: fifthUp, label: this.core.getNoteName(fifthUp, key), confidence: 0.7 });
    }
    if (this.core.inKey(fifthDown, key.root, key.minor)) {
      predictions.push({ root: fifthDown, label: this.core.getNoteName(fifthDown, key), confidence: 0.6 });
    }

    const stepUp = toPc(lastRoot + 2);
    const stepDown = toPc(lastRoot - 2);
    if (this.core.inKey(stepUp, key.root, key.minor)) {
      predictions.push({ root: stepUp, label: this.core.getNoteName(stepUp, key), confidence: 0.5 });
    }
    if (this.core.inKey(stepDown, key.root, key.minor)) {
      predictions.push({ root: stepDown, label: this.core.getNoteName(stepDown, key), confidence: 0.5 });
    }

    const map = new Map();
    for (const p of predictions) {
      if (!map.has(p.root) || map.get(p.root).confidence < p.confidence) {
        map.set(p.root, p);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  computePredictionAccuracy(timeline) {
    const withPred = timeline.filter(c => c.predictions && c.predictions.length);
    if (!withPred.length) return 0;
    const hits = withPred.filter(c => c.predictionMatch).length;
    return Math.round((hits / withPred.length) * 100);
  }

  quickModulationCheck(timeline, primaryKey) {
    if (!timeline || timeline.length < 20) return 0;

    const third = Math.floor(timeline.length / 3);
    const sections = [timeline.slice(0, third), timeline.slice(third, 2 * third), timeline.slice(2 * third)];

    let modCount = 0;
    let lastKey = { root: primaryKey.root, minor: primaryKey.minor };

    for (const section of sections) {
      if (!section.length) continue;

      let diatonicCount = 0;
      for (const chord of section) {
        const root = this.core.parseRoot(chord.label);
        if (root >= 0 && this.core.inKey(root, lastKey.root, lastKey.minor)) {
          diatonicCount++;
        }
      }

      const diatonicRatio = diatonicCount / section.length;
      if (diatonicRatio >= 0.6) continue;

      let bestNewKey = null;
      let bestRatio = diatonicRatio;

      for (let newRoot = 0; newRoot < 12; newRoot++) {
        for (const newMinor of [false, true]) {
          let cnt = 0;
          for (const chord of section) {
            const root = this.core.parseRoot(chord.label);
            if (root >= 0 && this.core.inKey(root, newRoot, newMinor)) {
              cnt++;
            }
          }
          const ratio = cnt / section.length;
          if (ratio > bestRatio + 0.15) {
            bestRatio = ratio;
            bestNewKey = { root: newRoot, minor: newMinor };
          }
        }
      }

      if (bestNewKey) {
        modCount++;
        lastKey = bestNewKey;
      }
    }

    return modCount;
  }

  degreeOfChord(label, key) {
    const rootPc = this.core.parseRoot(label);
    if (rootPc < 0) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const rel = toPc(rootPc - key.root);
    const scale = key.minor ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;

    let bestDeg = null;
    let bestDist = 999;

    for (let d = 0; d < scale.length; d++) {
      const dist = Math.min((rel - scale[d] + 12) % 12, (scale[d] - rel + 12) % 12);
      if (dist < bestDist) {
        bestDist = dist;
        bestDeg = d + 1;
      }
    }

    return bestDeg;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.core.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = mode === 'minor' ? this.core.MINOR_SCALE : this.core.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => {
      const pc = toPc(tonicPc + deg);
      return this.core.NOTES_SHARP[pc] + qualities[i];
    });
  }

  buildCircleOfFifths(key) {
    const keyName = this.core.getNoteName(key.root, key) + (key.minor ? 'm' : '');
    const chords = this.getDiatonicChords(keyName.replace(/m$/, ''), key.minor ? 'minor' : 'major');
    const functions = key.minor ? ['i','ii°','III','iv','v','VI','VII'] : ['I','ii','iii','IV','V','vi','vii°'];
    return chords.map((label, i) => ({ label, function: functions[i] || null }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEnhancer;
}

console.log('✅ ChordEnhancer.js loaded - Advanced processing ready');
