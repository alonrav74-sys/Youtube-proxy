/**
 * ChordDebugger v6.0 - כלי דיבוג לתוצאות אקורדים + טבלת UI
 */
class ChordDebugger {
  constructor() {
    this.enabled = true;
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  }

  log(results) {
    if (!this.enabled || !results) return;
    console.group('🎸 ChordDebugger v6.0');
    console.log('Key:', results.key ? `${this.NOTES[results.key.root]}${results.key.minor ? 'm' : ''} (${Math.round(results.key.confidence * 100)}%)` : 'N/A');
    console.log('BPM:', results.bpm || 'N/A');
    console.log('Duration:', results.duration ? `${results.duration.toFixed(1)}s` : 'N/A');
    if (results.stats) {
      console.log('Stats:', {
        total: results.stats.totalChords,
        structural: results.stats.structural,
        ornaments: results.stats.ornaments,
        inversions: results.stats.inversions,
        bassChanges: results.stats.bassChanges || 0,
        mmChanges: results.stats.mmChanges || 0
      });
    }
    if (results.chords?.length) {
      console.table(results.chords.slice(0, 20).map(c => ({
        time: c.t?.toFixed(2),
        chord: c.label,
        original: c.originalLabel || '-',
        bass: c.changedByBass ? '✓' : '-',
        mm: c.refinedBy ? '✓' : '-',
        type: c.ornamentType || '-'
      })));
    }
    if (results.timings) {
      console.log('Timings:', Object.fromEntries(Object.entries(results.timings).map(([k, v]) => [k, `${v.toFixed(0)}ms`])));
    }
    console.groupEnd();
  }

  /**
   * בונה HTML של טבלת דיבאג מפורטת
   * @param {Object} result - תוצאות הניתוח מ-ChordEngine
   * @param {Object} key - המפתח שזוהה
   * @param {number} capo - מיקום הקאפו
   * @param {Function} escapeHtml - פונקציה ל-escape HTML
   * @param {Function} applyCapoToLabel - פונקציה להחלת קאפו
   * @param {Function} sanitizeLabel - פונקציה לניקוי תווית
   * @param {Function} getHarmonicFunction - פונקציה לחישוב פונקציה הרמונית
   * @returns {string} HTML של הטבלה
   */
  buildTable(result, key, capo, escapeHtml, applyCapoToLabel, sanitizeLabel, getHarmonicFunction) {
    if (!result || !result.chords || !result.chords.length) {
      return '<tr><td colspan="7" style="text-align:center;color:#94a3b8">אין נתונים</td></tr>';
    }

    let html = '';
    
    result.chords.forEach((ch, idx) => {
      if (!ch || !ch.label) return;
      
      const time = ch.t ? ch.t.toFixed(2) : '—';
      
      // 🎼 מה המנוע המרכזי זיהה (לפני שינויים)
      const engineDetected = ch.originalLabel || ch.label;
      const engineDisplay = escapeHtml(engineDetected);
      
      // 🎸 מה BassEngine מצא
      let bassDisplay = '<span style="color:#666">—</span>';
      if (ch.detectedBass && ch.bassConfidence !== undefined) {
        const conf = (ch.bassConfidence * 100).toFixed(0);
        const bassNote = escapeHtml(ch.detectedBass);
        bassDisplay = `<span style="color:#f59e0b;font-weight:700">${bassNote}</span><br><small style="color:#888">${conf}%</small>`;
      }
      
      // 🎵 מה MajorMinorRefiner מצא
      let mmDisplay = '<span style="color:#666">—</span>';
      if (ch.mmDetected && ch.mmConfidence !== undefined) {
        const symbol = ch.mmDetected === 'major' ? 'M' : 'm';
        const conf = (ch.mmConfidence * 100).toFixed(0);
        const color = symbol === 'M' ? '#38bdf8' : '#a855f7';
        mmDisplay = `<span style="color:${color};font-weight:700;font-size:16px">${symbol}</span><br><small style="color:#888">${conf}%</small>`;
      }
      
      // ➡️ ההחלטה הסופית (אחרי כל השינויים)
      const finalLabel = applyCapoToLabel(sanitizeLabel(ch.label), capo);
      const finalDisplay = escapeHtml(finalLabel);
      
      // Func - פונקציה הרמונית
      const func = key ? getHarmonicFunction(ch.label, key) : '—';
      
      // צבעים והדגשות - נראה אם משהו השתנה
      let engineColor = '#94a3b8';
      let finalColor = '#38bdf8';
      let changedBy = '';
      
      // אם השתנה על ידי BassEngine
      if (ch.changedByBass) {
        engineColor = '#888';
        finalColor = '#f59e0b';
        changedBy = '🎸';
      }
      
      // אם השתנה על ידי MajorMinorRefiner
      if (ch.refinedBy) {
        engineColor = '#888';
        finalColor = '#a855f7';
        changedBy = '🎵';
      }
      
      // אם שניהם שינו
      if (ch.changedByBass && ch.refinedBy) {
        changedBy = '🎸🎵';
      }
      
      html += `<tr>
        <td>${idx + 1}</td>
        <td>${time}s</td>
        <td style="color:${engineColor};font-weight:600">${engineDisplay}</td>
        <td style="text-align:center">${bassDisplay}</td>
        <td style="text-align:center">${mmDisplay}</td>
        <td style="color:${finalColor};font-weight:700;font-size:15px">${finalDisplay} ${changedBy}</td>
        <td style="color:#38bdf8">${func}</td>
      </tr>`;
    });
    
    return html;
  }

  /**
   * בונה כותרות הטבלה
   * @returns {string} HTML של thead
   */
  getTableHeaders() {
    return `<tr>
      <th>#</th>
      <th>Time</th>
      <th>🎼 Engine</th>
      <th>🎸 Bass</th>
      <th>🎵 M/m</th>
      <th>➡️ Final</th>
      <th>Func</th>
    </tr>`;
  }

  createOverlay(results) {
    if (!results) return null;
    const div = document.createElement('div');
    div.id = 'chord-debugger-overlay';
    div.style.cssText = 'position:fixed;top:10px;right:10px;background:#1a1a2e;color:#eee;padding:15px;border-radius:8px;font-family:monospace;font-size:12px;max-height:80vh;overflow:auto;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    
    let html = `<div style="margin-bottom:10px;font-size:14px;font-weight:bold;">🎸 ChordDebugger v6.0</div>`;
    html += `<div>Key: <span style="color:#4ecdc4">${this.NOTES[results.key?.root] || '?'}${results.key?.minor ? 'm' : ''}</span> (${Math.round((results.key?.confidence || 0) * 100)}%)</div>`;
    html += `<div>BPM: ${results.bpm || '?'} | Duration: ${results.duration?.toFixed(1) || '?'}s</div>`;
    
    if (results.stats) {
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">`;
      html += `Chords: ${results.stats.totalChords} | Inversions: ${results.stats.inversions}`;
      html += `<br>Bass changes: ${results.stats.bassChanges || 0} | M/m changes: ${results.stats.mmChanges || 0}`;
      html += `</div>`;
    }
    
    html += `<div style="margin-top:10px;"><button onclick="this.parentElement.parentElement.remove()" style="background:#ff6b6b;border:none;color:white;padding:5px 10px;border-radius:4px;cursor:pointer;">Close</button></div>`;
    div.innerHTML = html;
    return div;
  }
}

window.ChordDebugger = ChordDebugger;
