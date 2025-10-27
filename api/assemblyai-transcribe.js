// /api/assemblyai-transcribe.js
// AssemblyAI transcription with detailed debug logging

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
    console.log('🎤 AssemblyAI Transcription Request Started');
    console.log('='.repeat(60));
    
    // Check environment
    console.log('📋 Environment Variables:');
    console.log('   ASSEMBLYAI_API_KEY:', process.env.ASSEMBLYAI_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('   RAPIDAPI_KEY:', process.env.RAPIDAPI_KEY ? '✅ Set' : '❌ Missing');

    const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!ASSEMBLYAI_API_KEY) {
      console.error('❌ ASSEMBLYAI_API_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'ASSEMBLYAI_API_KEY not configured' 
      });
    }

    if (!RAPIDAPI_KEY) {
      console.error('❌ RAPIDAPI_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // Parse JSON body
    const { videoId } = req.body || {};
    console.log('📥 Request body:', { videoId: videoId || 'Missing' });
    
    if (!videoId) {
      console.error('❌ No videoId provided');
      return res.status(400).json({ 
        success: false, 
        error: 'No videoId provided' 
      });
    }

    // Step 1: Get audio URL from RapidAPI
    console.log('\n🔗 STEP 1: Getting Audio URL from RapidAPI');
    console.log('-'.repeat(60));
    
    const rapidApiUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/download-mp3/${videoId}`;
    console.log('   API URL:', rapidApiUrl);
    
    let audioUrl;
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
      
      console.log('   Response status:', rapidRes.status);
      console.log('   Response time:', rapidTime, 'ms');
      
      if (!rapidRes.ok) {
        const errorText = await rapidRes.text();
        console.error('❌ RapidAPI error:', errorText.substring(0, 300));
        throw new Error(`RapidAPI failed: ${rapidRes.status}`);
      }
      
      // This API returns the MP3 file directly, not JSON!
      const contentType = rapidRes.headers.get('content-type');
      console.log('   Content-Type:', contentType);
      
      if (contentType && contentType.includes('audio')) {
        console.log('✅ Got audio file directly from API!');
        // Read the audio buffer directly - skip download step!
        audioBuffer = Buffer.from(await rapidRes.arrayBuffer());
        console.log('✅ Audio received:', audioBuffer.length, 'bytes in', rapidTime, 'ms');
      } else {
        // Maybe it's JSON after all?
        const text = await rapidRes.text();
        try {
          const rapidData = JSON.parse(text);
          console.log('   Response keys:', Object.keys(rapidData).join(', '));
          
          audioUrl = rapidData.link || rapidData.url || rapidData.dlink;
          
          if (!audioUrl) {
            console.error('❌ No audio URL in response:', JSON.stringify(rapidData).substring(0, 500));
            throw new Error('No audio URL from RapidAPI');
          }
          
          console.log('✅ Got audio URL:', audioUrl.substring(0, 80) + '...');
          
          // Download from URL
          console.log('\n⬇️  STEP 2: Downloading Audio File');
          console.log('-'.repeat(60));
          
          const downloadStart = Date.now();
          const audioRes = await fetch(audioUrl);
          
          if (!audioRes.ok) {
            throw new Error(`Download failed: ${audioRes.status}`);
          }
          
          audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          const downloadTime = Date.now() - downloadStart;
          console.log('✅ Downloaded:', audioBuffer.length, 'bytes in', downloadTime, 'ms');
          
        } catch (parseError) {
          console.error('❌ Could not parse response');
          throw new Error('Unexpected response format from RapidAPI');
        }
      }
      
    } catch (rapidError) {
      console.error('💥 RapidAPI Error:', rapidError.message);
      throw new Error(`RapidAPI failed: ${rapidError.message}`);
    }

    // Step 2: Upload to AssemblyAI
    console.log('\n📤 STEP 2: Uploading to AssemblyAI');
    console.log('-'.repeat(60));
    console.log('   Buffer size:', audioBuffer.length, 'bytes');
    
    let uploadUrl;
    try {
      const uploadStart = Date.now();
      
      console.log('   Uploading to AssemblyAI storage...');
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
        },
        body: audioBuffer,
      });
      
      const uploadTime = Date.now() - uploadStart;
      
      console.log('   Status:', uploadRes.status, uploadRes.statusText);
      console.log('   Upload time:', uploadTime, 'ms');

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error('❌ Upload failed:', errorText.substring(0, 500));
        throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
      }

      const uploadData = await uploadRes.json();
      console.log('   Response:', JSON.stringify(uploadData).substring(0, 200));
      
      uploadUrl = uploadData.upload_url;
      
      if (!uploadUrl) {
        console.error('❌ No upload_url in response');
        throw new Error('No upload URL returned');
      }
      
      console.log('✅ Upload complete!');
      console.log('   Upload URL:', uploadUrl.substring(0, 80) + '...');
      
    } catch (uploadError) {
      console.error('💥 Upload Error:');
      console.error('   Name:', uploadError.name);
      console.error('   Message:', uploadError.message);
      console.error('   Stack:', uploadError.stack);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Step 3: Submit transcription
    console.log('\n🎯 STEP 3: Submitting for Transcription');
    console.log('-'.repeat(60));
    
    let transcriptId;
    try {
      const submitStart = Date.now();
      
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
      
      const submitTime = Date.now() - submitStart;
      
      console.log('   Status:', submitRes.status);
      console.log('   Submit time:', submitTime, 'ms');

      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        console.error('❌ Submit failed:', errorText.substring(0, 500));
        throw new Error(`Submit failed: ${submitRes.status}`);
      }

      const submitData = await submitRes.json();
      transcriptId = submitData.id;
      
      console.log('✅ Transcription submitted!');
      console.log('   Transcript ID:', transcriptId);
      
    } catch (submitError) {
      console.error('💥 Submit Error:', submitError.message);
      throw submitError;
    }

    // Step 4: Poll for results
    console.log('\n⏳ STEP 4: Polling for Results');
    console.log('-'.repeat(60));
    
    let attempts = 0;
    const maxAttempts = 60;
    const pollInterval = 2000;
    
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, pollInterval));
      
      try {
        const pollRes = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: { 'authorization': ASSEMBLYAI_API_KEY },
          }
        );
        
        if (!pollRes.ok) {
          console.error('   Poll attempt', attempts, 'failed:', pollRes.status);
          continue;
        }
        
        const result = await pollRes.json();
        
        if (attempts % 5 === 0 || result.status !== 'processing') {
          console.log(`   Attempt ${attempts}/${maxAttempts}: ${result.status}`);
        }
        
        if (result.status === 'completed') {
          console.log('\n✅ TRANSCRIPTION COMPLETE!');
          console.log('='.repeat(60));
          
          const fullText = result.text || '';
          const words = result.words || [];
          
          // Create segments
          const segments = [];
          let current = { text: '', start: 0, end: 0, wordCount: 0 };
          
          words.forEach((word, i) => {
            if (current.wordCount === 0) {
              current.start = word.start / 1000;
            }
            
            current.text += (current.text ? ' ' : '') + word.text;
            current.end = word.end / 1000;
            current.wordCount++;
            
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
          
          const formattedWords = words.map(w => ({
            word: w.text,
            start: w.start / 1000,
            end: w.end / 1000,
            confidence: w.confidence || 1.0,
          }));
          
          console.log('📊 Results:');
          console.log('   Words:', formattedWords.length);
          console.log('   Segments:', segments.length);
          console.log('   Language:', result.language_code);
          console.log('   Duration:', result.audio_duration, 's');
          console.log('='.repeat(60));
          
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
          console.error('❌ Transcription error:', result.error);
          throw new Error('Transcription failed: ' + (result.error || 'Unknown error'));
        }
        
      } catch (pollError) {
        console.error('   Poll error:', pollError.message);
      }
    }
    
    console.error('❌ Timeout after', maxAttempts * pollInterval / 1000, 'seconds');
    throw new Error('Timeout waiting for transcription');

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
