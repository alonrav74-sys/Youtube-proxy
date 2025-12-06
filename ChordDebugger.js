/**
 * ChordDebugger.js v2.0
 * 🔬 מציג מה כל מנוע זיהה בעצמו - לא רק מה שינה!
 * 
 * עקרון: כל מנוע רץ ויש לו דעה, גם אם לא החליף.
 * אנחנו רוצים לראות:
 * 1. מה המנוע הבסיסי זיהה
 * 2. מה MajorMinorRefiner זיהה (גם אם לא החליף!)
 * 3. מה BassEngine זיהה (גם אם לא החליף!)
 * 4. מה בסוף נבחר
 */

class ChordDebugger {
  
  /**
   * בונה טבלת דיבאג מלאה
   * @param {Object} result - תוצאה מ-engine.detect()
   * @param {number} capo - מיקום קאפו (0-11)
   */
  static buildDebugData(result, capo = 0) {
    if (!result || !result.chords) return [];
    
    const debugData = [];
    
    result.chords.forEach((chord, idx) => {
      // ════════════════════════════════════════════════════
      // 🎼 מנוע בסיסי (ChordEngine)
      // ════════════════════════════════════════════════════
      const baseChord = this.applyCapo(
        chord.originalLabel || chord._baseOutput || chord.label, 
        capo
      );
      
      // ════════════════════════════════════════════════════
      // 🎵 MajorMinorRefiner - מה הוא זיהה?
      // ════════════════════════════════════════════════════
      let refinerDetected = '—';
      let refinerSuggested = baseChord;
      let refinerConf = null;
      let refinerApplied = false;
      let refinerReason = '—';
      
      // ⚡ Check for NEW fields from fixed Refiner
      if (chord._refinerDetected) {
        refinerDetected = chord._refinerDetected;
        refinerSuggested = this.applyCapo(chord._refinerSuggested || baseChord, capo);
        refinerConf = chord._refinerConfidence ? 
          (chord._refinerConfidence * 100).toFixed(0) + '%' : null;
        refinerApplied = chord._refinerApplied || false;
        refinerReason = chord._refinerReason || (refinerApplied ? 'Applied' : 'Not applied');
      }
      // Fallback to old fields
      else if (chord.refinedBy === 'MajorMinorRefiner' || chord.qualityRefined) {
        refinerApplied = chord.refinedBy === 'MajorMinorRefiner';
        
        if (chord.qualityRefined) {
          refinerDetected = chord.qualityRefined;
        } else if (chord.refinedLabel) {
          const isMinor = /m(?!aj)/.test(chord.refinedLabel);
          refinerDetected = isMinor ? 'minor' : 'major';
        }
        
        if (chord.refinedLabel) {
          refinerSuggested = this.applyCapo(chord.refinedLabel, capo);
        }
        
        refinerConf = chord.refinerConfidence || chord.qualityConfidence;
        if (refinerConf) refinerConf = (refinerConf * 100).toFixed(0) + '%';
        
        refinerReason = refinerApplied ? 
          `${refinerDetected} → ✅` : 
          `${refinerDetected} (${refinerConf || 'low'}) → ❌`;
      } else {
        refinerReason = 'Not analyzed';
      }
      
      // ════════════════════════════════════════════════════
      // 🎸 BassEngine - מה הוא זיהה?
      // ════════════════════════════════════════════════════
      let bassDetected = '—';
      let bassSuggested = refinerSuggested;
      let bassConf = null;
      let bassApplied = false;
      let bassReason = '—';
      
      // ⚡ Check for NEW fields from fixed BassEngine
      if (chord._bassDetected !== undefined) {
        bassDetected = chord._bassNoteName || this._pcToNote(chord._bassDetected);
        bassSuggested = this.applyCapo(chord._bassSuggested || chord.label, capo);
        bassConf = chord._bassConfidence ? 
          (chord._bassConfidence * 100).toFixed(0) + '%' : null;
        bassApplied = chord._bassApplied || false;
        bassReason = chord._bassReason || (bassApplied ? 'Applied' : 'Not applied');
      }
      // Fallback to old fields
      else if (chord.bassAdded || chord.changedByBass || chord.bassConfidence !== undefined) {
        bassApplied = chord.bassAdded || chord.changedByBass;
        
        if (chord.bassNote !== undefined && chord.bassNote >= 0) {
          bassDetected = this._pcToNote(chord.bassNote);
        } else if (chord.label && chord.label.includes('/')) {
          const parts = chord.label.split('/');
          bassDetected = parts[1] || '?';
        } else {
          bassDetected = 'Root';
        }
        
        if (bassApplied) {
          bassSuggested = this.applyCapo(chord.label, capo);
        }
        
        bassConf = chord.bassConfidence;
        if (bassConf) bassConf = (bassConf * 100).toFixed(0) + '%';
        
        if (chord.changedByBass) {
          bassReason = `${bassDetected} → ✅ Changed`;
        } else if (chord.bassAdded) {
          bassReason = `${bassDetected} → ✅ Inversion`;
        } else {
          bassReason = `${bassDetected} (${bassConf || 'low'}) → ❌`;
        }
      } else {
        bassReason = 'Not analyzed';
      }
      
      // ════════════════════════════════════════════════════
      // ✅ החלטה סופית
      // ════════════════════════════════════════════════════
      const finalChord = this.applyCapo(chord.label, capo);
      
      // מי זכה?
      let winner = 'base';
      if (finalChord !== baseChord) {
        if (refinerApplied) winner = 'refiner';
        if (bassApplied) winner = 'bass';
      }
      
      // ════════════════════════════════════════════════════
      // בניית שורה
      // ════════════════════════════════════════════════════
      debugData.push({
        index: idx + 1,
        time: chord.t?.toFixed(2) || '—',
        
        // מנוע בסיסי
        baseChord: baseChord,
        
        // Refiner
        refinerDetected: refinerDetected,
        refinerSuggested: refinerSuggested,
        refinerConf: refinerConf,
        refinerApplied: refinerApplied,
        refinerReason: refinerReason,
        
        // Bass
        bassDetected: bassDetected,
        bassSuggested: bassSuggested,
        bassConf: bassConf,
        bassApplied: bassApplied,
        bassReason: bassReason,
        
        // סופי
        finalChord: finalChord,
        winner: winner
      });
    });
    
    return debugData;
  }
  
  /**
   * חילוץ שם השורש מאקורד
   */
  static _getRootName(label) {
    const m = label?.match(/^([A-G][#b]?)/);
    return m ? m[1] : '';
  }
  
  /**
   * המרת pitch class למספר
   */
  static _parseRoot(label) {
    if (!label) return -1;
    const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    
    const m = label.match(/^([A-G])([#b])?/);
    if (!m) return -1;
    
    const note = m[1] + (m[2] || '');
    let idx = NOTES_SHARP.indexOf(note);
    if (idx >= 0) return idx;
    
    idx = NOTES_FLAT.indexOf(note);
    return idx >= 0 ? idx : -1;
  }
  
  /**
   * המרת pitch class לשם תו
   */
  static _pcToNote(pc) {
    const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return NOTES[((pc % 12) + 12) % 12];
  }
  
  /**
   * החלת קאפו על אקורד
   */
  static applyCapo(label, capo) {
    if (!label || !capo || capo === 0) return label;
    
    const NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    
    function transposeNote(noteStr, semitones) {
      const normalized = noteStr.replace('b', '#');
      const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const idx = NOTES_SHARP.indexOf(normalized);
      if(idx < 0) return noteStr;
      const newPc = ((idx - semitones) % 12 + 12) % 12;
      return NOTES_FLAT[newPc];
    }
    
    // טיפול באקורד עם inversion (/)
    if(label.includes('/')) {
      const parts = label.split('/');
      const rootPart = parts[0];
      const bassPart = parts[1];
      
      const rootMatch = rootPart.match(/^([A-G](?:#|b)?)(.*)$/);
      if(!rootMatch) return label;
      const transposedRoot = transposeNote(rootMatch[1], capo) + (rootMatch[2] || '');
      
      const bassMatch = bassPart.match(/^([A-G](?:#|b)?)(.*)$/);
      if(!bassMatch) return transposedRoot;
      const transposedBass = transposeNote(bassMatch[1], capo) + (bassMatch[2] || '');
      
      return transposedRoot + '/' + transposedBass;
    }
    
    // אקורד רגיל
    const m = label.match(/^([A-G](?:#|b)?)(.*)$/);
    if(!m) return label;
    
    return transposeNote(m[1], capo) + (m[2] || '');
  }
  
  /**
   * רנדור טבלת HTML
   */
  static renderTable(data, filter = 'all') {
    if (!data || !data.length) {
      return '<tr><td colspan="9" style="color:#94a3b8;padding:30px">אין נתונים</td></tr>';
    }
    
    // סינון
    let filtered = data;
    if (filter === 'bass') {
      filtered = data.filter(d => d.bassApplied);
    } else if (filter === 'refiner') {
      filtered = data.filter(d => d.refinerApplied);
    } else if (filter === 'changed') {
      filtered = data.filter(d => d.winner !== 'base');
    }
    
    if (!filtered.length) {
      return '<tr><td colspan="9" style="color:#94a3b8;padding:30px">אין תוצאות לסינון</td></tr>';
    }
    
    // בניית HTML
    let html = '';
    filtered.forEach(entry => {
      const baseClass = entry.winner === 'base' ? 'winner' : '';
      const refinerClass = entry.winner === 'refiner' ? 'winner' : '';
      const bassClass = entry.winner === 'bass' ? 'winner' : '';
      
      // עמודת Refiner - מה זיהה + מה הציע
      let refinerCell = entry.refinerSuggested;
      if (entry.refinerDetected !== '—') {
        refinerCell += `<br><small style="color:#94a3b8">${entry.refinerDetected} (${entry.refinerConf || '?'})</small>`;
      }
      if (entry.refinerApplied) {
        refinerCell += ' <span style="color:#22c55e">✅</span>';
      }
      
      // עמודת Bass - מה זיהה + מה הציע
      let bassCell = entry.bassSuggested;
      if (entry.bassDetected !== '—') {
        bassCell += `<br><small style="color:#94a3b8">bass: ${entry.bassDetected}</small>`;
      }
      if (entry.bassApplied) {
        bassCell += ' <span style="color:#22c55e">✅</span>';
      }
      
      html += `<tr>
        <td>${entry.index}</td>
        <td>${entry.time}s</td>
        <td class="base-col ${baseClass}">${entry.baseChord}</td>
        <td class="refiner-col ${refinerClass}">${refinerCell}</td>
        <td class="bass-col ${bassClass}">${bassCell}</td>
        <td class="final-col">${entry.finalChord}</td>
        <td style="font-size:10px;color:#94a3b8;text-align:right;direction:rtl;max-width:200px">
          ${entry.refinerReason !== '—' ? '🎵 ' + entry.refinerReason + '<br>' : ''}
          ${entry.bassReason !== '—' ? '🎸 ' + entry.bassReason : ''}
        </td>
      </tr>`;
    });
    
    return html;
  }
  
  /**
   * ייצוא ל-CSV
   */
  static exportCSV(data) {
    if (!data || !data.length) return '';
    
    let csv = 'Index,Time,Base,Refiner Detected,Refiner Suggested,Refiner Conf,Refiner Applied,Bass Detected,Bass Suggested,Bass Conf,Bass Applied,Final,Winner\n';
    
    data.forEach(entry => {
      csv += `${entry.index},`;
      csv += `${entry.time},`;
      csv += `"${entry.baseChord}",`;
      csv += `"${entry.refinerDetected}",`;
      csv += `"${entry.refinerSuggested}",`;
      csv += `"${entry.refinerConf || ''}",`;
      csv += `${entry.refinerApplied ? 'YES' : 'NO'},`;
      csv += `"${entry.bassDetected}",`;
      csv += `"${entry.bassSuggested}",`;
      csv += `"${entry.bassConf || ''}",`;
      csv += `${entry.bassApplied ? 'YES' : 'NO'},`;
      csv += `"${entry.finalChord}",`;
      csv += `${entry.winner}\n`;
    });
    
    return csv;
  }
  
  /**
   * הורדת CSV
   */
  static downloadCSV(data, filename = 'chord_debug.csv') {
    const csv = this.exportCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.ChordDebugger = ChordDebugger;
}
