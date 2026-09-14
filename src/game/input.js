// 철권식 입력 버퍼: 방향 히스토리, 동시누르기, 더블탭 대시, 풍신스텝 판정
export class TekkenInput {
  constructor() {
    this.t = 0;
    this.dir = 'n';
    this.prevDirKeys = { f: false, b: false, u: false, d: false };
    this.hist = []; // 최근 방향 (프레임당 1개, 최대 48)
    this.queue = []; // 소비 대기 버튼 [{code, dir, crouch, rise, dashF, t}]
    this.held = {}; // btn -> 누른 시각
    this.lastTapF = -99;
    this.lastTapB = -99;
    this.dashF = 0; // 남은 대시 판정 프레임
    this.dashB = 0;
    this.crouch = false;
    this.crouchReleasedAt = -99;
  }

  static dir8(k) {
    const { f, b, u, d } = k;
    if (f && d) return 'df';
    if (b && d) return 'db';
    if (f && u) return 'uf';
    if (b && u) return 'ub';
    if (f) return 'f';
    if (b) return 'b';
    if (u) return 'u';
    if (d) return 'd';
    return 'n';
  }

  // 매 프레임 호출. raw = {f,b,u,d} (상대 기준), jumpHeld는 u와 동일 취급
  frame(raw) {
    this.t += 1;
    const dir = TekkenInput.dir8(raw);
    // 더블탭 감지 (f/b 눌림 엣지)
    if (raw.f && !this.prevDirKeys.f) {
      if (this.t - this.lastTapF < 20) this.dashF = 14;
      this.lastTapF = this.t;
    }
    if (raw.b && !this.prevDirKeys.b) {
      if (this.t - this.lastTapB < 20) this.dashB = 12;
      this.lastTapB = this.t;
    }
    this.prevDirKeys = { ...raw };
    this.dir = dir;
    this.hist.push(dir);
    if (this.hist.length > 48) this.hist.shift();
    const wasCrouch = this.crouch;
    // 앉기 = 순수 아래(d/db). df는 서있는 취급 (df+2 같은 기술이 나가야 함) — 철권식
    this.crouch = (dir === 'd' || dir === 'db');
    if (wasCrouch && !this.crouch) this.crouchReleasedAt = this.t;
    if (this.dashF > 0) this.dashF -= 1;
    if (this.dashB > 0) this.dashB -= 1;
    // 오래된 큐 정리 (12f)
    this.queue = this.queue.filter((q) => this.t - q.t < 14);
    for (const k of Object.keys(this.held)) {
      if (this.t - this.held[k] > 30) delete this.held[k];
    }
  }

  // 버튼 눌림 엣지: btn = 1|2|3|4
  press(btn) {
    this.held[btn] = this.t;
    // 2틱 이내 함께 눌린 버튼 합치기 (1+3 잡기, 1+2 스크류 등).
    // 스트링(1,1,2)은 타격 간격이 더 길어서 합쳐지지 않음.
    const combo = Object.keys(this.held)
      .filter((k) => this.t - this.held[k] <= 2)
      .map(Number).sort().join('');
    // 기존 같은 틱 큐 항목 제거 후 합본으로 교체
    this.queue = this.queue.filter((q) => q.t !== this.t);
    this.queue.push({
      code: combo, dir: this.dir, crouch: this.crouch,
      rise: !this.crouch && (this.t - this.crouchReleasedAt) <= 8,
      dashF: this.dashF > 0, t: this.t,
    });
  }

  take() { return this.queue.shift() || null; }
  peekAll() { return this.queue; }
  clear() { this.queue.length = 0; }

  // 풍신스텝: f → (n ≤8f) → d → df (최근 30f 이내)
  hasWGF() {
    const h = this.hist;
    let i = h.length - 1;
    if (h[i] !== 'df') return false;
    while (i >= 0 && h[i] === 'df') i--; // df 구간 스킵
    if (i < 0 || h[i] !== 'd') return false;
    while (i >= 0 && h[i] === 'd') i--; // d 구간 스킵
    let nCount = 0;
    while (i >= 0 && h[i] === 'n') { nCount++; i--; }
    if (nCount > 8) return false;
    if (i < 0 || h[i] !== 'f') return false;
    return (h.length - 1 - i) <= 32;
  }
}
