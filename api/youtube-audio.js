// /api/youtube-audio.js
// Fast YouTube audio download using ytdl-core

import ytdl from 'ytdl-core';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { videoId } = req.query;
    
    console.log('='.repeat(60));
    console.log('🎵 YouTube Audio Download Started');
    console.log('='.repeat(60));
    console.log('📥 Video ID:', videoId || 'Missing');
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        error: 'No videoId provided' 
      });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log('\n🔗 Downloading audio with ytdl-core');
    console.log('-'.repeat(60));
    console.log('   YouTube URL:', youtubeUrl);
    
    const downloadStart = Date.now();
    
    // Get audio stream
    const audioStream = ytdl(youtubeUrl, {
      quality: 'lowestaudio',
      filter: 'audioonly',
    });
    
    // Collect audio data
    const chunks = [];
    
    audioStream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    audioStream.on('end', () => {
      const audioBuffer = Buffer.concat(chunks);
      const downloadTime = Date.now() - downloadStart;
      
      console.log('✅ Download complete!');
      console.log('   Size:', audioBuffer.length, 'bytes');
      console.log('   Time:', downloadTime, 'ms');
      console.log('='.repeat(60));
      
      // Return audio
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Content-Length', audioBuffer.length);
      res.status(200).send(audioBuffer);
    });
    
    audioStream.on('error', (error) => {
      console.error('💥 Download Error:', error.message);
      throw error;
    });
    
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
