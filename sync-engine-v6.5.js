// =====================================================
// 🎵 SyncEngine v6.5 - Hebrew Table Layout
// =====================================================
// 
// English (LTR): Precise positioning (unchanged)
// Hebrew (RTL): Table-based layout (NEW!)
//   - Live display: Same as English
//   - Sheet below live: LTR, no words, karaoke only
//   - Full sheet: Table with 2 rows (chords + lyrics)
//
// Hebrew detection: At least 5 Hebrew words

const SyncEngine = {
  
  // 🆕 v6.5: Better Hebrew detection (at least 5 Hebrew words)
  isHebrewText: function(text) {
    if (!text) return false;
    
    // Hebrew character range
    const hebrewRegex = /[\u0590-\u05FF]/;
    
    // Split into words
    const words = text.trim().split(/\s+/);
    
    // Count Hebrew words (words containing Hebrew characters)
    let hebrewWordCount = 0;
    for (const word of words) {
      if (hebrewRegex.test(word)) {
        hebrewWordCount++;
      }
    }
    
    // Require at least 5 Hebrew words
    return hebrewWordCount >= 5;
  },

  // ========================================
  // LIVE DISPLAY (don't touch for both languages!)
  // ========================================
  
  syncChordsWithLyrics: function(state, whisperWords, capo, sanitizeLabel, applyCapoToLabel) {
    if (!state || !state.timeline || !whisperWords || whisperWords.length === 0) {
      return null;
    }

    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    const chords = state.timeline;

    const stream = whisperWords.map((w, idx) => {
      const text = (w.word || w.text || '').trim();
      if (!text) return null;

      const wordStart = w.start + gateOffset;
      const wordEnd = (w.end || wordStart + 0.3) + gateOffset;

      const overlappingChords = chords.filter(ch => {
        const chordTime = ch.t + gateOffset;
        return chordTime >= wordStart && chordTime < wordEnd;
      });

      return {
        word: text,
        start: wordStart,
        end: wordEnd,
        chords: overlappingChords.map(ch => sanitizeLabel(applyCapoToLabel(ch.label, capoVal)))
      };
    }).filter(item => item !== null);

    return stream;
  },

  // ========================================
  // FULL SHEET TAB
  // ========================================
  
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

    // 🆕 v6.5: Check if this is REALLY Hebrew (at least 5 Hebrew words)
    const isReallyHebrew = this.isHebrewText(whisperText);
    
    if (isReallyHebrew) {
      // 🎹 HEBREW: Table-based layout
      this.buildHebrewTableSheet(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl);
    } else {
      // 🎸 ENGLISH: Precise positioning (don't touch!)
      this.buildEnglishSheet(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl);
    }
  },

  // ========================================
  // 🎸 ENGLISH SHEET (UNCHANGED!)
  // ========================================
  
  buildEnglishSheet: function(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    
    // Group words into lines
    const lines = [];
    let currentLine = [];
    const maxWords = 8;
    
    whisperWords.forEach((w, idx) => {
      const text = (w.word || w.text || '').trim();
      if (!text) return;
      
      currentLine.push({
        text: text,
        time: w.start + gateOffset,
        end: (w.end || w.start + 0.3) + gateOffset
      });
      
      const endsWithPunct = /[.!?,;]$/.test(text);
      if (endsWithPunct || currentLine.length >= maxWords || idx === whisperWords.length - 1) {
        if (currentLine.length > 0) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
    });

    // Build HTML
    let html = `<div dir="ltr" style="padding:20px;line-height:2.2;font-family:'Courier New',monospace;text-align:left;overflow-x:auto">`;
    
    const usedChordIndices = new Set();
    
    // INTRO
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
    
    // LINES
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineStart = line[0].time;
      const lineEnd = line[line.length - 1].end;
      
      const lineChords = state.timeline.filter((ch, idx) => {
        const chordTime = ch.t + gateOffset;
        if (chordTime >= lineStart && chordTime <= lineEnd) {
          usedChordIndices.add(idx);
          return true;
        }
        return false;
      });

      const lyricText = line.map(w => w.text).join(' ');
      let chordLine = '';
      
      if (lineChords.length > 0) {
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
              const beforeText = line.slice(0, i).map(w => w.text).join(' ');
              charPos = beforeText.length + (beforeText.length > 0 ? 1 : 0);
              foundWord = true;
              break;
            }
          }
          
          if (!foundWord) {
            charPos = lyricText.length + 4;
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

      html += '<div style="margin-bottom:20px;white-space:nowrap;overflow-x:auto">';
      if (chordLine.trim()) {
        html += `<div style="color:#38bdf8;font-weight:700;white-space:pre">${this.escapeHtml(chordLine)}</div>`;
      }
      html += `<div style="color:#ffffff;white-space:nowrap">${this.escapeHtml(lyricText)}</div>`;
      html += '</div>';
      
      // INTERLUDE
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
    
    // OUTRO
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

  // ========================================
  // 🎹 HEBREW TABLE SHEET (NEW!)
  // ========================================
  
  buildHebrewTableSheet: function(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    
    // Build cells: [{time, chord?, lyric?}, ...]
    const cells = [];
    
    // Add all chords
    state.timeline.forEach(ch => {
      cells.push({
        time: ch.t + gateOffset,
        chord: sanitizeLabel(applyCapoToLabel(ch.label, capoVal)),
        lyric: null
      });
    });
    
    // Add all lyrics
    whisperWords.forEach(w => {
      const text = (w.word || w.text || '').trim();
      if (!text) return;
      
      const time = w.start + gateOffset;
      
      // Check if there's a chord at similar time (within 300ms)
      const existing = cells.find(c => Math.abs(c.time - time) < 0.3);
      
      if (existing) {
        // Merge lyric with chord
        existing.lyric = text;
      } else {
        // Create new cell with lyric only
        cells.push({
          time: time,
          chord: null,
          lyric: text
        });
      }
    });
    
    // Sort by time
    cells.sort((a, b) => a.time - b.time);
    
    // Build table (RTL, 2 rows per line)
    let html = `<div dir="rtl" style="padding:20px;font-family:'David',serif;font-size:16px">`;
    html += '<table style="border-collapse:collapse;width:100%;direction:rtl">';
    
    // Group into rows (4 cells per row)
    const cellsPerRow = 4;
    for (let i = 0; i < cells.length; i += cellsPerRow) {
      const rowCells = cells.slice(i, i + cellsPerRow);
      
      // Chord row
      html += '<tr>';
      for (const cell of rowCells) {
        const chord = cell.chord || '&nbsp;';
        html += `<td style="padding:8px 15px;color:#38bdf8;font-weight:700;text-align:center;vertical-align:bottom;font-size:15px">${this.escapeHtml(chord)}</td>`;
      }
      html += '</tr>';
      
      // Lyric row
      html += '<tr>';
      for (const cell of rowCells) {
        const lyric = cell.lyric || '&nbsp;';
        html += `<td style="padding:8px 15px;color:#ffffff;text-align:center;vertical-align:top;font-size:17px">${this.escapeHtml(lyric)}</td>`;
      }
      html += '</tr>';
      
      // Spacer row
      html += '<tr style="height:15px"></tr>';
    }
    
    html += '</table>';
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
