# ChordFinder Pro - ULTIMATE Edition

🎸 **אקורדים מעל מילים בזמן אמת + דף נגינה מלא**

## תכונות

✅ **זיהוי אקורדים חכם** - HMM + Bass Detection  
✅ **תמלול מילים** - YouTube (Groq Whisper)  
✅ **סנכרון מדויק** - אקורד על מילה/בין מילים  
✅ **דף חי** - אקורדים בשורות (gaps = line breaks)  
✅ **RTL/LTR** - תמיכה מלאה בעברית  
✅ **PWA** - התקנה ועבודה offline  
✅ **Key-Constrained Detection** - זיהוי לפי סולם  
✅ **Conservative Inversions** - threshold ×2.5  
✅ **7th Detection** - בדיקה חכמה (אם A חזק → B7)  

## התקנה

### שרת (Vercel/Netlify/GitHub Pages)

1. העלה את כל הקבצים:
   - `index.html`
   - `chord-engine-unified.js`
   - `enhanced-key-detection.js`
   - `manifest.json`
   - `service-worker.js`
   - `icons/` (כל התיקייה)

2. פתח ב-HTTPS (חובה ל-PWA)

3. בדפדפן mobile:
   - Chrome: "Add to Home Screen"
   - Safari: "Add to Home Screen"

### מקומי (לפיתוח)

```bash
# התקן Python HTTP server
python3 -m http.server 8000

# או Node.js
npx http-server -p 8000

# פתח: http://localhost:8000
```

## איקונים

כרגע יש SVG placeholder בתיקיית `icons/`.

**ליצירת אייקונים ממשיים:**

1. צור אייקון 512×512 PNG
2. השתמש ב-[PWA Asset Generator](https://www.pwabuilder.com/imageGenerator):
   - העלה את האייקון
   - הורד את כל הגדלים
   - החלף את הקבצים ב-`icons/`

## דרישות מינימליות

- דפדפן מודרני (Chrome 90+, Safari 14+, Firefox 88+)
- HTTPS (חובה ל-PWA ו-Service Worker)
- JavaScript מופעל

## מבנה הפרויקט

```
chordfinder-pwa/
├── index.html                  # עמוד ראשי
├── chord-engine-unified.js     # מנוע זיהוי אקורדים
├── enhanced-key-detection.js   # זיהוי סולם משופר
├── manifest.json               # PWA manifest
├── service-worker.js           # Service worker (offline)
├── icons/                      # אייקונים
│   ├── icon.svg               # SVG מקור
│   └── icon-*.png             # (צריך ליצור)
└── README.md                   # זה
```

## בנוי על ידי Alon

**Powered by:**
- Groq Whisper (transcription)
- Harmonic Theory
- Modulation Detection
- HMM Tracking (Viterbi)
- ACF Bass Detection

---

**Built with ❤️ by Claude & Alon**
