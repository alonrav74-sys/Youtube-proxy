/**
 * ChordDebugger v4.0 - Updated for Quality Validation Approach
 * 
 * Shows:
 * - Base Engine output
 * - MajorMinorRefiner: major/minor validation (NOT chord changes)
 * - BassEngine: independent bass detection (can return NO_BASS)
 * - Final decision
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
      
      // Apply capo
      let finalLabel = chord.label;
      if (capoOffset > 0) {
        finalLabel = this.applyCapo(chord.label, capoOffset);
      }

      // Extract refinement info
      const refinerApplied = chord.refinedBy === 'MajorMinorRefiner';
      const refinerConfidence = chord.refinerConfidence || 0;
      const refinerReason = chord.reason || '';
      
      // Extract bass info
      const bassDetected = chord.bassDetected || null;
      const bassApplied = chord.changedByBass === true;
      const bassConfidence = chord.bassConfidence || 0;
      const bassFrequency = chord.bassFrequency || 0;

      // Determine what changed
      let baseChord = finalLabel;
      let refinerChord = finalLabel;
      let bassChord = finalLabel;

      // Work backwards to find original
      if (bassApplied) {
        bassChord = finalLabel;
        // Remove bass influence to get refiner output
        if (refinerApplied) {
          refinerChord = this.reconstructPreBass(chord, result.chords);
          baseChord = this.reconstructPreRefiner(chord, result.chords);
        } else {
          refinerChord = this.reconstructPreBass(chord, result.chords);
          baseChord = refinerChord;
        }
      } else if (refinerApplied) {
        refinerChord = finalLabel;
        bassChord = finalLabel;
        baseChord = this.reconstructPreRefiner(chord, result.chords);
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
   * Reconstruct what the chord was before bass engine
   */
  reconstructPreBass(chord, allChords) {
    // If label has slash, remove it
    if (chord.label.includes('/')) {
      return chord.label.split('/')[0];
    }
    // Otherwise look for a stored original
    return chord.originalLabel || chord.label;
  },

  /**
   * Reconstruct what the chord was before refiner
   */
  reconstructPreRefiner(chord, allChords) {
    // Look for clues in the chord object
    if (chord.refinedBy === 'MajorMinorRefiner') {
      // Try to reverse the change
      const current = chord.label;
      if (/m(?!aj)/.test(current)) {
        // Currently minor, was probably major
        return current.replace(/m(?!aj)/, '');
      } else if (!/m/.test(current) && !/sus|dim|aug/.test(current)) {
        // Currently major, was probably minor
        const match = current.match(/^([A-G][#b]?)/);
        if (match) {
          const root = match[1];
          const suffix = current.slice(root.length);
          return root + 'm' + suffix;
        }
      }
    }
    return chord.label;
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

      // Build refiner cell
      let refinerContent = '';
      if (row.refinerApplied) {
        refinerContent = `
          <div class="changed">${row.refinerChord}</div>
          <small style="color:#64748b;display:block;margin-top:4px">
            ${this.getRefinerReasonEmoji(row.refinerReason)} ${(row.refinerConfidence * 100).toFixed(0)}%
          </small>
        `;
      } else {
        refinerContent = `<span style="color:#64748b">—</span>`;
      }

      // Build bass cell
      let bassContent = '';
      if (row.bassDetected === 'NO_BASS') {
        bassContent = `<span style="color:#94a3b8">NO_BASS</span>`;
      } else if (row.bassApplied) {
        bassContent = `
          <div class="changed">${row.bassChord}</div>
          <small style="color:#64748b;display:block;margin-top:4px">
            🎸 ${row.bassDetected} (${(row.bassConfidence * 100).toFixed(0)}%)
          </small>
        `;
      } else if (row.bassDetected) {
        bassContent = `
          <span style="color:#64748b">
            ${row.bassDetected} ✓<br>
            <small>${(row.bassConfidence * 100).toFixed(0)}%</small>
          </span>
        `;
      } else {
        bassContent = `<span style="color:#64748b">—</span>`;
      }

      // Build notes cell
      let notes = [];
      if (row.refinerApplied) {
        notes.push(`🎵 ${this.getRefinerReasonText(row.refinerReason)}`);
      }
      if (row.bassDetected === 'NO_BASS') {
        notes.push(`❌ בס לא ברור`);
      } else if (row.bassApplied) {
        notes.push(`🎸 שונה מבס`);
      } else if (row.bassDetected) {
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
          <td style="font-size:11px;color:#cbd5e1">${notesContent}</td>
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
      'no_change': '—'
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
      'no_change': 'ללא שינוי'
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
   * Apply capo transposition
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

    const newIdx = (idx + capo) % 12;
    const newRoot = notes[newIdx];

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
      'Refiner Chord',
      'Refiner Confidence',
      'Refiner Reason',
      'Bass Detected',
      'Bass Applied',
      'Bass Chord',
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
        `"${row.refinerReason}"`,
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
