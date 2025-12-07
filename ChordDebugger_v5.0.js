/**
 * ChordDebugger v5.0
 * טבלת דיבאג לניתוח אקורדים עם Bass + MajorMinor Refiner
 */
class ChordDebugger {
  constructor() {
    this.chords = [];
    this.refinerResults = [];
    this.bassResults = [];
  }

  setData(chords, refinerResults = [], bassResults = []) {
    this.chords = chords || [];
    this.refinerResults = refinerResults || [];
    this.bassResults = bassResults || [];
  }

  getStats() {
    let bassChanges = 0, refinerChanges = 0;
    this.chords.forEach((c, i) => {
      if (c.bassNote) bassChanges++;
      const ref = this.refinerResults[i];
      if (ref?.shouldOverride) refinerChanges++;
    });
    return { bassChanges, refinerChanges, total: this.chords.length };
  }

  renderTable(filter = 'all') {
    if (!this.chords.length) {
      return '<div style="color:#64748b;padding:40px;text-align:center">אין נתונים</div>';
    }

    let html = `<table class="debug-table"><thead><tr>
      <th>#</th>
      <th>זמן</th>
      <th>אקורד</th>
      <th>🎸 Bass</th>
      <th>🎵 Refiner</th>
      <th>Confidence</th>
    </tr></thead><tbody>`;

    this.chords.forEach((chord, i) => {
      const time = chord.t?.toFixed(2) || '—';
      const label = chord.label || '—';
      
      // Bass info
      const bassNote = chord.bassNote || '—';
      const bassClass = chord.bassNote ? 'bass-cell detected' : 'bass-cell no-bass';
      
      // Refiner info
      const ref = this.refinerResults[i] || {};
      let refinerText = '—';
      let refinerClass = '';
      if (ref.shouldOverride) {
        refinerText = `${ref.originalQuality} → ${ref.newQuality}`;
        refinerClass = ref.newQuality === 'major' ? 'refiner-cell major' : 'refiner-cell minor';
      } else if (ref.decision) {
        refinerText = ref.decision;
        refinerClass = ref.decision === 'major' ? 'refiner-cell major' : 'refiner-cell minor';
      }
      
      const confidence = chord.confidence ? (chord.confidence * 100).toFixed(0) + '%' : '—';

      html += `<tr data-time="${chord.t || 0}">
        <td>${i + 1}</td>
        <td>${time}s</td>
        <td class="chord-cell">${label}</td>
        <td class="${bassClass}">${bassNote}</td>
        <td class="${refinerClass}">${refinerText}</td>
        <td>${confidence}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    return html;
  }
}

// Auto-initialize
window.chordDebugger = new ChordDebugger();
console.log('✅ ChordDebugger v5.0 loaded');
