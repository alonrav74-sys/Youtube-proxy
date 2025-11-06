// =====================================================
// 🎵 SyncEngine v6.11 - Empty Cells Width 0
// =====================================================
// 
// Live karaoke: Same for both languages (word + chord)
// Sheet below: Hebrew = chords only
// Full sheet: Hebrew = table, English = unchanged
// Labels: [Intro] only (no verse/chorus detection)
// 
// English: Unchanged (perfect!)
// Hebrew:
//   - Live sheet: Chords only (LTR, no lyrics)
//   - Full sheet: [Intro] + Compact table (10 cells/row)
//   - Detection: 5+ Hebrew words

const SyncEngine = {
  
  // 🆕 Hebrew detection (5+ Hebrew words)
  isHebrewText: function(text) {
    if (!text) return false;
    const hebrewRegex = /[\u0590-\u05FF]/;
    const words = text.trim().split(/\s+/);
    let hebrewWordCount = 0;
    for (const word of words) {
      if (hebrewRegex.test(word)) hebrewWordCount++;
    }
    return hebrewWordCount >= 5;
  },

  // ========================================
  // LIVE DISPLAY
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

    // Check if Hebrew
    const isReallyHebrew = this.isHebrewText(whisperText);
    
    if (isReallyHebrew) {
      this.buildHebrewTableSheet(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl);
    } else {
      this.buildEnglishSheet(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl);
    }
  },

  // ========================================
  // 🎸 ENGLISH SHEET (UNCHANGED!)
  // ========================================
  
  buildEnglishSheet: function(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    
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
  // 🎹 HEBREW TABLE SHEET (Negina-style!)
  // ========================================
  
  buildHebrewTableSheet: function(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    
    // Build cells
    const cells = [];
    
    state.timeline.forEach(ch => {
      cells.push({
        time: ch.t + gateOffset,
        chord: sanitizeLabel(applyCapoToLabel(ch.label, capoVal)),
        lyric: null
      });
    });
    
    whisperWords.forEach(w => {
      let text = (w.word || w.text || '').trim();
      if (!text) return;
      
      // Clean artifacts
      text = text.replace(/&nbsp;?/g, '');
      text = text.replace(/&amp;/g, '');
      text = text.trim();
      if (!text) return;
      
      const time = w.start + gateOffset;
      const existing = cells.find(c => Math.abs(c.time - time) < 0.3);
      
      if (existing) {
        existing.lyric = text;
      } else {
        cells.push({ time: time, chord: null, lyric: text });
      }
    });
    
    cells.sort((a, b) => a.time - b.time);
    
    // Extract INTRO
    const firstLyricIdx = cells.findIndex(c => c.lyric !== null);
    const introChords = firstLyricIdx > 0 ? cells.slice(0, firstLyricIdx).filter(c => c.chord) : [];
    const mainCells = firstLyricIdx > 0 ? cells.slice(firstLyricIdx) : cells;
    
    // Build HTML
    let html = `<div dir="rtl" style="padding:20px;font-family:'Arial',sans-serif;font-size:16px;line-height:1.8">`;
    
    // 🎵 אינטרו (Hebrew label!)
    if (introChords.length > 0) {
      html += '<div style="margin-bottom:25px">';
      html += '<div style="font-size:13px;color:#64748b;margin-bottom:8px;font-weight:700">אינטרו</div>';
      html += '<div dir="ltr" style="color:#38bdf8;font-weight:700;text-align:left">';
      for (let i = 0; i < introChords.length; i++) {
        if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
        html += `<span style="font-size:16px">${this.escapeHtml(introChords[i].chord)}</span>`;
      }
      html += '</div></div>';
    }
    
    // 🎹 TABLE (no section labels except Intro!)
    html += '<table style="border-collapse:collapse;direction:rtl;table-layout:auto;width:auto;margin:0">';
    
    // Group into lines (6-8 cells per line based on content)
    let currentLine = [];
    const maxCellsPerLine = 8;
    
    for (let i = 0; i < mainCells.length; i++) {
      currentLine.push(mainCells[i]);
      
      // Break line if:
      // 1. Reached max cells
      // 2. Big time gap (>2 seconds)
      // 3. End of song
      const nextCell = mainCells[i + 1];
      const timeGap = nextCell ? (nextCell.time - mainCells[i].time) : 999;
      
      if (currentLine.length >= maxCellsPerLine || timeGap > 2.0 || i === mainCells.length - 1) {
        // Render this line
        if (currentLine.length > 0) {
          // Chord row
          html += '<tr>';
          for (const cell of currentLine) {
            if (cell.chord) {
              html += `<td style="padding:4px 12px;color:#38bdf8;font-weight:700;text-align:center;vertical-align:bottom;font-size:15px;white-space:nowrap">${this.escapeHtml(cell.chord)}</td>`;
            } else {
              // Empty chord cell - width 0!
              html += `<td style="padding:0;width:0;vertical-align:bottom"></td>`;
            }
          }
          html += '</tr>';
          
          // Lyric row
          html += '<tr>';
          for (const cell of currentLine) {
            if (cell.lyric) {
              html += `<td style="padding:4px 12px;color:#ffffff;text-align:center;vertical-align:top;font-size:16px;white-space:nowrap">${this.escapeHtml(cell.lyric)}</td>`;
            } else {
              // Empty lyric cell - width 0!
              html += `<td style="padding:0;width:0;vertical-align:top"></td>`;
            }
          }
          html += '</tr>';
          
          // Spacer between lines
          html += '<tr style="height:15px"></tr>';
        }
        
        currentLine = [];
      }
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
