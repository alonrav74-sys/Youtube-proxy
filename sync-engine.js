// Sync Engine v4 - Fixed RTL/LTR Alignment
// מנוע סנכרון משופר עם יישור נכון לעברית/אנגלית

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
  console.log('🎼 Building beat-based timeline v4...');
  console.log(`   Words: ${words.length}, Chords: ${chords.length}`);
  console.log(`   BPM: ${bpm}, RTL: ${isRTL}, Gate: ${gateOffset.toFixed(2)}s`);
  
  if(!words || words.length === 0) {
    console.warn('⚠️ No words provided!');
    return createChordOnlyLines(chords, isRTL);
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
  
  // Build chord-word pairs
  const pairs = [];
  
  for(const word of offsetWords) {
    const wordTime = word.start;
    
    // Find the active chord at this word's time
    let activeChord = null;
    for(let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const chordEnd = nextChord ? nextChord.t : (wordTime + 100);
      
      if(chord.t <= wordTime && wordTime < chordEnd) {
        activeChord = chord.label;
        break;
      }
    }
    
    pairs.push({
      time: wordTime,
      chord: activeChord,
      word: word.text
    });
  }
  
  // Add chord-only entries for chords without nearby words
  for(const chord of chords) {
    const hasNearbyWord = offsetWords.some(w => 
      Math.abs(w.start - chord.t) < 0.15
    );
    
    if(!hasNearbyWord) {
      pairs.push({
        time: chord.t,
        chord: chord.label,
        word: null
      });
    }
  }
  
  // Sort by time
  pairs.sort((a, b) => a.time - b.time);
  
  console.log(`   Created ${pairs.length} chord-word pairs`);
  
  // Group into lines (fewer items per line for RTL)
  const lines = groupIntoLines(pairs, isRTL);
  
  console.log(`   Created ${lines.length} lines`);
  return lines;
}

/**
 * Group pairs into display lines
 */
function groupIntoLines(pairs, isRTL) {
  const lines = [];
  const itemsPerLine = isRTL ? 4 : 6; // Fewer items for RTL = more readable
  
  for(let i = 0; i < pairs.length; i += itemsPerLine) {
    const linePairs = pairs.slice(i, i + itemsPerLine);
    
    if(linePairs.length > 0) {
      lines.push({
        startTime: linePairs[0].time,
        pairs: linePairs
      });
    }
  }
  
  return lines;
}

/**
 * Create lines with chords only (fallback when no lyrics)
 */
function createChordOnlyLines(chords, isRTL) {
  console.log('   Creating chord-only lines (no lyrics)');
  
  const lines = [];
  const chordsPerLine = isRTL ? 4 : 6;
  
  for(let i = 0; i < chords.length; i += chordsPerLine) {
    const lineChords = chords.slice(i, i + chordsPerLine);
    
    lines.push({
      startTime: lineChords[0].t,
      pairs: lineChords.map(ch => ({
        time: ch.t,
        chord: ch.label,
        word: null
      }))
    });
  }
  
  return lines;
}

/**
 * Render beat timeline to HTML with proper RTL/LTR formatting
 * @param {Array} lines - Lines with pairs
 * @param {Boolean} isRTL - Right-to-left language
 * @returns {String} HTML
 */
function renderBeatTimeline(lines, isRTL) {
  console.log(`🎨 Rendering ${lines.length} lines to HTML (RTL: ${isRTL})...`);
  
  if(!lines || lines.length === 0) {
    console.error('❌ No lines to render!');
    return '<div style="color:#f00;padding:20px">❌ אין תוכן להצגה</div>';
  }
  
  let html = '';
  let totalChords = 0;
  let totalWords = 0;
  
  for(const line of lines) {
    if(!line || !line.pairs || line.pairs.length === 0) continue;
    
    // For RTL, reverse the order
    const pairs = isRTL ? [...line.pairs].reverse() : line.pairs;
    
    // Build arrays for chords and words
    const chordParts = [];
    const wordParts = [];
    
    for(const pair of pairs) {
      const chord = pair.chord || '';
      const word = pair.word || '';
      
      if(chord) totalChords++;
      if(word) totalWords++;
      
      // Determine display word
      const displayWord = word || (chord ? '___' : '');
      
      // Calculate width for alignment
      const maxWidth = Math.max(
        getDisplayWidth(chord),
        getDisplayWidth(displayWord),
        3
      );
      
      chordParts.push(padText(chord, maxWidth, isRTL));
      wordParts.push(padText(displayWord, maxWidth, isRTL));
    }
    
    // Join with spacing
    const chordLine = chordParts.join('  ');
    const wordLine = wordParts.join('  ');
    
    // Add to HTML
    if(chordLine.trim().length > 0 || wordLine.trim().length > 0) {
      html += `<div class="chord-line">${chordLine}</div>\n`;
      html += `<div class="lyric-line">${wordLine}</div>\n`;
    }
  }
  
  console.log(`✅ Rendered ${totalChords} chords, ${totalWords} words`);
  
  if(html.length === 0) {
    return '<div style="color:#f00;padding:20px">❌ לא נוצר תוכן</div>';
  }
  
  return html;
}

/**
 * Get display width of text (approximate, for Hebrew vs English)
 */
function getDisplayWidth(text) {
  if(!text) return 0;
  // Hebrew characters are typically wider
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  return text.length * (hasHebrew ? 1.3 : 1.0);
}

/**
 * Pad text to width
 */
function padText(text, width, isRTL) {
  if(!text) text = '';
  const currentWidth = getDisplayWidth(text);
  const padding = Math.max(0, Math.ceil(width - currentWidth));
  
  // For RTL, pad on the left; for LTR, pad on the right
  if(isRTL) {
    return ' '.repeat(padding) + text;
  } else {
    return text + ' '.repeat(padding);
  }
}

// 🔧 Wrapper object for compatibility with existing code
const SyncEngine = {
  /**
   * Sync chords with lyrics - wrapper for buildBeatTimeline
   */
  syncChordsWithLyrics(state, words, capo, sanitizeLabel, applyCapoToLabel) {
    if(!state || !state.timeline) return [];
    
    const isRTL = /[\u0590-\u05FF]/.test((words[0]?.word || words[0]?.text || ''));
    const gateOffset = state.gateTime || 0;
    
    // Apply capo to chords
    const chordsWithCapo = state.timeline.map(ch => ({
      ...ch,
      label: sanitizeLabel(applyCapoToLabel(ch.label, capo))
    }));
    
    return buildBeatTimeline(
      words,
      chordsWithCapo,
      state.bpm || 120,
      { numerator: 4, denominator: 4 },
      isRTL,
      gateOffset
    );
  },
  
  /**
   * Refresh sheet tab view - wrapper for renderBeatTimeline
   */
  refreshSheetTabView(state, words, text, language, capo, sanitizeLabel, applyCapoToLabel, sheetEl) {
    if(!state || !state.timeline) {
      sheetEl.textContent = '—';
      return;
    }
    
    const isRTL = language === 'he' || /[\u0590-\u05FF]/.test(text || '');
    const gateOffset = state.gateTime || 0;
    
    // Apply capo to chords
    const chordsWithCapo = state.timeline.map(ch => ({
      ...ch,
      label: sanitizeLabel(applyCapoToLabel(ch.label, capo))
    }));
    
    // Build timeline
    const lines = buildBeatTimeline(
      words || [],
      chordsWithCapo,
      state.bpm || 120,
      { numerator: 4, denominator: 4 },
      isRTL,
      gateOffset
    );
    
    // Render to HTML
    const html = renderBeatTimeline(lines, isRTL);
    
    // Set class and content
    sheetEl.className = `synced-sheet ${isRTL ? 'rtl' : 'ltr'}`;
    sheetEl.innerHTML = html;
  }
};

// Export to global scope
if(typeof window !== 'undefined') {
  window.buildBeatTimeline = buildBeatTimeline;
  window.renderBeatTimeline = renderBeatTimeline;
  window.SyncEngine = SyncEngine;
  console.log('✅ Sync Engine v4 loaded successfully (with SyncEngine wrapper)');
}

if(typeof module !== 'undefined' && module.exports) {
  module.exports = { buildBeatTimeline, renderBeatTimeline, SyncEngine };
}
