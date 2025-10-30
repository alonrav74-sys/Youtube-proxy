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
      end: (w.end || w.start) + gateOffset
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
        end: word.end || word.start
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
    
    const words = lineWords;
    const lineStart = words[0].time;
    const lineEnd = words[words.length - 1].end;
    
    const lineChords = allChords.filter(ch => 
      ch.time >= lineStart && ch.time <= lineEnd
    );
    
    // Build timeline
    const items = [];
    
    for(const chord of lineChords) {
      items.push({
        time: chord.time,
        type: 'chord',
        label: chord.label
      });
    }
    
    for(const word of words) {
      items.push({
        time: word.time,
        type: 'word',
        text: word.text
      });
    }
    
    items.sort((a, b) => a.time - b.time);
    
    // Calculate positions (SAME for both languages)
    const lyricText = words.map(w => w.text).join(' ');
    
    const chordPositions = [];
    for(const chord of lineChords) {
      let position = 0;
      let found = false;
      
      // Try to find word that contains this chord time
      for(let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordEnd = word.end || (word.time + 0.3);
        if(chord.time >= word.time && chord.time <= wordEnd) {
          // Chord is ON this word
          const beforeText = words.slice(0, i).map(w => w.text).join(' ');
          position = beforeText.length;
          if(position > 0) position += 1;
          found = true;
          break;
        }
      }
      
      if(!found) {
        // Chord is NOT on any word - find closest position
        if(chord.time < words[0].time) {
          // Before first word
          position = 0;
        } else if(chord.time > words[words.length - 1].end) {
          // After last word
          position = lyricText.length + 1;
        } else {
          // Between words - find which gap
          for(let i = 0; i < words.length - 1; i++) {
            const currentWordEnd = words[i].end || words[i].time;
            const nextWordStart = words[i + 1].time;
            
            if(chord.time > currentWordEnd && chord.time < nextWordStart) {
              // Chord is in gap between words[i] and words[i+1]
              const beforeText = words.slice(0, i + 1).map(w => w.text).join(' ');
              position = beforeText.length + 1; // After current word + space
              found = true;
              break;
            }
          }
          
          if(!found) {
            // Fallback: put at end
            position = lyricText.length + 1;
          }
        }
      }
      
      chordPositions.push({ position, label: chord.label });
    }
    
    chordPositions.sort((a, b) => a.position - b.position);
    
    // Build chord line
    let chordLine = '';
    let lastPos = 0;
    for(const cp of chordPositions) {
      const spaces = Math.max(0, cp.position - lastPos);
      chordLine += ' '.repeat(spaces) + cp.label;
      lastPos = cp.position + cp.label.length;
    }
    
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    
    let html = `<div style="margin-bottom:25px" ${dirAttr}>`;
    html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace">${escapeHtml(chordLine)}</div>`;
    html += `<div style="color:#ffffff;font-size:18px;line-height:1.3;white-space:pre">${escapeHtml(lyricText)}</div>`;
    html += `</div>`;
    
    return html;
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
