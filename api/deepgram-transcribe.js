// /api/deepgram-transcribe.js
// Send YouTube URL directly to Deepgram

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('🎤 Deepgram request');

    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
    
    if (!DEEPGRAM_API_KEY) {
      console.error('❌ No API key');
      return res.status(500).json({ 
        success: false, 
        error: 'DEEPGRAM_API_KEY not configured' 
      });
    }

    const { youtubeUrl } = req.body || {};
    
    if (!youtubeUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'No YouTube URL' 
      });
    }

    console.log('📺 URL:', youtubeUrl);

    // Send to Deepgram
    const deepgramResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=auto',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: youtubeUrl }),
      }
    );

    console.log('📡 Status:', deepgramResponse.status);

    if (!deepgramResponse.ok) {
      const errorText = await deepgramResponse.text();
      console.error('❌ Error:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: `Deepgram error: ${deepgramResponse.status}` 
      });
    }

    const data = await deepgramResponse.json();
    console.log('✅ Done!');

    const results = data.results;
    const channels = results?.channels?.[0];
    const alternatives = channels?.alternatives?.[0];
    
    if (!alternatives) {
      return res.status(500).json({ 
        success: false, 
        error: 'No results' 
      });
    }

    const transcript = alternatives.transcript || '';
    const words = alternatives.words || [];
    
    // Create segments
    const segments = [];
    let current = { text: '', start: 0, end: 0 };
    
    words.forEach((word, i) => {
      if (!current.text) current.start = word.start;
      
      current.text += (current.text ? ' ' : '') + word.word;
      current.end = word.end;
      
      const isPunct = /[.!?]$/.test(word.punctuated_word || word.word);
      if (isPunct || i === words.length - 1 || (i > 0 && i % 10 === 0)) {
        segments.push({ ...current });
        current = { text: '', start: 0, end: 0 };
      }
    });

    const language = channels?.detected_language || 'unknown';
    const duration = channels?.metadata?.duration || 0;

    console.log('📊', words.length, 'words,', segments.length, 'segments');

    return res.status(200).json({
      success: true,
      text: transcript,
      segments: segments,
      words: words.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence || 1.0,
      })),
      language: language,
      duration: duration,
    });

  } catch (error) {
    console.error('💥', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
