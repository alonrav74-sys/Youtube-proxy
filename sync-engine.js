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
    const isRTL = detectedLanguage === 'he' || detectedLanguage === 'Hebrew' || detectedLanguage === 'ar';

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
    const maxWords = 10; // 🔥 Reduced to 10 for better readability!
    const minGapForBreak = 1.5; // 🔥 Break on 1.5s+ pause (natural speech pause)

    console.log(`🔍 Starting line grouping: ${allItems.length} items (${allItems.filter(i => i.type === 'word').length} words, ${allItems.filter(i => i.type === 'chord').length} chords)`);

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
      
      // 🔥 NEW: Break if line duration is too long (15 seconds)
      const lineDuration = item.time - currentLine.startTime;
      if (currentLine.startTime > 0 && lineDuration >= 15.0) {
        shouldBreak = true;
        console.log(`  ⏱️ Breaking on duration: ${lineDuration.toFixed(1)}s`);
      }

      // Break on large gap
      if (nextItem && (nextItem.time - (item.end || item.time)) > minGapForBreak) {
        shouldBreak = true;
      }

      // Break at end
      if (i === allItems.length - 1) {
        shouldBreak = true;
      }

      if (shouldBreak && (currentLine.words.length > 0 || currentLine.chords.length > 0)) {
        lines.push({ ...currentLine });
        console.log(`  📝 Line ${lines.length}: ${currentLine.words.length} words, ${currentLine.chords.length} chords`);
        currentLine = { words: [], chords: [], startTime: 0, endTime: 0 };
      }
    }

    // 🔥 CRITICAL: Save any remaining words/chords in currentLine!
    if (currentLine.words.length > 0 || currentLine.chords.length > 0) {
      lines.push({ ...currentLine });
      console.log(`  📝 Line ${lines.length} (final): ${currentLine.words.length} words, ${currentLine.chords.length} chords`);
    }

    console.log(`✅ Created ${lines.length} lines`);
    console.log(`   Total words in lines: ${lines.reduce((sum, l) => sum + l.words.length, 0)}`);
    console.log(`   Total chords in lines: ${lines.reduce((sum, l) => sum + l.chords.length, 0)}`);

    // Build HTML - Ultimate Guitar style
    let html = '<div style="background:#0a1324;padding:20px;border-radius:12px;font-family:\'Courier New\',monospace;white-space:pre;overflow-y:auto;max-height:500px">';

    for (const line of lines) {
      const words = line.words;
      const chords = line.chords;

      // Check if this is an instrumental section (chords but no words)
      const isInstrumental = chords.length >= 1 && words.length === 0;

      if (isInstrumental) {
        // 🎵 Instrumental section - show "מעבר" or "Instrumental"
        const label = isRTL ? 'מעבר' : 'Instrumental';
        html += `<div style="margin-bottom:25px;${isRTL ? 'direction:rtl;text-align:right' : ''}">`;
        html += `<div style="color:#10b981;font-weight:700;font-size:14px;font-style:italic;margin-bottom:5px">[${label}]</div>`;
        html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace">`;
        chords.forEach(ch => {
          html += `<span style="margin-right:25px">${this.escapeHtml(ch.label)}</span>`;
        });
        html += `</div></div>`;
        continue;
      }

      // Don't skip - instrumental sections need to show!
      // if (words.length === 0) continue;

      // Build display with chords over words
      const lyricText = words.map(w => w.text).join(' ');

      // 🎯 Build actual HTML table (invisible borders)
      if (isRTL) {
        // RTL: Build table with cells from right to left (REVERSED order)
        html += `<table style="margin-bottom:20px;border-collapse:collapse;direction:rtl" dir="rtl">`;
        
        // Chord row - RIGHT TO LEFT
        html += `<tr>`;
        for (let w = 0; w < words.length; w++) {
          const word = words[w];
          
          // Find closest chord to this word (before or slightly after)
          let closestChord = null;
          let minDist = Infinity;
          
          for (const ch of chords) {
            // Check if chord is near this word (within ±1.0s window)
            const dist = Math.abs(ch.time - word.time);
            if (dist < 1.0 && dist < minDist) {
              minDist = dist;
              closestChord = ch;
            }
          }
          
          // Also check if this is the first word and chord is just before it
          if (w === 0 && chords.length > 0) {
            const firstChord = chords[0];
            if (firstChord.time <= word.time && (word.time - firstChord.time) < 1.0) {
              closestChord = firstChord;
            }
          }
          
          const chordLabel = closestChord ? this.escapeHtml(closestChord.label) : '';
          html += `<td style="color:#38bdf8;font-weight:700;font-size:16px;padding:4px 12px;text-align:center;font-family:monospace">${chordLabel}</td>`;
        }
        html += `</tr>`;
        
        // Lyrics row - RIGHT TO LEFT
        html += `<tr>`;
        for (const word of words) {
          html += `<td style="color:#ffffff;font-size:18px;padding:4px 12px;text-align:center">${this.escapeHtml(word.text)}</td>`;
        }
        html += `</tr>`;
        
        html += `</table>`;
      } else {
        // LTR: Build table normally
        html += `<table style="margin-bottom:20px;border-collapse:collapse">`;
        
        // Chord row
        html += `<tr>`;
        for (let w = 0; w < words.length; w++) {
          const word = words[w];
          
          // Find closest chord to this word (before or slightly after)
          let closestChord = null;
          let minDist = Infinity;
          
          for (const ch of chords) {
            // Check if chord is near this word (within ±1.0s window)
            const dist = Math.abs(ch.time - word.time);
            if (dist < 1.0 && dist < minDist) {
              minDist = dist;
              closestChord = ch;
            }
          }
          
          // Also check if this is the first word and chord is just before it
          if (w === 0 && chords.length > 0) {
            const firstChord = chords[0];
            if (firstChord.time <= word.time && (word.time - firstChord.time) < 1.0) {
              closestChord = firstChord;
            }
          }
          
          const chordLabel = closestChord ? this.escapeHtml(closestChord.label) : '';
          html += `<td style="color:#38bdf8;font-weight:700;font-size:16px;padding:4px 12px;text-align:center;font-family:monospace">${chordLabel}</td>`;
        }
        html += `</tr>`;
        
        // Lyrics row
        html += `<tr>`;
        for (const word of words) {
          html += `<td style="color:#ffffff;font-size:18px;padding:4px 12px;text-align:center">${this.escapeHtml(word.text)}</td>`;
        }
        html += `</tr>`;
        
        html += `</table>`;
      }
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
