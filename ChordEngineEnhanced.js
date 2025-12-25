);
    console.log(`   Key: ${key ? this.NOTES_SHARP[key.root] + (key.minor ? 'm' : '') : 'unknown'}`);
    console.log(`   Expected: ${[...expectedRoots].map(p => this.NOTES_SHARP[p]).join(', ')}`);
    console.log(`   Established: ${[...established].map(p => this.NOTES_SHARP[p]).join(', ')}`);
    
    // Step 4: Find suspicious chords - rare roots that are half-tone from established
    // AND not in expected scale
    let corrections = 0;
    
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord || !chord.label) continue;
      
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;
      
      // Skip if established or expected
      if (established.has(root) || expectedRoots.has(root)) continue;
      
      // Skip if appears frequently (probably intentional)
      if (rootCounts[root] >= 3) continue;
      
      // Check half-tone neighbors
      const halfUp = toPc(root + 1);
      const halfDown = toPc(root - 1);
      
      let correctedRoot = null;
      
      // Prefer correction to established AND expected root
      if (established.has(halfUp) && expectedRoots.has(halfUp)) {
        correctedRoot = halfUp;
      } else if (established.has(halfDown) && expectedRoots.has(halfDown)) {
        correctedRoot = halfDown;
      }
      // Otherwise, just established is enough
      else if (established.has(halfUp) && rootCounts[halfUp] >= rootCounts[root] * 3) {
        correctedRoot = halfUp;
      } else if (established.has(halfDown) && rootCounts[halfDown] >= rootCounts[root] * 3) {
        correctedRoot = halfDown;
      }
      
      // Apply correction
      if (correctedRoot !== null) {
        const isMinor = /m(?!aj)/.test(chord.label);
        const is7 = /7/.test(chord.label);
        const isMaj7 = /maj7/i.test(chord.label);
        const isDim = /dim/.test(chord.label);
        const isSus = /sus/.test(chord.label);
        
        let suffix = '';
        if (isDim) suffix = 'dim';
        else if (isSus) suffix = chord.label.match(/sus\d?/)?.[0] || 'sus4';
        else if (isMaj7) suffix = 'maj7';
        else if (is7) suffix = isMinor ? 'm7' : '7';
        else if (isMinor) suffix = 'm';
        
        const correctedLabel = this.NOTES_SHARP[correctedRoot] + suffix;
        
        console.log(`   ⚠️ ${chord.label} → ${correctedLabel} (${this.NOTES_SHARP[root]}: ${rootCounts[root]}x, not in scale, neighbor ${this.NOTES_SHARP[correctedRoot]}: ${rootCounts[correctedRoot]}x)`);
        
        timeline[i] = {
          ...chord,
          label: correctedLabel,
          originalLabel: chord.label,
          harmonicCorrection: true
        };
        corrections++;
      }
    }
    
    if (corrections > 0) {
      console.log(`   ✅ Made ${corrections} harmonic corrections`);
    } else {
      console.log(`   ✅ No corrections needed`);
    }
    
    return timeline;
  }

  // ✅ HUMAN EAR TONIC DETECTION - combines ALL musical evidence
  detectTonicLikeHumanEar(timeline, feats, duration) {
    if (!timeline || timeline.length < 4) return null;
    
    const toPc = n => ((n % 12) + 12) % 12;
    const scores = new Array(12).fill(0);
    const minorEvidence = new Array(12).fill(0);
    const majorEvidence = new Array(12).fill(0);
    
    console.log('🎧 HUMAN EAR ANALYSIS:');
    
    // ═══════════════════════════════════════════════════════
    // 1. CHORD CYCLE DETECTION (strongest evidence)
    // ═══════════════════════════════════════════════════════
    const cycle = this.detectChordCycle(timeline);
    if (cycle && cycle.repetitions >= 2) {
      const cycleRoot = cycle.firstChordRoot;
      
      // ✅ VALIDATION: Check if V→I cadence supports this tonic
      let vToITarget = -1;
      for (let i = 1; i < timeline.length; i++) {
        if (!timeline[i]?.label || !timeline[i-1]?.label) continue;
        const prev = this.parseRoot(timeline[i-1].label);
        const curr = this.parseRoot(timeline[i].label);
        if (prev >= 0 && curr >= 0 && toPc(curr - prev) === 5) {
          vToITarget = curr;
          break;
        }
      }
      
      if (vToITarget >= 0 && vToITarget !== cycleRoot) {
        if (cycle.pattern.includes(vToITarget)) {
          console.log(`  ⚠️ Cycle starts with ${this.NOTES_SHARP[cycleRoot]}, but V→I points to ${this.NOTES_SHARP[vToITarget]}`);
          scores[cycleRoot] += 30 * Math.min(cycle.repetitions, 6);
          scores[vToITarget] += 40 * Math.min(cycle.repetitions, 6);
        } else {
          scores[cycleRoot] += 50 * Math.min(cycle.repetitions, 6);
        }
      } else {
        scores[cycleRoot] += 50 * Math.min(cycle.repetitions, 6);
      }
      
      for (const chord of timeline) {
        if (chord && this.parseRoot(chord.label) === cycleRoot) {
          if (/m(?!aj)/.test(chord.label)) minorEvidence[cycleRoot] += 30;
          else majorEvidence[cycleRoot] += 30;
          break;
        }
      }
      console.log(`  🔄 Cycle: ${cycle.pattern.map(p => this.NOTES_SHARP[p]).join('→')} (${cycle.repetitions}x) → points to ${this.NOTES_SHARP[cycleRoot]}`);
    }
    
    // ═══════════════════════════════════════════════════════
    // 2. CADENCE DETECTION - V→I, IV→I, vii°→I
    // ═══════════════════════════════════════════════════════
    console.log('  🎼 Cadences:');
    
    for (let i = 1; i < timeline.length; i++) {
      if (!timeline[i]?.label || !timeline[i-1]?.label) continue;
      
      const prev = this.parseRoot(timeline[i-1].label);
      const curr = this.parseRoot(timeline[i].label);
      if (prev < 0 || curr < 0) continue;
      
      const interval = toPc(curr - prev);
      
      // ✅ FIX 2: V→I (perfect fifth up / perfect fourth down)
      if (interval === 5 || interval === 7) {
        scores[curr] += 40;
        console.log(`    V→I: ${this.NOTES_SHARP[prev]} → ${this.NOTES_SHARP[curr]} (+40)`);
        
        if (/m(?!aj)/.test(timeline[i].label)) minorEvidence[curr] += 20;
        else majorEvidence[curr] += 20;
      }
      
      // ✅ FIX 2: IV→I (plagal cadence - perfect fourth up)
      if (interval === 5) {
        scores[curr] += 25;
        console.log(`    IV→I: ${this.NOTES_SHARP[prev]} → ${this.NOTES_SHARP[curr]} (+25)`);
      }
      
      // ✅ FIX 2: vii°→I (leading tone - semitone up)
      if (interval === 1) {
        scores[curr] += 20;
        console.log(`    vii°→I: ${this.NOTES_SHARP[prev]} → ${this.NOTES_SHARP[curr]} (+20)`);
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // 3. REST POINTS - where does the song "breathe"?
    // ═══════════════════════════════════════════════════════
    if (feats?.bassPc && feats?.frameE) {
      console.log('  💤 Rest points:');
      const { bassPc, frameE } = feats;
      const restCounts = new Array(12).fill(0);
      const thr = this.percentile(frameE, 70);
      
      for (let i = 5; i < frameE.length - 1; i++) {
        const prev3 = (frameE[i-1] + frameE[i-2] + frameE[i-3]) / 3;
        if (frameE[i] < prev3 * 0.5 && prev3 >= thr) {
          const restBass = bassPc[Math.max(0, i - 2)];
          if (restBass >= 0) restCounts[restBass]++;
        }
      }
      
      const maxRest = Math.max(...restCounts);
      if (maxRest > 0) {
        for (let pc = 0; pc < 12; pc++) {
          if (restCounts[pc] > 0) {
            const bonus = (restCounts[pc] / maxRest) * 30;
            scores[pc] += bonus;
            console.log(`    ${this.NOTES_SHARP[pc]}: ${restCounts[pc]} rests (+${bonus.toFixed(0)})`);
          }
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // 4. NEW: LONG CHORDS FOLLOWED BY ROOT (after rest → I)
    // ═══════════════════════════════════════════════════════
    console.log('  🎵 Long chords → root:');
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const chord = timeline[i];
      const next = timeline[i + 1];
      if (!chord || !next) continue;
      
      const dur = this.getChordDuration(chord, timeline, duration);
      
      // If this chord is long (>2s) and next chord exists
      if (dur > 2.0) {
        const currRoot = this.parseRoot(chord.label);
        const nextRoot = this.parseRoot(next.label);
        
        if (currRoot >= 0 && nextRoot >= 0) {
          // Check if it's a cadence-like movement
          const interval = toPc(nextRoot - currRoot);
          
          // V→I or IV→I movement after long chord
          if (interval === 5 || interval === 7) {
            scores[nextRoot] += 25;
            console.log(`    ${this.NOTES_SHARP[currRoot]} (${dur.toFixed(1)}s) → ${this.NOTES_SHARP[nextRoot]} (+25)`);
            
            if (/m(?!aj)/.test(next.label)) minorEvidence[nextRoot] += 15;
            else majorEvidence[nextRoot] += 15;
          }
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // 5. FIRST AND LAST CHORD (skip intro noise!)
    // ═══════════════════════════════════════════════════════
    console.log('  🎬 First/Last chords:');
    
    // ✅ FIX 3: Skip intro noise - find first STRONG chord
    let firstStrongChord = null;
    const introSkipFrames = feats?.introSkipFrames || 0;
    
    for (const chord of timeline) {
      if (!chord || !chord.label) continue;
      const dur = this.getChordDuration(chord, timeline, duration);
      
      // First strong chord: duration > 1s AND after intro skip
      if (dur > 1.0 && chord.fi > introSkipFrames) {
        firstStrongChord = chord;
        break;
      }
    }
    
    if (firstStrongChord) {
      const root = this.parseRoot(firstStrongChord.label);
      if (root >= 0) {
        scores[root] += 30;
        console.log(`    First strong: ${firstStrongChord.label} (+30)`);
        
        if (/m(?!aj)/.test(firstStrongChord.label)) minorEvidence[root] += 25;
        else majorEvidence[root] += 25;
      }
    }
    
    // Last chord
    if (timeline.length > 0) {
      const last = timeline[timeline.length - 1];
      if (last && last.label) {
        const root = this.parseRoot(last.label);
        if (root >= 0) {
          scores[root] += 30;
          console.log(`    Last: ${last.label} (+30)`);
          
          if (/m(?!aj)/.test(last.label)) minorEvidence[root] += 25;
          else majorEvidence[root] += 25;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // 6. NEW: VOCAL ENTRY DETECTION (energy spike)
    // ═══════════════════════════════════════════════════════
    if (feats?.frameE) {
      console.log('  🎤 Vocal entry detection:');
      const { frameE } = feats;
      const threshold = this.percentile(frameE, 80);
      
      // Look for sudden energy increase (vocals entering)
      for (let i = 10; i < frameE.length - 5; i++) {
        const prev5Avg = (frameE[i-1] + frameE[i-2] + frameE[i-3] + frameE[i-4] + frameE[i-5]) / 5;
        const curr = frameE[i];
        
        // Sudden spike: current > prev * 1.5 and above threshold
        if (curr > prev5Avg * 1.5 && curr > threshold) {
          // Find which chord is playing at this moment
          const secPerHop = (feats.hop || 512) / (feats.sr || 22050);
          const time = i * secPerHop;
          
          for (const chord of timeline) {
            const chordStart = chord.t;
            const chordEnd = chord.t + this.getChordDuration(chord, timeline, duration);
            
            if (time >= chordStart && time < chordEnd) {
              const root = this.parseRoot(chord.label);
              if (root >= 0) {
                scores[root] += 15;
                console.log(`    Vocal entry at ${time.toFixed(1)}s on ${chord.label} (+15)`);
                
                if (/m(?!aj)/.test(chord.label)) minorEvidence[root] += 10;
                else majorEvidence[root] += 10;
              }
              break;
            }
          }
          
          // Skip ahead to avoid multiple detections of same entry
          i += 20;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // 7. NEW: PROGRESSION DETECTION (connect existing function!)
    // ═══════════════════════════════════════════════════════
    console.log('  📊 Progression patterns:');
    
    // Try to recognize common progressions
    const progressionResult = this.recognizeProgressionPattern(timeline, { root: 0, minor: false });
    if (progressionResult && progressionResult.pattern) {
      const patternRoot = progressionResult.tonicRoot;
      if (patternRoot >= 0) {
        const bonus = progressionResult.confidence * 40; // Up to +40
        scores[patternRoot] += bonus;
        console.log(`    Found ${progressionResult.pattern} → ${this.NOTES_SHARP[patternRoot]} (+${bonus.toFixed(0)})`);
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // 8. DURATION WEIGHTING
    // ═══════════════════════════════════════════════════════
    const rootDuration = new Array(12).fill(0);
    for (const chord of timeline) {
      if (!chord || !chord.label) continue;
      const root = this.parseRoot(chord.label);
      if (root >= 0) {
        const dur = this.getChordDuration(chord, timeline, duration);
        rootDuration[root] += dur;
      }
    }
    
    const maxDur = Math.max(...rootDuration);
    if (maxDur > 0) {
      for (let pc = 0; pc < 12; pc++) {
        const bonus = (rootDuration[pc] / maxDur) * 20;
        scores[pc] += bonus;
      }
    }
    
    // ═══════════════════════════════════════════════════════
    // FINAL: Select best root
    // ═══════════════════════════════════════════════════════
    let bestRoot = 0;
    let bestScore = -Infinity;
    
    for (let pc = 0; pc < 12; pc++) {
      if (scores[pc] > bestScore) {
        bestScore = scores[pc];
        bestRoot = pc;
      }
    }
    
    const isMinor = minorEvidence[bestRoot] > majorEvidence[bestRoot];
    const confidence = Math.min(100, Math.max(50, bestScore * 0.5));
    
    console.log(`\n  📊 SCORES:`);
    const top3 = [...Array(12).keys()]
      .map(pc => ({ pc, score: scores[pc] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    for (const { pc, score } of top3) {
      const minor = minorEvidence[pc] > majorEvidence[pc];
      console.log(`    ${this.NOTES_SHARP[pc]}${minor ? 'm' : ''}: ${score.toFixed(0)} (m:${minorEvidence[pc].toFixed(0)}, M:${majorEvidence[pc].toFixed(0)})`);
    }
    
    console.log(`  🏆 WINNER: ${this.NOTES_SHARP[bestRoot]}${isMinor ? 'm' : ''} (score: ${bestScore.toFixed(0)}, confidence: ${confidence}%)`);
    
    return {
      root: bestRoot,
      minor: isMinor,
      confidence,
      method: 'human_ear',
      label: this.NOTES_SHARP[bestRoot] + (isMinor ? 'm' : ''),
      scores: scores
    };
  }
  detectTonicMusically(timeline, key, duration, feats = null) {
    if (!timeline || timeline.length < 3) {
      return {
        root: key.root,
        label: this.getNoteName(key.root, key) + (key.minor ? 'm' : ''),
        confidence: 50
      };
    }

    // ✅ BEST METHOD: Detect repeating chord cycle
    // In 4/4 music with 4-chord loop, first chord of cycle = TONIC
    const cycle = this.detectChordCycle(timeline);
    if (cycle && cycle.confidence >= 65) {
      const tonicRoot = cycle.firstChordRoot;
      // Check if it's minor by looking at the chord label
      let isMinor = false;
      for (const chord of timeline) {
        if (chord && chord.label) {
          const r = this.parseRoot(chord.label);
          if (r === tonicRoot) {
            isMinor = /m(?!aj)/.test(chord.label);
            break;
          }
        }
      }
      
      console.log(`🔄 CYCLE DETECTED: ${cycle.cycleLength} chords, ${cycle.repetitions}x repeats`);
      console.log(`   Pattern: ${cycle.pattern.map(p => this.NOTES_SHARP[p]).join(' → ')}`);
      console.log(`   TONIC = ${this.NOTES_SHARP[tonicRoot]}${isMinor ? 'm' : ''} (confidence: ${cycle.confidence}%)`);
      
      return {
        root: tonicRoot,
        label: this.NOTES_SHARP[tonicRoot] + (isMinor ? 'm' : ''),
        confidence: cycle.confidence,
        method: 'cycle_detection'
      };
    }

    const toPc = n => ((n % 12) + 12) % 12;
    const candidates = {};
    let totalDuration = 0;

    // ✅ IMPROVED: Use smart intro detection if available
    let realMusicStartTime = 1.5; // default fallback
    
    if (feats && feats.introSkipFrames !== undefined && feats.hop && feats.sr) {
      // Use the smart detection that checks for harmonic content
      realMusicStartTime = (feats.introSkipFrames * feats.hop) / feats.sr;
    } else {
      // Fallback: find first chord with real harmonic content
      for (let i = 0; i < timeline.length; i++) {
        const chord = timeline[i];
        if (!chord || !chord.label) continue;
        
        // Skip if too early AND looks like noise (single note names like "A" without quality)
        if (chord.t < 1.0) continue;
        
        // Check if this looks like a real chord (has quality or is in a progression)
        const hasQuality = /m|7|maj|dim|aug|sus/.test(chord.label);
        const nextChord = timeline[i + 1];
        const hasProgression = nextChord && nextChord.t - chord.t < 3.0;
        
        if (hasQuality || hasProgression) {
          realMusicStartTime = chord.t;
          break;
        }
      }
    }

    // ✅ GPT FIX: Focus window - analyze 1-7 seconds after real music starts
    const focusStart = realMusicStartTime + 0.5; // Start focus 0.5s after music
    const focusEnd = realMusicStartTime + 7.0;

    // Count chords in focus window (this is where tonic is clearest)
    const focusChords = timeline.filter(c => c && c.t >= focusStart && c.t <= focusEnd);
    
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord || !chord.label) continue;
      const root = this.parseRoot(chord.label);
      if (root < 0) continue;

      const dur = this.getChordDuration(chord, timeline, duration);
      
      // ✅ GPT FIX: Weight chords in focus window much higher
      const inFocusWindow = chord.t >= focusStart && chord.t <= focusEnd;
      const focusWeight = inFocusWindow ? 3.0 : 1.0;
      
      // ✅ GPT FIX: Ignore intro chords for tonic calculation
      if (chord.t < realMusicStartTime) continue;
      
      totalDuration += dur;

      if (!candidates[root]) {
        candidates[root] = { 
          duration: 0, 
          openingScore: 0, 
          closingScore: 0, 
          cadenceScore: 0,
          resolutionScore: 0  // ✅ NEW: emotional resolution
        };
      }
      candidates[root].duration += dur * focusWeight;
    }

    // ✅ GPT FIX: First chord AFTER real music start
    let firstRealChordIdx = 0;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i] && timeline[i].t >= realMusicStartTime) {
        firstRealChordIdx = i;
        break;
      }
    }
    
    const opening = timeline.slice(firstRealChordIdx, Math.min(firstRealChordIdx + 4, timeline.length));
    
    for (let i = 0; i < opening.length; i++) {
      if (!opening[i] || !opening[i].label) continue;
      const root = this.parseRoot(opening[i].label);
      if (root >= 0 && candidates[root]) {
        // ✅ First real chord gets huge bonus
        const w = i === 0 ? 80 : (4 - i) * 15;
        candidates[root].openingScore += w;
      }
    }

    const closing = timeline.slice(Math.max(0, timeline.length - 3));
    for (let i = 0; i < closing.length; i++) {
      if (!closing[i] || !closing[i].label) continue;
      const root = this.parseRoot(closing[i].label);
      if (root >= 0 && candidates[root]) {
        candidates[root].closingScore += (i + 1) * 12;
      }
    }

    // ✅ GPT FIX: Emotional cadence detection - "coming home" feeling
    for (let i = 1; i < timeline.length; i++) {
      if (!timeline[i] || !timeline[i].label || !timeline[i-1] || !timeline[i-1].label) continue;
      const prevRoot = this.parseRoot(timeline[i-1].label);
      const currRoot = this.parseRoot(timeline[i].label);
      if (prevRoot < 0 || currRoot < 0) continue;
      
      const interval = toPc(currRoot - prevRoot);
      const dur = this.getChordDuration(timeline[i], timeline, duration);
      
      // V→I resolution (up P4 = interval 5)
      if (interval === 5) {
        if (candidates[currRoot]) {
          candidates[currRoot].cadenceScore += 8.0 * dur;
          candidates[currRoot].resolutionScore += 10.0; // Strong "home" feeling
        }
      }
      
      // IV→I plagal cadence (up P5 = interval 7)
      if (interval === 7) {
        if (candidates[currRoot]) {
          candidates[currRoot].cadenceScore += 5.0 * dur;
          candidates[currRoot].resolutionScore += 6.0;
        }
      }
      
      // ✅ GPT: bVII→i in minor (A→Bm = interval 2 up)
      if (interval === 2 && key.minor) {
        if (candidates[currRoot]) {
          candidates[currRoot].resolutionScore += 8.0; // Common minor resolution
        }
      }
      
      // ✅ Check for dominant (major chord a P5 above) resolving to tonic
      if (i >= 2) {
        const prevPrevRoot = this.parseRoot(timeline[i-2]?.label);
        if (prevPrevRoot >= 0) {
          const int1 = toPc(prevRoot - prevPrevRoot);
          const int2 = toPc(currRoot - prevRoot);
          // ii-V-I pattern
          if (int1 === 5 && int2 === 5) {
            if (candidates[currRoot]) {
              candidates[currRoot].resolutionScore += 15.0; // Strong ii-V-I
            }
          }
        }
      }
    }
    for (let i = 0; i < timeline.length - 1; i++) {
      if (!timeline[i] || !timeline[i].label || !timeline[i+1] || !timeline[i+1].label) continue;
      const r1 = this.parseRoot(timeline[i].label);
      const r2 = this.parseRoot(timeline[i + 1].label);
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
      // ✅ GPT FIX: Include emotional resolution score
      const score = durScore + c.openingScore + c.closingScore + c.cadenceScore + (c.resolutionScore || 0);
      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
      }
    }

    const confidence = Math.max(30, Math.min(100, bestScore));

    // ✅ GPT FIX #2: מנע מצב שבו הטוניקה יושבת על V אם הסולם עצמו די בטוח
    let tonicRoot = bestRoot;
    if (key && typeof key.root === 'number') {
      const rel = toPc(tonicRoot - key.root);
      const isFifthApart = (rel === 7 || rel === 5); // P5 up or P4 up

      if (isFifthApart && (key.confidence || 0) >= 0.6) {
        // אם הסולם די בטוח, הטוניקה תהיה השורש שלו ולא הדרגה החמישית
        tonicRoot = key.root;
      }
    }

    return {
      root: tonicRoot,
      label: this.NOTES_SHARP[((tonicRoot % 12) + 12) % 12] + (key.minor ? 'm' : ''),
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

  finalizeTimeline(timeline, key, bpm, feats) {
    if (!timeline || !timeline.length) return [];

    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.50 * spb);
    const energyMedian = this.percentile(feats.frameE, 50);

    const filtered = [];

    for (let i = 0; i < timeline.length; i++) {
      const a = timeline[i];
      if (!a || !a.label) continue;
      
      const b = timeline[i + 1];
      const dur = b ? (b.t - a.t) : minDur;
      const energy = feats.frameE[a.fi] || 0;
      const isWeak = energy < energyMedian * 0.85;

      const r = this.parseRoot(a.label);
      const isDiatonic = r >= 0 && this.inKey(r, key.root, key.minor);

      if (dur < minDur && filtered.length > 0 && (isWeak || !isDiatonic)) continue;
      if (dur < minDur * 0.6 && isWeak) continue;

      filtered.push(a);
    }

    const snapped = [];
    for (const ev of filtered) {
      if (!ev || !ev.label) continue;
      
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
    
    // ✅ LESS AGGRESSIVE: Shorter window, adaptive to song length
    const earlyWindow = Math.min(12.0, Math.max(8.0, 4 * spb));
    
    const toPc = n => ((n % 12) + 12) % 12;

    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonicPcs = scale.map(s => toPc(key.root + s));
    const qualities = key.minor ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];

    // ✅ ALLOW common borrowed chords even in early window
    const isCommonBorrowed = (chordRoot) => {
      const rel = toPc(chordRoot - key.root);
      if (key.minor) {
        // In minor: III, VI, VII are very common (from natural minor)
        return rel === 3 || rel === 8 || rel === 10;
      } else {
        // In major: iv, bVII, bVI are very common borrowed chords
        return rel === 5 || rel === 10 || rel === 8;
      }
    };

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
      if (!ev || !ev.label) continue;
      
      let label = ev.label;
      if (ev.t <= earlyWindow) {
        const r = this.parseRoot(label);
        const inKey = r >= 0 && this.inKey(r, key.root, key.minor);
        
        // ✅ ALLOW borrowed chords to pass through
        const isBorrowed = r >= 0 && isCommonBorrowed(r);
        
        if (!inKey && !isBorrowed) {
          const bp = feats.bassPc[ev.fi] ?? -1;
          let newRoot = bp >= 0 ? snapToDiatonic(bp) : snapToDiatonic(r >= 0 ? r : key.root);
          
          // Only force to tonic in first 2 seconds (not 3!)
          if (ev.t < Math.min(2.0, 1.5 * spb)) {
            newRoot = key.root;
          }
          
          const q = getQuality(newRoot);
          label = this.NOTES_SHARP[toPc(newRoot)] + q;
        } else if (inKey) {
          const q = getQuality(r);
          label = this.NOTES_SHARP[toPc(r)] + q;
        }
        // else: borrowed chord - keep as is!
      }
      out.push({ ...ev, label });
    }

    return out;
  }

  decorateQualitiesUltimate(timeline, feats, key, mode, extensionMul, extensionSensitivity = 1.0) {
    if (mode === 'basic') return timeline.map(e => e ? { ...e } : e);

    // ✅ GPT SUGGESTION 4: 'pop' mode - simplified extensions
    const isPopMode = mode === 'pop' || mode === 'basic_pop';
    
    const mul = extensionMul / (extensionSensitivity || 1.0);
    // In pop mode, require stronger evidence for extensions
    const popMul = isPopMode ? 1.5 : 1.0;
    
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      if (!ev || !ev.label) continue;
      
      const root = this.parseRoot(ev.label);
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

      // ✅ Pop mode: higher thresholds for sus chords
      const sus2Strong = s2 > (0.22 * popMul) / mul && s2 >= s4 * 0.9 && s5 > 0.10;
      const sus4Strong = s4 > (0.22 * popMul) / mul && s4 >= s2 * 0.9 && s5 > 0.10;

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
      const b7Strong = s_b7 > (0.16 * popMul) / mul && sR > 0.10 / mul;
      const maj7Strong = majContext && s7 > (0.20 * popMul) / mul && s7 > s_b7 * 1.2;

      // ✅ Pop mode: stricter 7th detection
      if (!/6$/.test(label)) {
        if (maj7Strong && !isPopMode) { // Pop mode: skip maj7 unless very strong
          label = base.replace(/m$/, '') + 'maj7';
        } else if (isPopMode && maj7Strong && s7 > 0.35) { // Very strong maj7 in pop
          label = base.replace(/m$/, '') + 'maj7';
        } else if (!/sus/.test(label) && (domLike ? s_b7 > 0.15 / mul : b7Strong)) {
          if (!/7$|maj7$/.test(label)) label += '7';
        }
      }

      // ✅ Pop mode: almost never detect dim/aug (very rare in pop)
      const dimThreshold = isPopMode ? 0.40 : 0.26;
      const dimTriad = !isPopMode && (
                       (isMinorTriad && s_b5 > dimThreshold / mul && s5 < 0.12 * mul && sm3 > 0.14 / mul) ||
                       (!isMinorTriad && s_b5 > 0.30 / mul && s5 < 0.10 * mul && sM3 < 0.08 * mul));

      if (dimTriad) {
        if (isMinorTriad && s_b7 > 0.18 / mul) {
          label = base.replace(/m$/, 'm7b5');
        } else {
          label = base.replace(/m$/, '') + 'dim';
        }
      }

      // ✅ Pop mode: almost never detect aug
      const augTriad = !isPopMode && !isMinorTriad && s_sharp5 > 0.24 / mul && s5 < 0.10 * mul && sM3 > 0.12 / mul;

      if (augTriad) {
        label = base.replace(/m$/, '') + 'aug';
      }

      // ✅ Pop mode: no add9 or 9 extensions
      if ((mode === 'jazz' || mode === 'pro') && !isPopMode) {
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
    // ✅ GPT RECOMMENDATION: DISABLED - this was causing Bm→B errors
    // Mode (major/minor) is now decided ONCE in finalizeModeFromTimeline
    // Individual chord maj/min is fixed ONLY in reinforceChordsByBassAnd135
    console.log('   ⚠️ adjustMinorMajors: DISABLED (GPT recommendation)');
    return timeline;
  }

  addInversionsUltimate(timeline, feats, key, bassMultiplier) {
    const out = [];
    const toPc = n => ((n % 12) + 12) % 12;

    for (const ev of timeline) {
      if (!ev || !ev.label) continue;
      
      const r = this.parseRoot(ev.label);
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
          const slash = this.getNoteName(bass, key);
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
      if (!ev || !ev.label) continue;
      
      const r = this.parseRoot(ev.label);
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

  classifyOrnaments(timeline, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const out = [];

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev || !ev.label) continue;
      
      const prev = i > 0 ? timeline[i - 1] : null;
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      const dur = next ? (next.t - ev.t) : spb;

      let ornamentType = 'structural';

      if (dur < 0.35 * spb && prev && prev.label && next && next.label) {
        const rPrev = this.parseRoot(prev.label);
        const r = this.parseRoot(ev.label);
        const rNext = this.parseRoot(next.label);
        if (rPrev >= 0 && r >= 0 && rNext >= 0) {
          const d1 = Math.min((r - rPrev + 12) % 12, (rPrev - r + 12) % 12);
          const d2 = Math.min((rNext - r + 12) % 12, (r - rNext + 12) % 12);
          if (d1 <= 2 && d2 <= 2) {
            ornamentType = 'passing';
          }
        }
      }

      if (dur < 0.4 * spb && prev && prev.label && next && next.label && prev.label === next.label && ornamentType === 'structural') {
        ornamentType = 'neighbor';
      }

      if (prev && prev.label) {
        const bassCur = feats.bassPc[ev.fi] ?? -1;
        const bassPrev = feats.bassPc[prev.fi] ?? -1;
        if (bassCur >= 0 && bassPrev >= 0 && bassCur === bassPrev) {
          const rCur = this.parseRoot(ev.label);
          const rPrev = this.parseRoot(prev.label);
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
      if (!ev || !ev.label) continue;
      
      const r = this.parseRoot(ev.label);
      if (r < 0) {
        out.push({ ...ev, modalContext: null });
        continue;
      }

      const rel = toPc(r - key.root);
      let modalContext = null;

      if (/7$/.test(ev.label) && !/maj7/.test(ev.label)) {
        const targetRoot = toPc(r + 7);
        const next = timeline[i + 1];
        if (next && next.label) {
          const nextRoot = this.parseRoot(next.label);
          if (nextRoot >= 0 && nextRoot === targetRoot && this.inKey(targetRoot, key.root, key.minor)) {
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


  recognizeProgressionPattern(recentChords, key) {
    if (!recentChords || recentChords.length < 2) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const degrees = recentChords.map(chord => {
      if (!chord || !chord.label) return null;
      const root = this.parseRoot(chord.label);
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
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const lastChord = recentChords[recentChords.length - 1];
    if (!lastChord || !lastChord.label) return null;
    
    const lastRoot = this.parseRoot(lastChord.label);
    if (lastRoot < 0) return null;

    const predictions = [];

    const progression = this.recognizeProgressionPattern(recentChords, key);
    if (progression && progression.next !== null) {
      const deg = progression.next;
      const targetRoot = toPc(key.root + scale[deg - 1]);
      predictions.push({ root: targetRoot, label: this.getNoteName(targetRoot, key), confidence: progression.strength });
    }

    const fifthUp = toPc(lastRoot + 7);
    const fifthDown = toPc(lastRoot - 7);

    if (this.inKey(fifthUp, key.root, key.minor)) {
      predictions.push({ root: fifthUp, label: this.getNoteName(fifthUp, key), confidence: 0.7 });
    }
    if (this.inKey(fifthDown, key.root, key.minor)) {
      predictions.push({ root: fifthDown, label: this.getNoteName(fifthDown, key), confidence: 0.6 });
    }

    const stepUp = toPc(lastRoot + 2);
    const stepDown = toPc(lastRoot - 2);
    if (this.inKey(stepUp, key.root, key.minor)) {
      predictions.push({ root: stepUp, label: this.getNoteName(stepUp, key), confidence: 0.5 });
    }
    if (this.inKey(stepDown, key.root, key.minor)) {
      predictions.push({ root: stepDown, label: this.getNoteName(stepDown, key), confidence: 0.5 });
    }

    const map = new Map();
    for (const p of predictions) {
      if (!map.has(p.root) || map.get(p.root).confidence < p.confidence) {
        map.set(p.root, p);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  enrichTimelineWithTheory(timeline, feats, key) {
    const enriched = [];
    const recent = [];
    const MEMORY = 5;

    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      if (!chord || !chord.label) continue;
      
      const analyzed = { ...chord };

      if (recent.length >= 2) {
        const prog = this.recognizeProgressionPattern(recent, key);
        if (prog) analyzed.recognizedProgression = prog.name;
      }

      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      if (next && next.label) {
        const preds = this.predictNextChord(recent.concat([analyzed]), key);
        if (preds && preds.length) {
          analyzed.predictions = preds;
          const nextRoot = this.parseRoot(next.label);
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

  computePredictionAccuracy(timeline) {
    const withPred = timeline.filter(c => c && c.predictions && c.predictions.length);
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
        if (!chord || !chord.label) continue;
        const root = this.parseRoot(chord.label);
        if (root >= 0 && this.inKey(root, lastKey.root, lastKey.minor)) {
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
            if (!chord || !chord.label) continue;
            const root = this.parseRoot(chord.label);
            if (root >= 0 && this.inKey(root, newRoot, newMinor)) {
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
    if (!label) return null;
    const rootPc = this.parseRoot(label);
    if (rootPc < 0) return null;

    const toPc = n => ((n % 12) + 12) % 12;
    const rel = toPc(rootPc - key.root);
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;

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

  inKey(pc, keyRoot, minor) {
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(iv => toPc(keyRoot + iv));
    const note = toPc(pc);

    if (diatonic.includes(note)) return true;

    if (minor) {
      const rel = toPc(pc - keyRoot);
      if (rel === 7 || rel === 11) return true;
    } else {
      const rel = toPc(pc - keyRoot);
      if (rel === 2 || rel === 10 || rel === 8) return true;
    }

    return false;
  }

  parseRoot(label) {
    if (!label || typeof label !== 'string') return -1;
    const m = label.match(/^([A-G])(#{1}|b{1})?/);
    if (!m) return -1;
    const note = m[1] + (m[2] || '');
    const sharpIndex = this.NOTES_SHARP.indexOf(note);
    if (sharpIndex >= 0) return sharpIndex;
    const flatIndex = this.NOTES_FLAT.indexOf(note);
    if (flatIndex >= 0) return flatIndex;
    return -1;
  }

  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  getNoteName(pc, key) {
    const toPc = n => ((n % 12) + 12) % 12;
    pc = toPc(pc);
    const keyRoot = key.root;
    const keyMinor = !!key.minor;

    const sharpMaj = [7,2,9,4,11,6,1];
    const sharpMin = [4,11,6,1,8,3,10];
    const flatMaj = [5,10,3,8,1,6,11];
    const flatMin = [2,7,0,5,10,3,8];

    let useFlats = false;

    if (keyMinor) {
      useFlats = flatMin.includes(keyRoot);
    } else {
      useFlats = flatMaj.includes(keyRoot);
    }

    if (keyRoot === 0 && !keyMinor) {
      if ([10,3,8].includes(pc)) useFlats = true;
    }

    return useFlats ? this.NOTES_FLAT[pc] : this.NOTES_SHARP[pc];
  }

  mixStereo(audioBuffer) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const len = Math.min(left.length, right.length);
    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      mono[i] = 0.5 * (left[i] + right[i]);
    }
    return mono;
  }

  resampleLinear(samples, fromRate, toRate) {
    if (!samples || fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLength = Math.max(1, Math.floor(samples.length / ratio));
    const resampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const i0 = Math.floor(srcIndex);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const t = srcIndex - i0;
      resampled[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }

    return resampled;
  }

  percentile(arr, p) {
    const a = (arr || []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return 0;
    const idx = Math.floor((p / 100) * (a.length - 1));
    return a[idx];
  }

  getDiatonicChords(tonic, mode) {
    const tonicPc = this.NOTES_SHARP.indexOf(tonic);
    if (tonicPc < 0) return [];
    const toPc = n => ((n % 12) + 12) % 12;
    const scale = mode === 'minor' ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const qualities = mode === 'minor' ? ['m','dim','','m','m','',''] : ['','m','m','','','m','dim'];
    return scale.map((deg, i) => {
      const pc = toPc(tonicPc + deg);
      return this.NOTES_SHARP[pc] + qualities[i];
    });
  }

}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
