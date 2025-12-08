/**
 * ChordDebugger v5.0 - כלי דיבוג לתוצאות אקורדים
 */
class ChordDebugger {
  constructor() {
    this.enabled = true;
  }
  log(results) {
    if (!this.enabled || !results) return;
    console.group('🎸 ChordDebugger v5.0');
    console.log('Key:', results.key ? `${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][results.key.root]}${results.key.minor ? 'm' : ''} (${Math.round(results.key.confidence * 100)}%)` : 'N/A');
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
  createOverlay(results) {
    if (!results) return null;
    const div = document.createElement('div');
    div.id = 'chord-debugger-overlay';
    div.style.cssText = 'position:fixed;top:10px;right:10px;background:#1a1a2e;color:#eee;padding:15px;border-radius:8px;font-family:monospace;font-size:12px;max-height:80vh;overflow:auto;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    let html = `<div style="margin-bottom:10px;font-size:14px;font-weight:bold;">🎸 ChordDebugger v5.0</div>`;
    html += `<div>Key: <span style="color:#4ecdc4">${notes[results.key?.root] || '?'}${results.key?.minor ? 'm' : ''}</span> (${Math.round((results.key?.confidence || 0) * 100)}%)</div>`;
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
