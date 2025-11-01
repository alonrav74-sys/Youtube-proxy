// sync-engine.js - Lyrics & Chords Synchronization Engine
// Handles "Full Sheet" tab with instrumental sections

const SyncEngine = {
  /**
   * Sync chords with lyrics for "Full Sheet" tab
   * IDENTICAL to buildFullLyricsSheet but without highlight/scroll
   */
  refreshSheetTabView(state, whisperWords, whisperText, detectedLanguage, capoValue, sanitizeLabel, applyCapoToLabel, targetElement) {
    if (!state || !state.timeline) {
      targetElement.innerHTML = '<div style="color:#cbd5e1;padding:20px">⏳ ממתין לאקורדים...</div>';
      return;
    }

    const capo = parseInt(capoValue || '0', 10);
    const gateOffset = state.gateTime || 0;
    const isRTL = detectedLanguage === 'he' || detectedLanguage === 'ar';

    // If no lyrics, show chords only
    if (!whisperWords || whisperWords.length === 0) {
      this.renderChordsOnly(state, capo, gateOffset, targetElement, sanitizeLabel, applyCapoToLabel, isRTL);
      return;
    }

    // 🎸 Build lines that include BOTH words and chords
    // IDENTICAL logic to buildFullLyricsSheet
    
    const allItems = [];

    // Add all chords
    state.timeline.forEach(chord => {
      allItems.push({
        type: 'chord',
        time: chord.t + gateOffset,
        label: sanitizeLabel(applyCapoToLabel(chord.label, capo)),
        originalTime: chord.t
      });
    });

    // Add all words
    whisperWords.forEach((w, idx) => {
      const text = (w.word || w.text || '').trim();
      if (!text) return;
      allItems.push({
        type: 'word',
        time: w.start + gateOffset,
        end: (w.end || w.start) + gateOffset,
        text: text,
        id: `word-${idx}`
      });
    });

    // Sort by time
    allItems.sort((a, b) => a.time - b.time);

    // Group into lines
    const lines = [];
    let currentLine = { words: [], chords: [], startTime: 0, endTime: 0 };
    const maxWords = 12;
    const gapThreshold = 3.0; // seconds - if gap > 3s, start new line

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const nextItem = allItems[i + 1];

      if (item.type === 'chord') {
        currentLine.chords.push(item);
        if (currentLine.startTime === 0) currentLine.startTime = item.time;
        currentLine.endTime = item.time;
      } else if (item.type === 'word') {
        currentLine.words.push(item);
        if (currentLine.startTime === 0) currentLine.startTime = item.time;
        currentLine.endTime = item.end;
      }

      // Check if we should start a new line
      let shouldBreak = false;

      // Break on punctuation
      if (item.type === 'word' && /[.!?,;؛،־]$/.test(item.text)) {
        shouldBreak = true;
      }

      // Break if too many words
      if (currentLine.words.length >= maxWords) {
        shouldBreak = true;
      }

      // Break on large gap
      if (nextItem && (nextItem.time - (item.end || item.time)) > gapThreshold) {
        shouldBreak = true;
      }

      // Break at end
      if (i === allItems.length - 1) {
        shouldBreak = true;
      }

      if (shouldBreak && (currentLine.words.length > 0 || currentLine.chords.length > 0)) {
        lines.push({ ...currentLine });
        currentLine = { words: [], chords: [], startTime: 0, endTime: 0 };
      }
    }

    // Build HTML - Ultimate Guitar style
    let html = '<div style="background:#0a1324;padding:20px;border-radius:12px;font-family:\'Courier New\',monospace;white-space:pre;overflow-y:auto;max-height:500px">';

    for (const line of lines) {
      const words = line.words;
      const chords = line.chords;

      // Check if this is an instrumental section (chords but no words)
      const isInstrumental = chords.length >= 3 && words.length === 0;

      if (isInstrumental) {
        // 🎵 Instrumental section - show "מעבר" or "Instrumental"
        const label = isRTL ? 'מעבר' : 'Instrumental';

        const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
        html += `<div style="margin-bottom:25px" ${dirAttr}>`;
        html += `<div style="color:#10b981;font-weight:700;font-size:14px;font-style:italic;margin-bottom:5px">[${label}]</div>`;
        html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace">`;
        chords.forEach(ch => {
          html += `<span style="margin-right:15px">${this.escapeHtml(ch.label)}</span>`;
        });
        html += `</div></div>`;
        continue;
      }

      if (words.length === 0) continue; // Skip empty lines

      // Build display with chords over words
      const lyricText = words.map(w => w.text).join(' ');

      // Calculate chord positions above words
      // RTL: position from RIGHT, LTR: position from LEFT
      const chordPositions = [];
      for (const chord of chords) {
        let position = 0;
        let found = false;

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const wordEnd = word.end || (word.time + 0.3); // minimum duration for matching
          if (chord.time >= word.time && chord.time <= wordEnd) {
            if (isRTL) {
              // RTL: position = characters AFTER this word (from right)
              const afterText = words.slice(i + 1).map(w => w.text).join(' ');
              position = afterText.length;
              if (position > 0) position += 1; // add space
            } else {
              // LTR: position = characters BEFORE this word (from left)
              const beforeText = words.slice(0, i).map(w => w.text).join(' ');
              position = beforeText.length;
              if (position > 0) position += 1;
            }
            found = true;
            break;
          }
        }

        if (!found) {
          // Chord is before first word or after last word
          if (isRTL) {
            position = chord.time > words[words.length - 1].end ? 0 : lyricText.length + 1;
          } else {
            position = chord.time < words[0].time ? 0 : lyricText.length + 1;
          }
        }

        chordPositions.push({ position, label: chord.label, id: chord.originalTime });
      }

      // Sort chord positions - ALWAYS ascending (0→10)
      // The position calculation already handles RTL correctly
      chordPositions.sort((a, b) => a.position - b.position);

      // Build chord line with spaces
      let chordLine = '';
      let lastPos = 0;
      for (const cp of chordPositions) {
        const spaces = Math.max(0, cp.position - lastPos);
        chordLine += ' '.repeat(spaces);
        chordLine += cp.label;
        lastPos = cp.position + cp.label.length;
      }

      html += `<div style="margin-bottom:25px">`;
      
      if (isRTL) {
        // RTL (Hebrew): chords LTR right-aligned, lyrics RTL right-aligned
        html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace;direction:ltr;text-align:right">${this.escapeHtml(chordLine)}</div>`;
        html += `<div style="color:#ffffff;font-size:18px;line-height:1.3;white-space:pre;direction:rtl;text-align:right">${this.escapeHtml(lyricText)}</div>`;
      } else {
        // LTR (English): keep original - UNCHANGED
        html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace">${this.escapeHtml(chordLine)}</div>`;
        html += `<div style="color:#ffffff;font-size:18px;line-height:1.3;white-space:pre">${this.escapeHtml(lyricText)}</div>`;
      }
      
      html += `</div>`;
    }

    html += '</div>';
    targetElement.innerHTML = html;

    console.log(`✅ Full sheet rendered: ${lines.length} lines (${lines.filter(l => l.words.length === 0 && l.chords.length >= 3).length} instrumental)`);
  },

  renderChordsOnly(state, capo, gateOffset, targetElement, sanitizeLabel, applyCapoToLabel, isRTL) {
    let html = '<div style="background:#0a1324;padding:20px;border-radius:12px;font-family:\'Courier New\',monospace;white-space:pre;line-height:1.8">';

    const lines = [];
    let currentLine = [];
    const gapThreshold = 3.0;

    for (let i = 0; i < state.timeline.length; i++) {
      const chord = state.timeline[i];
      const nextChord = state.timeline[i + 1];
      const chordLabel = sanitizeLabel(applyCapoToLabel(chord.label, capo));

      currentLine.push(chordLabel);

      if (nextChord) {
        const gap = nextChord.t - chord.t;
        if (gap > gapThreshold) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    for (const line of lines) {
      html += `<div style="color:#38bdf8;font-weight:700;font-size:18px;margin-bottom:15px">`;
      html += this.escapeHtml(line.join('  '));
      html += `</div>`;
    }

    html += '</div>';
    targetElement.innerHTML = html;
  },

  syncChordsWithLyrics(state, whisperWords, capoValue, sanitizeLabel, applyCapoToLabel) {
    // Legacy function - kept for compatibility
    return [];
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
