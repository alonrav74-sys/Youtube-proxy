/**
 * ChordDebugger v4.4 - CRYSTAL CLEAR
 * 
 * עמודות פשוטות:
 * 1. Base - האקורד מהמנוע הבסיסי
 * 2. Refiner - ▲ מז'ור או ▼ מינור + אחוז
 * 3. Bass - **רק התו שזוהה** + אחוז (לא אקורד!)
 * 4. Final - האקורד הסופי
 * 5. Time - זמן
 */

const ChordDebugger = {
  
  buildDebugData(result, capoOffset = 0) {
    const chords = result.chords || [];
    const debugData = [];

    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      
      // ═══════════════════════════════════════════════════════════════
      // 🎵 REFINER - just major/minor
      // ═══════════════════════════════════════════════════════════════
      const refinerAnalysis = chord.refinerAnalysis || null;
      const refinerApplied = chord.refinedBy === 'MajorMinorRefiner';
      const refinerConfidence = chord.refinerConfidence || 
                                refinerAnalysis?.qualityConfidence || 0;
      
      let detectedQuality = 'unclear';
      
      // Check from refinerAnalysis
      if (refinerAnalysis?.detectedQuality) {
        detectedQuality = refinerAnalysis.detectedQuality;
      }
      
      // Or calculate from strengths
      if (refinerAnalysis?.major3rdStrength !== undefined) {
        const m3 = refinerAnalysis.minor3rdStrength || 0;
        const M3 = refinerAnalysis.major3rdStrength || 0;
        if (M3 > m3 + 0.005) detectedQuality = 'major';
        else if (m3 > M3 + 0.005) detectedQuality = 'minor';
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎸 BASS - ONLY THE NOTE! Nothing else!
      // ═══════════════════════════════════════════════════════════════
      
      // bassDetected should be just a note name like "E", "A", "D"
      let bassNote = null;
      let bassConfidence = chord.bassConfidence || 0;
      
      if (chord.bassDetected && chord.bassDetected !== 'NO_BASS') {
        // Extract just the note name (in case it's something weird)
        const noteMatch = chord.bassDetected.match(/^([A-G][#b]?)/);
        if (noteMatch) {
          bassNote = noteMatch[1];
        } else {
          bassNote = chord.bassDetected;
        }
      }
      
      const bassApplied = chord.changedByBass === true;

      // ═══════════════════════════════════════════════════════════════
      // 📊 CHORDS
      // ═══════════════════════════════════════════════════════════════
      
      let baseChord = chord.originalLabel || chord.label;
      let finalChord = chord.label;

      // Apply capo
      if (capoOffset > 0) {
        baseChord = this.applyCapo(baseChord, capoOffset);
        finalChord = this.applyCapo(finalChord, capoOffset);
        if (bassNote) {
          bassNote = this.applyCapo(bassNote, capoOffset);
        }
      }

      debugData.push({
        index: i + 1,
        time: this.formatTime(chord.t),
        timeSeconds: chord.t,
        baseChord,
        detectedQuality,
        refinerConfidence,
        refinerApplied,
        bassNote,  // JUST THE NOTE!
        bassConfidence,
        bassApplied,
        finalChord
      });
    }

    return debugData;
  },

  renderTable(debugData, filter = 'all') {
    if (!debugData || !debugData.length) {
      return '<tr><td colspan="6" style="color:#94a3b8;padding:30px">אין נתונים</td></tr>';
    }

    // Apply filter
    let filtered = debugData;
    if (filter === 'refiner') {
      filtered = debugData.filter(d => d.refinerApplied);
    } else if (filter === 'bass') {
      filtered = debugData.filter(d => d.bassApplied);
    } else if (filter === 'changed') {
      filtered = debugData.filter(d => d.refinerApplied || d.bassApplied);
    }

    if (!filtered.length) {
      return '<tr><td colspan="6" style="color:#94a3b8;padding:30px">אין תוצאות</td></tr>';
    }

    let html = '';

    for (const row of filtered) {
      // ═══════════════════════════════════════════════════════════════
      // 🎵 REFINER CELL - just ▲ or ▼ with percentage
      // ═══════════════════════════════════════════════════════════════
      let refinerCell = '';
      const refConf = Math.round(row.refinerConfidence * 100);
      
      if (row.detectedQuality === 'major') {
        const color = row.refinerApplied ? '#22c55e' : '#94a3b8';
        refinerCell = `<span style="color:${color};font-weight:bold">▲</span> <small style="color:${color}">${refConf}%</small>`;
      } else if (row.detectedQuality === 'minor') {
        const color = row.refinerApplied ? '#22c55e' : '#94a3b8';
        refinerCell = `<span style="color:${color};font-weight:bold">▼</span> <small style="color:${color}">${refConf}%</small>`;
      } else {
        refinerCell = `<span style="color:#64748b">—</span>`;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎸 BASS CELL - JUST THE NOTE!
      // ═══════════════════════════════════════════════════════════════
      let bassCell = '';
      
      if (!row.bassNote) {
        bassCell = `<span style="color:#64748b">—</span>`;
      } else {
        const bassConf = Math.round(row.bassConfidence * 100);
        const color = row.bassApplied ? '#38bdf8' : '#94a3b8';
        
        // BIG NOTE + small percentage
        bassCell = `
          <span style="color:${color};font-weight:bold;font-size:16px">${row.bassNote}</span>
          <small style="color:${color};display:block">${bassConf}%</small>
        `;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎯 FINAL - highlight if changed
      // ═══════════════════════════════════════════════════════════════
      const changed = row.baseChord !== row.finalChord;
      const finalStyle = changed ? 'background:#fef3c7;color:#92400e;font-weight:bold' : '';

      // ═══════════════════════════════════════════════════════════════
      // 🏗️ BUILD ROW
      // ═══════════════════════════════════════════════════════════════
      html += `
        <tr>
          <td class="base-col">${row.baseChord}</td>
          <td class="refiner-col" style="text-align:center">${refinerCell}</td>
          <td class="bass-col" style="text-align:center">${bassCell}</td>
          <td style="${finalStyle}">${row.finalChord}</td>
          <td style="color:#64748b">${row.time}</td>
        </tr>
      `;
    }

    return html;
  },

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  applyCapo(chord, capo) {
    if (!chord || capo === 0) return chord;

    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    const match = chord.match(/^([A-G][#b]?)/);
    if (!match) return chord;

    let root = match[1];
    const suffix = chord.slice(root.length);

    root = root.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#');

    const idx = notes.indexOf(root);
    if (idx === -1) return chord;

    const newIdx = ((idx - capo) % 12 + 12) % 12;
    return flats[newIdx] + suffix;
  },

  downloadCSV(debugData, filename) {
    const headers = ['Base', 'Quality', 'Quality%', 'Bass Note', 'Bass%', 'Final', 'Time'];
    let csv = headers.join(',') + '\n';

    for (const row of debugData) {
      csv += [
        `"${row.baseChord}"`,
        `"${row.detectedQuality}"`,
        Math.round(row.refinerConfidence * 100) + '%',
        `"${row.bassNote || '-'}"`,
        Math.round(row.bassConfidence * 100) + '%',
        `"${row.finalChord}"`,
        row.time
      ].join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordDebugger;
}
