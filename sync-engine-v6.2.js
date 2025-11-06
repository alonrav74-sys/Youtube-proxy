// =====================================================
// 🎵 SyncEngine v6.2 - Lyrics + Chords Synchronization
// Fixed: Chords stay with their lyrics when wrapping
// =====================================================

const SyncEngine = {
  // Sync chords with lyrics words (for LIVE display - don't touch!)
  syncChordsWithLyrics: function(state, whisperWords, capo, sanitizeLabel, applyCapoToLabel) {
    if (!state || !state.timeline || !whisperWords || whisperWords.length === 0) {
      return [];
    }

    const stream = [];
    const gateOffset = state.gateTime || 0;

    for (const chord of state.timeline) {
      const chordTime = chord.t + gateOffset;
      
      // Find word at this time
      const word = whisperWords.find(w => {
        const wordStart = w.start + gateOffset;
        const wordEnd = (w.end || w.start + 0.3) + gateOffset;
        return chordTime >= wordStart && chordTime < wordEnd;
      });

      const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capo));
      
      stream.push({
        time: chordTime,
        chord: displayLabel,
        lyric: word ? (word.word || word.text || '') : '',
        originalChord: chord
      });
    }

    return stream;
  },

  // Refresh sheet tab view (for SHEET display)
  refreshSheetTabView: function(state, whisperWords, whisperText, detectedLanguage, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    if (!state || !state.timeline) {
      fullSheetEl.innerHTML = '<div style="color:#cbd5e1;padding:20px">ממתין לאקורדים...</div>';
      return;
    }

    if (!whisperWords || whisperWords.length === 0) {
      // No lyrics - show chords only
      const capoVal = parseInt(capo || '0', 10);
      
      let html = `<div dir="ltr" style="padding:20px;line-height:2.5;text-align:left;overflow-x:auto;white-space:nowrap">`;
      html += '<div style="color:#38bdf8;font-weight:700;margin-bottom:10px">🎵 Chords</div>';
      
      for (let i = 0; i < state.timeline.length; i++) {
        const chord = state.timeline[i];
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        
        if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
        html += `<span style="color:#38bdf8;font-weight:700;font-size:18px">${this.escapeHtml(displayLabel)}</span>`;
      }
      
      html += '</div>';
      fullSheetEl.innerHTML = html;
      return;
    }

    // Build sheet with lyrics
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    const isRTL = detectedLanguage === 'he';
    const dirAttr = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    
    // Group words into lines
    const lines = [];
    let currentLine = [];
    const maxWords = isRTL ? 6 : 8;
    
    whisperWords.forEach((w, idx) => {
      const text = (w.word || w.text || '').trim();
      if (!text) return;
      
      currentLine.push({
        text: text,
        time: w.start + gateOffset,
        end: (w.end || w.start + 0.3) + gateOffset
      });
      
      const endsWithPunct = /[.!?,;،؟]$/.test(text);
      if (endsWithPunct || currentLine.length >= maxWords || idx === whisperWords.length - 1) {
        if (currentLine.length > 0) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
    });

    // Build HTML with horizontal scroll
    let html = `<div dir="${dirAttr}" style="padding:20px;line-height:2.2;font-family:'Courier New',monospace;text-align:${textAlign};overflow-x:auto">`;
    
    // Track used chords
    const usedChordIndices = new Set();
    
    // Intro chords (before first line)
    const firstLineStart = lines.length > 0 ? lines[0][0].time : Infinity;
    const introChords = state.timeline.filter((ch, idx) => {
      const chordTime = ch.t + gateOffset;
      if (chordTime < firstLineStart) {
        usedChordIndices.add(idx);
        return true;
      }
      return false;
    });
    
    if (introChords.length > 0) {
      html += '<div style="margin-bottom:30px;color:#38bdf8;font-weight:700;white-space:nowrap">';
      html += '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">[Intro]</div>';
      for (let i = 0; i < introChords.length; i++) {
        const chord = introChords[i];
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
        html += `<span style="font-size:16px">${this.escapeHtml(displayLabel)}</span>`;
      }
      html += '</div>';
    }
    
    // Process each line
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineStart = line[0].time;
      const lineEnd = line[line.length - 1].end;
      
      // Find chords for THIS line
      const lineChords = state.timeline.filter((ch, idx) => {
        const chordTime = ch.t + gateOffset;
        
        // Include chords that are:
        // 1. Shortly before the line starts (up to 1 second before)
        // 2. During the line (from first word start to last word end)
        // 3. Shortly after the line ends (up to 0.8 seconds) - for end-of-line chords
        
        const beforeLineThreshold = 1.0;
        const afterLineThreshold = 0.8;  // Allow chords at end of line
        
        const isBeforeLine = chordTime >= (lineStart - beforeLineThreshold) && chordTime < lineStart;
        const isDuringLine = chordTime >= lineStart && chordTime <= lineEnd;
        const isAtEndOfLine = chordTime > lineEnd && chordTime <= (lineEnd + afterLineThreshold);
        
        if (isBeforeLine || isDuringLine || isAtEndOfLine) {
          usedChordIndices.add(idx);
          return true;
        }
        return false;
      });

      // Build lyrics
      const lyricText = line.map(w => w.text).join(' ');
      
      // Build chords above lyrics
      let chordLine = '';
      
      if (lineChords.length > 0) {
        if (isRTL) {
          // RTL: Simply list chords from right to left
          const sortedChords = lineChords.sort((a, b) => (b.t + gateOffset) - (a.t + gateOffset));
          for (let i = 0; i < sortedChords.length; i++) {
            const displayLabel = sanitizeLabel(applyCapoToLabel(sortedChords[i].label, capoVal));
            if (i > 0) chordLine += '    ';
            chordLine += displayLabel;
          }
        } else {
          // LTR: Position chords above their words
          const chordPositions = [];
          
          for (const chord of lineChords) {
            const chordTime = chord.t + gateOffset;
            let charPos = 0;
            let isAfterLine = true; // Assume it's after the line until we find it during a word
            
            for (let i = 0; i < line.length; i++) {
              const word = line[i];
              if (chordTime < word.time) {
                // Chord is before this word
                if (i === 0) {
                  charPos = 0;
                  isAfterLine = false;
                }
                break;
              }
              if (chordTime >= word.time && chordTime < word.end) {
                // Chord is DURING this word
                const beforeText = line.slice(0, i).map(w => w.text).join(' ');
                charPos = beforeText.length + (beforeText.length > 0 ? 1 : 0);
                isAfterLine = false;
                break;
              }
            }
            
            // If chord is AFTER all words (end of line)
            if (isAfterLine) {
              charPos = lyricText.length + 4; // Add 4 spaces after last word
            }
            
            const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
            chordPositions.push({ pos: charPos, label: displayLabel });
          }
          
          chordPositions.sort((a, b) => a.pos - b.pos);
          
          let currentPos = 0;
          for (const cp of chordPositions) {
            const spaces = cp.pos - currentPos;
            if (spaces > 0) chordLine += ' '.repeat(spaces);
            chordLine += cp.label;
            currentPos = cp.pos + cp.label.length;
          }
        }
      }

      // Output line with horizontal scroll
      html += '<div style="margin-bottom:20px;white-space:nowrap;overflow-x:auto">';
      if (chordLine.trim()) {
        html += `<div style="color:#38bdf8;font-weight:700;white-space:pre">${this.escapeHtml(chordLine)}</div>`;
      }
      html += `<div style="color:#ffffff;white-space:nowrap">${this.escapeHtml(lyricText)}</div>`;
      html += '</div>';
      
      // Interlude chords (between lines)
      if (lineIdx < lines.length - 1) {
        const nextLineStart = lines[lineIdx + 1][0].time;
        const interludeChords = state.timeline.filter((ch, idx) => {
          const chordTime = ch.t + gateOffset;
          if (chordTime > lineEnd && chordTime < nextLineStart && !usedChordIndices.has(idx)) {
            usedChordIndices.add(idx);
            return true;
          }
          return false;
        });
        
        if (interludeChords.length > 0) {
          html += '<div style="margin:20px 0;color:#38bdf8;font-weight:700;white-space:nowrap">';
          for (let i = 0; i < interludeChords.length; i++) {
            const chord = interludeChords[i];
            const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
            if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
            html += `<span style="font-size:16px">${this.escapeHtml(displayLabel)}</span>`;
          }
          html += '</div>';
        }
      }
    }
    
    // Outro chords (after last line)
    const lastLineEnd = lines.length > 0 ? lines[lines.length - 1][lines[lines.length - 1].length - 1].end : 0;
    const outroChords = state.timeline.filter((ch, idx) => {
      const chordTime = ch.t + gateOffset;
      if (chordTime > lastLineEnd && !usedChordIndices.has(idx)) {
        return true;
      }
      return false;
    });
    
    if (outroChords.length > 0) {
      html += '<div style="margin-top:30px;color:#38bdf8;font-weight:700;white-space:nowrap">';
      html += '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">[Outro]</div>';
      for (let i = 0; i < outroChords.length; i++) {
        const chord = outroChords[i];
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
        html += `<span style="font-size:16px">${this.escapeHtml(displayLabel)}</span>`;
      }
      html += '</div>';
    }
    
    html += '</div>';
    fullSheetEl.innerHTML = html;
  },

  // Helper
  escapeHtml: function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Make globally available
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}
