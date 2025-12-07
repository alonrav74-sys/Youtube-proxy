/**
 * ChordDebugger v5.0 - DEBUG TABLE MODULE
 * 
 * קובץ נפרד שמציג טבלת דיבאג מפורטת
 * מופעל מתוך ה-HTML בלשונית הדיבאג
 */

class ChordDebugger {
  constructor() {
    this.debugData = [];
    this.currentFilter = 'all';
  }

  /**
   * Initialize debug data from engine results
   */
  setData(timeline, refinerResults, bassResults) {
    this.debugData = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const chord = timeline[i];
      const refiner = refinerResults?.[i] || {};
      const bass = bassResults?.[i] || {};

      this.debugData.push({
        index: i + 1,
        time: chord.t || 0,
        engineLabel: chord.originalLabel || chord.label,
        finalLabel: chord.label,
        refinerDetected: refiner.detectedQuality || '-',
        refinerConfidence: refiner.qualityConfidence || 0,
        refinerChanged: refiner.shouldOverride || false,
        refinerReason: refiner.reason || '',
        major3rd: refiner.major3rdStrength || 0,
        minor3rd: refiner.minor3rdStrength || 0,
        bassDetected: bass.bassDetected || chord.bassDetected || '-',
        bassConfidence: bass.bassConfidence || chord.bassConfidence || 0,
        bassFrequency: bass.bassFrequency || chord.bassFrequency || 0,
        bassChanged: chord.changedByBass || false
      });
    }
    
    return this.debugData;
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.debugData.length;
    const bassDetected = this.debugData.filter(r => 
      r.bassDetected && r.bassDetected !== 'NO_BASS' && r.bassDetected !== '-'
    ).length;
    const refinerChanges = this.debugData.filter(r => r.refinerChanged).length;
    const bassChanges = this.debugData.filter(r => r.bassChanged).length;
    const majorCount = this.debugData.filter(r => r.refinerDetected === 'major').length;
    const minorCount = this.debugData.filter(r => r.refinerDetected === 'minor').length;
    
    return { total, bassDetected, refinerChanges, bassChanges, majorCount, minorCount };
  }

  /**
   * Render stats HTML
   */
  renderStats() {
    const stats = this.getStats();
    return `
      <div class="debug-stats">
        <span class="stat">סה״כ: <strong>${stats.total}</strong></span>
        <span class="stat">🎸 בס זוהה: <strong>${stats.bassDetected}</strong></span>
        <span class="stat">🎵 Refiner שינה: <strong>${stats.refinerChanges}</strong></span>
        <span class="stat">🎸 Bass שינה: <strong>${stats.bassChanges}</strong></span>
      </div>
    `;
  }

  /**
   * Render filter buttons
   */
  renderFilters() {
    return `
      <div class="debug-filters" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span style="color:#94a3b8;padding:6px 0">⚙️ סינון:</span>
        <button class="debug-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">הכל</button>
        <button class="debug-filter-btn ${this.currentFilter === 'refiner' ? 'active' : ''}" data-filter="refiner">Refiner שינה</button>
        <button class="debug-filter-btn ${this.currentFilter === 'bass' ? 'active' : ''}" data-filter="bass">Bass שינה</button>
        <button class="debug-filter-btn ${this.currentFilter === 'changes' ? 'active' : ''}" data-filter="changes">כל השינויים</button>
      </div>
    `;
  }

  /**
   * Format time as M:SS.s
   */
  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  }

  /**
   * Render table HTML
   */
  renderTable(filter = 'all') {
    this.currentFilter = filter;
    
    if (!this.debugData.length) {
      return '<div style="color:#64748b;padding:40px;text-align:center">אין נתונים - הרץ ניתוח קודם</div>';
    }

    let filtered = this.debugData;
    if (filter === 'refiner') filtered = this.debugData.filter(r => r.refinerChanged);
    else if (filter === 'bass') filtered = this.debugData.filter(r => r.bassChanged);
    else if (filter === 'changes') filtered = this.debugData.filter(r => r.refinerChanged || r.bassChanged);

    if (!filtered.length) {
      return '<div style="color:#64748b;padding:40px;text-align:center">אין תוצאות לפילטר הנבחר</div>';
    }

    let html = `<table class="debug-table">
      <thead><tr>
        <th>#</th>
        <th>⏱ זמן</th>
        <th>🎹 אקורד סופי</th>
        <th>🎵 Refiner<br>מז׳ור/מינור</th>
        <th>🎸 Bass<br>זיהוי</th>
      </tr></thead><tbody>`;

    for (const row of filtered) {
      // Refiner display
      let refinerDisplay = '-';
      let refinerClass = '';
      if (row.refinerDetected === 'major') {
        refinerDisplay = `▲ מז׳ור (${Math.round(row.refinerConfidence * 100)}%)`;
        refinerClass = 'major';
      } else if (row.refinerDetected === 'minor') {
        refinerDisplay = `▼ מינור (${Math.round(row.refinerConfidence * 100)}%)`;
        refinerClass = 'minor';
      } else if (row.refinerDetected === 'unclear') {
        refinerDisplay = '? לא ברור';
        refinerClass = 'unclear';
      } else {
        refinerDisplay = row.refinerDetected;
      }

      // Bass display
      let bassDisplay = '-';
      let bassClass = 'no-bass';
      if (row.bassDetected && row.bassDetected !== 'NO_BASS' && row.bassDetected !== '-') {
        bassDisplay = `${row.bassDetected} (${Math.round(row.bassConfidence * 100)}%)`;
        bassClass = 'detected';
      }

      // Row highlighting
      let rowClass = '';
      if (row.refinerChanged) rowClass += ' refiner-changed';
      if (row.bassChanged) rowClass += ' bass-changed';

      html += `<tr class="${rowClass}" data-time="${row.time}">
        <td>${row.index}</td>
        <td>${this.formatTime(row.time)}</td>
        <td class="chord-cell">${row.finalLabel}</td>
        <td class="refiner-cell ${refinerClass}">${refinerDisplay}</td>
        <td class="bass-cell ${bassClass}">${bassDisplay}</td>
      </tr>`;
    }

    html += '</tbody></table>';
    return html;
  }

  /**
   * Get CSS styles for the debug table
   */
  static getStyles() {
    return `
      <style>
        .debug-table{width:100%;border-collapse:collapse;margin-top:15px;font-size:13px;background:#0a1324;border-radius:8px;overflow:hidden}
        .debug-table th{background:#1a2332;color:#38bdf8;padding:12px 8px;text-align:center;font-weight:700;border-bottom:2px solid #2a3d55;font-size:12px}
        .debug-table td{padding:10px 8px;border-bottom:1px solid #1f2a40;text-align:center;vertical-align:middle}
        .debug-table tr:hover{background:#12203a}
        .debug-table tr.refiner-changed{background:#1a2a1a}
        .debug-table tr.bass-changed{background:#1a1a2a}
        .debug-table tr.highlight{background:#1e3a5f !important}
        .chord-cell{font-weight:bold;font-size:14px;color:#f0f0f0}
        .refiner-cell.major{color:#4ade80}
        .refiner-cell.minor{color:#f472b6}
        .refiner-cell.unclear{color:#94a3b8}
        .bass-cell.detected{color:#38bdf8;font-weight:600}
        .bass-cell.no-bass{color:#64748b;font-style:italic}
        .debug-stats{display:flex;gap:20px;flex-wrap:wrap;margin:10px 0;padding:10px;background:#0c162b;border-radius:8px}
        .debug-stats .stat{color:#94a3b8;font-size:13px}
        .debug-stats .stat strong{color:#e5e7eb}
        .debug-filter-btn{padding:6px 12px;border-radius:8px;background:#0b1221;border:1px solid #1f2a40;color:#cbd5e1;cursor:pointer;font-size:12px;transition:all 0.2s}
        .debug-filter-btn:hover{border-color:#38bdf8}
        .debug-filter-btn.active{background:#164e3a;border-color:#22c55e;color:#d7ffe6}
      </style>
    `;
  }
}

// Global instance
window.chordDebugger = new ChordDebugger();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordDebugger;
}
