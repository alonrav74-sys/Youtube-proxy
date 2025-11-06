// =====================================================
// 🎵 SyncEngine v6.2 - Lyrics + Chords Synchronization
// Simple version with end-of-line spacing fix only
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

  // Refresh sheet tab view
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

    // Build HTML
    let html = `<div dir="${dirAttr}" style="padding:20px;line-height:2.2;font-family:'Courier New',monospace;text-align:${textAlign};overflow-x:auto">`;
    
    // Track used chords
    const usedChordIndices = new Set();
    
    // 🎵 INTRO: Chords before first line
    if (lines.length > 0) {
      const firstLineStart = lines[0][0].time;
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
    }
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineStart = line[0].time;
      const lineEnd = line[line.length - 1].end;
      
      // Find chords for THIS line (simple - just within line time range)
      const lineChords = state.timeline.filter((ch, idx) => {
        const chordTime = ch.t + gateOffset;
        if (chordTime >= lineStart && chordTime <= lineEnd) {
          usedChordIndices.add(idx);
          return true;
        }
        return false;
      });

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
          // LTR: Position chords above their words OR at end of line
          const chordPositions = [];
          
          for (const chord of lineChords) {
            const chordTime = chord.t + gateOffset;
            let charPos = 0;
            let foundWord = false;
            
            for (let i = 0; i < line.length; i++) {
              const word = line[i];
              
              if (chordTime < word.time) {
                if (i === 0) {
                  charPos = 0;
                  foundWord = true;
                }
                break;
              }
              
              if (chordTime >= word.time && chordTime < word.end) {
                // Chord DURING word
                const beforeText = line.slice(0, i).map(w => w.text).join(' ');
                charPos = beforeText.length + (beforeText.length > 0 ? 1 : 0);
                foundWord = true;
                break;
              }
            }
            
            // 🔧 FIX: If chord is AFTER all words (end of line)
            if (!foundWord) {
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

      // Output line
      html += '<div style="margin-bottom:20px;white-space:nowrap;overflow-x:auto">';
      if (chordLine.trim()) {
        html += `<div style="color:#38bdf8;font-weight:700;white-space:pre">${this.escapeHtml(chordLine)}</div>`;
      }
      html += `<div style="color:#ffffff;white-space:nowrap">${this.escapeHtml(lyricText)}</div>`;
      html += '</div>';
      
      // 🎵 INTERLUDE: Chords between this line and next
      if (lineIdx < lines.length - 1) {
        const nextLineStart = lines[lineIdx + 1][0].time;
        const interludeChords = state.timeline.filter((ch, idx) => {
          const chordTime = ch.t + gateOffset;
          // Chords between end of this line and start of next line
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
    
    // 🎵 OUTRO: Chords after last line
    if (lines.length > 0) {
      const lastLineEnd = lines[lines.length - 1][lines[lines.length - 1].length - 1].end;
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
    }
    
    html += '</div>';
    fullSheetEl.innerHTML = html;
  },

  escapeHtml: function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}
