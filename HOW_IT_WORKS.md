# 🎸 ChordFinder Pro v26 - How It Works

## 📋 Table of Contents
1. [Overview](#overview)
2. [Input Processing](#input-processing)
3. [Feature Extraction](#feature-extraction)
4. [Key Detection](#key-detection)
5. [HMM Chord Tracking](#hmm-chord-tracking)
6. [Scoring System](#scoring-system)
7. [Post-Processing](#post-processing)

---

## 🎯 Overview

ChordFinder Pro uses a **Hidden Markov Model (HMM)** with **chroma features** to detect chords in audio files.

**Key Philosophy:**
- **Chroma is PRIMARY** - the audio signal is the most important
- **Diatonic is SECONDARY** - music theory provides a gentle nudge
- **Simple is better** - avoid over-engineering

---

## 📥 Input Processing

### Step 1: Audio Preparation
```javascript
// Convert stereo to mono
mono = (left + right) / 2

// Resample to 22,050 Hz (standard for music analysis)
audio = resample(mono, 44100 → 22050)

// Estimate BPM (for timing/filtering later)
bpm = estimateTempo(audio)
```

---

## 🔊 Feature Extraction

### Chroma Vectors (12-dimensional)
**What:** Energy distribution across 12 pitch classes (C, C#, D, ..., B)

**How:**
```javascript
// For each 100ms frame:
1. Apply Hann window
2. FFT → frequency spectrum
3. Map frequencies to pitch classes (mod 12)
4. Normalize to sum = 1.0

Result: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
Example: [0.25, 0.02, 0.15, 0.01, 0.20, 0.18, 0.01, 0.22, 0.03, 0.12, 0.01, 0.05]
         ^^^^                     ^^^^     ^^^^            ^^^^
         High energy = chord tones
```

**Chroma tells us:**
- Which notes are present (energy > 0.10)
- Which chord is playing (by matching templates)

---

### Bass Detection (F0 Estimation)
**What:** The lowest fundamental frequency (bass note)

**How:**
```javascript
1. Low-pass filter (keep only 40-250 Hz)
2. Autocorrelation to find periodicity
3. Convert frequency → MIDI → pitch class (0-11)

Example:
- F0 = 98 Hz → MIDI 43 (G2) → Pitch class 7 (G)
- F0 = 110 Hz → MIDI 45 (A2) → Pitch class 9 (A)
```

**Bass tells us:**
- Which note is in the bass (for inversions)
- Validation of chord root (if bass matches root → boost)

**Filtering:**
```javascript
// Remove unstable bass detections:
if (bass[i] < 0 OR 
    energy[i] < threshold OR 
    bass[i-1] ≠ bass[i] AND bass[i+1] ≠ bass[i]) {
    bass[i] = -1  // Mark as unreliable
}
```

---

### Frame Energy
**What:** Total signal energy per frame

**How:**
```javascript
energy[i] = sum(frame[n]²)
```

**Energy tells us:**
- Which frames are actual music vs silence
- Filter weak frames that might be noise

---

## 🎹 Key Detection

### Overview
Determines the musical key (e.g., "C Major", "A Minor")

### Two-Stage Process:

#### Stage 1: Bass-Based Tonic Detection
```javascript
// Count bass notes (weighted by energy):
for each frame i:
    if bassPc[i] >= 0 AND energy[i] >= threshold:
        bassHistogram[bassPc[i]] += energy[i]

// Most common bass note = tonic root
tonicRoot = argmax(bassHistogram)
confidence = max(bassHistogram) / sum(bassHistogram)
```

**Bass hint for major/minor:**
```javascript
// Check which intervals appear in bass:
m3_bass = histogram[root + 3]  // minor third
M3_bass = histogram[root + 4]  // major third
m6_bass = histogram[root + 8]  // minor sixth
M6_bass = histogram[root + 9]  // major sixth

// Score:
if (m6_bass > threshold) minorScore += 3
if (M6_bass > threshold) majorScore += 3
// ... etc

minorHint = (minorScore > majorScore)
```

#### Stage 2: Chroma-Based Mode Detection
```javascript
// Aggregate chroma (weighted by energy):
aggChroma = weighted_sum(chroma[i] * energy[i])

// Compare thirds:
m3 = aggChroma[root + 3]  // minor third
M3 = aggChroma[root + 4]  // major third

thirdRatio = m3 / M3

if (thirdRatio >= 1.03):
    minorScore += 5.0  // m3 stronger → minor key
else if (thirdRatio <= 0.97):
    majorScore += 5.0  // M3 stronger → major key

// Check sixths and sevenths similarly...

isMinor = (minorScore > majorScore)
```

**Why both stages?**
- Bass gives us the **root** (tonic pitch class)
- Chroma gives us the **mode** (major vs minor)

---

## 🎼 HMM Chord Tracking

### Candidate Generation
```javascript
// Create 24 candidates (12 roots × 2 modes):
for root = 0 to 11:
    candidates.push({ root, label: "C", type: "major" })
    candidates.push({ root, label: "Cm", type: "minor" })

// Example candidates:
// { root: 0, label: "C", type: "major" }
// { root: 0, label: "Cm", type: "minor" }
// { root: 1, label: "C#", type: "major" }
// { root: 1, label: "C#m", type: "minor" }
// ...
```

### Diatonic Chord Table
**For C Major:**
```javascript
diatonicChords = [
    { root: 0 (C),  mode: 'major' },     // I
    { root: 2 (D),  mode: 'minor' },     // ii
    { root: 4 (E),  mode: 'minor' },     // iii
    { root: 5 (F),  mode: 'major' },     // IV
    { root: 7 (G),  mode: 'major' },     // V
    { root: 9 (A),  mode: 'minor' },     // vi
    { root: 11 (B), mode: 'diminished' } // vii°
]
```

**For A Minor:**
```javascript
diatonicChords = [
    { root: 9 (A),  mode: 'minor' },     // i
    { root: 11 (B), mode: 'diminished' },// ii°
    { root: 0 (C),  mode: 'major' },     // III
    { root: 2 (D),  mode: 'minor' },     // iv
    { root: 4 (E),  mode: 'minor' },     // v
    { root: 5 (F),  mode: 'major' },     // VI
    { root: 7 (G),  mode: 'major' }      // VII
]
```

### Flag Computation
For each candidate:

```javascript
// 1. Is root diatonic?
cand.diatonic = (cand.root in diatonicPitchClasses)

// 2. Is BOTH root AND mode correct? (perfectDiatonic)
cand.perfectDiatonic = diatonicChords.some(dc =>
    dc.root === cand.root AND
    dc.mode === cand.type
)

// Example in C Major:
// Am: root=9 (diatonic) + mode=minor (correct) → perfectDiatonic = TRUE
// A:  root=9 (diatonic) + mode=major (wrong!)  → perfectDiatonic = FALSE

// 3. Is this chord borrowed? (wrong mode)
cand.borrowed = !cand.perfectDiatonic
```

### Chord Templates
```javascript
// Major chord: root, major third, fifth
major = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
         C           E        G

// Minor chord: root, minor third, fifth
minor = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]
         C        Eb       G
```

---

## 🎯 Scoring System

### Emission Score (How well does chord match frame?)

```javascript
function emitScore(frameIndex i, candidate cand):
    chroma_i = chroma[i]              // [C, C#, D, ..., B]
    template = chordTemplates[cand.label]  // [1,0,0,0,1,0,0,1,0,0,0,0] for C major
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Chroma Match (PRIMARY SIGNAL)
    // ═══════════════════════════════════════════════════════════════
    score = dot(chroma_i, template) / (norm(chroma_i) * norm(template))
    
    // This is cosine similarity: how similar is the chroma to the template?
    // Range: 0.0 (no match) to 1.0 (perfect match)
    
    // Example for C major chord:
    // chroma = [0.25, 0.02, 0.15, 0.01, 0.20, 0.18, 0.01, 0.22, 0.03, 0.12, 0.01, 0.05]
    //           ^^^^                     ^^^^                  ^^^^
    //           C (strong)               E (strong)            G (strong)
    // 
    // template = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
    // 
    // dot product = 0.25*1 + 0.20*1 + 0.22*1 = 0.67
    // normalized score ≈ 0.45
    
    // ✅ HARD THRESHOLD: Reject weak matches
    if (score < 0.35):
        return -Infinity  // Not this chord!
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Diatonic Boost (SECONDARY SIGNAL)
    // ═══════════════════════════════════════════════════════════════
    // Small boost/penalty based on music theory
    
    if (!cand.borrowed):
        score += 0.20   // ✅ Diatonic (correct mode) → small boost
    else:
        score -= 0.25   // ❌ Borrowed (wrong mode) → penalty
    
    // Example in C Major:
    // - Am (perfectDiatonic): score += 0.20
    // - A (borrowed):         score -= 0.25
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Bass Validation (TERTIARY SIGNAL)
    // ═══════════════════════════════════════════════════════════════
    if (bassPc[i] >= 0 AND bassPc[i] === cand.root):
        score += 0.15 * bassMultiplier  // Bass matches root → boost
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Energy Filter
    // ═══════════════════════════════════════════════════════════════
    if (energy[i] < lowEnergyThreshold):
        score -= 0.30  // Weak signal → penalize
    
    return score
```

### Real Example: C Major key, comparing Am vs A

**Frame chroma:**
```
[0.28, 0.02, 0.15, 0.01, 0.19, 0.12, 0.01, 0.22, 0.03, 0.45, 0.01, 0.05]
 C            D            F                 G            A
```

**Am candidate (root=9, type=minor):**
```javascript
// Template: [0,0,0,0,0,0,0,0,0,1,0,0] (A root)
//         + [0,0,0,1,0,0,0,0,0,0,0,0] (C - minor third)
//         + [0,0,0,0,0,0,0,1,0,0,0,0] (E - perfect fifth)
//         = [0,0,0,1,0,0,0,1,0,1,0,0]

chroma_score = cosine_similarity(chroma, template) ≈ 0.48

diatonic_boost:
  - root = 9 (A) → in C Major scale ✓
  - mode = minor → Am is vi in C Major ✓
  - perfectDiatonic = TRUE
  - borrowed = FALSE
  → +0.20

bass_boost:
  - bassPc[i] = 9 (A detected in bass)
  - cand.root = 9 (Am)
  → +0.15

energy_penalty:
  - energy[i] = 0.85 (strong signal)
  - threshold = 0.50
  → 0.00 (no penalty)

TOTAL = 0.48 + 0.20 + 0.15 = 0.83 ✅
```

**A candidate (root=9, type=major):**
```javascript
// Template: [0,0,0,0,0,0,0,0,0,1,0,0] (A root)
//         + [0,0,0,0,1,0,0,0,0,0,0,0] (C# - major third)
//         + [0,0,0,0,0,0,0,1,0,0,0,0] (E - perfect fifth)
//         = [0,0,0,0,1,0,0,1,0,1,0,0]

chroma_score = cosine_similarity(chroma, template) ≈ 0.42
  // Lower because C# (index 1) has low energy (0.02)
  // but template expects it high

diatonic_boost:
  - root = 9 (A) → in C Major scale ✓
  - mode = major → A is NOT in C Major (should be Am)
  - perfectDiatonic = FALSE
  - borrowed = TRUE
  → -0.25 ❌

bass_boost:
  - bassPc[i] = 9
  - cand.root = 9
  → +0.15

energy_penalty: 0.00

TOTAL = 0.42 - 0.25 + 0.15 = 0.32 ❌
```

**Winner: Am (0.83) beats A (0.32)!** ✅

---

### Transition Cost (How likely is chord progression?)

```javascript
function transitionCost(chordA, chordB):
    if (chordA.label === chordB.label):
        return 0.0  // Same chord → no cost
    
    // ═══════════════════════════════════════════════════════════════
    // CIRCLE OF FIFTHS DISTANCE
    // ═══════════════════════════════════════════════════════════════
    circle = [C, G, D, A, E, B, F#, C#, G#, D#, A#, F]
    //        0  1  2  3  4  5  6   7   8   9   10  11
    
    posA = circle.indexOf(chordA.root)
    posB = circle.indexOf(chordB.root)
    circleDist = min(|posA - posB|, 12 - |posA - posB|)
    
    // Closer on circle = more common progression
    // Example: C → G (circleDist = 1) vs C → F# (circleDist = 6)
    
    // ═══════════════════════════════════════════════════════════════
    // CHROMATIC DISTANCE
    // ═══════════════════════════════════════════════════════════════
    chromDist = min(|rootA - rootB|, 12 - |rootA - rootB|)
    
    // ═══════════════════════════════════════════════════════════════
    // BASE COST
    // ═══════════════════════════════════════════════════════════════
    cost = 0.4 + 0.08 * (circleDist * 0.85 + chromDist * 0.15)
    
    // Mode change penalty:
    if (chordA.type !== chordB.type):
        cost += 0.05
    
    // ═══════════════════════════════════════════════════════════════
    // COMMON PROGRESSIONS (reduce cost)
    // ═══════════════════════════════════════════════════════════════
    I = key.root
    V = (key.root + scale[4]) % 12
    IV = (key.root + scale[3]) % 12
    
    if (chordA.root === V AND chordB.root === I):
        cost -= 0.15  // V → I (perfect cadence)
    
    if (chordA.root === IV AND chordB.root === V):
        cost -= 0.12  // IV → V
    
    // Perfect fifth up (any chords):
    if ((chordB.root - chordA.root + 12) % 12 === 7):
        cost -= 0.08
    
    return max(0.0, cost)
```

**Examples:**
```
C → G:    circleDist=1 → cost ≈ 0.48, then -0.08 (fifth) → 0.40 ✅ (common)
C → F#:   circleDist=6 → cost ≈ 0.88 ❌ (uncommon)
G → C:    V → I → cost ≈ 0.40 - 0.15 → 0.25 ✅✅ (cadence!)
C → Cm:   same root, mode change → cost ≈ 0.45 (acceptable)
```

---

### Viterbi Algorithm (HMM Decoding)

**Goal:** Find the most likely sequence of chords

```javascript
// Dynamic Programming:
for each frame i:
    for each candidate state s:
        // Find best previous state:
        bestScore = -Infinity
        for each previous state j (beam search - top 8):
            score = dp[i-1][j]                          // Previous score
                  - transitionCost(state[j], state[s])  // Transition
                  + emitScore(i, state[s])              // Observation
            
            if (score > bestScore):
                bestScore = score
                bestPrev[i][s] = j
        
        dp[i][s] = bestScore

// Backtrack to find best path:
bestFinal = argmax(dp[lastFrame])
path = backtrack(bestFinal)
```

**Beam search:** Only consider top 8 candidates at each step (efficiency)

---

## 🔧 Post-Processing

### 1. Timeline Finalization

**Snap to Beat Grid:**
```javascript
beatDuration = 60 / bpm
for each event:
    gridTime = round(event.t / beatDuration) * beatDuration
    if (|gridTime - event.t| < 0.35 * beatDuration):
        event.t = gridTime  // Snap to grid
```

**Filter Short Chords:**
```javascript
minDuration = max(0.5, 0.50 * beatDuration)
for each event:
    if (duration < minDuration AND energy < threshold):
        remove event  // Too short and weak → noise
```

**Merge Duplicates:**
```javascript
for each consecutive pair:
    if (chord[i].label === chord[i+1].label):
        merge into single event
```

---

### 2. Enforce Early Diatonic

**Force tonic in intro:**
```javascript
earlyWindow = max(15.0, 6 * beatDuration)

for each event where t <= earlyWindow:
    if (root not diatonic):
        // First 3 seconds → FORCE tonic
        if (t < min(3.0, 2.0 * beatDuration)):
            event.label = tonicChord
```

**Why?** Intro often has noise, silence, or percussion only.

---

### 3. Decorate Qualities (7ths, 9ths, sus, etc.)

```javascript
for each event:
    // Average chroma around this chord:
    avgChroma = average(chroma[event.fi - 2 : event.fi + 2])
    
    // Check for extensions:
    root = event.root
    
    // Dominant 7th:
    if (avgChroma[root + 10] > 0.16):  // b7
        event.label += "7"
    
    // Major 7th:
    if (avgChroma[root + 11] > 0.20 AND avgChroma[root + 11] > avgChroma[root + 10] * 1.2):
        event.label += "maj7"
    
    // Sus4:
    if (avgChroma[root + 5] > 0.22 AND avgChroma[root + 5] > avgChroma[root + 2]):
        event.label = rootName + "sus4"
    
    // 6th:
    if (avgChroma[root + 9] > 0.18 AND avgChroma[root + 9] > avgChroma[root + 10] * 1.2):
        event.label += "6"
```

---

### 4. Add Inversions

```javascript
for each event:
    bass = bassPc[event.fi]
    if (bass < 0 OR bass === event.root):
        continue  // No inversion
    
    // Check if bass is a chord tone:
    chordTones = getChordTones(event.label)  // [0, 4, 7] for major
    if (bass in chordTones):
        // Bass is stable (appears in 3+ consecutive frames):
        if (countConsecutive(bass, event.fi) >= 3):
            bassName = getNoteName(bass)
            event.label += "/" + bassName  // e.g., "C/E"
```

---

## 📊 Summary of Decision Rules

### Priority Hierarchy:

1. **Chroma (PRIMARY - 67%)**
   - Must pass 0.35 threshold
   - Dot product with chord template
   - This is THE decisive factor

2. **Diatonic (SECONDARY - 33%)**
   - perfectDiatonic → +0.20
   - borrowed → -0.25
   - Gentle nudge, not decisive

3. **Bass (TERTIARY - 25% of diatonic)**
   - If matches root → +0.15
   - Validates chord choice

4. **Energy (FILTER)**
   - If weak → -0.30
   - Removes noise

5. **Transitions (SMOOTHING)**
   - Prefers common progressions
   - Prevents rapid changes

---

## 🎸 Example: Complete Analysis

**Input:** C Major song, frame with Am chord

**Audio Features:**
```
chroma = [0.28, 0.02, 0.15, 0.01, 0.19, 0.12, 0.01, 0.22, 0.03, 0.45, 0.01, 0.05]
         C            D            F                 G            A
bassPc = 9 (A)
energy = 0.85
```

**Candidates:**
| Candidate | Chroma | Diatonic | Bass | Energy | Total |
|-----------|--------|----------|------|--------|-------|
| **Am**    | 0.48   | +0.20    | +0.15| 0.00   | **0.83** ✅ |
| A         | 0.42   | -0.25    | +0.15| 0.00   | 0.32 |
| Dm        | 0.35   | +0.20    | 0.00 | 0.00   | 0.55 |
| Em        | 0.38   | +0.20    | 0.00 | 0.00   | 0.58 |
| C         | 0.41   | +0.20    | 0.00 | 0.00   | 0.61 |

**Winner:** Am with score 0.83!

**Why Am wins:**
- ✅ Chroma: Strong match (0.48) - C, E, A all present
- ✅ Diatonic: perfectDiatonic in C Major (+0.20)
- ✅ Bass: A in bass matches root (+0.15)
- ✅ Total: 0.83 - clear winner!

**Why A loses:**
- ⚠️ Chroma: Weaker (0.42) - C# expected but not present
- ❌ Diatonic: borrowed (wrong mode) (-0.25)
- ✅ Bass: A in bass matches (+0.15)
- ❌ Total: 0.32 - much lower!

---

## 🔍 Key Takeaways

1. **Chroma dominates** - if audio doesn't match, theory can't save it
2. **Diatonic is a nudge** - helps choose between close matches
3. **Bass validates** - confirms chord identity
4. **Simple is robust** - complex logic introduced bugs
5. **Threshold matters** - 0.35 filters noise effectively

This is v14.36 logic - **proven to work!** ✅
