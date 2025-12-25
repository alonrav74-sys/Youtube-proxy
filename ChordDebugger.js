/**
 * ChordDebugger v7.0 - כלי דיבוג לתוצאות אקורדים + טבלת UI
 * תואם ל-ChordEngineEnhanced v14.50
 */
class ChordDebugger {
  constructor() {
    this.enabled = true;
    this.NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  }

  log(results) {
    if (!this.enabled || !results) return;
    
    console.group('🎸 ChordDebugger v7.0');
    
    // Key info
    if (results.key) {
      console.log('Key:', `${this.NOTES[results.key.root]}${results.key.minor ? 'm' : ''} (${Math.round(results.key.confidence * 100)}%)`);
    } else {
      console.log('Key: N/A');
    }
    
    // Tonic info (v14.50 feature)
    if (results.tonic) {
      console.log('Tonic:', `${results.tonic.label} (${results.tonic.confidence}%) - method: ${results.tonic.method}`);
    }
    
    console.log('BPM:', results.bpm || 'N/A');
    console.log('Duration:', results.duration ? `${results.duration.toFixed(1)}s` : 'N/A');
    console.log('Mode:', results.mode || 'N/A');
    
    // Stats
    if (results.stats) {
      console.log('Stats:', {
        total: results.stats.totalChords,
        structural: results.stats.structural,
        ornaments: results.stats.ornaments,
        secondaryDominants: results.stats.secondaryDominants,
        modalBorrowings: results.stats.modalBorrowings,
        inversions: results.stats.inversions,
        extensions: results.stats.extensions,
        modulations: results.stats.modulations,
        bassChanges: results.stats.bassChanges || 0,
        mmChanges: results.stats.mmChanges || 0,
        predictionAccuracy: results.stats.predictionAccuracy + '%'
      });
    }
    
    // Chords table
    if (results.chords?.length) {
      console.table(results.chords.slice(0, 30).map(c => ({
        time: c.t?.toFixed(2),
        chord: c.label,
        original: c.originalLabel || '-',
        bass: c.changedByBass ? '✓' : '-',
        mm: c.refinedBy ? '✓' : '-',
        type: c.ornamentType || 'structural',
        context: c.modalContext || '-',
        nextPred: c.predictions?.[0]?.label || '-'
      })));
    }
    
    // Timings
    if (results.timings) {
      console.log('Timings:', Object.fromEntries(
        Object.entries(results.timings).map(([k, v]) => [k, `${v.toFixed(0)}ms`])
      ));
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
      return '<tr><td colspan="9" style="text-align:center;color:#94a3b8">אין נתונים</td></tr>';
    }

    let html = '';
    
    result.chords.forEach((ch, idx) => {
      if (!ch || !ch.label) return;
      
      const time = ch.t ? ch.t.toFixed(2) : '—';
      
      // 🎼 מה המנוע המרכזי זיהה (לפני שינויים) - עם קאפו!
      const engineDetected = ch.originalLabel || ch.label;
      const engineWithCapo = applyCapoToLabel(sanitizeLabel(engineDetected), capo);
      const engineDisplay = escapeHtml(engineWithCapo);
      
      // 🎸 מה BassEngine זיהה
      let bassDisplay = '<span style="color:#666">—</span>';
      const bassResult = window.__moduleResults?.bass?.[idx];
      if (bassResult && bassResult.bassDetected && bassResult.bassDetected !== 'NO_BASS') {
        const bassWithCapo = applyCapoToLabel(bassResult.bassDetected, capo);
        const conf = ((bassResult.bassConfidence || 0) * 100).toFixed(0);
        bassDisplay = `<span style="color:#f59e0b;font-weight:700">${escapeHtml(bassWithCapo)}</span><br><small style="color:#888">${conf}%</small>`;
      }
      
      // 🎵 מה MajorMinorRefiner זיהה
      let mmDisplay = '<span style="color:#666">—</span>';
      const refinerResult = window.__moduleResults?.refiner?.[idx];
      if (refinerResult && refinerResult.detectedQuality && refinerResult.detectedQuality !== 'unclear') {
        const quality = refinerResult.detectedQuality;
        const symbol = quality === 'major' ? 'M' : 'm';
        const conf = ((refinerResult.qualityConfidence || 0) * 100).toFixed(0);
        const color = symbol === 'M' ? '#38bdf8' : '#a855f7';
        mmDisplay = `<span style="color:${color};font-weight:700;font-size:16px">${symbol}</span><br><small style="color:#888">${conf}%</small>`;
      }
      
      // ➡️ ההחלטה הסופית (אחרי כל השינויים)
      const finalLabel = applyCapoToLabel(sanitizeLabel(ch.label), capo);
      const finalDisplay = escapeHtml(finalLabel);
      
      // Func - פונקציה הרמונית
      const func = key ? getHarmonicFunction(ch.label, key) : '—';
      
      // 🏷️ Type - סוג האקורד (v14.50)
      const typeDisplay = this.formatOrnamentType(ch.ornamentType);
      
      // 🎭 Context - הקשר מודלי (v14.50)
      const contextDisplay = this.formatModalContext(ch.modalContext);
      
      // צבעים והדגשות
      let engineColor = '#94a3b8';
      let finalColor = '#38bdf8';
      let changedBy = '';
      
      if (ch.changedByBass) {
        engineColor = '#888';
        finalColor = '#f59e0b';
        changedBy = '🎸';
      }
      
      if (ch.refinedBy) {
        engineColor = '#888';
        finalColor = '#a855f7';
        changedBy = '🎵';
      }
      
      if (ch.changedByBass && ch.refinedBy) {
        changedBy = '🎸🎵';
      }
      
      // Debug column - extra info
      let debugInfo = '';
      if (ch.predictions?.length) {
        debugInfo = `Next: ${ch.predictions[0].label}`;
      }
      if (ch.recognizedProgression) {
        debugInfo += (debugInfo ? '<br>' : '') + `Prog: ${ch.recognizedProgression}`;
      }
      
      html += `<tr>
        <td>${idx + 1}</td>
        <td>${time}s</td>
        <td style="color:${engineColor};font-weight:600">${engineDisplay}</td>
        <td style="text-align:center">${bassDisplay}</td>
        <td style="text-align:center">${mmDisplay}</td>
        <td style="color:${finalColor};font-weight:700;font-size:15px">${finalDisplay} ${changedBy}</td>
        <td style="color:#38bdf8">${func}</td>
        <td style="text-align:center">${typeDisplay}</td>
        <td style="color:#888;font-size:11px">${contextDisplay}${debugInfo ? '<br>' + debugInfo : ''}</td>
      </tr>`;
    });
    
    return html;
  }

  /**
   * פורמט לסוג אורנמנט
   */
  formatOrnamentType(type) {
    const types = {
      'structural': '<span style="color:#10b981">●</span>',
      'passing': '<span style="color:#f59e0b">◐</span>',
      'neighbor': '<span style="color:#8b5cf6">◑</span>',
      'pedal': '<span style="color:#06b6d4">◎</span>',
      'anticipation': '<span style="color:#ec4899">◇</span>'
    };
    return types[type] || types['structural'];
  }

  /**
   * פורמט להקשר מודלי
   */
  formatModalContext(context) {
    if (!context) return '';
    
    const contexts = {
      'secondary_dominant': '<span style="color:#ef4444;font-weight:700">V/x</span>',
      'borrowed_bVI': '<span style="color:#a855f7">♭VI</span>',
      'borrowed_bVII': '<span style="color:#a855f7">♭VII</span>',
      'borrowed_iv': '<span style="color:#a855f7">iv</span>',
      'borrowed_bIII': '<span style="color:#a855f7">♭III</span>',
      'borrowed_IV_major': '<span style="color:#a855f7">IV</span>',
      'neapolitan': '<span style="color:#06b6d4">N</span>'
    };
    
    return contexts[context] || `<span style="color:#666">${context}</span>`;
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
      <th>Type</th>
      <th>🔍 Debug</th>
    </tr>`;
  }

  /**
   * יוצר overlay צף עם סיכום התוצאות
   */
  createOverlay(results) {
    if (!results) return null;
    
    const div = document.createElement('div');
    div.id = 'chord-debugger-overlay';
    div.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      padding: 15px 20px;
      border-radius: 12px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      max-height: 85vh;
      max-width: 350px;
      overflow: auto;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.1);
    `;
    
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:16px;font-weight:bold;">🎸 ChordDebugger v7.0</span>
        <button onclick="this.closest('#chord-debugger-overlay').remove()" 
                style="background:#ff6b6b;border:none;color:white;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;">×</button>
      </div>
    `;
    
    // Key & Tonic
    const keyStr = results.key ? 
      `${this.NOTES[results.key.root]}${results.key.minor ? 'm' : ''}` : '?';
    const keyConf = Math.round((results.key?.confidence || 0) * 100);
    
    html += `<div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;margin-bottom:10px;">`;
    html += `<div style="display:flex;justify-content:space-between;">
      <span>Key:</span>
      <span style="color:#4ecdc4;font-weight:bold;font-size:18px">${keyStr}</span>
    </div>`;
    html += `<div style="color:#888;font-size:11px;">Confidence: ${keyConf}%</div>`;
    
    if (results.tonic) {
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;justify-content:space-between;">
          <span>Tonic:</span>
          <span style="color:#f59e0b;font-weight:bold">${results.tonic.label}</span>
        </div>
        <div style="color:#888;font-size:11px;">${results.tonic.method} (${results.tonic.confidence}%)</div>
      </div>`;
    }
    html += `</div>`;
    
    // BPM, Duration, Mode
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">`;
    html += `<div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;text-align:center;">
      <div style="color:#888;font-size:10px;">BPM</div>
      <div style="font-weight:bold;color:#38bdf8">${results.bpm || '?'}</div>
    </div>`;
    html += `<div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;text-align:center;">
      <div style="color:#888;font-size:10px;">Duration</div>
      <div style="font-weight:bold;color:#38bdf8">${results.duration?.toFixed(1) || '?'}s</div>
    </div>`;
    html += `<div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;text-align:center;">
      <div style="color:#888;font-size:10px;">Mode</div>
      <div style="font-weight:bold;color:#38bdf8">${results.mode || '?'}</div>
    </div>`;
    html += `</div>`;
    
    // Stats
    if (results.stats) {
      html += `<div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;margin-bottom:10px;">`;
      html += `<div style="font-weight:bold;margin-bottom:8px;color:#94a3b8;">📊 Statistics</div>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">`;
      
      const stats = [
        ['Total', results.stats.totalChords],
        ['Structural', results.stats.structural],
        ['Ornaments', results.stats.ornaments],
        ['Sec. Dom.', results.stats.secondaryDominants],
        ['Modal Borr.', results.stats.modalBorrowings],
        ['Inversions', results.stats.inversions],
        ['Extensions', results.stats.extensions],
        ['Modulations', results.stats.modulations],
        ['Bass Δ', results.stats.bassChanges || 0],
        ['M/m Δ', results.stats.mmChanges || 0]
      ];
      
      stats.forEach(([label, value]) => {
        html += `<div style="display:flex;justify-content:space-between;">
          <span style="color:#888">${label}:</span>
          <span style="color:#fff">${value}</span>
        </div>`;
      });
      
      html += `</div>`;
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);text-align:center;">
        <span style="color:#888">Prediction Accuracy:</span>
        <span style="color:#10b981;font-weight:bold;margin-left:8px;">${results.stats.predictionAccuracy}%</span>
      </div>`;
      html += `</div>`;
    }
    
    // Timings
    if (results.timings) {
      html += `<div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;">`;
      html += `<div style="font-weight:bold;margin-bottom:8px;color:#94a3b8;">⏱️ Timings</div>`;
      html += `<div style="font-size:11px;">`;
      
      const timingOrder = ['audioProcessing', 'featureExtraction', 'keyDetection', 'hmmTracking', 
                          'postProcessing', 'rerunKeyValidation', 'rerunTonic', 'total'];
      
      timingOrder.forEach(key => {
        if (results.timings[key] !== undefined) {
          const label = key.replace(/([A-Z])/g, ' $1').trim();
          const isTotal = key === 'total';
          html += `<div style="display:flex;justify-content:space-between;${isTotal ? 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);font-weight:bold;' : ''}">
            <span style="color:${isTotal ? '#fff' : '#888'}">${label}:</span>
            <span style="color:${isTotal ? '#4ecdc4' : '#fff'}">${results.timings[key].toFixed(0)}ms</span>
          </div>`;
        }
      });
      
      html += `</div></div>`;
    }
    
    div.innerHTML = html;
    return div;
  }

  /**
   * מציג את ה-overlay על המסך
   */
  showOverlay(results) {
    // הסר overlay קיים
    const existing = document.getElementById('chord-debugger-overlay');
    if (existing) existing.remove();
    
    const overlay = this.createOverlay(results);
    if (overlay) {
      document.body.appendChild(overlay);
    }
  }

  /**
   * מסתיר את ה-overlay
   */
  hideOverlay() {
    const overlay = document.getElementById('chord-debugger-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Toggle - הצג/הסתר
   */
  toggleOverlay(results) {
    const existing = document.getElementById('chord-debugger-overlay');
    if (existing) {
      existing.remove();
    } else {
      this.showOverlay(results);
    }
  }
}

window.ChordDebugger = ChordDebugger;
