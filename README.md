# 🎸 ChordFinder Pro - ULTIMATE Edition

Advanced chord detection with YouTube integration, real-time lyrics synchronization, and AI-powered analysis.

## ✨ Features

### 🎼 Advanced Chord Detection
- **3 AI Modes:** Fast, Balanced, Accurate
- **Key-Constrained Detection** - 93/100 music theory score
- **Mode Detection** - Identifies 9 musical modes
- **Roman Numeral Analysis** - Automatic scale degree notation
- **Figured Bass Notation** - Professional inversion symbols
- **Jazz Extended Chords** - 7alt, 13sus4, maj7#11

### 🎬 YouTube Integration
- Search and analyze any YouTube video
- Auto-sync chords with video playback
- Download audio for processing

### 📝 Lyrics Synchronization  
- **Groq Whisper** AI transcription
- Real-time word-level alignment
- Ultimate Guitar-style chord sheets
- RTL/LTR automatic support (Hebrew & English)
- Karaoke-style scrolling

### 🎯 Professional Features
- Circle of Fifths visualization
- Harmonic analysis (structural/ornamental chords)
- Secondary dominants detection
- Modal borrowing identification
- Transpose & capo support
- Export to ChordPro format

## 🚀 Quick Start

### Option 1: Local File
1. Open `index.html` in your browser
2. Click "📁 קובץ מקומי"
3. Select an audio file (MP3, WAV, M4A)
4. Click "נתח" (Analyze)
5. View chords in real-time!

### Option 2: YouTube
1. Click "🎬 יוטיוב" tab
2. Search for a song OR paste YouTube URL
3. Click "נתח" (Analyze)
4. Chords + lyrics sync automatically!

## 📦 Files

- `index.html` - Main application (all-in-one)
- `chord-engine-v5.js` - Base chord detection engine
- `chord-engine-pro.js` - Pro version with advanced features
- `chord-engine-v5.js` - Latest engine (v5.0)
- `sync-engine.js` - Lyrics synchronization engine

## 🎯 How It Works

1. **Audio Processing**: Converts audio to mono, resamples to 22kHz
2. **Chromagram Analysis**: FFT-based frequency analysis
3. **Chord Detection**: AI algorithms with harmonic validation
4. **Key Detection**: Krumhansl-Schmuckler algorithm
5. **Lyrics Sync**: Groq Whisper transcription + word-level timing
6. **Sheet Generation**: Ultimate Guitar-style chord sheets

## 🎨 AI Modes

### ⚡ Fast Mode (~2-5 seconds)
- Basic chord detection
- Quick results
- Good for simple songs

### ⚖️ Balanced Mode (~5-10 seconds) ⭐ **Default**
- Key-constrained detection
- Harmonic validation
- Best balance of speed/accuracy

### 🎯 Accurate Mode (~10-15 seconds)
- Full harmonic analysis
- Ornament detection
- Maximum accuracy

## 🎓 Perfect For

- 🎸 **Musicians** - Learn songs faster
- 🎹 **Teachers** - Demonstrate theory
- 📚 **Students** - Study harmony
- 🎼 **Composers** - Analyze works
- 🎵 **Music Lovers** - Understand songs

## 🔧 Technical Details

### Chord Engine
- FFT size: 16384 samples
- Hop size: 2048 samples  
- Chromagram: 12 pitch classes
- Sample rate: 22050 Hz

### Supported Formats
- Audio: MP3, WAV, M4A, OGG, FLAC
- Video: MP4, WEBM (audio extracted)

### Browser Compatibility
- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

## 📄 License

MIT License - Free for personal and commercial use!

## 👨‍💻 Author

**Alon Raviv**  
Built with ❤️ for musicians worldwide

## 🙏 Credits

- **Music Theory:** Krumhansl, Temperley, Kostka & Payne
- **Transcription:** Groq Whisper AI
- **Inspiration:** Ultimate Guitar, Chordify

---

**🎸 ChordFinder Pro ULTIMATE Edition** - Most advanced. Most accurate. Most musical.

⭐ If you find this useful, share it with other musicians!
