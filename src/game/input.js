// 철권식 입력 버퍼: 방향 히스토리, 동시누르기, 더블탭 대시, 풍신스텝 판정
export class TekkenInput {
  constructor() {
    this.t = 0;
    this.dir = 'n';
    this.prevDirKeys = { f: false, b: false, u: false, d: false };
    this.hist = []; // 최근 방향 (프레임당 1개, 최대 48)
    this.queue = []; // 소비 대기 버튼 [{code, dir, crouch, rise, dashF, t}]
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
    // 오래된 큐 정리 (22f)
    this.queue = this.queue.filter((q) => this.t - q.t < 22);
  }

  // 버튼 눌림 엣지: btn = 1|2|3|4, held = 현재 눌려있는 버튼들(자신 포함 가능)
  // 철권식: 물리적으로 함께 눌린 버튼 = 동시누르기. 손가락이 겹쳐있는 동안은 합쳐짐.
  press(btn, held = []) {
    // 아직 소비되지 않은 최근 입력(4틱 이내)은 코드 완성을 기다리던 것으로 보고 합침
    const fresh = [];
    this.queue = this.queue.filter((q) => {
      if (this.t - q.t <= 4) { for (const ch of q.code) fresh.push(+ch); return false; }
      return true;
    });
    const combo = [...new Set([btn, ...held, ...fresh])].sort((a, b) => a - b).join('');
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
