// /api/assemblyai-transcribe.js
// Fast transcription using AssemblyAI

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
    console.log('🎤 AssemblyAI request');

    const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
    
    if (!ASSEMBLYAI_API_KEY) {
      console.error('❌ No API key');
      return res.status(500).json({ 
        success: false, 
        error: 'ASSEMBLYAI_API_KEY not configured' 
      });
    }

    const { youtubeUrl, audioUrl } = req.body || {};
    
    if (!youtubeUrl && !audioUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'No YouTube URL or audio URL' 
      });
    }

    let finalAudioUrl = audioUrl;
    
    // Get audio URL if needed
    if (!finalAudioUrl && youtubeUrl) {
      console.log('📺 YouTube URL:', youtubeUrl);

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
      finalAudioUrl = rapidData.dlink;
      
      if (!finalAudioUrl) {
        throw new Error('No audio URL');
      }
      
      console.log('✅ Got audio URL');
    } else {
      console.log('✅ Using provided audio URL');
    }

    // Step 1: Download the audio file
    console.log('⬇️ Downloading audio file...');
    
    const audioResponse = await fetch(finalAudioUrl);
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio');
    }
    
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    console.log('✅ Downloaded:', audioBuffer.length, 'bytes');

    // Step 2: Upload to AssemblyAI
    console.log('📤 Uploading to AssemblyAI...');
    
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'authorization': ASSEMBLYAI_API_KEY,
      },
      body: audioBuffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`AssemblyAI upload error: ${uploadRes.status}`);
    }

    const uploadData = await uploadRes.json();
    const uploadUrl = uploadData.upload_url;
    
    console.log('✅ Uploaded to AssemblyAI storage');

    // Step 3: Submit for transcription
    console.log('📤 Submitting for transcription...');
    
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: uploadUrl,
        language_code: 'auto',
        speech_model: 'best',
      }),
    });

    if (!submitRes.ok) {
      const errorText = await submitRes.text();
      console.error('❌ Submit error:', errorText);
      throw new Error(`AssemblyAI submit error: ${submitRes.status}`);
    }

    const submitData = await submitRes.json();
    const transcriptId = submitData.id;
    
    console.log('🔄 Transcript ID:', transcriptId);

    // Step 2: Poll for results (faster than Gladia!)
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      
      const pollRes = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: { 'authorization': ASSEMBLYAI_API_KEY },
        }
      );
      
      if (!pollRes.ok) {
        console.error('❌ Poll error:', pollRes.status);
        continue;
      }
      
      const result = await pollRes.json();
      
      if (result.status === 'completed') {
        console.log('✅ Done!');
        
        const fullText = result.text || '';
        const words = result.words || [];
        
        // Create segments from words (group every ~10 words)
        const segments = [];
        let current = { text: '', start: 0, end: 0, wordCount: 0 };
        
        words.forEach((word, i) => {
          if (current.wordCount === 0) {
            current.start = word.start / 1000; // Convert ms to seconds
          }
          
          current.text += (current.text ? ' ' : '') + word.text;
          current.end = word.end / 1000;
          current.wordCount++;
          
          // End segment at punctuation or every 10 words
          const isPunct = /[.!?]$/.test(word.text);
          if (isPunct || current.wordCount >= 10 || i === words.length - 1) {
            segments.push({
              text: current.text,
              start: current.start,
              end: current.end,
            });
            current = { text: '', start: 0, end: 0, wordCount: 0 };
          }
        });
        
        // Convert words to our format
        const formattedWords = words.map(w => ({
          word: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
          confidence: w.confidence || 1.0,
        }));
        
        console.log('📊', formattedWords.length, 'words,', segments.length, 'segments');
        
        return res.status(200).json({
          success: true,
          text: fullText,
          segments: segments,
          words: formattedWords,
          language: result.language_code || 'unknown',
          duration: result.audio_duration || 0,
        });
      }
      
      if (result.status === 'error') {
        throw new Error('Transcription failed: ' + (result.error || 'Unknown error'));
      }
      
      // Still processing...
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
