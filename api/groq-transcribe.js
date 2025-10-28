// /api/groq-transcribe.js
// Groq Whisper Large v3 - Fast & accurate Hebrew transcription

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
    console.log('='.repeat(60));
    console.log('🎤 Groq Whisper Transcription Started');
    console.log('='.repeat(60));
    
    // Check environment
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    console.log('📋 Environment:');
    console.log('   GROQ_API_KEY:', GROQ_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('   RAPIDAPI_KEY:', RAPIDAPI_KEY ? '✅ Set' : '❌ Missing');
    
    if (!GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'GROQ_API_KEY not configured. Get one free at: https://console.groq.com' 
      });
    }

    if (!RAPIDAPI_KEY) {
      console.error('❌ RAPIDAPI_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    const { videoId } = req.body || {};
    console.log('📥 Video ID:', videoId || 'Missing');
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        error: 'No videoId provided' 
      });
    }

    // Step 1: Get audio from RapidAPI
    console.log('\n🔗 STEP 1: Getting Audio from YouTube');
    console.log('-'.repeat(60));
    
    const rapidApiUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/download-mp3/${videoId}`;
    
    let audioBuffer;
    
    try {
      const rapidStart = Date.now();
      const rapidRes = await fetch(rapidApiUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY
        }
      });
      
      const rapidTime = Date.now() - rapidStart;
      console.log('   Status:', rapidRes.status);
      console.log('   Time:', rapidTime, 'ms');
      
      if (!rapidRes.ok) {
        throw new Error(`RapidAPI failed: ${rapidRes.status}`);
      }
      
      const contentType = rapidRes.headers.get('content-type');
      console.log('   Content-Type:', contentType);
      
      if (contentType && (contentType.includes('audio') || contentType.includes('octet-stream'))) {
        audioBuffer = Buffer.from(await rapidRes.arrayBuffer());
        console.log('✅ Audio received:', audioBuffer.length, 'bytes');
      } else if (contentType && contentType.includes('json')) {
        const rapidData = await rapidRes.json();
        const audioUrl = rapidData.link || rapidData.url || rapidData.dlink;
        
        if (!audioUrl) {
          throw new Error('No audio URL from RapidAPI');
        }
        
        console.log('   Downloading from URL...');
        const audioRes = await fetch(audioUrl);
        
        if (!audioRes.ok) {
          throw new Error(`Download failed: ${audioRes.status}`);
        }
        
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        console.log('✅ Downloaded:', audioBuffer.length, 'bytes');
      } else {
        throw new Error(`Unexpected Content-Type: ${contentType}`);
      }
      
    } catch (rapidError) {
      console.error('💥 RapidAPI Error:', rapidError.message);
      throw new Error(`Failed to get audio: ${rapidError.message}`);
    }

    // Step 2: Send to Groq Whisper
    console.log('\n🎯 STEP 2: Transcribing with Groq Whisper Large v3');
    console.log('-'.repeat(60));
    console.log('   Model: whisper-large-v3');
    console.log('   Language: auto-detect (Hebrew + English)');
    console.log('   Timestamps: word-level');
    
    try {
      const groqStart = Date.now();
      
      // Groq expects multipart/form-data
      const FormData = (await import('formdata-node')).FormData;
      const { Blob } = await import('buffer');
      
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'audio.mp3');
      formData.append('model', 'whisper-large-v3');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');
      
      console.log('   Sending to Groq...');
      
      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
      });
      
      const groqTime = Date.now() - groqStart;
      console.log('   Status:', groqRes.status);
      console.log('   Time:', groqTime, 'ms');
      
      if (!groqRes.ok) {
        const errorText = await groqRes.text();
        console.error('❌ Groq error:', errorText.substring(0, 500));
        throw new Error(`Groq failed: ${groqRes.status}`);
      }
      
      const result = await groqRes.json();
      
      console.log('\n✅ TRANSCRIPTION COMPLETE!');
      console.log('='.repeat(60));
      
      const fullText = result.text || '';
      const words = result.words || [];
      
      // Create segments from words
      const segments = [];
      let current = { text: '', start: 0, end: 0, wordCount: 0 };
      
      words.forEach((word, i) => {
        if (current.wordCount === 0) {
          current.start = word.start;
        }
        
        current.text += (current.text ? ' ' : '') + word.word;
        current.end = word.end;
        current.wordCount++;
        
        const isPunct = /[.!?,؛،]$/.test(word.word);
        if (isPunct || current.wordCount >= 10 || i === words.length - 1) {
          segments.push({
            text: current.text,
            start: current.start,
            end: current.end,
          });
          current = { text: '', start: 0, end: 0, wordCount: 0 };
        }
      });
      
      const formattedWords = words.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }));
      
      console.log('📊 Results:');
      console.log('   Text length:', fullText.length, 'chars');
      console.log('   Words:', formattedWords.length);
      console.log('   Segments:', segments.length);
      console.log('   Language:', result.language || 'auto-detected');
      console.log('   Duration:', result.duration || 'N/A', 's');
      console.log('   Preview:', fullText.substring(0, 100) + '...');
      console.log('   Processing time:', groqTime, 'ms (⚡ FAST!)');
      console.log('='.repeat(60));
      
      return res.status(200).json({
        success: true,
        text: fullText,
        segments: segments,
        words: formattedWords,
        language: result.language || 'auto',
        duration: result.duration || 0,
      });
      
    } catch (groqError) {
      console.error('💥 Groq Error:', groqError.message);
      throw new Error(`Transcription failed: ${groqError.message}`);
    }

  } catch (error) {
    console.error('\n💥 FATAL ERROR');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(60));
    
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
