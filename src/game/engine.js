import { CFG, MOVES } from './config.js';
import { Fighter } from './fighter.js';
import { sfx } from './audio.js';

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onEvent = opts.onEvent || (() => {});
    this.resetMatch(opts.p1Name || 'P1', opts.p2Name || 'P2');
    this.shake = 0;
    this.hitstop = 0;
  }

  resetMatch(p1Name, p2Name) {
    this.p1 = new Fighter({ x: CFG.W * 0.3, color: '#3b82f6', facing: 1, name: p1Name, isLocal: true });
    this.p2 = new Fighter({ x: CFG.W * 0.7, color: '#ef4444', facing: -1, name: p2Name });
    this.wins = { p1: 0, p2: 0 };
    this.round = 1;
    this.time = CFG.ROUND_TIME;
    this.phase = 'fight'; // fight|roundEnd|matchEnd
    this.phaseT = 0;
    this.localSide = 'p1';
  }

  setLocalSide(side) {
    this.localSide = side;
    this.p1.isLocal = side === 'p1';
    this.p2.isLocal = side === 'p2';
  }

  get local() { return this.localSide === 'p1' ? this.p1 : this.p2; }
  get remote() { return this.localSide === 'p1' ? this.p2 : this.p1; }

  resetRound() {
    for (const [f, x, face] of [[this.p1, CFG.W * 0.3, 1], [this.p2, CFG.W * 0.7, -1]]) {
      f.x = x; f.y = CFG.GROUND_Y; f.vx = 0; f.vy = 0;
      f.hp = 100; f.state = 'idle'; f.attack = null; f.blocking = false; f.onGround = true;
      f.facing = face;
    }
    this.time = CFG.ROUND_TIME;
    this.phase = 'fight';
    this.phaseT = 0;
    sfx.round();
    this.onEvent('round', { round: this.round });
  }

  localAttack(kind) {
    const f = this.local;
    const res = f.tryAttack(kind);
    if (res) {
      if (kind === 'special') sfx.special();
      this.onEvent('action', { kind, seq: res.seq });
    }
    return res;
  }

  // 원격이 보낸 액션 적용
  applyRemoteAction({ kind }) {
    const r = this.remote;
    const res = r.tryAttack(kind);
    if (res && kind === 'special') sfx.special();
  }

  // 원격 스냅샷 적용
  applyRemoteSnapshot(snap) {
    this.remote.applySnapshot(snap);
  }

  step(localInput, dtFrames = 1, net = null) {
    for (let i = 0; i < dtFrames; i++) this.tick(localInput, net);
    this.render();
  }

  tick(localInput, net) {
    if (this.hitstop > 0) { this.hitstop -= 1; return; }
    this.phaseT += 1;

    if (this.phase === 'fight') {
      this.time -= 1 / 60;
      // 로컬 파이터 시뮬레이션
      if (this.localSide === 'p1') {
        this.p1.update(localInput, this.p2);
        if (!net) this.cpuControl(this.p2, this.p1); // 솔로: CPU
        else this.p2.update({ left: false, right: false }, this.p1);
      } else {
        this.p2.update(localInput, this.p1);
        this.p1.update({ left: false, right: false }, this.p2);
      }

      // 타격 판정 (양쪽)
      this.checkHit(this.p1, this.p2, net, 'p1');
      this.checkHit(this.p2, this.p1, net, 'p2');

      // 라운드 종료 체크
      const dead1 = this.p1.hp <= 0, dead2 = this.p2.hp <= 0;
      if (dead1 || dead2 || this.time <= 0) this.endRound(dead1, dead2);
    } else {
      // 연출 페이즈: 물리만
      this.p1.update({}, this.p2);
      this.p2.update({}, this.p1);
      if (this.phaseT > 150) {
        if (this.phase === 'matchEnd') { /* 대기 */ }
        else {
          this.round += 1;
          this.resetRound();
        }
      }
    }

    if (this.shake > 0) this.shake -= 1;
  }

  checkHit(att, def, net, side) {
    const box = att.attackBox;
    if (!box || att.attack.didHit) return;
    const d = def.bodyBox();
    const overlap = box.x < d.x + d.w && box.x + box.w > d.x && box.y < d.y + d.h && box.y + box.h > d.y;
    if (!overlap) return;
    att.attack.didHit = true;
    const m = MOVES[att.attack.kind];
    const blocked = def.blocking && ((def.facing === 1 && def.x <= att.x) || (def.facing === -1 && def.x >= att.x));
    // 데미지는 공격자 측에서 판정 → 상대에게 이벤트 전송
    def.applyHit({ dmg: m.dmg, push: m.push, stun: m.stun, fromX: att.x, blocked });
    att.gainMeter(m.meter);
    def.gainMeter(6);
    this.hitstop = blocked ? 4 : 8;
    this.shake = blocked ? 3 : 7;
    if (blocked) sfx.block();
    else if (att.attack.kind === 'punch') sfx.punch();
    else sfx.kick();
    // P2P: 내가 때린 판정만 전송 (중복 데미지 방지)
    const iAmAttacker = (this.localSide === side);
    if (net && iAmAttacker) {
      net.sendHit({ dmg: m.dmg, push: m.push, stun: m.stun, blocked, atkSeq: att.attack.seq });
    }
  }

  // 원격에서 온 타격 판정 적용 (이미 checkHit 한 쪽과 중복 방지: 원격 공격자의 판정만 받음)
  applyRemoteHit({ dmg, push, stun, blocked }) {
    const def = this.local;
    const att = this.remote;
    // 이미 로컬에서 같은 공격에 맞았으면 무시 (hp가 이미 깎임)
    def.applyHit({ dmg, push, stun, fromX: att.x, blocked });
    this.hitstop = blocked ? 4 : 8;
    this.shake = blocked ? 3 : 7;
    if (blocked) sfx.block(); else sfx.punch();
  }

  endRound(dead1, dead2) {
    let winner = null;
    if (dead1 && dead2) winner = null;
    else if (dead1) winner = 'p2';
    else if (dead2) winner = 'p1';
    else winner = this.p1.hp === this.p2.hp ? null : (this.p1.hp > this.p2.hp ? 'p1' : 'p2');

    if (winner) {
      this.wins[winner] += 1;
      this[winner].state = 'win';
      this[winner === 'p1' ? 'p2' : 'p1'].state = this[winner === 'p1' ? this.p2.hp <= 0 : this.p1.hp <= 0] ? 'down' : 'lose';
      sfx.ko();
      this.onEvent('toast', { text: winner === this.localSide ? '🏆 라운드 승리!' : '💀 라운드 패배…' });
    } else {
      this.onEvent('toast', { text: '🤝 무승부!' });
    }

    const champ = this.wins.p1 >= CFG.WIN_ROUNDS ? 'p1' : this.wins.p2 >= CFG.WIN_ROUNDS ? 'p2' : null;
    if (champ) {
      this.phase = 'matchEnd';
      this.phaseT = 0;
      this.onEvent('match', { winner: champ, wins: { ...this.wins } });
      this.onEvent('toast', { text: champ === this.localSide ? '🎉 매치 승리!' : '😭 매치 패배…' });
    } else {
      this.phase = 'roundEnd';
      this.phaseT = 0;
      this.onEvent('roundEnd', { winner, wins: { ...this.wins } });
    }
  }

  cpuControl(cpu, foe) {
    // 간단한 CPU: 접근 → 랜덤 공격/가드/점프
    const dx = foe.x - cpu.x;
    cpu.facing = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    const t = performance.now() / 1000;
    const input = { left: false, right: false, jump: false, block: false };
    if (cpu.state === 'hit' || cpu.attack) { cpu.update(input, foe); return; }
    if (dist > 110) {
      if (dx > 0) input.right = true; else input.left = true;
    } else {
      const r = Math.random();
      if (r < 0.12) cpu.tryAttack(Math.random() < 0.6 ? 'punch' : 'kick');
      else if (r < 0.2) input.block = true;
      else if (r < 0.23 && cpu.onGround) input.jump = true;
      else if (dist > 70) { if (dx > 0) input.right = true; else input.left = true; }
      else input.block = Math.sin(t * 2) > 0.6;
    }
    if (foe.attack && dist < 130 && Math.random() < 0.4) input.block = true;
    cpu.update(input, foe);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // 배경: 네온 도장
    const g = ctx.createLinearGradient(0, 0, 0, CFG.H);
    g.addColorStop(0, '#1a1030');
    g.addColorStop(0.7, '#241536');
    g.addColorStop(1, '#0d0d18');
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, CFG.W + 20, CFG.H + 20);

    // 달 + 관중 LED
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(480, 110, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,215,94,.15)';
    ctx.beginPath(); ctx.arc(480, 110, 70, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsl(${(i * 37 + Date.now() / 50) % 360} 80% 60% / .5)`;
      ctx.fillRect(20 + i * 23, 190 + Math.sin(i * 1.7) * 8, 10, 4);
    }
    // 도장 바닥
    ctx.fillStyle = '#2c2140';
    ctx.fillRect(0, CFG.GROUND_Y + 4, CFG.W, CFG.H - CFG.GROUND_Y);
    ctx.strokeStyle = '#e63b5f';
    ctx.lineWidth = 4;
    ctx.strokeRect(120, CFG.GROUND_Y - 130, CFG.W - 240, 140);
    ctx.fillStyle = 'rgba(230,59,95,.12)';
    ctx.fillRect(120, CFG.GROUND_Y - 130, CFG.W - 240, 140);

    this.p1.draw(ctx);
    this.p2.draw(ctx);

    // KO / 라운드 텍스트
    if (this.phase !== 'fight') {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.fillStyle = '#ffd75e';
      ctx.font = '900 72px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(this.phase === 'matchEnd' ? 'K.O.' : `ROUND ${this.round} END`, CFG.W / 2, CFG.H / 2);
    }
    ctx.restore();
  }
}
