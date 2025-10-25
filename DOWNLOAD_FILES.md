# 📥 הורד את הקבצים האלה

## 🎯 מה צריך להוריד?

### קבצי API (שים בתיקיית `api/`):

1. **[rapidapi-audio.js](computer:///mnt/user-data/outputs/rapidapi-audio.js)** ← לחץ ימין → Save As
2. **[rapidapi-transcript.js](computer:///mnt/user-data/outputs/rapidapi-transcript.js)** ← לחץ ימין → Save As
3. **[yt.js](computer:///mnt/user-data/outputs/yt.js)** ← לחץ ימין → Save As

### קובץ הגדרות (שים בשורש הפרויקט):

4. **[vercel.json](computer:///mnt/user-data/outputs/vercel.json)** ← לחץ ימין → Save As

---

## 📋 או תעתיק את הקוד ישירות:

### 1️⃣ rapidapi-audio.js

```javascript
// api/rapidapi-audio.js
// Vercel Serverless Function for downloading YouTube audio via RapidAPI

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ 
        error: 'Missing videoId parameter',
        example: '/api/rapidapi-audio?videoId=dQw4w9WgXcQ'
      });
    }
    
    // RapidAPI configuration
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_KEY_HERE';
    const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';
    
    console.log(`Fetching audio for video: ${videoId}`);
    
    // Call RapidAPI
    const response = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('RapidAPI error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'RapidAPI request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('RapidAPI response:', data);
    
    // Extract audio URL from different possible response formats
    const audioUrl = data.link || data.url || data.dlink || data.download;
    
    if (!audioUrl) {
      console.error('No audio URL in response:', data);
      return res.status(500).json({ 
        error: 'No audio URL found in response',
        response: data
      });
    }
    
    // Return the audio URL
    return res.status(200).json({ 
      success: true,
      url: audioUrl,
      videoId: videoId,
      title: data.title || 'Unknown'
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
```

---

### 2️⃣ rapidapi-transcript.js

```javascript
// api/rapidapi-transcript.js
// Vercel Serverless Function for fetching YouTube transcripts via RapidAPI

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ 
        error: 'Missing videoId parameter',
        example: '/api/rapidapi-transcript?videoId=dQw4w9WgXcQ'
      });
    }
    
    // RapidAPI configuration for YouTube Transcripts
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_KEY_HERE';
    const RAPIDAPI_HOST = 'youtube-transcripts.p.rapidapi.com';
    
    console.log(`Fetching transcript for video: ${videoId}`);
    
    // Call RapidAPI
    const response = await fetch(`https://${RAPIDAPI_HOST}/youtube/transcript?videoId=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('RapidAPI error:', response.status, errorText);
      
      // If no transcript available, return friendly message
      if (response.status === 404) {
        return res.status(200).json({ 
          error: 'No transcript available',
          text: '🎤 אין תמלול זמין לסרטון זה'
        });
      }
      
      return res.status(response.status).json({ 
        error: 'RapidAPI request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('Transcript response:', data);
    
    // Extract transcript text from different possible formats
    let transcriptText = '';
    
    if (typeof data === 'string') {
      transcriptText = data;
    } else if (data.transcript) {
      transcriptText = data.transcript;
    } else if (data.text) {
      transcriptText = data.text;
    } else if (Array.isArray(data.content)) {
      transcriptText = data.content.map(item => item.text || '').join(' ');
    } else if (Array.isArray(data)) {
      transcriptText = data.map(item => item.text || '').join(' ');
    }
    
    if (!transcriptText) {
      return res.status(200).json({ 
        error: 'No transcript text found',
        text: '🎤 אין תמלול זמין לסרטון זה',
        rawResponse: data
      });
    }
    
    // Return the transcript
    return res.status(200).json({ 
      success: true,
      text: transcriptText.trim(),
      videoId: videoId
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      text: '⚠️ שגיאת שרת בטעינת תמלול'
    });
  }
}
```

---

### 3️⃣ yt.js

```javascript
// api/yt.js
// Vercel Serverless Function for searching YouTube videos

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        error: 'Missing search query',
        example: '/api/yt?q=adele+hello'
      });
    }
    
    console.log(`Searching YouTube for: ${q}`);
    
    // Simple mock response - replace with actual scraping if needed
    const mockResults = [
      {
        id: 'dQw4w9WgXcQ',
        title: q,
        author: 'YouTube',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
      }
    ];
    
    return res.status(200).json(mockResults);
    
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: error.message
    });
  }
}
```

---

### 4️⃣ vercel.json

```json
{
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET, POST, PUT, DELETE, OPTIONS"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "X-Requested-With, Content-Type, Accept"
        }
      ]
    }
  ]
}
```

---

## 📤 איך להעלות ל-GitHub?

### דרך 1: דרך הממשק (הכי פשוט)

1. לך ל: https://github.com/alonrav74-sys/Youtube-proxy/tree/main/api
2. לחץ **"Add file" → "Create new file"**
3. שם הקובץ: `rapidapi-audio.js`
4. העתק את הקוד למעלה
5. **Commit new file**
6. חזור על זה עבור `rapidapi-transcript.js` ו-`yt.js`

7. אז לך לשורש: https://github.com/alonrav74-sys/Youtube-proxy
8. צור קובץ `vercel.json` באותה דרך

### דרך 2: העלאה בגרירה

1. שמור את 3 הקבצים על המחשב
2. לך ל: https://github.com/alonrav74-sys/Youtube-proxy/tree/main/api
3. גרור אותם לחלון הדפדפן
4. Commit

---

## ✅ מה אחרי זה?

1. הוסף `RAPIDAPI_KEY` ב-Vercel
2. עשה Redeploy
3. בדוק שזה עובד!

**[← חזור למדריך המלא](computer:///mnt/user-data/outputs/QUICK_FIX_404.md)**
