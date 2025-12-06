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

  /**
   * חישוב סטטיסטיקות
   */
  static _calculateStats(data) {
    return {
      total: data.length,
      refinerChanged: data.filter(d => d.refinerApplied).length,
      bassChanged: data.filter(d => d.bassApplied).length,
      unchanged: data.filter(d => d.winner === 'base').length
    };
  }

  /**
   * רנדור ממשק דיבאג מלא
   */
  static renderDebugUI(data, capo = 0) {
    if (!data || !data.length) return '<div style="color:#94a3b8;padding:30px">אין נתונים</div>';
    
    // Store for filtering
    this._currentData = data;
    
    const stats = this._calculateStats(data);
    
    return `
      <div style="font-family: 'Geist', system-ui, sans-serif; direction: rtl;">
        <!-- Stats -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
          <div style="padding: 12px 20px; background: #1e293b; border-radius: 8px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">סה"כ אקורדים</div>
            <div style="font-size: 24px; font-weight: 600; color: #f1f5f9;">${stats.total}</div>
          </div>
          <div style="padding: 12px 20px; background: #1e293b; border-radius: 8px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">🎵 Refiner שינה</div>
            <div style="font-size: 24px; font-weight: 600; color: #22c55e;">${stats.refinerChanged}</div>
          </div>
          <div style="padding: 12px 20px; background: #1e293b; border-radius: 8px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">🎸 Bass שינה</div>
            <div style="font-size: 24px; font-weight: 600; color: #3b82f6;">${stats.bassChanged}</div>
          </div>
          ${capo > 0 ? `
          <div style="padding: 12px 20px; background: #1e293b; border-radius: 8px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">🎸 קאפו</div>
            <div style="font-size: 24px; font-weight: 600; color: #f59e0b;">${capo}</div>
          </div>
          ` : ''}
        </div>

        <!-- Filters -->
        <div style="margin-bottom: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="ChordDebugger.filterTable('all')" 
                  id="filter-all"
                  class="debug-filter-btn active"
                  style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
            הכל
          </button>
          <button onclick="ChordDebugger.filterTable('refiner')" 
                  id="filter-refiner"
                  class="debug-filter-btn"
                  style="padding: 8px 16px; background: #1e293b; color: #cbd5e1; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
            רק Refiner שינה
          </button>
          <button onclick="ChordDebugger.filterTable('bass')" 
                  id="filter-bass"
                  class="debug-filter-btn"
                  style="padding: 8px 16px; background: #1e293b; color: #cbd5e1; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
            רק Bass שינה
          </button>
          <button onclick="ChordDebugger.filterTable('changed')" 
                  id="filter-changed"
                  class="debug-filter-btn"
                  style="padding: 8px 16px; background: #1e293b; color: #cbd5e1; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
            כל השינויים
          </button>
        </div>

        <!-- Table -->
        <div style="overflow-x: auto; background: #0f172a; border-radius: 8px; border: 1px solid #1e293b;">
          <table id="debug-table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #1e293b; color: #94a3b8; font-weight: 500;">
                <th style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #334155; width: 40px;">#</th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #334155; width: 60px;">זמן</th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #334155; width: 80px;">🎼 מנוע<br>בסיסי</th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #334155; min-width: 120px;">🎵 Refiner<br><small style="font-size:10px;font-weight:400;color:#64748b;">מז'ור/מינור</small></th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #334155; min-width: 120px;">🎸 Bass<br><small style="font-size:10px;font-weight:400;color:#64748b;">אינברסיות</small></th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #334155; width: 80px;">✅ החלטה<br>סופית</th>
                <th style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #334155; min-width: 200px;">הערות</th>
              </tr>
            </thead>
            <tbody id="debug-table-body">
              ${this.renderTable(data, 'all')}
            </tbody>
          </table>
        </div>

        <!-- Export -->
        <div style="margin-top: 15px;">
          <button onclick="ChordDebugger.downloadCSV(ChordDebugger._currentData)" 
                  style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
            📥 ייצא ל-CSV
          </button>
        </div>
      </div>

      <style>
        .debug-filter-btn:hover {
          opacity: 0.8;
        }
        .debug-filter-btn.active {
          background: #3b82f6 !important;
          color: white !important;
        }
        .base-col { text-align: center; }
        .refiner-col { text-align: center; }
        .bass-col { text-align: center; }
        .final-col { text-align: center; background: #1e3a1e; color: #a7f3a7; font-weight: 700; }
        
        .base-col.winner { background: #fef3c7; color: #92400e; font-weight: 600; }
        .refiner-col.winner { background: #dcfce7; color: #166534; font-weight: 600; }
        .bass-col.winner { background: #dbeafe; color: #1e40af; font-weight: 600; }
        
        #debug-table tbody tr:hover {
          background: #1e293b;
        }
        #debug-table tbody td {
          padding: 10px 8px;
          border-bottom: 1px solid #1e293b;
          color: #e2e8f0;
        }
      </style>
    `;
  }

  /**
   * סינון טבלה
   */
  static filterTable(filter) {
    if (!this._currentData) return;
    
    const tbody = document.getElementById('debug-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = this.renderTable(this._currentData, filter);
    
    // Update active button
    document.querySelectorAll('.debug-filter-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '#1e293b';
      btn.style.color = '#cbd5e1';
    });
    
    const activeBtn = document.getElementById(`filter-${filter}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.style.background = '#3b82f6';
      activeBtn.style.color = 'white';
    }
  }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.ChordDebugger = ChordDebugger;
}
