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
 * Render beat timeline to HTML - Compact sheet music style
 * @param {Array} lines - Lines with beats
 * @param {Boolean} isRTL - Right-to-left language
 * @returns {String} HTML
 */
function renderBeatTimeline(lines, isRTL) {
  let html = '';
  
  for(const line of lines) {
    const beats = isRTL ? [...line.beats].reverse() : line.beats;
    
    // Collect only non-empty beats
    const items = [];
    for(const beat of beats) {
      if(beat.chord || beat.word) {
        items.push({
          chord: beat.chord || '',
          word: beat.word || '',
          hasChord: !!beat.chord,
          hasWord: !!beat.word
        });
      }
    }
    
    // Skip completely empty lines
    if(items.length === 0) continue;
    
    // Build chord and lyric lines
    let chordLine = '';
    let lyricLine = '';
    
    for(const item of items) {
      const chordText = item.hasChord ? item.chord : '';
      const wordText = item.hasWord ? item.word : '___';
      
      // Pad to align properly
      const maxLen = Math.max(chordText.length, wordText.length, 3);
      chordLine += chordText.padEnd(maxLen + 2, ' ');
      lyricLine += wordText.padEnd(maxLen + 2, ' ');
    }
    
    // Add to HTML if not empty
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
