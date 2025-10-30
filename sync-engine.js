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
   * 🏗️ Build chord sheet HTML with chords positioned above words
   * NOW supports chord-only sections (intro, solo, bridge)!
   */
  buildChordSheet(chords, words, isRTL) {
    if (!chords || chords.length === 0) {
      return '<div style="color:#cbd5e1;padding:20px">⏳ ממתין לאקורדים...</div>';
    }
    
    if (!words || words.length === 0) {
      // No words at all - build chord-only sheet
      return this.buildChordOnlySheet(chords, isRTL);
    }
    
    // Identify sections: [lyric sections] + [chord-only sections]
    const sections = this.identifySections(chords, words);
    
    // Build HTML for each section
    let html = '';
    for (const section of sections) {
      if (section.type === 'lyrics') {
        // Regular lyrics with chords
        html += this.buildLine(section.words, chords, isRTL);
      } else {
        // Chord-only section (intro/solo/bridge)
        html += this.buildChordOnlyLine(section.chords, isRTL, section.label);
      }
    }
    
    return html;
  },

  /**
   * 🎸 Identify sections in the song
   * Returns array of: {type: 'lyrics', words: [...]} or {type: 'chords', chords: [...], label: '...'}
   */
  identifySections(allChords, allWords) {
    const sections = [];
    
    if (allWords.length === 0) {
      // No words - entire song is chord-only
      sections.push({
        type: 'chords',
        chords: allChords,
        label: '[Instrumental]'
      });
      return sections;
    }
    
    const firstWordTime = allWords[0].time;
    const lastWordTime = allWords[allWords.length - 1].end || allWords[allWords.length - 1].time;
    
    // Check for intro (chords before first word)
    const introChords = allChords.filter(ch => ch.time < firstWordTime - 0.5);
    if (introChords.length > 0) {
      sections.push({
        type: 'chords',
        chords: introChords,
        label: '[Intro]'
      });
    }
    
    // Group words into lines
    const wordLines = this.groupIntoLines(allWords, false);
    
    // Process each line and check for chord-only gaps between them
    for (let i = 0; i < wordLines.length; i++) {
      const line = wordLines[i];
      
      sections.push({
        type: 'lyrics',
        words: line
      });
      
      // Check for gap between this line and next
      if (i < wordLines.length - 1) {
        const lineEnd = line[line.length - 1].end || line[line.length - 1].time;
        const nextLineStart = wordLines[i + 1][0].time;
        const gapDuration = nextLineStart - lineEnd;
        
        // If gap > 3 seconds, check for chords in gap
        if (gapDuration > 3) {
          const gapChords = allChords.filter(ch => 
            ch.time > lineEnd + 0.5 && ch.time < nextLineStart - 0.5
          );
          
          if (gapChords.length > 0) {
            sections.push({
              type: 'chords',
              chords: gapChords,
              label: '[Instrumental]'
            });
          }
        }
      }
    }
    
    // Check for outro (chords after last word)
    const outroChords = allChords.filter(ch => ch.time > lastWordTime + 0.5);
    if (outroChords.length > 0) {
      sections.push({
        type: 'chords',
        chords: outroChords,
        label: '[Outro]'
      });
    }
    
    return sections;
  },

  /**
   * 🎸 Build chord-only line (for intro/solo/outro)
   */
  buildChordOnlyLine(chords, isRTL, label = '[Instrumental]') {
    if (!chords || chords.length === 0) return '';
    
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    const chordStr = chords.map(ch => ch.label).join('  ');
    
    let html = `<div style="margin-bottom:25px" ${dirAttr}>`;
    html += `<div style="color:#f59e0b;font-weight:700;font-size:14px;font-style:italic;margin-bottom:4px">${escapeHtml(label)}</div>`;
    html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace">${escapeHtml(chordStr)}</div>`;
    html += `</div>`;
    
    return html;
  },

  /**
   * 🎸 Build full chord-only sheet (when no words at all)
   */
  buildChordOnlySheet(chords, isRTL) {
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    
    // Group chords into bars (every 4 chords or by timing)
    const lines = [];
    let currentLine = [];
    
    for (let i = 0; i < chords.length; i++) {
      currentLine.push(chords[i].label);
      
      // Break every 4 chords or at timing gaps
      const nextChord = chords[i + 1];
      const shouldBreak = 
        currentLine.length >= 4 || 
        !nextChord ||
        (nextChord.time - chords[i].time) > 3;
      
      if (shouldBreak) {
        lines.push(currentLine.join('  '));
        currentLine = [];
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine.join('  '));
    }
    
    let html = `<div ${dirAttr}>`;
    html += `<div style="color:#f59e0b;font-weight:700;font-size:14px;font-style:italic;margin-bottom:8px">[Instrumental]</div>`;
    for (const line of lines) {
      html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.8;white-space:pre;font-family:monospace;margin-bottom:8px">${escapeHtml(line)}</div>`;
    }
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

  /**
   * 🎨 Build single line with chords above words (Ultimate Guitar style)
   */
  buildLine(lineWords, allChords, isRTL) {
    if (!lineWords || lineWords.length === 0) return '';
    
    const words = lineWords;
    const lineStart = words[0].time;
    const lineEnd = words[words.length - 1].end || words[words.length - 1].time;
    
    // 🆕 Include chords BEFORE and AFTER the line, not just within!
    // Expand range by ±2 seconds to catch chords near boundaries
    const expandedStart = Math.max(0, lineStart - 2);
    const expandedEnd = lineEnd + 2;
    
    console.log(`📝 Building line: ${lineStart.toFixed(1)}s - ${lineEnd.toFixed(1)}s (expanded: ${expandedStart.toFixed(1)}s - ${expandedEnd.toFixed(1)}s)`);
    console.log(`   Words: ${words.map(w => w.text).join(' ')}`);
    
    const lineChords = allChords.filter(ch => 
      ch.time >= expandedStart && ch.time <= expandedEnd
    );
    
    console.log(`   Found ${lineChords.length} chords in range: ${lineChords.map(ch => `${ch.label}@${ch.time.toFixed(1)}s`).join(', ')}`);
    
    // Calculate positions (SAME for both languages)
    const lyricText = words.map(w => w.text).join(' ');
    
    const chordPositions = [];
    for(const chord of lineChords) {
      let position = 0;
      let found = false;
      
      // Try to find word that contains this chord time
      for(let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordEnd = word.end || (word.time + 0.3);
        if(chord.time >= word.time && chord.time <= wordEnd) {
          // Chord is ON this word
          const beforeText = words.slice(0, i).map(w => w.text).join(' ');
          position = beforeText.length;
          if(position > 0) position += 1;
          found = true;
          break;
        }
      }
      
      if(!found) {
        // Chord is NOT on any word - find closest position
        if(chord.time < words[0].time) {
          // 🆕 BEFORE first word - put at position 0
          position = 0;
          console.log(`   🎸 Chord ${chord.label} BEFORE first word at pos 0`);
        } else if(chord.time > lineEnd) {
          // 🆕 AFTER last word - put at end + 2 spaces
          position = lyricText.length + 2;
          console.log(`   🎸 Chord ${chord.label} AFTER last word at pos ${position}`);
        } else {
          // Between words - find which gap
          for(let i = 0; i < words.length - 1; i++) {
            const currentWordEnd = words[i].end || words[i].time;
            const nextWordStart = words[i + 1].time;
            
            if(chord.time > currentWordEnd && chord.time < nextWordStart) {
              // Chord is in gap between words[i] and words[i+1]
              const beforeText = words.slice(0, i + 1).map(w => w.text).join(' ');
              position = beforeText.length + 1; // After current word + space
              console.log(`   🎸 Chord ${chord.label} BETWEEN words at pos ${position}`);
              found = true;
              break;
            }
          }
          
          if(!found) {
            // Fallback: put at end
            position = lyricText.length + 2;
          }
        }
      }
      
      chordPositions.push({ position, label: chord.label, time: chord.time });
    }
    
    chordPositions.sort((a, b) => a.position - b.position);
    
    // Build chord line
    let chordLine = '';
    let lastPos = 0;
    for(const cp of chordPositions) {
      const spaces = Math.max(0, cp.position - lastPos);
      chordLine += ' '.repeat(spaces) + cp.label;
      lastPos = cp.position + cp.label.length;
    }
    
    const dirAttr = isRTL ? 'dir="rtl"' : 'dir="ltr"';
    
    let html = `<div style="margin-bottom:25px" ${dirAttr}>`;
    html += `<div style="color:#38bdf8;font-weight:700;font-size:16px;line-height:1.3;white-space:pre;font-family:monospace">${escapeHtml(chordLine)}</div>`;
    html += `<div style="color:#ffffff;font-size:18px;line-height:1.3;white-space:pre">${escapeHtml(lyricText)}</div>`;
    html += `</div>`;
    
    return html;
  }
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
