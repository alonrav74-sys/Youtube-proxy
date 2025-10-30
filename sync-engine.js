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
    
    const words = lineWords;
    const lineStart = words[0].time;
    const lineEnd = words[words.length - 1].end;
    
    const lineChords = allChords.filter(ch => 
      ch.time >= lineStart - 0.15 && ch.time <= lineEnd + 0.15
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
    
    // Sort by time
    items.sort((a, b) => a.time - b.time);
    
    const flexDir = isRTL ? 'row-reverse' : 'row';
    const justifyContent = isRTL ? 'flex-end' : 'flex-start';
    
    let html = `<div style="margin-bottom:30px">`;
    
    // Chords
    html += `<div style="display:flex;flex-direction:${flexDir};justify-content:${justifyContent};flex-wrap:wrap;min-height:22px">`;
    for(const item of items) {
      if(item.type === 'chord') {
        html += `<span style="color:#38bdf8;font-weight:700;font-size:16px;margin:0 6px">${escapeHtml(item.label)}</span>`;
      } else {
        html += `<span style="width:${item.text.length * 10}px;margin:0 6px"></span>`;
      }
    }
    html += `</div>`;
    
    // Words
    html += `<div style="display:flex;flex-direction:${flexDir};justify-content:${justifyContent};flex-wrap:wrap;min-height:26px;margin-top:2px">`;
    for(const item of items) {
      if(item.type === 'word') {
        html += `<span style="color:#ffffff;font-size:18px;margin:0 6px">${escapeHtml(item.text)}</span>`;
      } else {
        html += `<span style="width:${item.label.length * 10}px;margin:0 6px"></span>`;
      }
    }
    html += `</div>`;
    
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
