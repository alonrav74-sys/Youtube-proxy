// ChordEvalSimple.js
// 👇 כלי פשוט ל:
// 1. יצירת CSV מהתוצאה של ChordEngineUltimate.detect()
// 2. השוואה ל-CSV ידני (Ground Truth)
// 3. הפקת דוח טקסטואלי לקריאה בסימולטור

const ChordEvalSimple = (() => {

  // ---------- 1. יצוא CSV מהמנוע ----------

  function exportEngineCsv(result) {
    const chords = result && result.chords ? result.chords : [];
    const rows = [];

    // כותרת
    rows.push([
      "time_sec",      // זמן באודיו
      "label",         // האקורד כפי שהמנוע זיהה (לעריכה ידנית)
      "root_pc",       // root כ- pitch class (0=C ... 11=B)
      "bass_pc",       // bass pitch class אם יש (אחרת ריק)
      "type",          // major/minor וכו'
      "confidence"     // 0-100
    ].join(","));

    for (const ev of chords) {
      rows.push([
        (ev.t || 0).toFixed(3),
        safe(ev.label),
        ev.root != null ? ev.root : "",
        ev.bassNote != null ? ev.bassNote : "",
        safe(ev.type || ""),
        ev.confidence != null ? ev.confidence : ""
      ].join(","));
    }

    return rows.join("\n");
  }

  function safe(v) {
    if (v == null) return "";
    return String(v).replace(/,/g, ";");
  }

  // הורדה בפועל כקובץ
  function downloadEngineCsv(result, filename = "engine_chords.csv") {
    const csv = exportEngineCsv(result);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- 2. Parser בסיסי ל-CSV ----------

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (!lines.length) return { headers: [], rows: [] };

    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cols = line.split(",");
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (cols[i] || "").trim();
      });
      return obj;
    });

    return { headers, rows };
  }

  // ---------- 3. המרת שורה לאובייקט אקורד עם זמן ----------

  function rowToChord(row) {
    let t = 0;
    if (row.time_sec != null && row.time_sec !== "") {
      const f = parseFloat(row.time_sec);
      if (!isNaN(f)) t = f;
    }

    return {
      t,
      label: row.label || "",
      raw: row
    };
  }

  // ---------- 4. נורמליזציה של label להשוואה ----------

  function normalizeLabel(label) {
    if (!label) return "";

    label = label.trim();

    // מוריד bass (C/E -> C, G/B -> G וכו')
    const slashIdx = label.indexOf("/");
    if (slashIdx >= 0) {
      label = label.substring(0, slashIdx);
    }

    // מוריד רווחים
    label = label.replace(/\s+/g, "");

    return label.toUpperCase();
  }

  // ---------- 5. יישור טיימליינים לפי הזמן ----------

  function alignTimelines(engineRows, truthRows, opts = {}) {
    const tol = opts.timeTolerance != null ? opts.timeTolerance : 0.25;

    const eng = engineRows
      .map(rowToChord)
      .sort((a, b) => a.t - b.t);

    const truth = truthRows
      .map(rowToChord)
      .sort((a, b) => a.t - b.t);

    const pairs = [];
    let i = 0, j = 0;

    while (i < eng.length && j < truth.length) {
      const e = eng[i];
      const g = truth[j];
      const dt = e.t - g.t;

      if (Math.abs(dt) <= tol) {
        // match
        pairs.push({ engine: e, truth: g });
        i++; j++;
      } else if (dt < 0) {
        // engine מוקדם – כנראה אקורד מיותר
        pairs.push({ engine: e, truth: null });
        i++;
      } else {
        // truth מוקדם – engine פספס
        pairs.push({ engine: null, truth: g });
        j++;
      }
    }

    // שאריות
    while (i < eng.length) {
      pairs.push({ engine: eng[i], truth: null });
      i++;
    }
    while (j < truth.length) {
      pairs.push({ engine: null, truth: truth[j] });
      j++;
    }

    return pairs;
  }

  // ---------- 6. השוואה של זוג אקורדים ----------

  function compareChordPair(e, g) {
    if (!e || !g) {
      return {
        match: false,
        type: e ? "extra_engine" : "missed_engine",
        engineLabel: e ? e.label : null,
        truthLabel: g ? g.label : null
      };
    }

    const eNorm = normalizeLabel(e.label);
    const gNorm = normalizeLabel(g.label);

    const match = eNorm === gNorm;

    return {
      match,
      type: match ? "exact" : "mismatch",
      engineLabel: e.label,
      truthLabel: g.label
    };
  }

  // ---------- 7. compareCsv: engine CSV + truth CSV -> דו"ח ----------

  function compareCsv(engineCsvText, truthCsvText, opts = {}) {
    const engine = parseCsv(engineCsvText);
    const truth = parseCsv(truthCsvText);

    const pairs = alignTimelines(engine.rows, truth.rows, opts);

    let total = 0;
    let exact = 0;
    let extra = 0;
    let missed = 0;

    const mistakes = [];

    for (const pair of pairs) {
      total++;

      const cmp = compareChordPair(pair.engine, pair.truth);

      if (cmp.type === "extra_engine") {
        extra++;
        mistakes.push({
          time: pair.engine.t,
          kind: "אקורד מיותר (engine)",
          engine: pair.engine.label,
          truth: ""
        });
        continue;
      }

      if (cmp.type === "missed_engine") {
        missed++;
        mistakes.push({
          time: pair.truth.t,
          kind: "אקורד חסר (engine לא מצא)",
          engine: "",
          truth: pair.truth.label
        });
        continue;
      }

      if (cmp.match) {
        exact++;
      } else {
        mistakes.push({
          time: pair.engine.t,
          kind: "label שונה",
          engine: cmp.engineLabel,
          truth: cmp.truthLabel
        });
      }
    }

    const acc = total ? (exact / total) : 0;

    return {
      stats: {
        totalPairs: total,
        exactMatches: exact,
        exactRate: acc,
        extraEngine: extra,
        missedTruth: missed
      },
      mistakes
    };
  }

  // ---------- 8. פורמט יפה לדוח טקסטואלי ----------

  function formatReport(report) {
    const s = report.stats;
    const lines = [];

    lines.push("🎼 דו\"ח השוואת אקורדים (engine מול CSV ידני)");
    lines.push("------------------------------------------------");
    lines.push(`סה"כ זוגות שנבדקו: ${s.totalPairs}`);
    lines.push(`התאמות מלאות (אותו אקורד בדיוק): ${s.exactMatches} (${(s.exactRate * 100).toFixed(1)}%)`);
    lines.push(`אקורדים מיותרים (engine): ${s.extraEngine}`);
    lines.push(`אקורדים חסרים (engine לא מצא): ${s.missedTruth}`);
    lines.push("");
    lines.push("טעויות עיקריות:");
    lines.push("----------------");

    if (!report.mistakes.length) {
      lines.push("אין טעויות – הכל תואם ✅");
      return lines.join("\n");
    }

    report.mistakes.slice(0, 100).forEach(m => {
      lines.push(
        `[t=${m.time.toFixed(2)}s] ${m.kind} | engine: ${m.engine || "-"} | truth: ${m.truth || "-"}`
      );
    });

    if (report.mistakes.length > 100) {
      lines.push(`... ועוד ${report.mistakes.length - 100} טעויות נוספות`);
    }

    return lines.join("\n");
  }

  return {
    exportEngineCsv,
    downloadEngineCsv,
    parseCsv,
    compareCsv,
    formatReport
  };

})();

// חשיפה ל-window / Node
if (typeof window !== "undefined") {
  window.ChordEvalSimple = ChordEvalSimple;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ChordEvalSimple;
}
