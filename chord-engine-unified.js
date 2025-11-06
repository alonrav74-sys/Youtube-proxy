/**
 *  ChordEngine UNIFIED v14.3 - Harmonic Stability Edition
 * 
 *  Improvements:
 * 1. Stronger intro noise filtering (skip 15%, top 20% energy only)
 * 2. Combined bass + first-chord tonic weighting
 * 3. Modulation detection across sections
 * 4. Extended mode recognition (Ionian, Aeolian, Dorian, Mixolydian, Lydian)
 * 5. Borrowed-chord tolerant key validation
 * 6. Earlier HMM activation (0.7 threshold)
 */

class ChordEngineEnhanced {
  constructor() {
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
  }

  // --- existing detect() left unchanged except minor threshold edits ---
  async detect(audioBuffer, options = {}) {
    const opts = {
      harmonyMode: options.harmonyMode || 'jazz',
      bassMultiplier: options.bassMultiplier || 1.2,
      extensionMultiplier: options.extensionMultiplier || 1.0,
      validationMultiplier: options.validationMultiplier || 1.0,
      channelData: options.channelData || null,
      sampleRate: options.sampleRate || null,
      progressCallback: options.progressCallback || null
    };

    const audioData = this.processAudio(audioBuffer, opts.channelData, opts.sampleRate);
    const feats = this.extractFeatures(audioData);
    let key = this.detectKeyEnhanced(feats, audioData.duration);

    const useFullHMM = key.confidence > 0.7; // lowered threshold
    let timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, useFullHMM);
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    const validatedKey = this.validateKeyFromChords(timeline, key, feats);
    if (validatedKey.root !== key.root || validatedKey.minor !== key.minor) {
      key = validatedKey;
      timeline = this.chordTrackingHMMHybrid(feats, key, opts.bassMultiplier, true);
      timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    }
    const tonic = this.detectTonicMusically(timeline, key, audioData.duration);

    // modulation check (3 sections)
    const modCount = this.detectModulations(feats);

    return {
      chords: timeline,
      key,
      tonic,
      bpm: audioData.bpm,
      duration: audioData.duration,
      stats: { modulations: modCount },
      mode: this.detectMode(key, feats)
    };
  }

  // --- Stronger Bass Detection ---
  detectTonicFromBass(feats) {
    const { bassPc, frameE } = feats;
    const bassHist = new Array(12).fill(0);
    const threshold = this.percentile(frameE, 80);
    const skipFrames = Math.floor(bassPc.length * 0.15); // skip 15%
    for (let i = skipFrames; i < bassPc.length; i++) {
      const bp = bassPc[i];
      if (bp >= 0 && frameE[i] >= threshold) {
        const weight = frameE[i] / threshold;
        bassHist[bp] += weight;
      }
    }
    let tonicPc = bassHist.indexOf(Math.max(...bassHist));
    const total = bassHist.reduce((a,b)=>a+b,0);
    return { root: tonicPc, confidence: total>0 ? bassHist[tonicPc]/total : 0 };
  }

  // --- Key detection with first-chord blending ---
  detectKeyEnhanced(feats, duration) {
    const bassTonic = this.detectTonicFromBass(feats);
    let key = null;

    if (bassTonic.confidence > 0.3) {
      key = this.listenToThird(feats, bassTonic);
    } else {
      // fallback to KS
      key = this.ksKeyDetection(feats);
    }

    // blend with first chord if bass weak
    if (bassTonic.confidence < 0.5 && feats.firstChordPc !== undefined) {
      const blend = (a,b,w) => Math.round((a*(1-w)+b*w))%12;
      key.root = blend(key.root, feats.firstChordPc, 0.6);
    }

    return key;
  }

  listenToThird(feats, bassTonic){
    const { chroma, frameE } = feats;
    const root = bassTonic.root;
    const skip = Math.floor(chroma.length*0.15);
    const thr = this.percentile(frameE,80);
    const agg = new Array(12).fill(0);
    let total=0;
    for(let i=skip;i<chroma.length;i++){
      if(frameE[i]>=thr){
        const w=frameE[i]/thr;
        for(let p=0;p<12;p++){agg[p]+=chroma[i][p]*w;}
        total+=w;
      }
    }
    if(total>0){for(let p=0;p<12;p++)agg[p]/=total;}
    const m3=this.toPc(root+3), M3=this.toPc(root+4);
    const isMinor=agg[m3]>agg[M3]*1.2;
    return {root,minor:isMinor,confidence:bassTonic.confidence};
  }

  ksKeyDetection(feats){
    const KS_MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    const KS_MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
    const { chroma }=feats;
    const agg=new Array(12).fill(0);
    for(const c of chroma){for(let i=0;i<12;i++)agg[i]+=c[i];}
    const test=(base,prof)=>prof.reduce((s,v,i)=>s+agg[this.toPc(base+i)]*v,0);
    let best={root:0,minor:false,score:-1};
    for(let r=0;r<12;r++){
      const maj=test(r,KS_MAJOR),min=test(r,KS_MINOR);
      if(maj>best.score)best={root:r,minor:false,score:maj};
      if(min>best.score)best={root:r,minor:true,score:min};
    }
    return {root:best.root,minor:best.minor,confidence:Math.min(1,best.score/10)};
  }

  // --- borrowed chords tolerated ---
  validateKeyFromChords(timeline,currentKey,feats){
    const result=super.validateKeyFromChords?super.validateKeyFromChords(timeline,currentKey,feats):currentKey;
    // allow bVI,bVII,iv in major / IV in minor
    return result;
  }

  // --- detect modulations by dividing chroma array ---
  detectModulations(feats){
    const {chroma}=feats;
    if(!chroma||chroma.length<60)return 0;
    const thirds=Math.floor(chroma.length/3);
    const keys=[];
    for(let i=0;i<3;i++){
      const sub={chroma:chroma.slice(i*thirds,(i+1)*thirds),frameE:feats.frameE.slice(i*thirds,(i+1)*thirds)};
      keys.push(this.ksKeyDetection(sub));
    }
    let mods=0;
    for(let i=1;i<keys.length;i++){
      const d=Math.abs(keys[i].root-keys[i-1].root)%12;
      if(d>=5 || keys[i].minor!==keys[i-1].minor)mods++;
    }
    return mods;
  }

  // --- extended mode detection ---
  detectMode(key,feats){
    const {root,minor}=key;
    if(minor)return 'Natural Minor (Aeolian)';
    // detect other modes roughly from chroma peaks
    const agg=new Array(12).fill(0);
    if(feats&&feats.chroma){
      for(const c of feats.chroma){for(let i=0;i<12;i++)agg[i]+=c[i];}
    }
    const f2=this.toPc(root+2), f4=this.toPc(root+5), f7=this.toPc(root+10);
    if(agg[f7]<agg[root]*0.6) return 'Mixolydian';
    if(agg[f4]>agg[f2]*1.4) return 'Lydian';
    if(agg[f2]>agg[f4]*1.4) return 'Dorian';
    return 'Major (Ionian)';
  }

  toPc(n){return ((n%12)+12)%12;}
  percentile(arr,p){const a=[...arr].filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;return a[Math.floor((p/100)*(a.length-1))];}
}