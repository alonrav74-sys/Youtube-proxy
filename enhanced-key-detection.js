/**
 * 🎹 Enhanced Key Detection Module
 * 
 * Fixes the Am/C (relative minor/major) confusion problem
 * Uses multiple analysis methods:
 * 1. Cadence analysis (V→I resolution)
 * 2. First/last chord analysis
 * 3. Chord progression patterns
 * 4. Leading tone presence
 * 
 * @version 1.0.0
 */

class EnhancedKeyDetection {
  static detectKeyEnhanced(chroma, timeline, key) {
    console.log(`🎹 Enhanced Key Detection: Initial guess = ${key.root} ${key.minor ? 'minor' : 'major'}`);
    if (!this.isRelativeMinorConfusion(key)) return key;
    console.log('🔍 Detected Am/C relative minor confusion - analyzing...');
    const scores = { major: 0, minor: 0 };
    const cadenceResult = this.analyzeCadences(timeline, key);
    scores.major += cadenceResult.majorScore; scores.minor += cadenceResult.minorScore;
    const boundaryResult = this.analyzeBoundaryChords(timeline, key);
    scores.major += boundaryResult.majorScore; scores.minor += boundaryResult.minorScore;
    const leadingToneResult = this.analyzeLeadingTone(chroma, key);
    scores.major += leadingToneResult.majorScore; scores.minor += leadingToneResult.minorScore;
    const dominantResult = this.analyzeDominants(timeline, key);
    scores.major += dominantResult.majorScore; scores.minor += dominantResult.minorScore;
    const progressionResult = this.analyzeProgressions(timeline, key);
    scores.major += progressionResult.majorScore; scores.minor += progressionResult.minorScore;
    const finalIsMinor = scores.minor > scores.major;
    if (finalIsMinor !== key.minor) {
      if (finalIsMinor && !key.minor) key.root = this.toPc(key.root - 3);
      else if (!finalIsMinor && key.minor) key.root = this.toPc(key.root + 3);
      key.minor = finalIsMinor;
      console.log(`✅ Corrected key to ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    } else {
      console.log(`✅ Key confirmed: ${this.noteNames[key.root]}${key.minor ? 'm' : ''}`);
    }
    return key;
  }
  static isRelativeMinorConfusion(key){ return (key.root===0||key.root===9); }
  static analyzeCadences(timeline,key){
    if(!timeline||timeline.length<2) return {majorScore:0,minorScore:0};
    let majorScore=0,minorScore=0;
    for(let i=0;i<timeline.length-1;i++){
      const c=timeline[i], n=timeline[i+1];
      if(!c.label||!n.label) continue;
      const cr=this.parseRoot(c.label), nr=this.parseRoot(n.label);
      if(cr<0||nr<0) continue;
      if(cr===7&&nr===0){ majorScore+=30; if(c.label.includes('7')) majorScore+=10; }
      if(cr===4&&nr===9){ minorScore+=30; if(c.label.includes('7')) minorScore+=10; }
      if(cr===7&&nr===9){ majorScore+=15; }
      if(cr===5&&nr===0){ majorScore+=20; }
      if(cr===2&&nr===9){ minorScore+=20; }
    }
    return {majorScore,minorScore};
  }
  static analyzeBoundaryChords(timeline,key){
    if(!timeline||timeline.length===0) return {majorScore:0,minorScore:0};
    let majorScore=0,minorScore=0;
    const first=timeline[0]; if(first&&first.label){ const r=this.parseRoot(first.label); const m=first.label.includes('m')&&!first.label.includes('maj'); if(r===0&&!m) majorScore+=15; if(r===9&&m) minorScore+=15; }
    const last=timeline[timeline.length-1]; if(last&&last.label){ const r=this.parseRoot(last.label); const m=last.label.includes('m')&&!last.label.includes('maj'); if(r===0&&!m) majorScore+=25; if(r===9&&m) minorScore+=25; }
    return {majorScore,minorScore};
  }
  static analyzeLeadingTone(chroma,key){
    let majorScore=0,minorScore=0;
    const agg=new Array(12).fill(0);
    for(const c of chroma){ for(let p=0;p<12;p++){ agg[p]+=c[p]||0; } }
    const sum=agg.reduce((a,b)=>a+b,0)||1;
    for(let p=0;p<12;p++){ agg[p]/=sum; }
    const b=agg[11]; if(b>0.08) majorScore+=10;
    const gS=agg[8]; if(gS>0.06) minorScore+=8;
    return {majorScore,minorScore};
  }
  static analyzeDominants(timeline,key){
    if(!timeline||timeline.length===0) return {majorScore:0,minorScore:0};
    let majorScore=0,minorScore=0,g=0,e=0;
    for(const ch of timeline){
      if(!ch.label) continue;
      const r=this.parseRoot(ch.label);
      if(r===7){ g++; if(ch.label.includes('7')) g+=0.5; }
      if(r===4){ e++; if(ch.label.includes('7')) e+=0.5; }
    }
    if(g>0) majorScore+=min(20,g*5) if(e>0) minorScore+=min(20,e*5)
    return {majorScore,minorScore};
  }
  static analyzeProgressions(timeline,key){
    if(!timeline||timeline.length<3) return {majorScore:0,minorScore:0};
    let majorScore=0,minorScore=0;
    const maj=[[0,5,7,0],[0,9,5,7],[0,7,0],[2,7,0]], minP=[[9,2,4,9],[9,5,4,9],[9,7,0,9],[9,4,9]];
    for(const pr of maj){ const c=this.countProgressionOccurrences(timeline,pr); if(c>0) majorScore+=c*10; }
    for(const pr of minP){ const c=this.countProgressionOccurrences(timeline,pr); if(c>0) minorScore+=c*10; }
    return {majorScore,minorScore};
  }
  static countProgressionOccurrences(tl,prog){
    let cnt=0; for(let i=0;i<=tl.length-prog.length;i++){ let ok=true; for(let j=0;j<prog.length;j++){ const ch=tl[i+j]; if(!ch||!ch.label){ ok=false; break;} const r=this.parseRoot(ch.label); if(r!==prog[j]){ ok=false; break;} } if(ok) cnt++; } return cnt;
  }
  static parseRoot(label){ if(!label||typeof label!=='string') return -1; const m=label.match(/^([A-G])(#|b)?/); if(!m) return -1; const map={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}; let r=map[m[1]]; if(m[2]==='#') r++; if(m[2]==='b') r--; return this.toPc(r); }
  static toPc(n){ return ((n%12)+12)%12; }
  static noteNames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
}

if (typeof window!=='undefined'){ window.EnhancedKeyDetection=EnhancedKeyDetection; console.log('✅ Enhanced Key Detection Module loaded!'); }
if (typeof module!=='undefined' && module.exports){ module.exports = EnhancedKeyDetection; }
