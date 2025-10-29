// Sync Engine v3 - Improved Chord-Lyric Synchronization
// מנוע סנכרון משופר בין אקורדים למילים

/**
 * Build beat-based timeline with precise chord-lyric alignment
 * @param {Array} words - Whisper words with timestamps
 * @param {Array} chords - Chord timeline with timestamps  
 * @param {Number} bpm - Beats per minute
 * @param {Object} timeSignature - {numerator, denominator}
 * @param {Boolean} isRTL - Right-to-left language
 * @param {Number} gateOffset - Start gate offset in seconds
 * @returns {Array} lines - Array of lines with beats
 */
function buildBeatTimeline(words, chords, bpm, timeSignature, isRTL, gateOffset) {
  console.log('🎼 Building beat-based timeline v3...');
  console.log(`   Words: ${words.length}, Chords: ${chords.length}`);
  console.log(`   BPM: ${bpm}, Time Sig: ${timeSignature.numerator}/${timeSignature.denominator}`);
  console.log(`   RTL: ${isRTL}, Gate Offset: ${gateOffset.toFixed(2)}s`);
  
  if(!words || words.length === 0) {
    console.warn('⚠️ No words provided!');
    return createChordOnlyLines(chords, bpm, timeSignature);
  }
  
  if(!chords || chords.length === 0) {
    console.warn('⚠️ No chords provided!');
    return [];
  }
  
  // Apply gate offset to words
  const offsetWords = words.map(w => ({
    ...w,
    start: w.start + gateOffset,
    end: (w.end || w.start + 0.2) + gateOffset,
    text: (w.word || w.text || '').trim()
  })).filter(w => w.text.length > 0);
  
  console.log(`   After offset: ${offsetWords.length} words`);
  if(offsetWords.length > 0) {
    console.log(`   First word: "${offsetWords[0].text}" at ${offsetWords[0].start.toFixed(2)}s`);
  }
  
  // Create timeline with both chords and words
  const timeline = [];
  
  // Process each word and find matching chord
  for(const word of offsetWords) {
    const wordTime = word.start;
    
    // Find the chord that's active at this word's time
    let activeChord = null;
    for(let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const chordEnd = nextChord ? nextChord.t : (wordTime + 10);
      
      if(chord.t <= wordTime && wordTime < chordEnd) {
        activeChord = chord.label;
        break;
      }
    }
    
    timeline.push({
      time: wordTime,
      word: word.text,
      chord: activeChord,
      type: 'word'
    });
  }
  
  // Add chords that don't have words (spacers)
  for(const chord of chords) {
    const chordTime = chord.t;
    
    // Check if there's a word near this chord (within 200ms)
    const hasNearbyWord = offsetWords.some(w => 
      Math.abs(w.start - chordTime) < 0.2
    );
    
    if(!hasNearbyWord) {
      timeline.push({
        time: chordTime,
        word: null,
        chord: chord.label,
        type: 'chord-only'
      });
    }
  }
  
  // Sort by time
  timeline.sort((a, b) => a.time - b.time);
  
  console.log(`   Timeline has ${timeline.length} events`);
  console.log(`   First 3 events:`, timeline.slice(0, 3));
  
  // Group into lines
  const lines = groupIntoLines(timeline, isRTL);
  
  console.log(`   Created ${lines.length} lines`);
  return lines;
}

/**
 * Group timeline events into display lines
 */
function groupIntoLines(timeline, isRTL) {
  const lines = [];
  const itemsPerLine = isRTL ? 6 : 8;
  
  for(let i = 0; i < timeline.length; i += itemsPerLine) {
    const lineItems = timeline.slice(i, i + itemsPerLine);
    
    if(lineItems.length > 0) {
      lines.push({
        startTime: lineItems[0].time,
        beats: lineItems.map(item => ({
          time: item.time,
          chord: item.chord || null,
          word: item.word || null,
          isSpacer: item.type === 'chord-only'
        }))
      });
    }
  }
  
  return lines;
}

/**
 * Create lines with chords only (fallback when no lyrics)
 */
function createChordOnlyLines(chords, bpm, timeSignature) {
  console.log('   Creating chord-only lines (no lyrics)');
  
  const lines = [];
  const chordsPerLine = 8;
  
  for(let i = 0; i < chords.length; i += chordsPerLine) {
    const lineChords = chords.slice(i, i + chordsPerLine);
    
    lines.push({
      startTime: lineChords[0].t,
      beats: lineChords.map(ch => ({
        time: ch.t,
        chord: ch.label,
        word: null,
        isSpacer: false
      }))
    });
  }
  
  return lines;
}

/**
 * Render beat timeline to HTML with proper formatting
 * @param {Array} lines - Lines with beats
 * @param {Boolean} isRTL - Right-to-left language
 * @returns {String} HTML
 */
function renderBeatTimeline(lines, isRTL) {
  console.log(`🎨 Rendering ${lines.length} lines to HTML...`);
  
  if(!lines || lines.length === 0) {
    console.error('❌ No lines to render!');
    return '<div style="color:#f00;padding:20px">❌ אין קווים להצגה</div>';
  }
  
  let html = '';
  let totalChords = 0;
  let totalWords = 0;
  let totalSpacers = 0;
  
  for(let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    
    if(!line || !line.beats || line.beats.length === 0) {
      console.warn(`⚠️ Line ${lineIdx} has no beats, skipping`);
      continue;
    }
    
    const beats = isRTL ? [...line.beats].reverse() : line.beats;
    
    let chordLine = '';
    let lyricLine = '';
    
    for(const beat of beats) {
      const chord = beat.chord || '';
      const word = beat.word || '';
      
      if(chord) totalChords++;
      if(word) totalWords++;
      if(beat.isSpacer) totalSpacers++;
      
      // Determine display text
      let displayWord = word;
      if(!word && chord) {
        displayWord = '___'; // Spacer for chord-only beat
      }
      
      // Calculate spacing for alignment
      const maxLen = Math.max(chord.length, displayWord.length, 4);
      const spacing = 2;
      
      chordLine += chord.padEnd(maxLen + spacing, ' ');
      lyricLine += displayWord.padEnd(maxLen + spacing, ' ');
    }
    
    // Only add non-empty lines
    if(chordLine.trim().length > 0 || lyricLine.trim().length > 0) {
      html += `<div class="chord-line">${chordLine}</div>\n`;
      html += `<div class="lyric-line">${lyricLine}</div>\n`;
    }
  }
  
  console.log(`✅ HTML generated: ${html.length} chars`);
  console.log(`   Chords: ${totalChords}, Words: ${totalWords}, Spacers: ${totalSpacers}`);
  
  if(html.length === 0) {
    console.error('❌ No HTML content generated!');
    return '<div style="color:#f00;padding:20px">❌ לא הצלחתי לייצר תוכן</div>';
  }
  
  return html;
}

// Export to global scope
if(typeof window !== 'undefined') {
  window.buildBeatTimeline = buildBeatTimeline;
  window.renderBeatTimeline = renderBeatTimeline;
  console.log('✅ Sync Engine v3 loaded successfully');
}
