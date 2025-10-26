// /api/gladia-transcribe.js
// Transcription using Gladia

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
    console.log('🎤 Gladia request');

    const GLADIA_API_KEY = process.env.GLADIA_API_KEY;
    
    if (!GLADIA_API_KEY) {
      console.error('❌ No Gladia key');
      return res.status(500).json({ 
        success: false, 
        error: 'GLADIA_API_KEY not configured' 
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

    // Get audio URL
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      throw new Error('RAPIDAPI_KEY not configured');
    }
    
    const rapidRes = await fetch(
      `https://youtube-mp3-downloader2.p.rapidapi.com/ytmp3/ytmp3/custom/?url=${encodeURIComponent(youtubeUrl)}&quality=128`,
      {
        headers: {
          'x-rapidapi-host': 'youtube-mp3-downloader2.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY
        }
      }
    );
    
    if (!rapidRes.ok) {
      throw new Error('RapidAPI failed: ' + rapidRes.status);
    }
    
    const rapidData = await rapidRes.json();
    const audioUrl = rapidData.dlink;
    
    if (!audioUrl) {
      throw new Error('No audio URL');
    }
    
    console.log('✅ Got audio URL');

    // Send to Gladia
    console.log('📤 Sending to Gladia...');
    
    const gladiaRes = await fetch(
      'https://api.gladia.io/v2/transcription/',
      {
        method: 'POST',
        headers: {
          'x-gladia-key': GLADIA_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          enable_code_switching: true,
          language_behaviour: 'automatic single language',
        }),
      }
    );

    if (!gladiaRes.ok) {
      const errorText = await gladiaRes.text();
      console.error('❌ Gladia error:', errorText);
      throw new Error(`Gladia error: ${gladiaRes.status}`);
    }

    const gladiaData = await gladiaRes.json();
    const jobId = gladiaData.id || gladiaData.result_url?.split('/').pop();
    
    console.log('🔄 Job ID:', jobId);

    // Poll for results
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      
      const pollRes = await fetch(
        `https://api.gladia.io/v2/transcription/${jobId}`,
        {
          headers: { 'x-gladia-key': GLADIA_API_KEY },
        }
      );
      
      if (!pollRes.ok) continue;
      
      const result = await pollRes.json();
      
      if (result.status === 'done') {
        console.log('✅ Done!');
        
        const trans = result.result?.transcription;
        const fullText = trans?.full_transcript || '';
        const words = [];
        const segments = [];
        
        if (trans?.utterances) {
          trans.utterances.forEach(utt => {
            if (utt.words) {
              utt.words.forEach(w => {
                words.push({
                  word: w.word || '',
                  start: w.start || 0,
                  end: w.end || 0,
                  confidence: w.confidence || 1.0,
                });
              });
            }
            
            segments.push({
              text: utt.text || '',
              start: utt.start || 0,
              end: utt.end || 0,
            });
          });
        }
        
        console.log('📊', words.length, 'words');
        
        return res.status(200).json({
          success: true,
          text: fullText,
          segments: segments,
          words: words,
          language: trans?.language || 'unknown',
          duration: trans?.duration || 0,
        });
      }
      
      if (result.status === 'error') {
        throw new Error('Transcription failed');
      }
      
      if (attempts % 5 === 0) {
        console.log(`⏳ ${attempts * 2}s`);
      }
    }
    
    throw new Error('Timeout');

  } catch (error) {
    console.error('💥', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
