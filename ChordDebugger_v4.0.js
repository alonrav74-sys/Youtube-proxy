/**
 * ChordDebugger v4.2 - FIXED Bass Display + Better Refiner Display
 * 
 * 🔧 תיקונים:
 * - תצוגת באס הגיונית: מראה את התו שזוהה ואיך הוא משפיע
 * - תצוגת Refiner משופרת
 */

const ChordDebugger = {
  /**
   * Build debug data from engine result
   */
  buildDebugData(result, capoOffset = 0) {
    const chords = result.chords || [];
    const debugData = [];

    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      
      // ═══════════════════════════════════════════════════════════════
      // 🎵 REFINER DATA
      // ═══════════════════════════════════════════════════════════════
      const refinerApplied = chord.refinedBy === 'MajorMinorRefiner';
      const refinerConfidence = chord.refinerConfidence || 
                                chord.refinerAnalysis?.qualityConfidence || 0;
      const refinerReason = chord.reason || 
                           chord.refinerAnalysis?.reason || 'no_data';
      
      const refinerAnalysis = chord.refinerAnalysis || null;
      const detectedQuality = refinerAnalysis?.detectedQuality || 'unclear';
      
      // ═══════════════════════════════════════════════════════════════
      // 🎸 BASS DATA
      // ═══════════════════════════════════════════════════════════════
      let bassDetected = chord.bassDetected || null;
      const bassApplied = chord.changedByBass === true;
      const bassConfidence = chord.bassConfidence || 0;
      const bassFrequency = chord.bassFrequency || 0;

      // ═══════════════════════════════════════════════════════════════
      // 🔍 RECONSTRUCT CHORD STAGES
      // ═══════════════════════════════════════════════════════════════
      
      // Start with the final label
      let finalChord = chord.label;
      let baseChord = chord.label;
      let refinerChord = chord.label;
      
      // If we have originalLabel, that's the base
      if (chord.originalLabel) {
        baseChord = chord.originalLabel;
      }
      
      // Work out what refiner did
      if (refinerApplied) {
        // Refiner changed something
        if (chord.originalLabel) {
          baseChord = chord.originalLabel;
        }
        // The refiner output is the label before bass
        refinerChord = bassApplied && finalChord.includes('/') 
          ? finalChord.split('/')[0] 
          : finalChord;
      } else {
        refinerChord = baseChord;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎸 APPLY CAPO
      // ═══════════════════════════════════════════════════════════════
      if (capoOffset > 0) {
        baseChord = this.applyCapo(baseChord, capoOffset);
        refinerChord = this.applyCapo(refinerChord, capoOffset);
        finalChord = this.applyCapo(finalChord, capoOffset);
        
        if (bassDetected && bassDetected !== 'NO_BASS') {
          bassDetected = this.applyCapo(bassDetected, capoOffset);
        }
      }

      debugData.push({
        index: i + 1,
        time: this.formatTime(chord.t),
        timeSeconds: chord.t,
        
        // Base engine
        baseChord: baseChord,
        
        // Refiner info
        refinerChord: refinerChord,
        refinerApplied: refinerApplied,
        refinerConfidence: refinerConfidence,
        refinerReason: refinerReason,
        refinerAnalysis: refinerAnalysis,
        detectedQuality: detectedQuality,
        
        // Bass info - SIMPLE AND CLEAR
        bassDetected: bassDetected,  // The actual note detected
        bassApplied: bassApplied,
        bassConfidence: bassConfidence,
        bassFrequency: bassFrequency,
        
        // Final
        finalChord: finalChord,
        
        // Which stage "won"
        winner: bassApplied ? 'bass' : (refinerApplied ? 'refiner' : 'base')
      });
    }

    return debugData;
  },

  /**
   * Render debug table
   */
  renderTable(debugData, filter = 'all') {
    if (!debugData || !debugData.length) {
      return '<tr><td colspan="7" style="color:#94a3b8;padding:30px">אין נתונים</td></tr>';
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
      return '<tr><td colspan="7" style="color:#94a3b8;padding:30px">אין תוצאות מסוננות</td></tr>';
    }

    let html = '';

    for (const row of filtered) {
      const baseClass = row.winner === 'base' ? 'base-col winner' : 'base-col';
      const refinerClass = row.winner === 'refiner' ? 'refiner-col winner' : 'refiner-col';
      const bassClass = row.winner === 'bass' ? 'bass-col winner' : 'bass-col';

      // ═══════════════════════════════════════════════════════════════
      // 🎵 REFINER CELL
      // ═══════════════════════════════════════════════════════════════
      let refinerContent = '';
      const qualityIcon = row.detectedQuality === 'major' ? '▲' : 
                         row.detectedQuality === 'minor' ? '▼' : '?';
      const confPercent = (row.refinerConfidence * 100).toFixed(0);
      
      if (row.refinerApplied) {
        // Refiner CHANGED the chord
        refinerContent = `
          <div class="changed">${row.refinerChord}</div>
          <small style="color:#22c55e">${qualityIcon} ${confPercent}%</small>
        `;
      } else if (row.refinerConfidence > 0) {
        // Refiner analyzed but didn't change
        refinerContent = `
          <span style="color:#94a3b8">${row.baseChord}</span><br>
          <small style="color:#64748b">${qualityIcon} ${confPercent}%</small>
        `;
      } else {
        refinerContent = `<span style="color:#64748b">—</span>`;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎸 BASS CELL - FIXED! Simple and logical
      // ═══════════════════════════════════════════════════════════════
      let bassContent = '';
      
      if (!row.bassDetected || row.bassDetected === 'NO_BASS') {
        // No bass detected
        bassContent = `<span style="color:#94a3b8">NO_BASS</span>`;
      } else if (row.bassApplied) {
        // Bass CHANGED something - show the result
        bassContent = `
          <div class="changed">${row.finalChord}</div>
          <small style="color:#38bdf8">🎸 ${row.bassDetected} (${(row.bassConfidence * 100).toFixed(0)}%)</small>
        `;
      } else {
        // Bass detected but matches root (no change needed)
        bassContent = `
          <span style="color:#94a3b8">${row.bassDetected}</span><br>
          <small style="color:#64748b">${(row.bassConfidence * 100).toFixed(0)}% (תואם)</small>
        `;
      }

      // ═══════════════════════════════════════════════════════════════
      // 📝 NOTES CELL
      // ═══════════════════════════════════════════════════════════════
      let notes = [];
      
      if (row.refinerApplied) {
        notes.push(`🎵 ${this.getRefinerReasonText(row.refinerReason)}`);
      }
      
      if (row.bassApplied) {
        notes.push(`🎸 בס: ${row.bassDetected}`);
      }
      
      const notesContent = notes.length ? notes.join('<br>') : '<span style="color:#64748b">—</span>';

      html += `
        <tr>
          <td>${row.index}</td>
          <td>${row.time}</td>
          <td class="${baseClass}">${row.baseChord}</td>
          <td class="${refinerClass}">${refinerContent}</td>
          <td class="${bassClass}">${bassContent}</td>
          <td class="final-col">${row.finalChord}</td>
          <td style="font-size:11px;color:#cbd5e1;text-align:right">${notesContent}</td>
        </tr>
      `;
    }

    return html;
  },

  getRefinerReasonText(reason) {
    const map = {
      'major_to_minor': 'מז\'ור → מינור',
      'minor_to_major': 'מינור → מז\'ור',
      'too_short': 'קצר מדי',
      'complex_chord': 'אקורד מורכב',
      'no_change': 'ללא שינוי',
      'no_data': ''
    };
    return map[reason] || reason;
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
    const newRoot = flats[newIdx];

    return newRoot + suffix;
  },

  downloadCSV(debugData, filename) {
    const headers = ['#', 'Time', 'Base', 'Refiner', 'Refiner%', 'Quality', 'Bass Note', 'Bass%', 'Final', 'Winner'];
    let csv = headers.join(',') + '\n';

    for (const row of debugData) {
      csv += [
        row.index,
        row.time,
        `"${row.baseChord}"`,
        `"${row.refinerChord}"`,
        (row.refinerConfidence * 100).toFixed(0) + '%',
        `"${row.detectedQuality}"`,
        `"${row.bassDetected || 'NO_BASS'}"`,
        (row.bassConfidence * 100).toFixed(0) + '%',
        `"${row.finalChord}"`,
        `"${row.winner}"`
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
