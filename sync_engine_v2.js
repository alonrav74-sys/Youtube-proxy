// Sync Engine v2 - Beat-based Timeline Builder
// בונה timeline רציף לפי מקצבים (beats)

/**
 * Build beat-based timeline for synced chord sheet
 * @param {Array} words - Whisper words with timestamps
 * @param {Array} chords - Chord timeline with timestamps  
 * @param {Number} bpm - Beats per minute
 * @param {Boolean} isRTL - Right-to-left language
 * @param {Number} gateOffset - Start gate offset in seconds
 * @returns {Array} lines - Array of lines, each with beats
 */
function buildBeatTimeline(words, chords, bpm, isRTL, gateOffset) {
  console.log('🎼 Building beat-based timeline...');
  console.log(`   BPM: ${bpm}, RTL: ${isRTL}, Gate: ${gateOffset.toFixed(2)}s`);
  
  // Calculate beat duration
  const beatDuration = 60 / bpm; // seconds per beat
  const beatsPerLine = 8; // 2 bars of 4/4
  
  // Apply gate offset to words
  const offsetWords = words.map(w => ({
    ...w,
    start: w.start + gateOffset,
    end: (w.end || w.start + 0.1) + gateOffset
  }));
  
  // Find song duration
  const lastChord = chords[chords.length - 1];
  const lastWord = offsetWords[offsetWords.length - 1];
  const duration = Math.max(
    lastChord ? lastChord.t : 0,
    lastWord ? lastWord.end : 0
  ) + beatDuration * 4; // Add 4 beats buffer
  
  // Build beat grid
  const totalBeats = Math.ceil(duration / beatDuration);
  const beats = [];
  
  for(let i = 0; i < totalBeats; i++) {
    const beatTime = i * beatDuration;
    
    // Find chord at this beat (within 200ms window)
    const chord = chords.find(ch => 
      Math.abs(ch.t - beatTime) < 0.2
    );
    
    // Find word at this beat
    const word = offsetWords.find(w => 
      beatTime >= w.start && beatTime < w.end
    );
    
    beats.push({
      index: i,
      time: beatTime,
      chord: chord ? chord.label : null,
      word: word ? (word.word || word.text) : null
    });
  }
  
  console.log(`   Created ${beats.length} beats`);
  
  // Group beats into lines
  const lines = [];
  for(let i = 0; i < beats.length; i += beatsPerLine) {
    const lineBeats = beats.slice(i, i + beatsPerLine);
    
    // Skip empty lines at the end
    const hasContent = lineBeats.some(b => b.chord || b.word);
    if(!hasContent && i > 0) continue;
    
    lines.push({
      startBeat: i,
      beats: lineBeats
    });
  }
  
  console.log(`   Created ${lines.length} lines`);
  
  return lines;
}

/**
 * Render beat timeline to HTML
 * @param {Array} lines - Lines with beats
 * @param {Boolean} isRTL - Right-to-left language
 * @returns {String} HTML
 */
function renderBeatTimeline(lines, isRTL) {
  let html = '';
  
  for(const line of lines) {
    const beats = isRTL ? [...line.beats].reverse() : line.beats;
    
    // Build chord line
    let chordLine = '';
    for(const beat of beats) {
      if(beat.chord) {
        chordLine += beat.chord.padEnd(12, ' ');
      } else {
        chordLine += '            '; // 12 spaces
      }
    }
    
    // Build lyric line
    let lyricLine = '';
    for(const beat of beats) {
      if(beat.word) {
        lyricLine += beat.word.padEnd(12, ' ');
      } else if(beat.chord) {
        lyricLine += '___         '; // Spacer for chord-only beat
      } else {
        lyricLine += '            '; // Empty beat
      }
    }
    
    // Add to HTML
    if(chordLine.trim() || lyricLine.trim()) {
      html += `<div class="chord-line">${chordLine.trimEnd()}</div>`;
      html += `<div class="lyric-line">${lyricLine.trimEnd()}</div>`;
    }
  }
  
  return html;
}

// Export functions
if(typeof window !== 'undefined') {
  window.buildBeatTimeline = buildBeatTimeline;
  window.renderBeatTimeline = renderBeatTimeline;
  console.log('✅ Sync Engine v2 loaded');
}
