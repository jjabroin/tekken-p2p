import { CFG } from './config.js';
import { getMove } from './characters.js';
import { TekkenInput } from './input.js';

let uid = 1;

export class Fighter {
  constructor({ x, facing, name, char, isLocal }) {
    this.id = uid++;
    this.name = name || 'FIGHTER';
    this.char = char;
    this.x = x;
    this.y = CFG.GROUND_Y; // 발 위치
    this.vx = 0;
    this.vy = 0;
    this.w = 34;
    this.h = 96;
    this.facing = facing;
    this.hp = char.hp;
    this.maxHp = char.hp;
    this.state = 'idle';
    this.stateT = 0;
    this.attack = null; // {move, t, didHit, seq, ch}
    this.attackSeq = 0;
    this.stun = 0; // 피격/가드 경직
    this.blocking = false;
    this.crouchBlock = false;
    this.onGround = true;
    this.isLocal = !!isLocal;
    this.flash = 0;
    this.rage = false;
    this.rageUsed = false;
    this.airT = 0;
    this.screwOk = true;
    this.downT = 0;
    this.buffer = null; // {code→q} 입력 버퍼
    this.bufferT = 0;
    this.input = new TekkenInput();
    this.animT = 0;
    this.grabbedBy = null;
  }

  get centerY() { return this.y - this.h / 2; }

  bodyBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  attackBox() {
    if (!this.attack) return null;
    const m = this.attack.move;
    const t = this.attack.t;
    if (t < m.st || t > m.st + m.ac) return null;
    const dir = this.facing;
    const yMap = { h: [118, 52], m: [152, 62], l: [192, 46], ub: [150, 70] };
    const [cy, hh] = yMap[m.h] || yMap.m;
    return { x: dir === 1 ? this.x : this.x - m.range, y: cy - hh / 2, w: m.range, h: hh };
  }

  canAct() {
    return ['idle', 'walkf', 'walkb', 'dash', 'backdash', 'crouch', 'block', 'jump'].includes(this.state);
  }

  // ── 기술 선택 ──
  chooseMove(q) {
    const has = (id) => this.char.moves.includes(id);
    // 누움
    if (this.state === 'down') {
      if (q.code === '3' && has('get3')) return 'get3';
      if (q.code === '4' && has('get4')) return 'get4';
      return null;
    }
    // 공중
    if (!this.onGround || this.state === 'air') {
      if ((q.code === '1' || q.code === '2') && has('air1')) return 'air1';
      if ((q.code === '3' || q.code === '4') && has('air4')) return 'air4';
      return null;
    }
    // 연계 (캔슬)
    if (this.attack && this.attack.t >= this.attack.move.st) {
      const nx = this.attack.move.next?.[q.code];
      if (nx && has(nx)) return nx;
    }
    if (this.attack) return null; // 연계 아니면 공격 중 입력 불가(버퍼로 저장)
    // 풍신권
    if (q.code === '2' && (q.dir === 'df' || q.dir === 'd') && has('wgf') && this.input.hasWGF()) return 'wgf';
    // 대시 기술
    if (q.dashF && q.code === '2') {
      if (has('death')) return 'death';
      if (has('ff2')) return 'ff2';
    }
    // 앉아/일어나기
    if (q.crouch) {
      // db 방향기 우선 (앉아+뒤)
      for (const id of this.char.moves) {
        const m = getMove(id);
        if (m && m.dir === 'db' && String(m.btn) === q.code) return id;
      }
      for (const id of ['d4', 'd3', 'd2', 'd1']) {
        const m = getMove(id);
        if (m && String(m.btn) === q.code && has(id)) return id;
      }
      // 앉은 상태 일반 버튼 폴백
      if (q.code === '3' && has('d3')) return 'd3';
      if (q.code === '4' && has('d4')) return 'd4';
      if (q.code === '1' && has('d1')) return 'd1';
      if (q.code === '2' && has('d2')) return 'd2';
      return null;
    }
    // 일어나며 기술 (ws+?)
    if (q.rise) {
      for (const id of this.char.moves) {
        const m = getMove(id);
        if (m && m.rise && String(m.btn) === q.code) return id;
      }
    }
    // 방향+버튼 정확 매칭 (방향기 우선 → 무방향기)
    for (let pass = 0; pass < 2; pass++) {
      for (const id of this.char.moves) {
        const m = getMove(id);
        if (!m || m.btn === 0 || String(m.btn) !== q.code) continue;
        if (m.down || m.air || m.rageMove || m.special) continue;
        if (m.dash && !q.dashF) continue;
        if (m.rise && !q.rise) continue;
        if (pass === 0) {
          if (!m.dir || m.dir !== q.dir) continue;
        } else {
          if (m.dir) continue;
          if (q.dir !== 'n' && q.dir !== 'f' && q.dir !== 'b') continue;
        }
        return id;
      }
    }
    // 단타 폴백
    const fb = { 1: 'm1', 2: 'm2', 3: 's3', 4: 's4', 12: 'screw12', 13: 't13', 24: 't24' };
    const f = fb[q.code];
    if (f && has(f)) return f;
    return null;
  }

  startMove(id) {
    const m = getMove(id);
    if (!m) return null;
    this.attackSeq += 1;
    this.attack = { move: m, id, t: 0, didHit: false, seq: this.attackSeq };
    this.state = 'attack';
    this.stateT = 0;
    this.blocking = false;
    this.animT = 0;
    return { move: id, seq: this.attackSeq };
  }

  // type: 'hit' | 'block' | 'launch' | 'screw' | 'kd' | 'grab'
  applyHit({ dmg, push, type, fromX, launchVy, stun }) {
    if (this.state === 'down' || this.state === 'lose') return;
    if (this.state === 'win' || this.state === 'grabVictim') return;
    const dir = this.x >= fromX ? 1 : -1;
    this.attack = null;
    this.buffer = null;
    if (type === 'block') {
      this.hp = Math.max(0, this.hp - dmg);
      this.x += dir * push;
      this.stun = stun || 12;
      this.stateT = 0;
      // block 상태 유지 (가드 중이었으므로)
    } else if (type === 'launch' || (type === 'hit' && this.state === 'air')) {
      this.hp = Math.max(0, this.hp - dmg);
      this.state = 'air';
      this.vy = launchVy ?? -8;
      this.onGround = false;
      this.airT = 0;
      this.x += dir * (push || 2);
      this.stateT = 0;
    } else if (type === 'screw') {
      this.hp = Math.max(0, this.hp - dmg);
      this.state = 'air';
      this.vy = -5.5;
      this.onGround = false;
      this.screwOk = false;
      this.airT = 0;
      this.x += dir * (push || 2);
      this.stateT = 0;
    } else if (type === 'kd' || this.hp - dmg <= 0) {
      this.hp = Math.max(0, this.hp - dmg);
      this.state = this.hp <= 0 ? 'down' : 'down';
      this.downT = 0;
      this.stateT = 0;
      this.vy = -4;
      this.onGround = false;
      this.x += dir * (push || 3);
    } else if (type === 'grab') {
      this.hp = Math.max(0, this.hp - dmg);
      this.state = 'grabVictim';
      this.stateT = 0;
      this.grabT = 42;
    } else {
      this.hp = Math.max(0, this.hp - dmg);
      this.x += dir * (push || 2);
      this.stun = stun || 16;
      this.state = 'hit';
      this.stateT = 0;
    }
    if (!this.rage && this.hp > 0 && this.hp <= this.maxHp * 0.25) this.rage = true;
    this.flash = 7;
    this.clamp();
  }

  update(raw, foe) {
    this.stateT += 1;
    this.animT += 1;
    if (this.flash > 0) this.flash -= 1;
    const inp = this.input;
    inp.frame(raw);

    if (!this.onGround && this.state !== 'air' && this.state !== 'attack') {
      // 점프 물리 중
    }

    // 방향 전환 (행동 가능할 때만)
    if (foe && (this.canAct() || this.state === 'block')) {
      this.facing = foe.x >= this.x ? 1 : -1;
    }

    // 경직
    if (this.stun > 0) {
      this.stun -= 1;
      this.physics();
      if (this.stun === 0 && (this.state === 'hit' || this.state === 'block')) this.state = 'idle';
      return;
    }

    // 잡기 당함
    if (this.state === 'grabVictim') {
      this.grabT -= 1;
      if (foe) this.x += ((foe.x + foe.facing * 30) - this.x) * 0.3;
      if (this.grabT <= 0) { this.state = 'hit'; this.stun = 18; this.stateT = 0; }
      return;
    }

    // 다운
    if (this.state === 'down') {
      this.downT += 1;
      this.physics();
      // 기상킥 입력 처리
      let q;
      while ((q = inp.take())) {
        const id = this.chooseMove(q);
        if (id) { this.doGetup(id); return; }
      }
      if (this.hp <= 0) return; // KO면 누워있기
      if (this.downT > 55) { this.state = 'idle'; this.stateT = 0; }
      return;
    }

    if (['win', 'lose'].includes(this.state)) { this.physics(); return; }

    // 공중 (띄워짐)
    if (this.state === 'air') {
      this.airT += 1;
      this.physics();
      inp.clear();
      return;
    }

    // 공격 진행
    if (this.attack) {
      const m = this.attack.move;
      this.attack.t += 1;
      const total = m.st + m.ac + m.rc;
      // 연계 버퍼 확인
      let q;
      const buffered = [];
      while ((q = inp.take())) {
        const nx = m.next?.[q.code];
        if (nx && this.attack.t >= m.st && this.char.moves.includes(nx)) {
          this.startMove(nx);
          return { chained: true };
        }
        buffered.push(q);
      }
      // 버퍼 저장 (연계 타이밍용, 10f)
      if (buffered.length) { this.buffer = buffered[buffered.length - 1]; this.bufferT = 10; }
      if (this.bufferT > 0) {
        this.bufferT -= 1;
        const nx = m.next?.[this.buffer.code];
        if (nx && this.attack.t >= m.st && this.char.moves.includes(nx)) {
          const b = this.buffer; this.buffer = null;
          this.startMove(nx);
          return { chained: true };
        }
        if (this.bufferT === 0) this.buffer = null;
      }
      // 레이지 돌진
      if (m.rageMove) this.x += this.facing * 3.2;
      if (this.attack.t >= total) {
        this.attack = null;
        this.state = this.onGround ? 'idle' : 'jump';
      }
      this.physics();
      return;
    }

    // 가드 (뒤를 잡으면 가드 — 철권식)
    const wantGuard = raw.b && this.onGround;
    this.blocking = !!wantGuard;
    this.crouchBlock = !!(wantGuard && raw.d);

    // 대시 상태 진입
    if (inp.dashF > 0 && this.state !== 'dash' && this.onGround && !wantGuard && (raw.f)) {
      this.state = 'dash'; this.stateT = 0;
    }
    if (inp.dashB > 0 && this.state !== 'backdash' && this.onGround && !wantGuard) {
      this.state = 'backdash'; this.stateT = 0;
    }

    // 버튼 입력 처리
    let q;
    while ((q = inp.take())) {
      const id = this.chooseMove(q);
      if (id) {
        if (id === 'get3' || id === 'get4') { this.doGetup(id); return; }
        return this.startMove(id);
      }
    }

    // 이동
    const sp = CFG.MOVE_SPEED * this.char.speed;
    if (this.state === 'dash') {
      this.x += this.facing * CFG.DASH_SPEED * this.char.speed;
      if (this.stateT > 14 || !raw.f) this.state = 'idle';
    } else if (this.state === 'backdash') {
      this.x -= this.facing * CFG.DASH_SPEED * 0.9 * this.char.speed;
      if (this.stateT > 12) this.state = 'idle';
    } else if (!wantGuard) {
      if (raw.f ^ raw.b) {
        this.x += (raw.f ? sp : -sp) * this.facing;
        // f/b는 상대 기준이므로 그대로 이동
        if (this.onGround) this.state = raw.f ? 'walkf' : 'walkb';
      } else if (this.onGround) {
        this.state = this.crouch ? 'crouch' : 'idle';
      }
    } else if (this.onGround) {
      this.state = 'block';
    }

    // 앉기 (순수 d/db만 — df는 서있는 취급)
    const d8 = TekkenInput.dir8(raw);
    this.crouch = !!((d8 === 'd' || d8 === 'db') && this.onGround && !this.attack);

    // 점프
    if (raw.u && this.onGround && !wantGuard && this.state !== 'jump') {
      this.vy = CFG.JUMP_V;
      this.onGround = false;
      this.state = 'jump';
      this.stateT = 0;
    }
    if (!this.onGround && this.state !== 'jump' && this.state !== 'attack') this.state = 'jump';

    this.physics();
    this.clamp();
  }

  // raw f/b는 상대 기준이므로 월드 이동 변환 필요:
  // frame()에 들어오기 전 main에서 변환한다 (f = D키 등). 여기서는 facing 기준 처리.
  doGetup(id) {
    this.state = 'attack';
    this.stateT = 0;
    this.onGround = true;
    this.y = CFG.GROUND_Y;
    this.vy = 0;
    this.startMove(id);
  }

  physics() {
    this.vy += CFG.GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.8;
    if (this.y >= CFG.GROUND_Y) {
      const wasAir = this.state === 'air';
      this.y = CFG.GROUND_Y;
      this.vy = 0;
      this.onGround = true;
      if (this.state === 'jump' || this.state === 'attack') {
        if (this.state === 'jump') this.state = 'idle';
      }
      if (wasAir) {
        this.state = this.hp <= 0 ? 'down' : 'down';
        this.downT = 0;
        this.stateT = 0;
        this.screwOk = true;
      }
      if (this.state === 'down' && this.hp <= 0) { /* KO 유지 */ }
    } else {
      this.onGround = false;
    }
  }

  clamp() {
    this.x = Math.max(24, Math.min(CFG.W - 24, this.x));
  }

  resetRound(x, facing) {
    this.x = x; this.y = CFG.GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.hp = this.maxHp;
    this.state = 'idle'; this.stateT = 0;
    this.attack = null; this.stun = 0;
    this.blocking = false; this.onGround = true;
    this.facing = facing; this.flash = 0;
    this.rage = false; this.rageUsed = false;
    this.screwOk = true; this.buffer = null;
    this.input.clear();
  }

  snapshot() {
    return {
      x: +this.x.toFixed(1), y: +this.y.toFixed(1),
      vx: +this.vx.toFixed(2), vy: +this.vy.toFixed(2),
      hp: this.hp | 0, rage: this.rage ? 1 : 0,
      face: this.facing, st: this.state,
      atk: this.attack ? `${this.attack.id}:${this.attack.seq}` : '',
    };
  }

  applySnapshot(s) {
    this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
    this.hp = s.hp; this.rage = !!s.rage; this.facing = s.face;
    if (['attack', 'hit', 'block', 'air', 'down', 'crouch', 'jump', 'grabVictim', 'win', 'lose', 'walkf', 'walkb', 'dash', 'backdash'].includes(s.st)) {
      this.state = s.st;
    } else if (this.state !== 'attack') {
      this.state = 'idle';
    }
    if (s.atk) {
      const [id, seq] = s.atk.split(':');
      if (+seq !== this.attack?.seq) {
        const m = getMove(id);
        if (m) {
          this.attack = { move: m, id, t: 0, didHit: true, seq: +seq };
          this.state = 'attack';
        }
      }
    } else if (this.state === 'attack') {
      this.attack = null;
      this.state = 'idle';
    }
  }

  // ── 렌더 ──
  curFrame() {
    const t = this.animT;
    switch (this.state) {
      case 'idle': return ['idle0', 'idle1', 'idle2', 'idle3'][Math.floor(t / 9) % 4];
      case 'walkf': case 'dash': return ['walkf0', 'walkf1', 'walkf2', 'walkf3'][Math.floor(t / 6) % 4];
      case 'walkb': case 'backdash': return ['walkb0', 'walkb1', 'walkb2', 'walkb3'][Math.floor(t / 6) % 4];
      case 'crouch': case 'block': return this.crouchBlock || this.state === 'crouch' ? 'down' : 'block';
      case 'jump': return this.vy < -3 ? 'jump0' : this.vy < 2 ? 'jump1' : 'jump2';
      case 'attack': {
        const m = this.attack.move;
        const total = Math.max(1, m.st + m.ac + m.rc);
        const idx = Math.min(m.anim.length - 1, Math.floor((this.attack.t / total) * m.anim.length));
        return m.anim[idx];
      }
      case 'hit': return 'idle0';
      case 'air': return Math.floor(t / 5) % 2 ? 'air0' : 'air1';
      case 'down': case 'lose': return 'down';
      case 'grabVictim': return 'down';
      case 'win': return 'win';
      default: return 'idle0';
    }
  }

  draw(ctx, sheet, meta) {
    const fr = meta.frames[this.curFrame()] || meta.frames.idle0;
    // 그림자
    const shY = CFG.GROUND_Y + 4;
    const shScale = Math.max(0.3, 1 - (CFG.GROUND_Y - this.y) / 220);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), shY, 20 * shScale, 5 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    const fx = Math.round(this.x);
    const fy = Math.round(this.y);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(this.facing, 1);
    const dx = -fr.ax;
    const dy = -(fr.h - fr.ay);
    const tint = this.flash > 0 ? 'white' : null;
    if (!tint) {
      ctx.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, Math.round(dx), Math.round(dy), fr.w, fr.h);
    } else {
      const c = Fighter._tmp || (Fighter._tmp = document.createElement('canvas'));
      c.width = fr.w; c.height = fr.h;
      const g = c.getContext('2d');
      g.clearRect(0, 0, fr.w, fr.h);
      g.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#fff';
      g.fillRect(0, 0, fr.w, fr.h);
      ctx.drawImage(c, Math.round(dx), Math.round(dy));
    }
    ctx.restore();

    // 레이지 오라
    if (this.rage && this.hp > 0) {
      ctx.fillStyle = `rgba(255,40,60,${0.10 + 0.08 * Math.sin(this.animT * 0.3)})`;
      ctx.fillRect(fx - 24, fy - 104, 48, 104);
    }
  }
}
