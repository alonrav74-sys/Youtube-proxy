# 🚀 מדריך העלאה מהירה - תקן את ה-404

## הבעיה שזיהינו:
השרת מחזיר **404** = הקבצים לא נמצאים במבנה הנכון

---

## ✅ הפתרון - 4 שלבים פשוטים:

### שלב 1: הוסף את קבצי ה-API ⬆️

לך ל-GitHub שלך: https://github.com/alonrav74-sys/Youtube-proxy

**בדוק אם יש תיקייה בשם `api`:**
- ✅ אם יש - מצוין
- ❌ אם אין - צור אותה

---

### שלב 2: העלה את הקבצים 📁

**העתק את הקבצים האלה לתיקיית `api`:**

1. **api/rapidapi-audio.js** ← יצרתי לך
2. **api/rapidapi-transcript.js** ← יצרתי לך  
3. **api/yt.js** ← יצרתי לך
4. **vercel.json** ← שים בשורש (לא ב-api!)

**איך?**

#### דרך 1: דרך GitHub (הכי פשוט)

1. לך ל: https://github.com/alonrav74-sys/Youtube-proxy/tree/main/api
2. לחץ "Add file" → "Upload files"
3. גרור את 3 הקבצים (.js) לחלון
4. לחץ "Commit changes"

5. אז חזור לשורש: https://github.com/alonrav74-sys/Youtube-proxy
6. העלה את `vercel.json` (בשורש, לא בתיקייה!)

#### דרך 2: דרך Git (אם אתה מכיר)

```bash
cd Youtube-proxy
mkdir -p api
# העתק את הקבצים לתיקיית api
git add .
git commit -m "Fix API endpoints"
git push
```

---

### שלב 3: הוסף RapidAPI Key 🔑

1. לך ל: https://vercel.com/dashboard
2. בחר את הפרויקט `youtube-proxy`
3. לחץ "Settings" → "Environment Variables"
4. הוסף משתנה חדש:
   - **Name:** `RAPIDAPI_KEY`
   - **Value:** המפתח שלך מ-RapidAPI
   - לחץ "Save"

**איפה המפתח?**
- לך ל: https://rapidapi.com/hub
- התחבר
- לחץ על "My Apps" → העתק את ה-API Key

---

### שלב 4: Redeploy 🔄

1. עדיין ב-Vercel Dashboard
2. לחץ "Deployments" (למעלה)
3. לחץ על השלוש נקודות ליד ה-deployment האחרון
4. לחץ "Redeploy"
5. המתן 1-2 דקות ⏳

---

## 🧪 בדיקה

אחרי ה-Redeploy, פתח את הקישורים האלה:

### ✅ בדיקה 1: Audio API
```
https://youtube-proxy-pied.vercel.app/api/rapidapi-audio?videoId=dQw4w9WgXcQ
```

**מה אתה אמור לראות:**
```json
{
  "success": true,
  "url": "https://...",
  "videoId": "dQw4w9WgXcQ"
}
```

### ✅ בדיקה 2: Transcript API
```
https://youtube-proxy-pied.vercel.app/api/rapidapi-transcript?videoId=dQw4w9WgXcQ
```

**מה אתה אמור לראות:**
```json
{
  "success": true,
  "text": "Never gonna give you up...",
  "videoId": "dQw4w9WgXcQ"
}
```

---

## ❓ אם זה עדיין לא עובד

### אם אתה רואה 404:
- בדוק שהקבצים ב-`api/` (עם אות קטנה)
- בדוק ששם הקובץ בדיוק: `rapidapi-audio.js` (לא `rapidapi_audio.js`)

### אם אתה רואה שגיאת API Key:
```json
{"error": "RapidAPI request failed"}
```
- בדוק שהוספת `RAPIDAPI_KEY` ב-Vercel Environment Variables
- בדוק שעשית Redeploy **אחרי** שהוספת את המפתח

### אם אתה רואה CORS error בדפדפן:
- בדוק שהעלית את `vercel.json` לשורש הפרויקט
- עשה Redeploy

---

## 📦 הקבצים שיצרתי:

✅ **rapidapi-audio.js** - מוריד אודיו מיוטיוב  
✅ **rapidapi-transcript.js** - מוריד תמלול מיוטיוב  
✅ **yt.js** - חיפוש סרטונים  
✅ **vercel.json** - הגדרות CORS  

---

## 🎯 מצב הפרויקט:

אחרי שזה יעבוד:
1. ✅ תוכל לחפש שירים ביוטיוב
2. ✅ להוריד אודיו אוטומטית
3. ✅ לקבל תמלול בעברית/אנגלית
4. ✅ לזהות אקורדים
5. ✅ ליצור דף נגינה מסונכרן

**בהצלחה! אם תקוע איפשהו - צלם מסך ותראה לי 📸**
