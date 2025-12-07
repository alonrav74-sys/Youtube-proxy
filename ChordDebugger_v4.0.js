/**
 * ChordDebugger v4.1 - FIXED for v4.1 Engines
 * 
 * 🔧 תיקונים:
 * - תומך בפורמט החדש של refinerAnalysis
 * - תומך בפורמט החדש של bassDetected
 * - מציג תמיד את מה שהמנועים מזהים (גם אם לא שינו)
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
      
      // Get refiner analysis (even if it didn't change anything)
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
      let baseChord = chord.label;
      let refinerChord = chord.label;
      let bassChord = chord.label;

      // If we have originalLabel, use it as base
      if (chord.originalLabel) {
        baseChord = chord.originalLabel;
      }
      
      // If refiner changed it
      if (refinerApplied && chord.originalLabel) {
        baseChord = chord.originalLabel;
        refinerChord = chord.label;
      }
      
      // If bass changed it
      if (bassApplied) {
        bassChord = chord.label;
        // Try to get pre-bass label
        if (chord.label.includes('/')) {
          refinerChord = chord.label.split('/')[0];
          if (!refinerApplied) baseChord = refinerChord;
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎸 APPLY CAPO
      // ═══════════════════════════════════════════════════════════════
      if (capoOffset > 0) {
        baseChord = this.applyCapo(baseChord, capoOffset);
        refinerChord = this.applyCapo(refinerChord, capoOffset);
        bassChord = this.applyCapo(bassChord, capoOffset);
        
        if (bassDetected && bassDetected !== 'NO_BASS') {
          bassDetected = this.applyCapo(bassDetected, capoOffset);
        }
      }
      
      const finalLabel = bassChord;

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
        
        // Bass info
        bassChord: bassChord,
        bassDetected: bassDetected,
        bassApplied: bassApplied,
        bassConfidence: bassConfidence,
        bassFrequency: bassFrequency,
        
        // Final
        finalChord: finalLabel,
        
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
      // Determine cell classes
      const baseClass = row.winner === 'base' ? 'base-col winner' : 'base-col';
      const refinerClass = row.winner === 'refiner' ? 'refiner-col winner' : 'refiner-col';
      const bassClass = row.winner === 'bass' ? 'bass-col winner' : 'bass-col';

      // ═══════════════════════════════════════════════════════════════
      // 🎵 BUILD REFINER CELL - ALWAYS show what it detected!
      // ═══════════════════════════════════════════════════════════════
      let refinerContent = '';
      
      if (row.refinerApplied) {
        // Refiner changed the chord
        refinerContent = `
          <div class="changed">${row.refinerChord}</div>
          <small style="color:#22c55e;display:block;margin-top:4px">
            ${this.getRefinerReasonEmoji(row.refinerReason)} ${(row.refinerConfidence * 100).toFixed(0)}%
          </small>
        `;
      } else if (row.refinerAnalysis && row.refinerConfidence > 0) {
        // Refiner analyzed but didn't change
        const qualityIcon = row.detectedQuality === 'major' ? '▲' : 
                           row.detectedQuality === 'minor' ? '▼' : '?';
        refinerContent = `
          <span style="color:#94a3b8">${row.baseChord}</span><br>
          <small style="color:#64748b">${qualityIcon} ${(row.refinerConfidence * 100).toFixed(0)}%</small>
        `;
      } else {
        // No refiner data
        refinerContent = `<span style="color:#64748b">—</span>`;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🎸 BUILD BASS CELL - ALWAYS show what it detected!
      // ═══════════════════════════════════════════════════════════════
      let bassContent = '';
      
      if (row.bassDetected === 'NO_BASS' || row.bassDetected === null) {
        bassContent = `<span style="color:#94a3b8">NO_BASS</span>`;
      } else if (row.bassApplied) {
        // Bass changed the chord
        bassContent = `
          <div class="changed">${row.bassChord}</div>
          <small style="color:#38bdf8;display:block;margin-top:4px">
            🎸 ${row.bassDetected} (${(row.bassConfidence * 100).toFixed(0)}%)
          </small>
        `;
      } else if (row.bassDetected) {
        // Bass detected but didn't change (matches root)
        bassContent = `
          <span style="color:#94a3b8">${row.baseChord}</span><br>
          <small style="color:#64748b">🎸 ${row.bassDetected} ${(row.bassConfidence * 100).toFixed(0)}%</small>
        `;
      } else {
        bassContent = `<span style="color:#64748b">—</span>`;
      }

      // ═══════════════════════════════════════════════════════════════
      // 📝 BUILD NOTES CELL
      // ═══════════════════════════════════════════════════════════════
      let notes = [];
      
      if (row.refinerApplied) {
        notes.push(`🎵 ${this.getRefinerReasonText(row.refinerReason)}`);
      } else if (row.refinerAnalysis && row.refinerConfidence > 0.2) {
        const qIcon = row.detectedQuality === 'major' ? 'מז\'ור' : 
                      row.detectedQuality === 'minor' ? 'מינור' : 'לא ברור';
        notes.push(`🎵 זיהה: ${qIcon}`);
      }
      
      if (row.bassDetected === 'NO_BASS' || !row.bassDetected) {
        notes.push(`🎸 בס לא ברור`);
      } else if (row.bassApplied) {
        notes.push(`🎸 בס שינה → ${row.bassDetected}`);
      } else if (row.bassDetected) {
        notes.push(`🎸 בס: ${row.bassDetected} (תואם)`);
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

  /**
   * Get emoji for refiner reason
   */
  getRefinerReasonEmoji(reason) {
    const map = {
      'major_to_minor': '➜ m',
      'minor_to_major': '➜ M',
      'too_short': '⏱️',
      'complex_chord': '🎼',
      'no_change': '—',
      'no_data': '—'
    };
    return map[reason] || '—';
  },

  /**
   * Get text for refiner reason
   */
  getRefinerReasonText(reason) {
    const map = {
      'major_to_minor': 'מז\'ור → מינור',
      'minor_to_major': 'מינור → מז\'ור',
      'too_short': 'קצר מדי',
      'complex_chord': 'אקורד מורכב',
      'no_change': 'ללא שינוי',
      'no_data': 'אין נתונים'
    };
    return map[reason] || reason;
  },

  /**
   * Format time as MM:SS
   */
  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  /**
   * Apply capo transposition (SUBTRACT capo!)
   */
  applyCapo(chord, capo) {
    if (!chord || capo === 0) return chord;

    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    const match = chord.match(/^([A-G][#b]?)/);
    if (!match) return chord;

    let root = match[1];
    const suffix = chord.slice(root.length);

    // Normalize flats to sharps
    root = root.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#');

    const idx = notes.indexOf(root);
    if (idx === -1) return chord;

    // SUBTRACT capo
    const newIdx = ((idx - capo) % 12 + 12) % 12;
    const newRoot = flats[newIdx];

    return newRoot + suffix;
  },

  /**
   * Download debug data as CSV
   */
  downloadCSV(debugData, filename) {
    const headers = [
      '#',
      'Time',
      'Base Engine',
      'Refiner Applied',
      'Refiner Result',
      'Refiner Confidence',
      'Detected Quality',
      'Bass Detected',
      'Bass Applied',
      'Bass Result',
      'Bass Confidence',
      'Final Chord',
      'Winner'
    ];

    let csv = headers.join(',') + '\n';

    for (const row of debugData) {
      csv += [
        row.index,
        row.time,
        `"${row.baseChord}"`,
        row.refinerApplied ? 'Yes' : 'No',
        `"${row.refinerChord}"`,
        (row.refinerConfidence * 100).toFixed(0) + '%',
        `"${row.detectedQuality}"`,
        `"${row.bassDetected || 'None'}"`,
        row.bassApplied ? 'Yes' : 'No',
        `"${row.bassChord}"`,
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
