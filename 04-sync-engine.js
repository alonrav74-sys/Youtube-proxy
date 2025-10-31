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
   * 🏗️ Build chord sheet HTML
   * Strategy: Chords ON words, spaces for chords BETWEEN/AFTER, separate lines for sections
   */
  buildChordSheet(chords, words, isRTL) {
    if (!chords || chords.length === 0) {
      return '<div style="color:#cbd5e1;padding:20px">⏳ ממתין לאקורדים...</div>';
    }
    
    if (!words || words.length === 0) {
      return this.buildChordOnlySheet(chords, isRTL);
    }
    
    const wordLines = this.groupIntoLines(words, false);
    
    let html = '';
    let lastTime = 0;
    
    for (let i = 0; i < wordLines.length; i++) {
      const line = wordLines[i];
      const lineStart = line[0].time;
      const lineEnd = line[line.length - 1].end || line[line.length - 1].time;
      
      // Check for chord section BEFORE this line
      const chordsBefore = chords.filter(ch => ch.time >= lastTime && ch.time < lineStart - 1);
      if (chordsBefore.length > 0) {
        html += this.buildChordOnlyLine(chordsBefore, isRTL);
      }
      
      // Build line with dynamic spacing
      html += this.buildLineWithSpacing(line, chords, isRTL);
      
      lastTime = lineEnd;
    }
    
    // Chords after last line
    if (wordLines.length > 0) {
      const lastLineEnd = wordLines[wordLines.length - 1];
      const endTime = (lastLineEnd[lastLineEnd.length - 1].end || lastLineEnd[lastLineEnd.length - 1].time);
      const chordsAfter = chords.filter(ch => ch.time > endTime + 0.5);
      if (chordsAfter.length > 0) {
        html += this.buildChordOnlyLine(chordsAfter, isRTL);
      }
    }
    
    return html;
  },

  /**
   * 🎸 Build line with dynamic spacing for chords
   * ALL chords are ABOVE the line, never on the lyric line itself!
   */
  buildLineWithSpacing(lineWords, allChords, isRTL) {
    const words = lineWords;
    const lineStart = words[0].time;
    const lineEnd = words[words.length - 1].end || words[words.length - 1].time;
    
    // Get chords in this line's range (+1 second buffer for chords after)
    const lineChords = allChords.filter(ch => 
      ch.time >= lineStart - 0.2 && ch.time <= lineEnd + 1
    );
    
    // Categorize chords
    const segments = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordEnd = word.end || (word.time + 0.3);
      const nextWord = words[i + 1];
      
      // Chords ON this word (strict matching)
      const chordsOn = lineChords.filter(ch => 
        ch.time >= word.time - 0.1 && ch.time <= wordEnd
      );
      
      // Chords AFTER this word (before next word or end of line)
      const afterBoundary = nextWord ? nextWord.time : lineEnd + 1;
      const chordsAfter = lineChords.filter(ch =>
        ch.time > wordEnd + 0.1 && ch.time < afterBoundary - 0.1
      );
      
      segments.push({
        word: word.text,
        chordsOn: chordsOn.map(c => c.label),
        chordsAfter: chordsAfter.map(c => c.label)
      });
    }
    
    // Build the display - chords ABOVE, lyrics BELOW
    let chordLine = '';
    let lyricLine = '';
    
    for (const seg of segments) {
      const word = seg.word;
      const chordsOnStr = seg.chordsOn.join(' ');
      const chordsAfterStr = seg.chordsAfter.join(' ');
      
      // Add word with chord above
      const wordLen = word.length;
      const chordLen = chordsOnStr.length;
      const width = Math.max(wordLen, chordLen);
      
      // Pad to align
      chordLine += chordsOnStr.padEnd(width, ' ');
      lyricLine += word.padEnd(width, ' ');
      
      // Add space + chords after (IN CHORD LINE ONLY!)
      if (chordsAfterStr) {
        const afterSpace = '  ';
        chordLine += afterSpace + chordsAfterStr + '  ';
        lyricLine += afterSpace + ' '.repeat(chordsAfterStr.length) + '  '; // Empty space in lyric line!
      } else {
        chordLine += '  ';
        lyricLine += '  ';
      }
    }
    
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    
    let html = `<div style="margin-bottom:20px" ${dirAttr}>`;
    html += `<div style="color:#38bdf8;font-weight:700;font-size:15px;line-height:1.3;white-space:pre;font-family:'Courier New',monospace">${escapeHtml(chordLine.trimEnd())}</div>`;
    html += `<div style="color:#ffffff;font-size:16px;line-height:1.3;white-space:pre;font-family:'Courier New',monospace">${escapeHtml(lyricLine.trimEnd())}</div>`;
    html += `</div>`;
    
    return html;
  },

  /**
   * 🎸 Build chord-only line (for sections without words)
   */
  buildChordOnlyLine(chords, isRTL) {
    if (!chords || chords.length === 0) return '';
    
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    const chordStr = chords.map(ch => ch.label).join('  ');
    
    let html = `<div style="margin-bottom:20px" ${dirAttr}>`;
    html += `<div style="color:#38bdf8;font-weight:700;font-size:15px;line-height:1.3;white-space:pre;font-family:'Courier New',monospace">${escapeHtml(chordStr)}</div>`;
    html += `<div style="color:#64748b;font-size:14px;font-style:italic">[Instrumental]</div>`;
    html += `</div>`;
    
    return html;
  },

  /**
   * 🎸 Build full chord-only sheet
   */
  buildChordOnlySheet(chords, isRTL) {
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    const chordStr = chords.map(ch => ch.label).join('  ');
    
    let html = `<div style="padding:20px" ${dirAttr}>`;
    html += `<div style="color:#f59e0b;font-size:14px;font-style:italic;margin-bottom:8px">[Instrumental]</div>`;
    html += `<div style="color:#38bdf8;font-weight:700;font-size:15px;line-height:1.8;white-space:pre;font-family:'Courier New',monospace">${escapeHtml(chordStr)}</div>`;
    html += `</div>`;
    
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
