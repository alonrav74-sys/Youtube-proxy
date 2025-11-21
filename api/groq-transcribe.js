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
    console.log('🎤 ===== GROQ TRANSCRIPTION STARTED =====');
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    if (!GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'GROQ_API_KEY not configured' 
      });
    }

    const contentType = req.headers['content-type'] || '';
    console.log('📦 Content-Type:', contentType);
    
    let audioBuffer;
    
    // Handle different content types
    if (contentType.includes('multipart/form-data')) {
      // Parse multipart form data
      console.log('📋 Parsing multipart form data...');
      
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        throw new Error('No boundary in multipart data');
      }
      
      // Get raw body
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(chunks);
      
      // Find audio file in multipart data
      const boundaryStr = `--${boundary}`;
      const parts = bodyBuffer.toString('binary').split(boundaryStr);
      
      for (const part of parts) {
        if (part.includes('Content-Type: audio/')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const bodyStart = headerEnd + 4;
            const bodyEnd = part.lastIndexOf('\r\n');
            const audioData = part.substring(bodyStart, bodyEnd);
            audioBuffer = Buffer.from(audioData, 'binary');
            break;
          }
        }
      }
      
    } else if (contentType.includes('application/json')) {
      // Handle JSON with base64 audio
      console.log('📋 Parsing JSON...');
      
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      
      if (body.audioData) {
        // Base64 encoded audio
        console.log('📦 Got base64 audio data');
        audioBuffer = Buffer.from(body.audioData, 'base64');
      } else {
        throw new Error('No audioData in request body');
      }
      
    } else {
      // Assume raw audio body
      console.log('📋 Reading raw audio body...');
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      audioBuffer = Buffer.concat(chunks);
    }
    
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('No audio data received');
    }
    
    console.log('✅ Audio received:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');

    // Send to Groq Whisper
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
    
    console.log('📤 Sending to Groq (', (formBody.length / 1024 / 1024).toFixed(2), 'MB )...');
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody,
    });
    
    console.log('📬 Groq response status:', groqRes.status);
    
    if (!groqRes.ok) {
      const error = await groqRes.text();
      console.error('❌ Groq error:', error);
      throw new Error(`Groq failed: ${groqRes.status} - ${error}`);
    }
    
    const result = await groqRes.json();
    console.log('✅ Transcription complete!');
    console.log('📝 Text length:', result.text?.length || 0);
    console.log('🔤 Words count:', result.words?.length || 0);
    
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
    
    console.log('✅ ===== TRANSCRIPTION SUCCESS =====\n');
    
    return res.status(200).json({
      success: true,
      text: result.text || '',
      segments,
      words: words.map(w => ({ word: w.word, start: w.start, end: w.end })),
      language: result.language || 'auto',
      duration: result.duration || 0,
    });

  } catch (error) {
    console.error('💥 ===== TRANSCRIPTION ERROR =====');
    console.error('💥 Error:', error.message);
    console.error('💥 Stack:', error.stack);
    
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
