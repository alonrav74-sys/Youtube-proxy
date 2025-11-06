// =====================================================
// 🎵 SyncEngine v6.1 - Lyrics + Chords Synchronization
// =====================================================

const SyncEngine = {
  // Sync chords with lyrics words
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

  // Refresh sheet tab view
  refreshSheetTabView: function(state, whisperWords, whisperText, detectedLanguage, capo, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    if (!state || !state.timeline) {
      fullSheetEl.innerHTML = '<div style="color:#cbd5e1;padding:20px">ממתין לאקורדים...</div>';
      return;
    }

    if (!whisperWords || whisperWords.length === 0) {
      // No lyrics - show chords only (ALWAYS LTR with spacing)
      const capoVal = parseInt(capo || '0', 10);
      
      let html = `<div dir="ltr" style="padding:20px;line-height:2.5;text-align:left">`;
      html += '<div style="color:#38bdf8;font-weight:700;margin-bottom:10px">🎵 Chords</div>';
      
      // Add chords with timing-based spacing
      let lastTime = 0;
      for (let i = 0; i < state.timeline.length; i++) {
        const chord = state.timeline[i];
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        
        // Calculate spacing based on time difference
        const timeDiff = chord.t - lastTime;
        const spaces = Math.floor(timeDiff * 3); // 3 spaces per second
        const spacing = Math.max(1, Math.min(8, spaces)); // 1-8 spaces
        
        if (i > 0) {
          html += '&nbsp;'.repeat(spacing * 2); // Double spaces for visibility
        }
        
        html += `<span style="color:#38bdf8;font-weight:700;font-size:18px">${this.escapeHtml(displayLabel)}</span>`;
        lastTime = chord.t;
      }
      
      html += '</div>';
      fullSheetEl.innerHTML = html;
      return;
    }

    // Build full sheet with lyrics
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
        end: (w.end || w.start + 0.3) + gateOffset,
        id: `word-${idx}`
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
    let html = `<div dir="${dirAttr}" style="padding:20px;line-height:2.2;font-family:'Courier New',monospace;text-align:${textAlign}">`;
    
    // Track which chords have been used
    const usedChordIndices = new Set();
    
    // Find intro chords (before first line)
    const firstLineStart = lines.length > 0 ? lines[0][0].time : Infinity;
    const introChords = state.timeline.filter((ch, idx) => {
      const chordTime = ch.t + gateOffset;
      if (chordTime < firstLineStart) {
        usedChordIndices.add(idx);
        return true;
      }
      return false;
    });
    
    // Display intro chords
    if (introChords.length > 0) {
      html += '<div style="margin-bottom:30px;color:#38bdf8;font-weight:700">';
      html += '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">[Intro]</div>';
      
      for (let i = 0; i < introChords.length; i++) {
        const chord = introChords[i];
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        
        if (i > 0) html += '&nbsp;&nbsp;&nbsp;&nbsp;';
        html += `<span style="font-size:16px">${this.escapeHtml(displayLabel)}</span>`;
      }
      
      html += '</div>';
    }
    
    // Process each line with lyrics
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineStart = line[0].time;
      const lineEnd = line[line.length - 1].end;
      
      // Find chords in this line's time range
      const lineChords = state.timeline.filter((ch, idx) => {
        const chordTime = ch.t + gateOffset;
        if (chordTime >= lineStart && chordTime <= lineEnd) {
          usedChordIndices.add(idx);
          return true;
        }
        return false;
      });

      // Build lyric text (keep original order for position calculation)
      const lyricText = line.map(w => w.text).join(' ');
      
      // Build chord line with proper positioning
      let chordLine = '';
      
      if (lineChords.length > 0) {
        const chordPositions = [];
        
        for (const chord of lineChords) {
          const chordTime = chord.t + gateOffset;
          let position = 0;
          
          // Find which word this chord belongs to (same logic for LTR and RTL)
          for (let i = 0; i < line.length; i++) {
            const word = line[i];
            if (chordTime >= word.time && chordTime < word.end) {
              // Chord during this word
              const beforeText = line.slice(0, i).map(w => w.text).join(' ');
              position = beforeText.length;
              if (position > 0) position += 1; // Space before word
              break;
            } else if (chordTime < word.time && i === 0) {
              // Chord before first word
              position = 0;
              break;
            } else if (i === line.length - 1 && chordTime >= word.end) {
              // Chord after last word
              position = lyricText.length + 2;
              break;
            }
          }
          
          const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
          chordPositions.push({ position, label: displayLabel, time: chordTime });
        }
        
        if (isRTL) {
          // RTL: Calculate positions from the RIGHT side
          // We need to mirror the positions
          const maxLen = lyricText.length;
          
          // Convert LTR positions to RTL positions
          for (const cp of chordPositions) {
            cp.rtlPosition = Math.max(0, maxLen - cp.position - cp.label.length);
          }
          
          // Sort by RTL position (right to left = descending position)
          chordPositions.sort((a, b) => b.rtlPosition - a.rtlPosition);
          
          let lastPos = maxLen + 10; // Start from far right
          
          for (let i = chordPositions.length - 1; i >= 0; i--) {
            const cp = chordPositions[i];
            const spaces = Math.max(0, lastPos - cp.rtlPosition - cp.label.length);
            chordLine += ' '.repeat(spaces);
            chordLine += cp.label;
            lastPos = cp.rtlPosition;
          }
        } else {
          // LTR: Normal left-to-right positioning
          chordPositions.sort((a, b) => a.position - b.position);
          
          let lastPos = 0;
          for (const cp of chordPositions) {
            const spaces = Math.max(0, cp.position - lastPos);
            chordLine += ' '.repeat(spaces);
            chordLine += cp.label;
            lastPos = cp.position + cp.label.length;
          }
        }
      }

      // Add to HTML
      html += '<div style="margin-bottom:20px">';
      if (chordLine.trim()) {
        html += `<div style="color:#38bdf8;font-weight:700;font-family:monospace;white-space:pre">${this.escapeHtml(chordLine)}</div>`;
      }
      html += `<div style="color:#ffffff;white-space:pre-wrap">${this.escapeHtml(lyricText)}</div>`;
      html += '</div>';
      
      // Check for interlude chords (between this line and next)
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
          html += '<div style="margin:20px 0;color:#38bdf8;font-weight:700">';
          
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
    
    // Find outro chords (after last line)
    const lastLineEnd = lines.length > 0 ? lines[lines.length - 1][lines[lines.length - 1].length - 1].end : 0;
    const outroChords = state.timeline.filter((ch, idx) => {
      const chordTime = ch.t + gateOffset;
      if (chordTime > lastLineEnd && !usedChordIndices.has(idx)) {
        return true;
      }
      return false;
    });
    
    // Display outro chords
    if (outroChords.length > 0) {
      html += '<div style="margin-top:30px;color:#38bdf8;font-weight:700">';
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

  // Helper function
  escapeHtml: function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Make it globally available
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}
