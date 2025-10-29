// Sync Engine v2 - Beat-based Timeline Builder
// בונה timeline רציף לפי מקצבים (beats)

/**
 * Build simple chronological timeline (no beat grid)
 * @param {Array} words - Whisper words with timestamps
 * @param {Array} chords - Chord timeline with timestamps  
 * @param {Boolean} isRTL - Right-to-left language
 * @param {Number} gateOffset - Start gate offset in seconds
 * @returns {Array} lines - Array of lines
 */
function buildBeatTimeline(words, chords, bpm, timeSignature, isRTL, gateOffset) {
  console.log('🎼 Building chronological timeline...');
  console.log(`   Words: ${words.length}, Chords: ${chords.length}, RTL: ${isRTL}, Gate: ${gateOffset.toFixed(2)}s`);
  
  // Apply gate offset to words
  const offsetWords = words.map(w => ({
    ...w,
    start: w.start + gateOffset,
    end: (w.end || w.start + 0.1) + gateOffset,
    text: w.word || w.text || ''
  }));
  
  // Merge words and chords into events
  const events = [];
  
  // Add all chords
  for(const ch of chords) {
    events.push({
      time: ch.t,
      type: 'chord',
      chord: ch.label,
      word: null
    });
  }
  
  // Add all words
  for(const w of offsetWords) {
    events.push({
      time: w.start,
      type: 'word',
      chord: null,
      word: w.text
    });
  }
  
  // Sort by time
  events.sort((a, b) => a.time - b.time);
  
  console.log(`   Total events: ${events.length}`);
  
  // Merge close events (within 200ms)
  const merged = [];
  let i = 0;
  
  while(i < events.length) {
    const current = events[i];
    const next = events[i + 1];
    
    // Check if next event is within 200ms
    if(next && Math.abs(next.time - current.time) < 0.2) {
      // Merge them
      merged.push({
        time: current.time,
        chord: current.chord || next.chord,
        word: current.word || next.word
      });
      i += 2; // Skip both
    } else {
      // Keep as is
      merged.push({
        time: current.time,
        chord: current.chord,
        word: current.word
      });
      i++;
    }
  }
  
  console.log(`   Merged to ${merged.length} events`);
  
  // Group into lines (6-8 events per line)
  const lines = [];
  const eventsPerLine = isRTL ? 6 : 8;
  
  for(let i = 0; i < merged.length; i += eventsPerLine) {
    const lineEvents = merged.slice(i, i + eventsPerLine);
    if(lineEvents.length > 0) {
      lines.push({
        startTime: lineEvents[0].time,
        events: lineEvents
      });
    }
  }
  
  console.log(`   Created ${lines.length} lines`);
  
  // Debug: show first line
  if(lines.length > 0) {
    console.log('   First line:', lines[0]);
  }
  
  return lines;
}

/**
 * Render chronological timeline to HTML
 * @param {Array} lines - Lines with events
 * @param {Boolean} isRTL - Right-to-left language
 * @returns {String} HTML
 */
function renderBeatTimeline(lines, isRTL) {
  console.log(`🎨 Rendering ${lines.length} lines, RTL: ${isRTL}`);
  let html = '';
  let totalChords = 0;
  let totalWords = 0;
  
  for(const line of lines) {
    const events = isRTL ? [...line.events].reverse() : line.events;
    
    console.log(`   Line has ${events.length} events`);
    
    // Debug first 3 events
    for(let i = 0; i < Math.min(3, events.length); i++) {
      const ev = events[i];
      console.log(`     Event ${i}: chord="${ev.chord}", word="${ev.word}"`);
    }
    
    // Build chord and lyric lines
    let chordLine = '';
    let lyricLine = '';
    
    for(const ev of events) {
      if(ev.chord) totalChords++;
      if(ev.word) totalWords++;
      
      const chordText = ev.chord || '';
      const wordText = ev.word || '';
      
      // Skip completely empty events
      if(!chordText && !wordText) continue;
      
      // For chord-only events, show spacer
      const displayWord = wordText || (chordText ? '___' : '');
      
      // Pad to align properly
      const maxLen = Math.max(chordText.length, displayWord.length, 3);
      chordLine += chordText.padEnd(maxLen + 2, ' ');
      lyricLine += displayWord.padEnd(maxLen + 2, ' ');
    }
    
    // Add to HTML if not empty
    if(chordLine.length > 0 || lyricLine.length > 0) {
      html += `<div class="chord-line">${chordLine}</div>`;
      html += `<div class="lyric-line">${lyricLine}</div>`;
    }
  }
  
  console.log(`🎨 Generated HTML length: ${html.length} chars`);
  console.log(`🎸 Total chords rendered: ${totalChords}`);
  console.log(`🎤 Total words rendered: ${totalWords}`);
  if(html.length === 0) {
    console.error('❌ No HTML generated!');
  }
  
  return html;
}

// Export functions
if(typeof window !== 'undefined') {
  window.buildBeatTimeline = buildBeatTimeline;
  window.renderBeatTimeline = renderBeatTimeline;
  console.log('✅ Sync Engine v2 loaded');
}
