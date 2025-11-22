// =====================================================
// 🎵 SyncEngine v6.14 - CLEAN (No Debug)
// =====================================================

const SyncEngine = {
  
  // Helper: Get pitch class from note name
  getChordRoot: function(noteName) {
    const noteMap = {
      'C': 0, 'C#': 1, 'Db': 1,
      'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4,
      'F': 5, 'F#': 6, 'Gb': 6,
      'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10,
      'B': 11
    };
    return noteMap[noteName] !== undefined ? noteMap[noteName] : null;
  },
  
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

  refreshSheetTabView: function(state, whisperWords, whisperText, detectedLanguage, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    if (!state || !state.timeline) {
      fullSheetEl.innerHTML = '<div style="color:#cbd5e1;padding:20px">ממתין לאקורדים...</div>';
      return;
    }

    if (!whisperWords || whisperWords.length === 0) {
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

    const isReallyHebrew = this.isHebrewText(whisperText);
    
    // Both Hebrew and English use same format (chords above lyrics)
    this.buildEnglishSheet(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl, isReallyHebrew);
  },

  buildEnglishSheet: function(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl, isHebrewOverride) {
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    const isRTL = isHebrewOverride || false;
    
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
      
      const endsWithPunct = /[.!?,;]$/.test(text);
      if (endsWithPunct || currentLine.length >= maxWords || idx === whisperWords.length - 1) {
        if (currentLine.length > 0) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
    });

    let html = `<div dir="${isRTL ? 'rtl' : 'ltr'}" style="padding:20px;line-height:2.2;font-family:'Courier New',monospace;text-align:${isRTL ? 'right' : 'left'};overflow-x:auto">`;
    
    const usedChordIndices = new Set();
    
    if (lines.length > 0) {
      const firstLineStart = lines[0][0].time;
      
      // Check if first chord is tonic or relative minor
      let skipFirstChord = false;
      if (state.timeline[0]) {
        const firstChordTime = state.timeline[0].t + gateOffset;
        const firstChordLabel = state.timeline[0].label || '';
        const keyRoot = state.key ? state.key.root : null;
        
        // Extract root from chord label (e.g., "Am" -> 0 for A, "C" -> 0 for C)
        const chordRootMatch = firstChordLabel.match(/^([A-G][#b]?)/);
        const chordRoot = chordRootMatch ? chordRootMatch[1] : null;
        
        // Check if chord is tonic or relative minor
        const isTonic = (keyRoot !== null && chordRoot && 
                         this.getChordRoot(chordRoot) === keyRoot);
        const isRelativeMinor = (keyRoot !== null && chordRoot && 
                                  this.getChordRoot(chordRoot) === (keyRoot + 9) % 12); // relative minor is +9 semitones
        
        // Skip ONLY if it's noise AND not tonic/relative minor
        const isNoise = (firstChordTime < 1.5) && (firstChordTime < firstLineStart - 3.0);
        skipFirstChord = isNoise && !isTonic && !isRelativeMinor;
      }
      
      const introChords = state.timeline.filter((ch, idx) => {
        const chordTime = ch.t + gateOffset;
        
        // Skip first chord if it's noise (and not tonic/relative)
        if (idx === 0 && skipFirstChord) {
          return false;
        }
        
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
        if (isRTL) {
          // HEBREW: Simple spacing between chords
          chordLine = lineChords.map(ch => {
            const displayLabel = sanitizeLabel(applyCapoToLabel(ch.label, capoVal));
            return displayLabel;
          }).join('   '); // 3 spaces between chords
        } else {
          // ENGLISH: Exact positioning above words
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
        } // end of else (English)
      }

      html += '<div style="margin-bottom:20px;white-space:nowrap;overflow-x:auto">';
      if (chordLine.trim()) {
        html += `<div style="color:#38bdf8;font-weight:700;white-space:pre">${this.escapeHtml(chordLine)}</div>`;
      }
      html += `<div style="color:#ffffff;white-space:nowrap">${this.escapeHtml(lyricText)}</div>`;
      html += '</div>';
      
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

  buildHebrewTableSheet: function(state, whisperWords, whisperText, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    
    // Collect chords and lyrics
    const chords = state.timeline.map(ch => ({
      time: ch.t + gateOffset,
      label: sanitizeLabel(applyCapoToLabel(ch.label, capoVal))
    }));
    
    const lyrics = whisperWords.map(w => {
      let text = (w.word || w.text || '').trim();
      if (!text) return null;
      text = text.replace(/&nbsp;?/g, '').replace(/&amp;/g, '').trim();
      if (!text) return null;
      return {
        time: w.start + gateOffset,
        label: text
      };
    }).filter(x => x !== null);
    
    // Build cells with auto-merge
    const cells = [];
    const usedLyrics = new Set();
    const MERGE_THRESHOLD = 0.3;
    
    chords.forEach(chord => {
      let closestLyric = null;
      let closestDist = Infinity;
      
      lyrics.forEach((lyric, idx) => {
        if (usedLyrics.has(idx)) return;
        const dist = Math.abs(lyric.time - chord.time);
        if (dist < closestDist && dist < MERGE_THRESHOLD) {
          closestDist = dist;
          closestLyric = { lyric, idx };
        }
      });
      
      if (closestLyric) {
        cells.push({
          time: chord.time,
          chord: chord.label,
          lyric: closestLyric.lyric.label
        });
        usedLyrics.add(closestLyric.idx);
      } else {
        cells.push({
          time: chord.time,
          chord: chord.label,
          lyric: null
        });
      }
    });
    
    lyrics.forEach((lyric, idx) => {
      if (!usedLyrics.has(idx)) {
        cells.push({
          time: lyric.time,
          chord: null,
          lyric: lyric.label
        });
      }
    });
    
    cells.sort((a, b) => a.time - b.time);
    
    // Find first lyric
    const cellsWithLyrics = cells.filter(c => c.lyric && typeof c.lyric === 'string' && c.lyric.length > 0);
    const firstLyricTime = cellsWithLyrics.length > 0 ? cellsWithLyrics[0].time : Infinity;
    
    const introChords = cells.filter(c => c.chord && c.time < firstLyricTime);
    const mainCells = cells.filter(c => c.time >= firstLyricTime);
    
    // Build HTML
    let html = `<div dir="rtl" style="padding:20px;font-family:'Arial',sans-serif;font-size:16px;line-height:1.8">`;
    
    // DEBUG BOX
    html += '<div style="background:#2a1a00;border:2px solid #f59e0b;padding:15px;border-radius:8px;margin-bottom:20px;font-family:monospace;font-size:12px;color:#fbbf24">';
    html += '<b>🔍 Debug:</b><br>';
    html += `Total cells: ${mainCells.length}<br>`;
    html += `First 5 cells:<br>`;
    for (let i = 0; i < Math.min(5, mainCells.length); i++) {
      const c = mainCells[i];
      html += `[${i}] ${c.chord || '—'} / ${c.lyric || '—'}<br>`;
    }
    html += '</div>';
    
    // [Intro]
    if (introChords.length > 0) {
      html += '<div style="margin-bottom:25px">';
      html += '<div style="font-size:12px;color:#64748b;margin-bottom:8px;font-weight:700">[Intro]</div>';
      html += '<div dir="ltr" style="color:#38bdf8;font-weight:700;text-align:left">';
      for (let i = 0; i < introChords.length; i++) {
        if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
        html += `<span style="font-size:16px">${this.escapeHtml(introChords[i].chord)}</span>`;
      }
      html += '</div></div>';
    }
    
    // Table
    html += '<table style="border-collapse:collapse;direction:rtl;table-layout:auto;width:auto;margin:0">';
    
    let currentLine = [];
    const maxCellsPerLine = 8;
    
    for (let i = 0; i < mainCells.length; i++) {
      currentLine.push(mainCells[i]);
      
      const nextCell = mainCells[i + 1];
      const timeGap = nextCell ? (nextCell.time - mainCells[i].time) : 999;
      
      if (currentLine.length >= maxCellsPerLine || timeGap > 2.0 || i === mainCells.length - 1) {
        if (currentLine.length > 0) {
          // DEBUG: show currentLine
          if (html.includes('First line:') === false) {
            html += '<div style="background:#1a2a00;border:1px solid #22c55e;padding:10px;border-radius:8px;margin-bottom:10px;font-size:11px;color:#86efac">';
            html += '<b>First line cells:</b><br>';
            currentLine.forEach((c, idx) => {
              html += `[${idx}] chord:"${c.chord || 'NULL'}" lyric:"${c.lyric || 'NULL'}"<br>`;
            });
            html += '</div>';
          }
          
          // Chord row
          html += '<tr>';
          for (const cell of currentLine) {
            if (cell.chord) {
              html += `<td style="padding:4px 12px;color:#38bdf8;font-weight:700;text-align:center;vertical-align:bottom;font-size:15px;white-space:nowrap">${this.escapeHtml(cell.chord)}</td>`;
            } else {
              html += `<td style="padding:4px 12px;vertical-align:bottom">&nbsp;</td>`;
            }
          }
          html += '</tr>';
          
          // Lyric row
          html += '<tr>';
          for (const cell of currentLine) {
            if (cell.lyric) {
              html += `<td style="padding:4px 12px;color:#e5e7eb;text-align:center;vertical-align:top;font-size:16px;white-space:nowrap">${this.escapeHtml(cell.lyric)}</td>`;
            } else {
              html += `<td style="padding:4px 12px;vertical-align:top">&nbsp;</td>`;
            }
          }
          html += '</tr>';
          
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
