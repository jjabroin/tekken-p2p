import { CFG, MOVES } from './config.js';

let uid = 1;

export class Fighter {
  constructor({ x, color, facing, name, isLocal }) {
    this.id = uid++;
    this.name = name || 'FIGHTER';
    this.x = x;
    this.y = CFG.GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.w = 56;
    this.h = 120;
    this.facing = facing; // 1: 오른쪽, -1: 왼쪽
    this.color = color;
    this.hp = 100;
    this.meter = 0;
    this.state = 'idle'; // idle|walk|jump|attack|hit|block|down|win|lose
    this.stateT = 0;
    this.attack = null; // { kind, t, didHit }
    this.attackSeq = 0;
    this.blocking = false;
    this.onGround = true;
    this.isLocal = !!isLocal;
    this.flash = 0;
  }

  get cx() { return this.x; }
  get attackBox() {
    if (!this.attack) return null;
    const m = MOVES[this.attack.kind];
    const t = this.attack.t;
    if (t < m.startup || t > m.startup + m.active) return null;
    const dir = this.facing;
    return {
      x: dir === 1 ? this.x : this.x - m.range,
      y: this.y - this.h + 20,
      w: m.range,
      h: 70,
    };
  }

  bodyBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  tryAttack(kind) {
    if (this.state === 'hit' || this.state === 'down' || this.state === 'win' || this.state === 'lose') return null;
    if (this.attack) return null;
    if (!this.onGround) return null;
    if (kind === 'special' && this.meter < 100) return null;
    if (kind === 'special') this.meter = 0;
    this.attackSeq += 1;
    this.attack = { kind, t: 0, didHit: false, seq: this.attackSeq };
    this.state = 'attack';
    this.stateT = 0;
    this.blocking = false;
    return { kind, seq: this.attackSeq };
  }

  applyHit({ dmg, push, stun, fromX, blocked }) {
    if (this.state === 'down') return;
    const dir = this.x >= fromX ? 1 : -1;
    if (blocked) {
      this.hp = Math.max(0, this.hp - Math.ceil(dmg * 0.15));
      this.x += dir * push * 0.4;
      this.state = 'block';
      this.stateT = 0;
    } else {
      this.hp = Math.max(0, this.hp - dmg);
      this.x += dir * push;
      this.state = this.hp <= 0 ? 'down' : 'hit';
      this.stateT = 0;
      this.attack = null;
      this._stun = stun;
    }
    this.flash = 8;
    this.clamp();
  }

  update(input, foe) {
    this.stateT += 1;
    if (this.flash > 0) this.flash -= 1;

    // 바라보는 방향 자동 전환 (공격/피격 중 제외)
    if (!this.attack && this.state !== 'hit' && foe) {
      this.facing = foe.x >= this.x ? 1 : -1;
    }

    // 피격 경직
    if (this.state === 'hit' && this.stateT < (this._stun || 14)) {
      this.physics();
      return;
    }
    if (this.state === 'hit') this.state = 'idle';

    // 공격 진행
    if (this.attack) {
      const m = MOVES[this.attack.kind];
      this.attack.t += 1;
      const total = m.startup + m.active + m.recover;
      if (this.attack.t >= total) {
        this.attack = null;
        this.state = 'idle';
      }
      this.physics();
      return;
    }

    if (this.state === 'down' || this.state === 'win' || this.state === 'lose') {
      this.physics();
      return;
    }

    // 가드
    this.blocking = !!input.block && this.onGround;
    if (this.blocking) this.state = 'block';
    else if (this.state === 'block') this.state = 'idle';

    // 이동
    const speed = CFG.MOVE_SPEED * (this.blocking ? 0 : 1);
    if (input.left) { this.x -= speed; if (this.onGround) this.state = 'walk'; }
    else if (input.right) { this.x += speed; if (this.onGround) this.state = 'walk'; }
    else if (this.onGround && !this.blocking) this.state = 'idle';

    // 점프
    if (input.jump && this.onGround && !this.blocking) {
      this.vy = CFG.JUMP_V;
      this.onGround = false;
      this.state = 'jump';
    }

    if (!this.onGround) this.state = this.state === 'jump' ? 'jump' : this.state;

    this.physics();
    this.clamp();
  }

  physics() {
    this.vy += CFG.GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.8;
    if (this.y >= CFG.GROUND_Y) {
      this.y = CFG.GROUND_Y;
      this.vy = 0;
      this.onGround = true;
      if (this.state === 'jump') this.state = 'idle';
    } else {
      this.onGround = false;
    }
  }

  clamp() {
    this.x = Math.max(40, Math.min(CFG.W - 40, this.x));
  }

  gainMeter(n) {
    this.meter = Math.max(0, Math.min(100, this.meter + n));
  }

  snapshot() {
    return {
      x: +this.x.toFixed(1), y: +this.y.toFixed(1),
      vx: +this.vx.toFixed(2), vy: +this.vy.toFixed(2),
      hp: this.hp | 0, meter: this.meter | 0,
      facing: this.facing, state: this.state,
      atk: this.attack ? `${this.attack.kind}:${this.attack.seq}:${this.attack.t}` : '',
    };
  }

  applySnapshot(s) {
    this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
    this.hp = s.hp; this.meter = s.meter; this.facing = s.facing;
    // 공격/다운 같은 주요 상태만 덮어쓰기 (떨림 방지)
    if (['attack', 'hit', 'down', 'block', 'win', 'lose'].includes(s.state)) {
      this.state = s.state;
    }
    if (s.atk) {
      const [kind, seq] = s.atk.split(':');
      const nseq = +seq;
      if (nseq !== this.attack?.seq) {
        this.attack = { kind, t: 0, didHit: true, seq: nseq };
        this.state = 'attack';
      }
    } else if (this.state === 'attack') {
      this.attack = null;
      this.state = 'idle';
    }
  }

  draw(ctx) {
    const b = this.bodyBox();
    const atk = this.attackBox;

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(this.x, CFG.GROUND_Y + 8, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 피격 플래시
    const body = this.flash > 0 ? '#ffffff' : this.color;

    // 몸통
    ctx.fillStyle = body;
    const crouch = this.blocking ? 18 : 0;
    roundRect(ctx, b.x, b.y + crouch, b.w, b.h - crouch, 10);
    ctx.fill();

    // 머리
    ctx.fillStyle = this.flash > 0 ? '#fff' : '#f2c99b';
    ctx.beginPath();
    ctx.arc(this.x, b.y - 2 + crouch, 17, 0, Math.PI * 2);
    ctx.fill();
    // 헤어밴드
    ctx.fillStyle = '#e63b5f';
    ctx.fillRect(this.x - 17, b.y - 8 + crouch, 34, 6);

    // 팔 (공격 모션)
    ctx.strokeStyle = body;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    const armY = b.y + 44 + crouch;
    if (this.attack && atk) {
      const m = MOVES[this.attack.kind];
      const ext = m.range * Math.min(1, this.attack.t / Math.max(1, m.startup));
      ctx.beginPath();
      ctx.moveTo(this.x, armY);
      ctx.lineTo(this.x + this.facing * ext, armY - 6);
      ctx.stroke();
      // 공격 판정 박스 (디버그용 희미하게)
      ctx.fillStyle = this.attack.kind === 'special' ? 'rgba(255,215,94,.35)' : 'rgba(255,255,255,.18)';
      ctx.fillRect(atk.x, atk.y, atk.w, atk.h);
    } else if (this.blocking) {
      ctx.beginPath();
      ctx.moveTo(this.x, armY);
      ctx.lineTo(this.x + this.facing * 10, armY - 26);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,180,255,.35)';
      ctx.fillRect(this.x + (this.facing === 1 ? -6 : -26), b.y + 10, 32, 80);
    } else {
      ctx.beginPath();
      ctx.moveTo(this.x, armY);
      ctx.lineTo(this.x + this.facing * 22, armY + 10);
      ctx.stroke();
    }

    // 다리
    ctx.strokeStyle = '#20202e';
    ctx.lineWidth = 11;
    const legSwing = this.state === 'walk' ? Math.sin(this.stateT * 0.4) * 12 : 0;
    ctx.beginPath();
    ctx.moveTo(this.x - 8, b.y + b.h - 6);
    ctx.lineTo(this.x - 12 + legSwing, CFG.GROUND_Y + 4);
    ctx.moveTo(this.x + 8, b.y + b.h - 6);
    ctx.lineTo(this.x + 12 - legSwing, CFG.GROUND_Y + 4);
    ctx.stroke();

    // 이름 + 게이지
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(this.name.slice(0, 12), this.x, b.y - 28 + crouch);
    // 미터 게이지
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(this.x - 28, b.y - 22 + crouch, 56, 5);
    ctx.fillStyle = this.meter >= 100 ? '#ffd75e' : '#22d3ee';
    ctx.fillRect(this.x - 28, b.y - 22 + crouch, 56 * (this.meter / 100), 5);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
