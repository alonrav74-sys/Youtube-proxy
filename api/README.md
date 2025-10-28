# 🚀 ChordFinder Pro - Groq Whisper + Cobalt API

## ⚡ מה חדש:

- **Cobalt API** - הורדת אודיו מהירה (1-2 שניות!)
- **Groq Whisper** - תמלול עברית מעולה (5-10 שניות!)
- **ללא RapidAPI** - לא צריך עוד!

---

## 📋 התקנה מהירה:

### 1️⃣ קבל API Key של Groq (חינמי!)

1. לך ל: **https://console.groq.com**
2. הרשם (חינם!)
3. צור API Key חדש
4. העתק

---

### 2️⃣ הוסף ל-Vercel

1. **Vercel Dashboard** → בחר פרויקט
2. **Settings** → **Environment Variables**
3. הוסף:
   - **Name:** `GROQ_API_KEY`
   - **Value:** המפתח מGroq
4. שמור!

**זהו! לא צריך עוד API keys!**

---

### 3️⃣ העלה קבצים ל-GitHub

```
youtube-proxy/
├── api/
│   ├── cobalt-audio.js      ← חדש! (הורדה מהירה)
│   └── groq-transcribe.js   ← עודכן! (משתמש ב-Cobalt)
├── index.html                
├── chord-engine.js           
└── package.json             
```

---

### 4️⃣ זהו! 

Vercel יעשה deploy אוטומטי → חכה דקה → מוכן!

---

## ⚡ למה זה מהיר יותר:

### **לפני** (RapidAPI):
1. RapidAPI → 10-30 שניות ⏰
2. AssemblyAI → 30-60 שניות ⏰
**סה"כ: 40-90 שניות** 😴

### **עכשיו** (Cobalt + Groq):
1. Cobalt → **1-2 שניות** ⚡
2. Groq → **5-10 שניות** ⚡
**סה"כ: 6-12 שניות!** 🚀

---

## 🎯 מה קורה בקוד:

1. **המשתמש** בוחר שיר מYouTube
2. **Cobalt API** מוריד את האודיו (מהיר!)
3. **Groq Whisper** מתמלל (עברית מעולה!)
4. **ChordEngine** מזהה אקורדים
5. **סנכרון** - אקורדים מעל מילים!

---

## 📦 הקבצים בחבילה:

- **cobalt-audio.js** - הורדת אודיו מהירה מYouTube
- **groq-transcribe.js** - תמלול עם Groq Whisper
- **index.html** - הממשק (מעודכן)
- **chord-engine.js** - זיהוי אקורדים
- **package.json** - dependencies

---

## 🆘 בעיות?

### "GROQ_API_KEY not configured"
→ הוסף ב-Vercel Environment Variables

### "Cobalt failed"
→ YouTube חסם את הסרטון (נדיר)
→ נסה סרטון אחר

### תמלול ריק
→ בדוק Vercel Logs
→ וודא ש-Groq API key תקין

---

## ✨ תכונות:

✅ **זיהוי אקורדים** - אוטומטי מהאודיו  
✅ **תמלול עברית** - Groq Whisper Large v3  
✅ **תמלול אנגלית** - גם כן מעולה  
✅ **סנכרון** - אקורדים מעל מילים  
✅ **דף נגינה** - סגנון nagnu.co.il  
✅ **מהיר** - 6-12 שניות סה"כ!  

---

## 🎸 דוגמאות שירים לנסות:

### עברית 🇮🇱:
- "הביתה ירדנה ארזי"
- "שיר לשלום מירי אלוני"
- "ים של דמעות אביתר בנאי"

### אנגלית 🇺🇸:
- "Hallelujah Leonard Cohen"
- "Imagine John Lennon"
- "Let It Be The Beatles"

---

## 🎉 זהו! תהנה! 🚀

**ChordFinder Pro** - זיהוי אקורדים + תמלול מהיר
