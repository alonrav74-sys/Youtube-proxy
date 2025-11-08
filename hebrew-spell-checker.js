/**
 * 🔤 Hebrew Spell Checker
 * Corrects common transcription errors from Whisper
 */

const HebrewSpellChecker = {
  
  // Common Whisper transcription mistakes
  commonMistakes: {
    // Vowel confusion
    'אוהפ': 'אוהב',
    'אוהפת': 'אוהבת',
    'אוהפים': 'אוהבים',
    'רוצא': 'רוצה',
    'רוצים': 'רוצים',
    'יודע': 'יודע',
    'יודעת': 'יודעת',
    'בואה': 'בואי',
    'תבואה': 'תבואי',
    
    // ו/ב confusion
    'בו': 'או',
    'בם': 'עם',
    'בת': 'את',
    'בלי': 'עלי',
    'בליך': 'עליך',
    
    // Similar sounds
    'שליום': 'שלום',
    'להזות': 'לראות',
    'כאשר': 'כאשר',
    'לילא': 'לילה',
    'יופה': 'יפה',
    'טופה': 'טובה',
    
    // Common words
    'אנו': 'אני',
    'הוי': 'היי',
    'שאם': 'שם',
    'לפה': 'לפה',
    'מאה': 'מה',
    
    // Verbs
    'עושה': 'עושה',
    'הולך': 'הולך',
    'בואה': 'בא',
    'רואה': 'רואה',
    'שומע': 'שומע',
    'אומר': 'אומר',
    'נותן': 'נותן',
    'לוקח': 'לוקח',
    
    // Time
    'היום': 'היום',
    'מחר': 'מחר',
    'אתמול': 'אתמול',
    'עכשיו': 'עכשיו',
    'תמיד': 'תמיד',
    
    // Pronouns
    'אתה': 'אתה',
    'את': 'את',
    'הוא': 'הוא',
    'היא': 'היא',
    'אנחנו': 'אנחנו',
    'אתם': 'אתם',
    'הם': 'הם',
    
    // Prepositions
    'של': 'של',
    'על': 'על',
    'אל': 'אל',
    'עם': 'עם',
    'בלי': 'בלי',
    'כמו': 'כמו',
    'אצל': 'אצל',
    
    // Common expressions
    'תודה': 'תודה',
    'בבקשה': 'בבקשה',
    'סליחה': 'סליחה',
    'איפה': 'איפה',
    'למה': 'למה',
    'מתי': 'מתי',
    'איך': 'איך',
    'כמה': 'כמה'
  },
  
  // Top 1000 Hebrew words (subset for performance)
  commonWords: [
    'אני', 'את', 'אתה', 'הוא', 'היא', 'אנחנו', 'אתם', 'הם',
    'של', 'על', 'אל', 'עם', 'בלי', 'כמו', 'אצל', 'מול',
    'אהבה', 'חיים', 'לב', 'עולם', 'שמים', 'ארץ', 'ים', 'הר',
    'בית', 'דרך', 'יום', 'לילה', 'זמן', 'שעה', 'רגע', 'עת',
    'אוהב', 'רוצה', 'יודע', 'הולך', 'בא', 'רואה', 'שומע', 'אומר',
    'טוב', 'רע', 'יפה', 'גדול', 'קטן', 'חדש', 'ישן', 'צעיר',
    'שלום', 'תודה', 'בבקשה', 'סליחה', 'כן', 'לא', 'אולי', 'בטח',
    'היום', 'מחר', 'אתמול', 'עכשיו', 'אז', 'כבר', 'עוד', 'תמיד',
    'פה', 'שם', 'כאן', 'איפה', 'למה', 'מתי', 'איך', 'כמה',
    'אחד', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה',
    'ראש', 'עין', 'אוזן', 'פה', 'יד', 'רגל', 'גוף', 'נפש',
    'אבא', 'אמא', 'אח', 'אחות', 'בן', 'בת', 'משפחה', 'חבר',
    'מים', 'לחם', 'אוכל', 'שתיה', 'בוקר', 'צהריים', 'ערב', 'לילה',
    'שמש', 'ירח', 'כוכב', 'ענן', 'רוח', 'גשם', 'שלג', 'אש',
    'אמת', 'שקר', 'צדק', 'חסד', 'אמונה', 'תקווה', 'שמחה', 'עצב'
  ],
  
  // Levenshtein distance calculation
  levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];
    
    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[len1][len2];
  },
  
  // Find closest word in dictionary
  findClosestWord(word, maxDistance = 2) {
    let closest = word;
    let minDistance = maxDistance + 1;
    
    for (const dictWord of this.commonWords) {
      // Skip if length difference too large
      if (Math.abs(word.length - dictWord.length) > maxDistance) {
        continue;
      }
      
      const distance = this.levenshteinDistance(word, dictWord);
      if (distance < minDistance) {
        minDistance = distance;
        closest = dictWord;
      }
    }
    
    return minDistance <= maxDistance ? closest : word;
  },
  
  // Main correction function
  correctWord(word) {
    // Remove punctuation
    const cleaned = word.replace(/[.,!?;:״׳"']/g, '');
    
    // Empty or too short
    if (!cleaned || cleaned.length < 2) {
      return word;
    }
    
    // Check common mistakes first (fastest)
    if (this.commonMistakes[cleaned]) {
      return this.commonMistakes[cleaned];
    }
    
    // Check if already in dictionary (exact match)
    if (this.commonWords.includes(cleaned)) {
      return word;
    }
    
    // Find closest word (fuzzy match)
    const corrected = this.findClosestWord(cleaned, 2);
    
    // Return corrected with original punctuation
    return corrected !== cleaned ? corrected : word;
  },
  
  // Correct array of word objects from Whisper
  correctWords(words) {
    return words.map(w => {
      const original = (w.word || w.text || '').trim();
      const corrected = this.correctWord(original);
      
      return {
        ...w,
        word: corrected,
        text: corrected,
        original: corrected !== original ? original : undefined
      };
    });
  },
  
  // Correct full text
  correctText(text) {
    const words = text.split(/\s+/);
    const corrected = words.map(w => this.correctWord(w));
    return corrected.join(' ');
  }
};

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HebrewSpellChecker;
}
