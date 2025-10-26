// /api/deepgram-transcribe.js
// Transcription using Deepgram - supports both URL and file upload

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
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
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    console.log('🎤 Deepgram transcribe request received');

    // Get Deepgram API key
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
    
    if (!DEEPGRAM_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'DEEPGRAM_API_KEY not configured' 
      });
    }

    // Check if YouTube URL or audio URL
    const { youtubeUrl, audioUrl } = req.body || {};
    
    let finalAudioUrl = audioUrl;
    
    // If YouTube URL, get audio URL first
    if (youtubeUrl && !audioUrl) {
      console.log('📺 Getting audio from YouTube:', youtubeUrl);
      
      // Extract video ID
      const videoId = youtubeUrl.includes('watch?v=') 
        ? youtubeUrl.split('watch?v=')[1].split('&')[0]
        : youtubeUrl.split('/').pop();
      
      // Get audio URL from RapidAPI
      const rapidApiRes = await fetch(
        `https://youtube-mp3-downloader2.p.rapidapi.com/ytmp3/ytmp3/custom/?url=${encodeURIComponent(youtubeUrl)}&quality=320`,
        {
          headers: {
            'x-rapidapi-host': 'youtube-mp3-downloader2.p.rapidapi.com',
            'x-rapidapi-key': process.env.RAPIDAPI_KEY || ''
          }
        }
      );
      
      if (!rapidApiRes.ok) {
        throw new Error('Failed to get audio from YouTube');
      }
      
      const rapidData = await rapidApiRes.json();
      finalAudioUrl = rapidData.dlink;
      
      if (!finalAudioUrl) {
        throw new Error('No audio URL in RapidAPI response');
      }
      
      console.log('✅ Got audio URL from YouTube');
    }
    
    if (!finalAudioUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio URL or YouTube URL provided' 
      });
    }
    
    console.log('🔗 Using audio URL for Deepgram');
    
    let deepgramResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&language=auto',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: finalAudioUrl
        }),
      }
    );

    if (!deepgramResponse.ok) {
      const errorText = await deepgramResponse.text();
      console.error('❌ Deepgram error:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: `Deepgram API error: ${deepgramResponse.status}` 
      });
    }

    const data = await deepgramResponse.json();
    console.log('✅ Transcription complete!');

    // Extract results
    const results = data.results;
    const channels = results?.channels?.[0];
    const alternatives = channels?.alternatives?.[0];
    
    if (!alternatives) {
      return res.status(500).json({ 
        success: false, 
        error: 'No transcription results' 
      });
    }

    const transcript = alternatives.transcript || '';
    const words = alternatives.words || [];
    
    // Convert to our format (matching Whisper format)
    const segments = [];
    let currentSegment = { text: '', start: 0, end: 0, words: [] };
    
    words.forEach((word, i) => {
      // Group words into segments (every 10 words or by punctuation)
      if (currentSegment.words.length === 0) {
        currentSegment.start = word.start;
      }
      
      currentSegment.words.push({
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.confidence,
      });
      
      currentSegment.text += (currentSegment.text ? ' ' : '') + word.word;
      currentSegment.end = word.end;
      
      // End segment at punctuation or every 10 words
      const isPunctuation = /[.!?]$/.test(word.punctuated_word || word.word);
      if (isPunctuation || currentSegment.words.length >= 10 || i === words.length - 1) {
        segments.push({
          text: currentSegment.text,
          start: currentSegment.start,
          end: currentSegment.end,
          words: currentSegment.words,
        });
        currentSegment = { text: '', start: 0, end: 0, words: [] };
      }
    });

    // Get metadata
    const metadata = results?.channels?.[0]?.metadata;
    const duration = metadata?.duration || 0;
    const language = results?.channels?.[0]?.detected_language || 'unknown';

    return res.status(200).json({
      success: true,
      text: transcript,
      segments: segments,
      words: words.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
      })),
      language: language,
      duration: duration,
      provider: 'deepgram',
    });

  } catch (error) {
    console.error('💥 Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
}
