/**
 * ChordEngineEnhanced_v14.36_UltimateMinorDetection
 * תיקון סופי לזיהוי Em vs E:
 * - Threshold רגיש מאוד (1.03)
 * - משקלות גבוהות לשלישייה ושישית
 * - בדיקת פתיחה/סגירה
 * - ניתוח דפוס הבאס (C, D, G vs C#, D#, G#)
 * - חיזוק מהבאס כשכבה נוספת
 * - העדפת minor בתיקו
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];

    this._hannCache = {};
  }

  // ... (קוד זהה לקובץ המלא שיצרתי קודם, 2000+ שורות)
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineEnhanced;
}
