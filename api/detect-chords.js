// api/detect-chords.js
// Full chord detection logic - extracted from v27

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { features, bpm, duration, config = {} } = req.body;

    if (!features || !features.chroma || !features.bassPc) {
      return res.status(400).json({ error: 'Missing audio features' });
    }

    const { chroma, bassPc, frameE, hop, sr } = features;
    const { extMode = 'jazz', decSens = 1.0, bassSens = 1.25, quantValue = 4 } = config;

    // Constants
    const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
    const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
    const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const toPc = n => ((n % 12) + 12) % 12;
    const nameSharp = i => NOTES_SHARP[toPc(i)];

    function parseRoot(label) {
      const m = label?.match?.(/^([A-G](?:#|b)?)/);
      if (!m) return -1;
      const nm = m[1].replace('b', '#');
      return NOTES_SHARP.indexOf(nm);
    }

    function ksScore(chromaAgg, root, isMinor) {
      const prof = isMinor ? KS_MINOR : KS_MAJOR;
      let s = 0;
      for (let i = 0; i < 12; i++) s += chromaAgg[toPc(i + root)] * prof[i];
      return s;
    }

    function percentileLocal(arr, p) {
      const a = [...arr].filter(x => Number.isFinite(x)).sort((x, y) => x - y);
      return a[Math.floor((p / 100) * (a.length - 1))] || 0;
    }

    // 1. Estimate key
    function estimateKeyKrumhansl(chroma) {
      const agg = new Array(12).fill(0);
      for (let i = 0; i < chroma.length; i++) {
        for (let p = 0; p < 12; p++) agg[p] += chroma[i][p];
      }
      const s = agg.reduce((a, b) => a + b, 0) || 1;
      for (let p = 0; p < 12; p++) agg[p] /= s;
      
      let best = { score: -1, root: 0, minor: false };
      for (let r = 0; r < 12; r++) {
        const sMaj = ksScore(agg, r, false);
        const sMin = ksScore(agg, r, true);
        if (sMaj > best.score) best = { score: sMaj, root: r, minor: false };
        if (sMin > best.score) best = { score: sMin, root: r, minor: true };
      }
      return { root: best.root, minor: best.minor };
    }

    // 2. Detect mode
    function detectMode(chroma, key) {
      const agg = new Array(12).fill(0);
      for (const c of chroma) for (let p = 0; p < 12; p++) agg[p] += c[p];
      const s = agg.reduce((a, b) => a + b, 0) || 1;
      for (let p = 0; p < 12; p++) agg[p] /= s;
      
      if (!key.minor) {
        if (agg[toPc(key.root + 10)] > 0.15) return 'Mixolydian';
        if (agg[toPc(key.root + 6)] > 0.12) return 'Lydian';
        return 'Major';
      } else {
        if (agg[toPc(key.root + 9)] > 0.15 && agg[toPc(key.root + 11)] < 0.08) return 'Dorian';
        if (agg[toPc(key.root + 11)] > 0.15) return 'Harmonic Minor';
        return 'Natural Minor';
      }
    }

    // 3. Build chords from bass
    function buildChordsFromBass(bassPc, chroma, frameE, key, bpm, hop, sr) {
      const diatonic = (key.minor ? MINOR_SCALE : MAJOR_SCALE).map(s => toPc(key.root + s));
      const borrowedPcs = key.minor ? [toPc(key.root + 8), toPc(key.root + 10)] : [];
      const allowedPcs = [...diatonic, ...borrowedPcs];
      
      const spb = 60 / Math.max(60, bpm || 120);
      const minFrames = Math.max(2, Math.floor((spb * 0.3) / (hop / sr)));
      
      const timeline = [];
      let i = 0;
      
      while (i < bassPc.length) {
        if (bassPc[i] < 0 || frameE[i] < percentileLocal(frameE, 15)) {
          i++;
          continue;
        }
        
        const root = bassPc[i];
        const startFrame = i;
        const startTime = i * (hop / sr);
        
        if (!allowedPcs.includes(root)) {
          i++;
          continue;
        }
        
        let endFrame = startFrame;
        let gapCounter = 0;
        const maxGap = 3;
        
        while (endFrame < bassPc.length) {
          if (bassPc[endFrame] === root) {
            gapCounter = 0;
            endFrame++;
          } else if (bassPc[endFrame] < 0 || gapCounter < maxGap) {
            gapCounter++;
            endFrame++;
          } else {
            break;
          }
        }
        
        if ((endFrame - startFrame) < minFrames) {
          i = endFrame;
          continue;
        }
        
        const avgChroma = new Array(12).fill(0);
        let totalWeight = 0;
        
        for (let j = startFrame; j < endFrame; j++) {
          if (chroma[j]) {
            const weight = Math.sqrt(frameE[j] || 1);
            for (let p = 0; p < 12; p++) avgChroma[p] += chroma[j][p] * weight;
            totalWeight += weight;
          }
        }
        
        if (totalWeight > 0) {
          for (let p = 0; p < 12; p++) avgChroma[p] /= totalWeight;
        }
        
        // Decide major/minor
        const minor3rd = avgChroma[toPc(root + 3)] || 0;
        const major3rd = avgChroma[toPc(root + 4)] || 0;
        let isMinor;
        if (major3rd > minor3rd * 1.3) isMinor = false;
        else if (minor3rd > major3rd * 1.3) isMinor = true;
        else isMinor = minor3rd >= major3rd * 0.85;
        
        const label = nameSharp(root) + (isMinor ? 'm' : '');
        
        timeline.push({
          time: startTime,
          label: label,
          avgChroma: avgChroma,
          fi: startFrame,
          endFrame: endFrame
        });
        
        i = endFrame;
      }
      
      return timeline;
    }

    // 4. Add extensions
    function decorateQualitiesBassFirst(timeline, extMode, decSens) {
      if (extMode === 'basic') return timeline;
      
      return timeline.map(ev => {
        const root = parseRoot(ev.label);
        if (root < 0) return ev;
        
        const avg = ev.avgChroma;
        let label = ev.label;
        
        const seventh = avg[toPc(root + 10)] || 0;
        const maj7 = avg[toPc(root + 11)] || 0;
        const ninth = avg[toPc(root + 2)] || 0;
        
        const threshold7 = 0.15 / decSens;
        const threshold9 = 0.12 / decSens;
        
        if (extMode === 'jazz' || extMode === 'pro') {
          if (seventh > threshold7 && seventh > maj7 * 1.2 && !/7/.test(label)) {
            label += '7';
          } else if (maj7 > threshold7 && maj7 > seventh * 1.2 && !/7/.test(label)) {
            label += 'maj7';
          }
          
          if (extMode === 'pro' && /7/.test(label) && ninth > threshold9) {
            label = label.replace('7', '9');
            label = label.replace('maj7', 'maj9');
          }
        }
        
        return { ...ev, label };
      });
    }

    // 5. Add inversions
    function addInversionsIfNeeded(timeline, bassPc, bassSens) {
      if (bassSens < 1.6) return timeline;
      
      return timeline.map(ev => {
        const root = parseRoot(ev.label);
        if (root < 0) return ev;
        
        const i0 = Math.max(0, ev.fi);
        const i1 = Math.min(bassPc.length - 1, ev.endFrame || ev.fi + 3);
        
        const bassVotes = new Array(12).fill(0);
        for (let i = i0; i <= i1; i++) {
          if (bassPc[i] >= 0) bassVotes[bassPc[i]]++;
        }
        
        const dominantBass = bassVotes.indexOf(Math.max(...bassVotes));
        if (dominantBass < 0 || dominantBass === root) return ev;
        
        const intervals = [0, 3, 4, 7, 10, 11];
        const bassInterval = toPc(dominantBass - root);
        
        if (intervals.includes(bassInterval)) {
          const bassNote = nameSharp(dominantBass);
          return { ...ev, label: ev.label + '/' + bassNote };
        }
        
        return ev;
      });
    }

    // 6. Validate chords
    function validateChords(timeline, key) {
      const diatonic = (key.minor ? MINOR_SCALE : MAJOR_SCALE).map(s => toPc(key.root + s));
      
      return timeline.filter(ev => {
        const root = parseRoot(ev.label);
        if (root < 0) return false;
        
        const isInKey = diatonic.includes(root);
        if (isInKey) return true;
        
        const chromaStrength = ev.avgChroma ? ev.avgChroma[root] : 0;
        return chromaStrength >= 0.25;
      });
    }

    // 7. Classify ornaments
    function classifyOrnamentsByDuration(timeline, bpm) {
      const spb = 60 / Math.max(60, bpm || 120);
      const structuralThreshold = spb * 1.5;
      
      return timeline.map((ev, i) => {
        const nextEv = timeline[i + 1];
        const duration = nextEv ? (nextEv.time - ev.time) : (spb * 2);
        
        let ornamentType = 'structural';
        if (duration < spb * 0.75) {
          ornamentType = 'passing';
        } else if (duration < structuralThreshold) {
          ornamentType = 'ornament';
        }
        
        return { ...ev, ornamentType };
      });
    }

    // 8. Quantize
    function quantizeToGrid(timeline, bpm, quantValue) {
      const spb = 60 / Math.max(60, bpm || 120);
      const gridSize = spb / quantValue;
      
      return timeline.map((ev, i) => {
        const quantized = Math.round(ev.time / gridSize) * gridSize;
        const nextEv = timeline[i + 1];
        const dur = nextEv ? (nextEv.time - ev.time) : spb;
        
        return { ...ev, time: quantized, duration: dur };
      });
    }

    // 9. Remove redundant
    function removeRedundantChords(timeline, bpm) {
      const spb = 60 / Math.max(60, bpm || 120);
      const barDuration = spb * 4;
      
      const out = [];
      let lastLabel = null;
      let lastBar = -1;
      
      for (const ev of timeline) {
        const currentBar = Math.floor(ev.time / barDuration);
        
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

    // Run the full pipeline
    const key = estimateKeyKrumhansl(chroma);
    const mode = detectMode(chroma, key);
    
    let timeline = buildChordsFromBass(bassPc, chroma, frameE, key, bpm, hop, sr);
    
    // Add tonic if empty
    if (timeline.length === 0 || (timeline.length < 3 && duration > 30)) {
      const tonicLabel = nameSharp(key.root) + (key.minor ? 'm' : '');
      timeline.unshift({
        time: 0,
        label: tonicLabel,
        avgChroma: chroma[0] || new Array(12).fill(0),
        ornamentType: 'structural'
      });
    }
    
    timeline = decorateQualitiesBassFirst(timeline, extMode, decSens);
    timeline = addInversionsIfNeeded(timeline, bassPc, bassSens);
    timeline = validateChords(timeline, key);
    timeline = classifyOrnamentsByDuration(timeline, bpm);
    timeline = quantizeToGrid(timeline, bpm, quantValue);
    timeline = removeRedundantChords(timeline, bpm);
    
    // Calculate metrics
    const structural = timeline.filter(e => e.ornamentType === 'structural').length;
    const ornaments = timeline.filter(e => e.ornamentType !== 'structural').length;
    
    // Secondary dominants
    let secDom = 0;
    for (let i = 0; i < timeline.length - 1; i++) {
      if (timeline[i].label.includes('7') && !timeline[i].label.includes('maj7')) {
        const rootI = parseRoot(timeline[i].label);
        const rootNext = parseRoot(timeline[i + 1].label);
        if (rootI >= 0 && rootNext >= 0) {
          const interval = toPc(rootNext - rootI);
          if (interval === 5 || interval === 7) secDom++;
        }
      }
    }
    
    // Modal borrowing
    const diatonic = (key.minor ? MINOR_SCALE : MAJOR_SCALE).map(s => toPc(key.root + s));
    let modalBorrow = 0;
    for (const ev of timeline) {
      const r = parseRoot(ev.label);
      if (r >= 0 && !diatonic.includes(r)) modalBorrow++;
    }
    
    return res.status(200).json({
      success: true,
      key: {
        root: key.root,
        minor: key.minor,
        name: nameSharp(key.root) + (key.minor ? 'm' : '')
      },
      mode,
      chords: timeline,
      metrics: {
        structural,
        ornaments,
        secDom,
        modalBorrow,
        total: timeline.length
      },
      bpm,
      duration
    });

  } catch (error) {
    console.error('Chord detection error:', error);
    return res.status(500).json({
      error: 'Chord detection failed',
      message: error.message
    });
  }
};
