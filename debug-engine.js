// ═══════════════════════════════════════════════════════════
// 🔬 3-ENGINE DEBUG & CSV EXPORT
// ═══════════════════════════════════════════════════════════

function generate3EngineDebugReport(result) {
  if (!result || !result.chords) return 'No result available';
  
  const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  let report = '';
  
  // ═══ HEADER ═══
  report += `═══════════════════════════════════════════════════════════\n`;
  report += `🎼 3-ENGINE COMPARISON REPORT (v14.36)\n`;
  report += `═══════════════════════════════════════════════════════════\n\n`;
  
  // ═══ KEY DETECTION ═══
  report += `🎹 KEY DETECTION:\n`;
  report += `   Final Key: ${NOTES[result.key.root]} ${result.key.minor ? 'minor' : 'major'}\n`;
  report += `   Confidence: ${(result.key.confidence * 100).toFixed(1)}%\n`;
  if (result.key.confidenceBreakdown) {
    report += `   Major Conf: ${(result.key.confidenceBreakdown.major * 100).toFixed(1)}%\n`;
    report += `   Minor Conf: ${(result.key.confidenceBreakdown.minor * 100).toFixed(1)}%\n`;
  }
  report += `\n`;
  
  // ═══ BASS ENGINE STATUS ═══
  report += `🎸 BASS ENGINE:\n`;
  if (result.bassTimeline && result.bassTimeline.length > 0) {
    report += `   Status: ✅ ACTIVE\n`;
    report += `   Segments: ${result.bassTimeline.length}\n`;
    report += `   First 3 bass notes:\n`;
    result.bassTimeline.slice(0, 3).forEach((b, i) => {
      report += `      ${i+1}. ${b.noteName} (PC=${b.pc}) @ ${b.tStart.toFixed(2)}s-${b.tEnd.toFixed(2)}s\n`;
    });
  } else {
    report += `   Status: ❌ NOT USED\n`;
  }
  report += `\n`;
  
  // ═══ MAJOR/MINOR REFINER STATUS ═══
  report += `🎵 MAJOR/MINOR REFINER:\n`;
  const refinedChords = result.chords.filter(c => c.refinedBy);
  if (refinedChords.length > 0) {
    report += `   Status: ✅ ACTIVE\n`;
    report += `   Corrections: ${refinedChords.length}\n`;
    report += `   Settings:\n`;
    report += `      minConfidenceToOverride: ${result.refinerSettings?.minConfidenceToOverride || 'N/A'}\n`;
    report += `      decisionThreshold: ${result.refinerSettings?.decisionThreshold || 'N/A'}\n`;
    report += `   First 3 corrections:\n`;
    refinedChords.slice(0, 3).forEach((c, i) => {
      report += `      ${i+1}. ${c.originalLabel || '?'} → ${c.label} (conf: ${(c.refinerConfidence * 100).toFixed(0)}%)\n`;
    });
  } else {
    report += `   Status: ⚠️ NO CORRECTIONS MADE\n`;
  }
  report += `\n`;
  
  // ═══ CHORD ENGINE (MAIN) ═══
  report += `🎼 CHORD ENGINE (MAIN):\n`;
  report += `   Total Chords: ${result.chords.length}\n`;
  report += `   Duration: ${result.duration ? result.duration.toFixed(2) : 'N/A'}s\n`;
  if (result.stats) {
    report += `   In-Scale: ${result.stats.inScale || 0}\n`;
    report += `   Borrowed: ${result.stats.borrowed || 0}\n`;
    report += `   Inversions: ${result.stats.inversions || 0}\n`;
    report += `   Extensions: ${result.stats.extensions || 0}\n`;
  }
  report += `\n`;
  
  // ═══ DETAILED CHORD-BY-CHORD TABLE ═══
  report += `📊 CHORD-BY-CHORD COMPARISON (First 20):\n`;
  report += `${'─'.repeat(100)}\n`;
  report += `${'#'.padEnd(4)} ${'Time'.padEnd(7)} ${'ChordEngine'.padEnd(12)} ${'BassNote'.padEnd(10)} ${'Refiner'.padEnd(15)} ${'Final'.padEnd(12)} ${'Status'.padEnd(15)}\n`;
  report += `${'─'.repeat(100)}\n`;
  
  result.chords.slice(0, 20).forEach((chord, i) => {
    const num = (i + 1).toString().padEnd(4);
    const time = chord.t.toFixed(2).padEnd(7);
    
    // ChordEngine output (before any refinement)
    const engineChord = (chord.originalLabel || chord.label).padEnd(12);
    
    // Bass note from BassEngine
    const bass = result.bassTimeline?.find(b => chord.t >= b.tStart && chord.t < b.tEnd);
    const bassNote = bass ? `${bass.noteName} (${bass.pc})`.padEnd(10) : '—'.padEnd(10);
    
    // Refiner suggestion
    let refinerSugg = '—';
    if (chord.refinedBy) {
      refinerSugg = `${chord.label} (${(chord.refinerConfidence * 100).toFixed(0)}%)`;
    }
    refinerSugg = refinerSugg.padEnd(15);
    
    // Final chord
    const finalChord = chord.label.padEnd(12);
    
    // Status
    let status = '';
    if (chord.refinedBy) {
      status = '✅ REFINED';
    } else if (bass && chord.label.includes('/')) {
      status = '🎸 +BASS';
    } else {
      status = '🎼 Original';
    }
    status = status.padEnd(15);
    
    report += `${num} ${time} ${engineChord} ${bassNote} ${refinerSugg} ${finalChord} ${status}\n`;
  });
  
  report += `${'─'.repeat(100)}\n`;
  report += `\n`;
  
  // ═══ SUMMARY ═══
  report += `📈 SUMMARY:\n`;
  report += `   BassEngine: ${result.bassTimeline ? `✅ ${result.bassTimeline.length} segments` : '❌'}\n`;
  report += `   Refiner: ${refinedChords.length > 0 ? `✅ ${refinedChords.length} corrections` : '⚠️ No corrections'}\n`;
  report += `   Total Processing: ${result.chords.length} chords\n`;
  report += `\n`;
  report += `═══════════════════════════════════════════════════════════\n`;
  
  return report;
}

function generate3EngineCSV(result) {
  if (!result || !result.chords) return 'Time,Error\n0,No result available';
  
  const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  
  let csv = 'Time,Duration,ChordEngine_Output,Bass_Note,Bass_PC,';
  csv += 'Refiner_Suggestion,Refiner_Confidence,Final_Chord,Was_Refined,Status\n';
  
  result.chords.forEach((chord, i) => {
    const time = chord.t.toFixed(2);
    
    // Duration until next chord
    const nextChord = result.chords[i + 1];
    const duration = nextChord ? (nextChord.t - chord.t).toFixed(2) : '—';
    
    // Original ChordEngine output (before refinement)
    const engineOutput = chord.originalLabel || chord.label;
    
    // Bass info from BassEngine
    const bass = result.bassTimeline?.find(b => chord.t >= b.tStart && chord.t < b.tEnd);
    const bassNote = bass ? bass.noteName : '—';
    const bassPc = bass ? bass.pc : '—';
    
    // Refiner info
    const refinerSugg = chord.refinedBy ? chord.label : '—';
    const refinerConf = chord.refinerConfidence ? (chord.refinerConfidence * 100).toFixed(0) + '%' : '—';
    
    // Final chord
    const finalChord = chord.label;
    
    // Was it refined?
    const wasRefined = chord.refinedBy ? 'YES' : 'NO';
    
    // Status
    let status = 'Original';
    if (chord.refinedBy) status = 'Refined';
    else if (bass && chord.label.includes('/')) status = 'Bass_Added';
    
    csv += `${time},${duration},${engineOutput},${bassNote},${bassPc},`;
    csv += `${refinerSugg},${refinerConf},${finalChord},${wasRefined},${status}\n`;
  });
  
  return csv;
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function copyDebugToClipboard() {
  const text = document.getElementById('debugOutput').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyDebugBtn');
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  }).catch(err => {
    alert('Copy failed: ' + err);
  });
}

// Make functions globally available
window.generate3EngineDebugReport = generate3EngineDebugReport;
window.generate3EngineCSV = generate3EngineCSV;
window.downloadCSV = downloadCSV;
window.copyDebugToClipboard = copyDebugToClipboard;
