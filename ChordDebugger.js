/**
 * ChordDebugger.js v1.0
 * 🔬 מציג מה כל מנוע החליט - לא מה שונה!
 * 
 * מטרה: לראות את ההחלטות של כל מנוע בנפרד:
 * 🎼 ChordEngine (מנוע בסיסי)
 * 🎵 MajorMinorRefiner  
 * 🎸 BassEngine
 * ✅ החלטה סופית
 * 
 * ⚠️ כל האקורדים מוצגים אחרי קאפו (כמו שהגיטריסט רואה)
 */

class ChordDebugger {
  
  /**
   * בונה טבלת דיבאג מלאה מתוצאות המנוע
   * @param {Object} result - תוצאה מ-engine.detect()
   * @param {number} capo - מיקום קאפו (0-11)
   */
  static buildDebugData(result, capo = 0) {
    if (!result || !result.chords) return [];
    
    const debugData = [];
    
    result.chords.forEach((chord, idx) => {
      // 🎼 מנוע בסיסי - מה הוא זיהה בהתחלה
      const baseChord = this.applyCapo(chord.originalLabel || chord._baseOutput || chord.label, capo);
      
      // 🎵 MajorMinorRefiner - מה הוא המליץ
      let refinerChord = baseChord;
      let refinerConf = null;
      let refinerReason = '—';
      
      if (chord.refinedBy === 'MajorMinorRefiner') {
        refinerChord = this.applyCapo(chord.refinedLabel || chord.label, capo);
        refinerConf = chord.refinerConfidence ? (chord.refinerConfidence * 100).toFixed(0) + '%' : null;
        refinerReason = chord.refinerReason || 'Changed mode';
      }
      
      // 🎸 BassEngine - מה הוא המליץ
      let bassChord = refinerChord; // Bass רץ אחרי Refiner
      let bassConf = null;
      let bassReason = '—';
      
      if (chord.bassAdded || chord.changedByBass || chord.label?.includes('/')) {
        bassChord = this.applyCapo(chord.label, capo);
        bassConf = chord.bassConfidence ? (chord.bassConfidence * 100).toFixed(0) + '%' : null;
        bassReason = chord.changedByBass ? 'Changed chord' : (chord.bassAdded ? 'Added inversion' : 'Bass override');
      }
      
      // ✅ החלטה סופית
      const finalChord = this.applyCapo(chord.label, capo);
      
      // מי זכה?
      let winner = 'base';
      if (finalChord !== baseChord) {
        if (chord.refinedBy) winner = 'refiner';
        if (chord.bassAdded || chord.changedByBass) winner = 'bass';
      }
      
      debugData.push({
        index: idx + 1,
        time: chord.t?.toFixed(2) || '—',
        
        // כל מנוע (אחרי קאפו!)
        baseChord: baseChord,
        refinerChord: refinerChord,
        refinerConf: refinerConf,
        refinerReason: refinerReason,
        bassChord: bassChord,
        bassConf: bassConf,
        bassReason: bassReason,
        
        // סופי
        finalChord: finalChord,
        winner: winner,
        
        // חרומה נוספת (אם יש)
        chroma: chord.chromaVector ? chord.chromaVector.slice(0, 3).map(v => v.toFixed(2)).join(',') + '...' : null
      });
    });
    
    return debugData;
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
      return '<tr><td colspan="7" style="color:#94a3b8;padding:30px">אין נתונים</td></tr>';
    }
    
    // סינון
    let filtered = data;
    if (filter === 'bass') {
      filtered = data.filter(d => d.winner === 'bass');
    } else if (filter === 'refiner') {
      filtered = data.filter(d => d.winner === 'refiner');
    } else if (filter === 'changed') {
      filtered = data.filter(d => d.winner !== 'base');
    }
    
    if (!filtered.length) {
      return '<tr><td colspan="7" style="color:#94a3b8;padding:30px">אין תוצאות לסינון</td></tr>';
    }
    
    // בניית HTML
    let html = '';
    filtered.forEach(entry => {
      const baseClass = entry.winner === 'base' ? 'winner' : '';
      const refinerClass = entry.winner === 'refiner' ? 'winner' : '';
      const bassClass = entry.winner === 'bass' ? 'winner' : '';
      
      // הערות
      let notes = [];
      if (entry.refinerReason !== '—') notes.push(`🎵 ${entry.refinerReason} ${entry.refinerConf || ''}`);
      if (entry.bassReason !== '—') notes.push(`🎸 ${entry.bassReason} ${entry.bassConf || ''}`);
      const notesText = notes.length > 0 ? notes.join('<br>') : '—';
      
      html += `<tr>
        <td>${entry.index}</td>
        <td>${entry.time}s</td>
        <td class="base-col ${baseClass}">${entry.baseChord}</td>
        <td class="refiner-col ${refinerClass}">${entry.refinerChord}</td>
        <td class="bass-col ${bassClass}">${entry.bassChord}</td>
        <td class="final-col">${entry.finalChord}</td>
        <td style="font-size:11px;color:#94a3b8;text-align:right;direction:rtl">${notesText}</td>
      </tr>`;
    });
    
    return html;
  }
  
  /**
   * ייצוא ל-CSV
   */
  static exportCSV(data) {
    if (!data || !data.length) return '';
    
    let csv = 'Index,Time,Base Engine,Refiner Output,Refiner Conf,Refiner Reason,Bass Output,Bass Conf,Bass Reason,Final,Winner\n';
    
    data.forEach(entry => {
      csv += `${entry.index},`;
      csv += `${entry.time},`;
      csv += `"${entry.baseChord}",`;
      csv += `"${entry.refinerChord}",`;
      csv += `"${entry.refinerConf || ''}",`;
      csv += `"${entry.refinerReason}",`;
      csv += `"${entry.bassChord}",`;
      csv += `"${entry.bassConf || ''}",`;
      csv += `"${entry.bassReason}",`;
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
