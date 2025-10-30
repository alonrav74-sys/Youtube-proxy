// Sync Engine v5 - Precise Chord-Above-Word Alignment
// מנוע סנכרון מדויק עם אקורדים בדיוק מעל מילים (סגנון Ultimate Guitar)

/**
 * 🎯 Main sync function - creates chord sheet with chords above words
 */
const SyncEngine = {
  /**
   * Sync chords with lyrics for live playback
   */
  syncChordsWithLyrics(state, words, capo, sanitizeLabel, applyCapoToLabel) {
    if (!state || !state.timeline) return [];
    
    const gateOffset = state.gateTime || 0;
    const chords = state.timeline.map(ch => ({
      time: ch.t,
      label: sanitizeLabel(applyCapoToLabel(ch.label, capo))
    }));
    
    return { chords, words, gateOffset };
  },

  /**
   * 📝 Build full sheet tab view with chords above lyrics
   */
  refreshSheetTabView(state, words, text, language, capo, sanitizeLabel, applyCapoToLabel, sheetEl) {
    if (!state || !state.timeline || state.timeline.length === 0) {
      sheetEl.innerHTML = '<div style="color:#cbd5e1;padding:20px">⏳ ממתין לאקורדים...</div>';
      return;
    }
    
    const isRTL = language === 'he' || /[\u0590-\u05FF]/.test(text || '');
    const gateOffset = state.gateTime || 0;
    
    console.log(`🎼 Building sheet (RTL: ${isRTL})`);
    
    // Apply capo to all chords AND add gateOffset to time!
    const chords = state.timeline.map(ch => ({
      time: ch.t + gateOffset,
      label: sanitizeLabel(applyCapoToLabel(ch.label, capo))
    }));
    
    // Apply gateOffset to words
    const wordsWithGate = words.map(w => ({
      ...w,
      start: w.start + gateOffset,
      end: (w.end || w.start + 0.3) + gateOffset
    }));
    
    // Build the sheet
    const html = this.buildChordSheet(chords, wordsWithGate, isRTL);
    
    // Set direction and content
    sheetEl.className = `synced-sheet ${isRTL ? 'rtl' : 'ltr'}`;
    sheetEl.innerHTML = html;
    
    console.log('✅ Sheet built');
  },

  /**
   * 🏗️ Build chord sheet HTML with chords positioned above words
   */
  buildChordSheet(chords, words, isRTL) {
    if (!words || words.length === 0) {
      return '<div style="color:#cbd5e1;padding:20px">⏳ ממתין למילים...</div>';
    }
    
    // Group words into lines (words already have gateOffset applied)
    const lines = this.groupIntoLines(words, isRTL);
    
    // Build HTML for each line
    let html = '';
    for (const line of lines) {
      html += this.buildLine(line, chords, isRTL);
    }
    
    return html;
  },

  /**
   * 📋 Group words into lines (by sentences or max words)
   */
  groupIntoLines(words, isRTL) {
    const lines = [];
    let currentLine = [];
    const maxWordsPerLine = isRTL ? 6 : 8;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const text = (word.word || word.text || '').trim();
      
      if (!text) continue;
      
      // Words already have gateOffset applied (word.start + gateOffset from calling code)
      currentLine.push({
        text: text,
        time: word.start,
        end: word.end || (word.start + 0.3)
      });
      
      // Break on punctuation or max words
      const endsWithPunctuation = /[.!?,;؛،־]$/.test(text);
      const isLastWord = i === words.length - 1;
      
      if (endsWithPunctuation || currentLine.length >= maxWordsPerLine || isLastWord) {
        if (currentLine.length > 0) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
    }
    
    return lines;
  },

  /**
   * 🎨 Build single line with chords above words (Ultimate Guitar style)
   */
  buildLine(lineWords, allChords, isRTL) {
    if (!lineWords || lineWords.length === 0) return '';
    
    // Work with original word order for positioning
    const words = lineWords;
    
    // Find chords that belong to this line
    const lineStart = words[0].time;
    const lineEnd = words[words.length - 1].end;
    
    // Note: allChords[].time already includes gateOffset (added in calling function)
    const lineChords = allChords.filter(ch => 
      ch.time >= lineStart - 0.5 && ch.time <= lineEnd + 0.5
    );
    
    // Build chord positioning
    const chordPositions = [];
    const lyricText = words.map(w => w.text).join(' ');
    
    for (const chord of lineChords) {
      // Find which word this chord belongs to
      let position = 0;
      let foundWord = false;
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        
        // Chord happens during or near this word (150ms tolerance)
        if (chord.time >= word.time - 0.15 && chord.time <= word.end + 0.15) {
          // Calculate position in the line text
          const wordsBeforeText = words.slice(0, i).map(w => w.text).join(' ');
          position = wordsBeforeText.length;
          if (position > 0) position += 1; // Add space
          
          // Fine-tune position based on timing within word
          const wordProgress = (chord.time - word.time) / (word.end - word.time);
          if (wordProgress > 0.3 && wordProgress < 0.9) {
            position += Math.floor(word.text.length * wordProgress);
          }
          
          foundWord = true;
          break;
        }
      }
      
      // If chord is before first word or after last word
      if (!foundWord) {
        if (chord.time < words[0].time) {
          position = 0;
        } else {
          position = lyricText.length;
        }
      }
      
      chordPositions.push({ position, label: chord.label });
    }
    
    // Sort by position (for LTR), reverse for RTL handled above
    chordPositions.sort((a, b) => a.position - b.position);
    
    // Build chord line with proper spacing
    let chordLine = '';
    let lastPos = 0;
    
    for (const cp of chordPositions) {
      const spacesNeeded = Math.max(0, cp.position - lastPos);
      chordLine += ' '.repeat(spacesNeeded) + cp.label;
      lastPos = cp.position + cp.label.length;
    }
    
    // Add direction styling
    const dirStyle = isRTL ? ' style="direction:rtl;text-align:right"' : '';
    
    // Build HTML
    return `<div class="chord-line"${dirStyle}>${escapeHtml(chordLine)}</div>\n<div class="lyric-line"${dirStyle}>${escapeHtml(lyricText)}</div>\n`;
  }
};

/**
 * 🔒 Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export to global scope
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
  console.log('✅ Sync Engine v5 loaded (Ultimate Guitar style)');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SyncEngine };
}
