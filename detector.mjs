// Pose displacement is measured in calibrated shoulder widths, downward positive.
// Only observed poses advance the sequence; missing frames never imply a sujood.
export const CFG = Object.freeze({
  standMed: 0.45, bow: 0.85, enter: 2.2, histS: 0.2,
  bowHoldS: 0.65, uprightHoldS: 0.7, minDeepS: 0.65,
  standHoldS: 1.5, minFloorS: 4, frameGapS: 0.75, lostGiveUpS: 8
});

export class RakaatDetector {
  constructor(target = 4) {
    if (![2, 3, 4].includes(target)) throw new Error('Invalid rakaat target');
    this.target = target;
    this.rak = 1;
    this.phase = 'BOW';
    this.hist = [];
    this.holds = new Map();
    this.lastTs = null;
    this.lastSeen = null;
    this.floorSince = null;
    this.lowSeen = false;
  }
  resetSequence() {
    this.phase = 'BOW';
    this.holds.clear();
    this.hist = [];
    this.floorSince = null;
    this.lowSeen = false;
  }
  held(name, condition, ts, seconds) {
    if (!condition) { this.holds.delete(name); return false; }
    if (!this.holds.has(name)) this.holds.set(name, ts);
    return ts - this.holds.get(name) >= seconds;
  }
  transition(phase) { this.phase = phase; this.holds.clear(); }
  step(ts, tracked, d) {
    if (!Number.isFinite(ts) || (this.lastTs !== null && ts <= this.lastTs)) return this.snapshot(false);
    if (this.lastTs !== null && ts - this.lastTs > CFG.frameGapS) {
      this.hist = []; this.holds.clear();
    }
    this.lastTs = ts;
    if (this.lastSeen !== null && ts - this.lastSeen > CFG.lostGiveUpS) this.resetSequence();
    if (!tracked || !Number.isFinite(d)) {
      this.hist = []; this.holds.clear();
      return this.snapshot(false);
    }
    this.lastSeen = ts;
    this.hist.push([ts, d]);
    this.hist = this.hist.filter(h => ts - h[0] <= CFG.histS);
    const values = this.hist.map(h => h[1]).sort((a, b) => a - b);
    const med = values[Math.floor(values.length / 2)];
    const standing = med < CFG.standMed;
    let incremented = false;
    if (this.phase === 'BOW') {
      if (this.held('bow', med > CFG.bow, ts, CFG.bowHoldS)) this.transition('UPRIGHT');
    } else if (this.phase === 'UPRIGHT') {
      if (this.held('up', standing, ts, CFG.uprightHoldS)) this.transition('FLOOR');
    } else if (this.phase === 'FLOOR') {
      if (this.held('low', med > CFG.enter, ts, CFG.minDeepS)) {
        this.floorSince = ts;
        this.lowSeen = true;
        this.transition('RISE');
      }
      // A bow that returns upright here becomes a new candidate bow. No count
      // is awarded until a distinctly deeper, observed floor pose follows.
    } else if (this.phase === 'RISE') {
      const ready = this.lowSeen && ts - this.floorSince >= CFG.minFloorS;
      if (this.held('stand', standing && ready, ts, CFG.standHoldS)) {
        if (this.rak < this.target) { this.rak++; incremented = true; }
        this.resetSequence();
      }
    }
    return this.snapshot(incremented);
  }
  snapshot(incremented) { return { rak: this.rak, phase: this.phase, incremented }; }
}
