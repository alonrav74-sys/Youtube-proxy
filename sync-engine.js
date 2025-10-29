/**
 * Sync Engine - Extracted from ChordFinder Pro
 * מנוע הסנכרון בין אקורדים למילים
 */

class SyncEngine {
  /**
   * Sync chords with lyrics - creates live stream
   */
  static syncChordsWithLyrics(STATE, WHISPER_WORDS, capoValue, sanitizeLabel, applyCapoToLabel) {
    if (!STATE || !WHISPER_WORDS || WHISPER_WORDS.length === 0) return [];
    
    const tl = STATE.timeline;
    const words = WHISPER_WORDS;
    const LIVE_STREAM = [];
    const capo = parseInt(capoValue || '0', 10);

    for (const w of words) {
      const start = w.start;
      const end = w.end ?? (w.start + 0.1);
      const near = tl.find(ch => ch.t >= start - 0.05 && ch.t <= end + 0.05);
      LIVE_STREAM.push({
        start,
        text: (w.word || w.text || ''),
        chordLabel: near ? applyCapoToLabel(sanitizeLabel(near.label), capo) : null,
        isSpacer: false
      });
    }

    for (const ch of tl) {
      const t = ch.t;
      const hasWord = words.some(w => t >= (w.start - 0.05) && t <= ((w.end ?? (w.start + 0.1)) + 0.05));
      if (!hasWord) {
        LIVE_STREAM.push({
          start: t,
          text: '',
          chordLabel: applyCapoToLabel(sanitizeLabel(ch.label), capo),
          isSpacer: true
        });
      }
    }

    LIVE_STREAM.sort((a, b) => a.start - b.start);

    tl.forEach((ch, i) => {
      const nextT = tl[i + 1]?.t ?? (ch.t + 10);
      const bucket = words.filter(w => w.start >= ch.t && w.start < nextT);
      ch.words = bucket.map(w => (w.word || w.text || '').trim());
    });

    return LIVE_STREAM;
  }

  /**
   * Build sheet tab view with synchronized chords and lyrics
   */
  static refreshSheetTabView(STATE, WHISPER_WORDS, WHISPER_TEXT, DETECTED_LANGUAGE, capoValue, sanitizeLabel, applyCapoToLabel, fullSheetEl) {
    if (!STATE) {
      if (fullSheetEl) fullSheetEl.textContent = 'לחץ "נתח"';
      return;
    }

    const capo = parseInt(capoValue || '0', 10);
    const isRTL = DETECTED_LANGUAGE === 'he';
    fullSheetEl.className = `synced-sheet ${isRTL ? 'rtl' : ''}`;

    if (!WHISPER_WORDS || WHISPER_WORDS.length === 0) {
      let output = '<div style="color:#000;font-family:Arial">🎸 אקורדים:<br><br>';
      STATE.timeline.forEach((ev, i) => {
        const chord = applyCapoToLabel(ev.label, capo);
        output += `${chord}  `;
        if ((i + 1) % 8 === 0) output += '<br>';
      });
      output += '<br><br>💡 לסנכרון מילים צריך Groq Whisper</div>';
      fullSheetEl.innerHTML = output;
      return;
    }

    const words = WHISPER_WORDS;
    const tl = STATE.timeline;

    console.log(`🎤 Total words from Whisper: ${words.length}`);
    console.log(`🎸 Total chords detected: ${tl.length}`);

    const lines = [];
    let currentLine = [];
    const WORDS_PER_LINE = 8;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      currentLine.push(w);

      const text = w.word || w.text || '';
      const isEndOfSentence = /[.!?,؛،]/.test(text.trim());

      if (currentLine.length >= WORDS_PER_LINE || isEndOfSentence || i === words.length - 1) {
        if (currentLine.length > 0) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
    }

    let html = '';

    for (const line of lines) {
      if (line.length === 0) continue;

      const lineStart = line[0].start;
      const lineEnd = (line[line.length - 1].end ?? line[line.length - 1].start) + 0.5;

      const chordsInLine = tl.filter(ch => ch.t >= lineStart && ch.t <= lineEnd);
      chordsInLine.sort((a, b) => a.t - b.t);

      const items = [];
      const usedChords = new Set();

      for (const w of line) {
        const wordText = (w.word || w.text || '').trim();
        const wordTime = w.start;

        let matchedChord = null;
        let minDiff = 0.15;

        for (const ch of chordsInLine) {
          if (usedChords.has(ch)) continue;

          const diff = Math.abs(ch.t - wordTime);
          if (diff < minDiff) {
            minDiff = diff;
            matchedChord = ch;
          }
        }

        if (matchedChord) {
          usedChords.add(matchedChord);
        }

        items.push({
          word: wordText,
          chord: matchedChord ? applyCapoToLabel(sanitizeLabel(matchedChord.label), capo) : null,
          time: wordTime
        });
      }

      for (const ch of chordsInLine) {
        if (usedChords.has(ch)) continue;

        let insertIndex = items.length;
        for (let i = 0; i < items.length; i++) {
          if (ch.t < items[i].time) {
            insertIndex = i;
            break;
          }
        }

        items.splice(insertIndex, 0, {
          word: null,
          chord: applyCapoToLabel(sanitizeLabel(ch.label), capo),
          time: ch.t,
          isSpacer: true
        });
      }

      let chordLine = '';
      let lyricLine = '';
      const MAX_LINE_WIDTH = 70;

      for (const item of items) {
        if (item.isSpacer) {
          const spacerWidth = item.chord.length + 2;

          if (lyricLine.length + spacerWidth > MAX_LINE_WIDTH && lyricLine.length > 0) {
            html += `<div class="chord-line">${chordLine}</div>`;
            html += `<div class="lyric-line">${lyricLine.trimEnd()}</div>`;
            chordLine = '';
            lyricLine = '';
          }

          while (chordLine.length < lyricLine.length) {
            chordLine += ' ';
          }
          chordLine += item.chord + '  ';
          lyricLine += ' '.repeat(spacerWidth);

        } else {
          const wordLength = item.word.length + 1;

          if (lyricLine.length + wordLength > MAX_LINE_WIDTH && lyricLine.length > 10) {
            html += `<div class="chord-line">${chordLine}</div>`;
            html += `<div class="lyric-line">${lyricLine.trimEnd()}</div>`;
            chordLine = '';
            lyricLine = '';
          }

          if (item.chord) {
            while (chordLine.length < lyricLine.length) {
              chordLine += ' ';
            }
            chordLine += item.chord;
          }

          lyricLine += item.word + ' ';
        }
      }

      if (lyricLine.trim().length > 0) {
        html += `<div class="chord-line">${chordLine}</div>`;
        html += `<div class="lyric-line">${lyricLine.trimEnd()}</div>`;
      }
    }

    fullSheetEl.innerHTML = html || '<div style="color:#999">אין תוצאות</div>';
  }
}

if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
  console.log('✅ SyncEngine loaded');
}
