// /api/groq-transcribe.js
// Groq Whisper with yt-search-and-download-mp3 API

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('🎤 Groq Transcription Started');
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!GROQ_API_KEY || !RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'API keys not configured' 
      });
    }

    const { videoId } = req.body || {};
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'No videoId' });
    }

    // Step 1: Get MP3 from yt-search-and-download-mp3
    console.log('📥 Getting MP3 from RapidAPI...');
    
    // Try common parameter names
    const params = new URLSearchParams({
      videoId: videoId,
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      v: videoId
    });
    
    const rapidUrl = `https://yt-search-and-download-mp3.p.rapidapi.com/mp3?${params}`;
    console.log('📡 Request URL:', rapidUrl);
    
    const rapidRes = await fetch(rapidUrl, {
      headers: {
        'x-rapidapi-host': 'yt-search-and-download-mp3.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    if (!rapidRes.ok) {
      const errorText = await rapidRes.text();
      console.error('❌ RapidAPI error:', errorText.substring(0, 500));
      throw new Error(`RapidAPI failed: ${rapidRes.status}`);
    }
    
    const rapidData = await rapidRes.json();
    console.log('📦 Response keys:', Object.keys(rapidData).join(', '));
    
    // Find audio URL - common field names
    let audioUrl = rapidData.link || 
                   rapidData.url || 
                   rapidData.download_link || 
                   rapidData.downloadLink ||
                   rapidData.audio_url ||
                   rapidData.audioUrl ||
                   rapidData.mp3 ||
                   rapidData.file;
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('Response:', JSON.stringify(rapidData).substring(0, 500));
      throw new Error('No audio URL in API response');
    }
    
    console.log('✅ Got audio URL!');

    // Step 2: Download audio
    console.log('⬇️  Downloading audio...');
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    console.log(`✅ Downloaded: ${audioBuffer.length} bytes`);

    // Step 3: Send to Groq using manual multipart form
    console.log('🎯 Sending to Groq Whisper...');
    
    const boundary = `----WebKitFormBoundary${Math.random().toString(36)}`;
    const chunks = [];
    
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`Content-Disposition: form-data; name="file"; filename="audio.mp3"\r\n`);
    chunks.push(`Content-Type: audio/mpeg\r\n\r\n`);
    chunks.push(audioBuffer);
    chunks.push(`\r\n`);
    
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`Content-Disposition: form-data; name="model"\r\n\r\n`);
    chunks.push(`whisper-large-v3\r\n`);
    
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`Content-Disposition: form-data; name="response_format"\r\n\r\n`);
    chunks.push(`verbose_json\r\n`);
    
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`Content-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\n`);
    chunks.push(`word\r\n`);
    
    chunks.push(`--${boundary}--\r\n`);
    
    const formBody = Buffer.concat(
      chunks.map(chunk => 
        typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      )
    );
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody,
    });
    
    if (!groqRes.ok) {
      const error = await groqRes.text();
      console.error('❌ Groq error:', error);
      throw new Error(`Groq failed: ${groqRes.status}`);
    }
    
    const result = await groqRes.json();
    console.log('✅ Transcription complete!');
    
    // Format response
    const words = result.words || [];
    const segments = [];
    let current = { text: '', start: 0, end: 0, wordCount: 0 };
    
    words.forEach((word, i) => {
      if (current.wordCount === 0) current.start = word.start;
      current.text += (current.text ? ' ' : '') + word.word;
      current.end = word.end;
      current.wordCount++;
      
      const isPunct = /[.!?,؛،]$/.test(word.word);
      if (isPunct || current.wordCount >= 10 || i === words.length - 1) {
        segments.push({ ...current });
        current = { text: '', start: 0, end: 0, wordCount: 0 };
      }
    });
    
    return res.status(200).json({
      success: true,
      text: result.text || '',
      segments,
      words: words.map(w => ({ word: w.word, start: w.start, end: w.end })),
      language: result.language || 'auto',
      duration: result.duration || 0,
    });

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
