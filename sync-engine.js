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
      fullSheetEl.innerHTML = '<div style="color:#cbd5e1;padding:20px">⏳ ממתין לאקורדים...</div>';
      return;
    }

    if (!whisperWords || whisperWords.length === 0) {
      // No lyrics - show chords only
      const capoVal = parseInt(capo || '0', 10);
      const isRTL = detectedLanguage === 'he';
      const dirClass = isRTL ? 'rtl' : 'ltr';
      
      let html = `<div class="${dirClass}" style="padding:20px;line-height:2">`;
      html += '<div style="color:#38bdf8;font-weight:700;margin-bottom:10px">🎵 אקורדים (ללא מילים)</div>';
      
      for (const chord of state.timeline) {
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        html += `<span style="color:#38bdf8;font-weight:700;margin:0 10px">${this.escapeHtml(displayLabel)}</span>`;
      }
      
      html += '</div>';
      fullSheetEl.innerHTML = html;
      return;
    }

    // Build full sheet with lyrics
    const capoVal = parseInt(capo || '0', 10);
    const gateOffset = state.gateTime || 0;
    const isRTL = detectedLanguage === 'he';
    const dirClass = isRTL ? 'rtl' : 'ltr';
    
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
    let html = `<div class="${dirClass}" style="padding:20px;line-height:1.8;font-family:'Courier New',monospace">`;
    
    for (const line of lines) {
      const lineStart = line[0].time;
      const lineEnd = line[line.length - 1].end;
      
      // Find chords in this line's time range
      const lineChords = state.timeline.filter(ch => {
        const chordTime = ch.t + gateOffset;
        return chordTime >= lineStart && chordTime <= lineEnd;
      });

      const lyricText = line.map(w => w.text).join(' ');
      
      // Position chords above lyrics
      const chordPositions = [];
      for (const chord of lineChords) {
        const chordTime = chord.t + gateOffset;
        let position = 0;
        
        // Find which word this chord belongs to
        for (let i = 0; i < line.length; i++) {
          const word = line[i];
          if (chordTime >= word.time && chordTime <= word.end) {
            const beforeText = line.slice(0, i).map(w => w.text).join(' ');
            position = beforeText.length;
            if (position > 0) position += 1;
            break;
          }
        }
        
        const displayLabel = sanitizeLabel(applyCapoToLabel(chord.label, capoVal));
        chordPositions.push({ position, label: displayLabel });
      }

      // Build chord line
      chordPositions.sort((a, b) => a.position - b.position);
      let chordLine = '';
      let lastPos = 0;
      
      for (const cp of chordPositions) {
        const spaces = Math.max(0, cp.position - lastPos);
        chordLine += ' '.repeat(spaces);
        chordLine += cp.label;
        lastPos = cp.position + cp.label.length;
      }

      // Add to HTML
      html += '<div style="margin-bottom:20px">';
      if (chordLine.trim()) {
        html += `<div style="color:#38bdf8;font-weight:700;font-family:monospace">${this.escapeHtml(chordLine)}</div>`;
      }
      html += `<div style="color:#ffffff">${this.escapeHtml(lyricText)}</div>`;
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
