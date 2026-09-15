import { CFG } from './config.js';
import { Fighter } from './fighter.js';
import { getMove } from './characters.js';
import { sfx } from './audio.js';

const COMBO_SCALE = [1, 0.7, 0.5, 0.4, 0.32, 0.26, 0.22];

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.onEvent = opts.onEvent || (() => {});
    this.sheets = opts.sheets || {}; // charId -> {img, meta}
    this.demo = !!opts.demo;
    this.train = !!opts.train; // 연습 모드 (타이머/라운드 없음, 더미 상대)
    this.trainDummyMode = 'stand'; // stand|guard|crouch
    this.trainResetT = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.flash = 0; // KO 화면 플래시
    this.timeScale = 1;
    this.slowT = 0;
    this.particles = [];
    this.dmgNums = []; // 데미지 숫자 팝업 {x,y,txt,t,color}
    this.announce = null; // {text, sub, t, dur, size}
    this.combo = { p1: null, p2: null };
    this.cpuT = 0;
    this.resetMatch(opts.p1 || { name: 'P1', charId: 0 }, opts.p2 || { name: 'P2', charId: 0 });
  }

  resetMatch(p1, p2) {
    const { CHARS } = Game;
    this.p1 = new Fighter({ x: 150, facing: 1, name: p1.name, char: CHARS[p1.charId] || CHARS[0], isLocal: true });
    this.p2 = new Fighter({ x: 330, facing: -1, name: p2.name, char: CHARS[p2.charId] || CHARS[0] });
    this.p1.charId = p1.charId; this.p2.charId = p2.charId;
    this.wins = { p1: 0, p2: 0 };
    this.round = 1;
    this.perfects = { p1: 0, p2: 0 };
    this.startRound(true);
  }

  static setChars(CHARS) { Game.CHARS = CHARS; }

  setLocalSide(side) {
    this.localSide = side || 'p1';
    this.p1.isLocal = side === 'p1';
    this.p2.isLocal = side === 'p2';
  }
  get local() { return this.localSide === 'p1' ? this.p1 : this.p2; }
  get remote() { return this.localSide === 'p1' ? this.p2 : this.p1; }

  startRound(first = false) {
    this.p1.resetRound(150, 1);
    this.p2.resetRound(330, -1);
    this.time = CFG.ROUND_TIME;
    this.phase = 'announce';
    this.phaseT = 0;
    this.combo = { p1: null, p2: null };
    this.particles.length = 0;
    this.announce = null;
    if (this.train) {
      this.phase = 'fight';
      this.time = 99;
      this.say('TRAINING', 'G 더미전환 · X 리셋', 70, 36);
    } else if (!this.demo) {
      this.say(`ROUND ${this.round}`, '', 55, 40);
      sfx.round();
      this.onEvent('round', { round: this.round });
    } else {
      this.phase = 'fight';
    }
    if (first) this.phaseT = 0;
  }

  say(text, sub = '', dur = 50, size = 44) {
    this.announce = { text, sub, t: 0, dur, size };
  }

  localAttack(code) {
    const f = this.local;
    if (this.phase !== 'fight') return null;
    f.input.press(code);
    return true;
  }

  localAttack(code) {
    if (this.phase !== 'fight') return;
    this.local.input.press(code);
  }

  rageArt() {
    const f = this.local;
    if (this.phase !== 'fight') return;
    if (!f.rage || f.rageUsed || !f.canAct() || !f.onGround) return;
    f.rageUsed = true;
    const res = f.startMove('rage');
    if (res) { sfx.rage(); this.onEvent('action', { move: 'rage', seq: res.seq }); }
  }

  applyRemoteAction({ move, seq }) {
    const r = this.remote;
    const m = getMove(move);
    if (!m) return;
    if (this.phase !== 'fight') return;
    r.attackSeq = Math.max(r.attackSeq, seq);
    r.attack = { move: m, id: move, t: 0, didHit: true, seq };
    r.state = 'attack'; r.stateT = 0; r.blocking = false;
    if (move === 'rage') sfx.rage();
  }

  applyRemoteSnapshot(snap) {
    this.remote.applySnapshot(snap);
  }

  step(localRaw, net) {
    // 저속 연출
    let n = 1;
    if (this.slowT > 0) { this.slowT -= 1; if (this.slowT % 2 === 0) n = 0; }
    if (this.hitstop > 0) { this.hitstop -= 1; n = 0; }
    for (let i = 0; i < n; i++) this.tick(localRaw, net);
    this.render();
  }

  tick(localRaw, net) {
    this.phaseT += 1;
    this.updateParticles();

    if (this.announce) {
      this.announce.t += 1;
      if (this.announce.t >= this.announce.dur) {
        const was = this.announce.text;
        this.announce = null;
        if (this.phase === 'announce') {
          if (was.startsWith('ROUND')) { this.say('FIGHT!', '', 32, 56); sfx.fight(); }
          else if (was === 'FIGHT!') this.phase = 'fight';
        }
      }
    }

    if (this.phase === 'fight') {
      if (!this.train) this.time -= 1 / 60;
      const locked = this.phase !== 'fight' || !!this.announce;
      const empty = {};
      const rawFor = (side) => (locked ? empty : (side === this.localSide ? localRaw : empty));
      if (this.cpuP1) this.cpu(this.p1, this.p2);
      else this.p1.update(rawFor('p1'), this.p2);
      if (this.train) this.trainDummy(this.p2, this.p1);
      else if (this.cpuP2) this.cpu(this.p2, this.p1);
      else this.p2.update(rawFor('p2'), this.p1);
      // 콤보 리셋 감지 (착지)
      for (const [me, foe, key] of [[this.p1, this.p2, 'p2'], [this.p2, this.p1, 'p1']]) {
        if (foe.state === 'down' && foe.downT <= 1 && this.combo[key]) {
          this.combo[key] = null;
        }
      }
      this.checkHit(this.p1, this.p2, net, 'p1');
      this.checkHit(this.p2, this.p1, net, 'p2');
      const dead1 = this.p1.hp <= 0, dead2 = this.p2.hp <= 0;
      if (this.train) {
        if ((dead1 || dead2) && !this.trainResetT) {
          this.trainResetT = 80;
          sfx.ko();
          this.say(dead1 && dead2 ? 'DOUBLE K.O.!' : 'K.O.!', '', 60, 52);
        }
      } else if (dead1 || dead2 || this.time <= 0) this.endRound(dead1, dead2);
    } else if (this.phase === 'ko' || this.phase === 'roundEnd') {
      this.p1.update({}, this.p2);
      this.p2.update({}, this.p1);
      if (this.phaseT > 150) {
        if (this.round >= 99) return;
        this.round += 1;
        this.startRound();
      }
    } else if (this.phase === 'matchEnd' || this.phase === 'announce') {
      if (this.phase === 'matchEnd') {
        this.p1.update({}, this.p2);
        this.p2.update({}, this.p1);
      }
    }

    if (this.shake > 0) this.shake -= 1;
  }

  // ── 타격 판정 (공격자 측 판정) ──
  checkHit(att, def, net, side) {
    const atk = att.attack;
    if (!atk || atk.didHit) return;
    // 잡기는 별도 처리
    if (atk.move.grab) { this.checkGrab(att, def, net, side); return; }
    const box = att.attackBox();
    if (!box) return;
    const d = def.bodyBox();
    const overlap = box.x < d.x + d.w && box.x + box.w > d.x && box.y < d.y + d.h && box.y + box.h > d.y;
    if (!overlap) return;
    if (def.state === 'down') return;
    if (def.state === 'air' && atk.move.h === 'l') return; // 하단은 공중 whiff
    if (def.state === 'grabVictim') return;

    atk.didHit = true;
    const m = atk.move;
    const ch = !!(def.attack && def.attack.t < def.attack.move.st + 2);
    // 가드 판정 (철권식: 서서 h/m, 앉아 l, ub 불가)
    let blocked = false;
    if (!m.rageMove && def.blocking && def.state !== 'air' && m.h !== 'ub') {
      blocked = m.h === 'l' ? def.crouchBlock : !def.crouchBlock;
    }

    const iAmAttacker = this.localSide === side;
    // 솔로: 양쪽 다 로컬 판정. P2P: 공격자 측만 판정 전송, 피격자는 hit 이벤트로 적용.
    const authoritative = !net || this.localSide === side;
    if (!authoritative) return;

    const key = side;
    const combo = this.combo[key];
    const airHit = def.state === 'air';
    const count = airHit ? (combo ? combo.hits : 0) : 0;
    const scale = airHit ? (COMBO_SCALE[Math.min(count, COMBO_SCALE.length - 1)]) : 1;
    let dmg = Math.max(1, Math.round(m.dmg * att.char.power * scale * (ch ? 1.3 : 1) * (att.rage ? 1.1 : 1)));

    if (blocked) {
      const chip = Math.min(def.hp, 2 + Math.round(dmg * 0.06));
      def.applyHit({ dmg: chip, push: 2.5, type: 'block', fromX: att.x, stun: 10 + Math.round(dmg * 0.25) });
      this.hitstop = 3; this.shake = 3;
      sfx.block();
      this.spark(def.x - def.facing * 14, def.centerY, 4, '#7db8ff');
      this.dmgNum(def.x, def.y - 108, chip, '#9fc4ff');
      if (net && iAmAttacker) net.sendHit({ dmg: chip, push: 2.5, type: 'block', stun: 10 + Math.round(dmg * 0.25) });
      return;
    }

    // 스크류
    if (m.screw && airHit && def.screwOk) {
      def.applyHit({ dmg, push: 2, type: 'screw', fromX: att.x });
      this.bumpCombo(key, dmg, true);
      this.hitstop = 10; this.shake = 7;
      sfx.screw();
      this.spark(def.x, def.centerY, 14, '#4df3ff');
      this.dmgNum(def.x, def.y - 118, dmg, '#4df3ff');
      this.say2('SCREW!', side);
      if (net && iAmAttacker) net.sendHit({ dmg, push: 2, type: 'screw' });
      return;
    }

    // 런처 / 공중타
    if (m.launch && !airHit) {
      const vy = m.launch * (1.18 - 0.16 * def.char.weight);
      def.applyHit({ dmg, push: 2, type: 'launch', fromX: att.x, launchVy: vy });
      this.bumpCombo(key, dmg, false);
      this.hitstop = m.electric ? 12 : 8; this.shake = m.electric ? 9 : 6;
      if (m.electric) { sfx.electric(); this.spark(def.x, def.centerY - 20, 20, '#bfe9ff'); }
      else sfx.launch();
      this.spark(att.x + att.facing * m.range * 0.8, def.centerY, 10, '#ffd75e');
      this.dmgNum(def.x, def.y - 118, dmg, m.electric ? '#bfe9ff' : '#ffd75e');
      if (net && iAmAttacker) net.sendHit({ dmg, push: 2, type: 'launch', launchVy: vy });
      return;
    }
    if (airHit) {
      const vy = Math.min(def.vy - 1.6, -2.2);
      def.applyHit({ dmg, push: 1.5, type: 'hit', fromX: att.x, launchVy: vy });
      // applyHit가 air 유지: state가 air였으므로 'hit' 대신 air 팝업 처리
      def.state = 'air'; def.vy = vy; def.onGround = false;
      this.bumpCombo(key, dmg, false);
      this.hitstop = 5; this.shake = 5;
      m.h === 'l' ? sfx.kick() : (atk.id === 'm1' || atk.id === 'm2' ? sfx.punch() : sfx.kick());
      this.spark(def.x, def.centerY, 8, '#fff');
      this.dmgNum(def.x, def.y - 118, dmg, '#fff');
      if (net && iAmAttacker) net.sendHit({ dmg, push: 1.5, type: 'air', launchVy: vy });
      return;
    }

    // 지상타
    const type = m.kd ? 'kd' : 'hit';
    const stun = 14 + Math.round(m.dmg * 0.4);
    def.applyHit({ dmg, push: m.push || 2.5, type, fromX: att.x, stun });
    this.hitstop = m.heavy ? 8 : 4; this.shake = m.heavy ? 9 : 5;
    if (m.heavy) sfx.heavy();
    else if (m.btn === 3 || m.btn === 4) sfx.kick();
    else sfx.punch();
    this.spark(att.x + att.facing * m.range * 0.8, def.centerY, m.heavy ? 14 : 8, ch ? '#ff5a5a' : '#ffd75e');
    this.dmgNum(def.x, def.y - 112, dmg, ch ? '#ff6a6a' : '#fff');
    if (ch) this.say2('COUNTER!', side);
    if (net && iAmAttacker) net.sendHit({ dmg, push: m.push || 2.5, type, stun });
  }

  checkGrab(att, def, net, side) {
    const atk = att.attack;
    const box = att.attackBox();
    if (!box) return;
    const t = atk.t, m = atk.move;
    if (t < m.st || t > m.st + m.ac || atk.didHit) return;
    const d = def.bodyBox();
    const overlap = box.x < d.x + d.w && box.x + box.w > d.x;
    const authoritative = !net || this.localSide === side;
    if (!overlap || def.state === 'air' || def.state === 'down' || def.state === 'grabVictim') {
      if (t >= m.st + m.ac && !atk.didHit) { atk.didHit = true; } // 헛잡기
      return;
    }
    if (!authoritative) return;
    atk.didHit = true;
    let dmg = Math.round(m.dmg * att.char.power * (att.char.throwBonus || 1));
    def.applyHit({ dmg, type: 'grab', fromX: att.x });
    sfx.throw();
    this.hitstop = 8; this.shake = 7;
    this.spark(def.x, def.centerY, 12, '#ff9f1c');
    this.dmgNum(def.x, def.y - 112, dmg, '#ff9f1c');
    this.say2('THROW!', side);
    if (net && this.localSide === side) net.sendHit({ dmg, type: 'grab' });
  }

  applyRemoteHit(h) {
    const def = this.local, att = this.remote;
    if (h.type === 'air') {
      def.applyHit({ dmg: h.dmg, push: h.push, type: 'hit', fromX: att.x, launchVy: h.launchVy });
      def.state = 'air'; def.vy = h.launchVy; def.onGround = false;
    } else {
      def.applyHit({ dmg: h.dmg, push: h.push, type: h.type, fromX: att.x, launchVy: h.launchVy, stun: h.stun });
    }
    this.dmgNum(def.x, def.y - 112, h.dmg, h.type === 'block' ? '#9fc4ff' : '#fff');
    if (h.type === 'launch' || h.type === 'screw') this.bumpCombo(this.localSide === 'p1' ? 'p2' : 'p1', h.dmg, h.type === 'screw');
    this.hitstop = 5; this.shake = 5;
    sfx.punch();
  }

  bumpCombo(side, dmg, screw) {
    const c = this.combo[side] || (this.combo[side] = { hits: 0, dmg: 0 });
    c.hits += 1; c.dmg += dmg;
    if (screw) c.screw = true;
  }

  say2(text, side) {
    this.floatText = { text, side, t: 0 };
  }

  endRound(dead1, dead2) {
    let winner = null;
    if (dead1 && dead2) winner = null;
    else if (dead1) winner = 'p2';
    else if (dead2) winner = 'p1';
    else winner = this.p1.hp === this.p2.hp ? null : (this.p1.hp > this.p2.hp ? 'p1' : 'p2');

    this.phase = 'ko';
    this.phaseT = 0;
    this.slowT = 46;
    this.flash = 7;
    this.timeScale = 1;
    if (this.demo) {
      setTimeout(() => {}, 0);
      this.demoReset = 90;
      sfx.ko();
      this.say(dead1 && dead2 ? 'DOUBLE K.O.!' : 'K.O.!', '', 80, 64);
      return;
    }
    if (this.time <= 0 && !dead1 && !dead2) {
      sfx.ko();
      this.say('TIME UP', '', 70, 52);
    } else {
      sfx.ko();
      this.say(dead1 && dead2 ? 'DOUBLE K.O.!' : 'K.O.!', '', 70, 64);
    }
    this.pendingWinner = winner;
    this.pendingPerfect = winner ? this[winner].hp >= this[winner].maxHp : false;
  }

  finishRound() {
    const winner = this.pendingWinner;
    if (winner) {
      this.wins[winner] += 1;
      if (this.pendingPerfect) {
        this.perfects[winner] += 1;
        this.say('PERFECT!', '', 60, 48);
      }
      this[winner].state = 'win';
      const loser = winner === 'p1' ? this.p2 : this.p1;
      if (loser.hp <= 0) loser.state = 'down';
      else loser.state = 'lose';
      this.onEvent('toast', { text: winner === this.localSide ? '🏆 라운드 승리!' : '💀 라운드 패배…' });
    } else {
      this.onEvent('toast', { text: '🤝 무승부!' });
    }
    const champ = this.wins.p1 >= CFG.WIN_ROUNDS ? 'p1' : this.wins.p2 >= CFG.WIN_ROUNDS ? 'p2' : null;
    if (champ) {
      this.phase = 'matchEnd';
      this.phaseT = 0;
      this[champ].state = 'win';
      sfx.win();
      this.onEvent('match', { winner: champ, wins: { ...this.wins } });
    } else {
      this.phase = 'roundEnd';
      this.phaseT = 0;
      this.onEvent('roundEnd', { winner, wins: { ...this.wins } });
    }
  }

  // ── 연습 더미 ──
  trainDummy(me, foe) {
    me.facing = foe.x >= me.x ? 1 : -1;
    const raw = { f: false, b: false, u: false, d: false };
    if (me.state === 'down' || me.attack || me.stun > 0 || me.state === 'air' || me.state === 'grabVictim') {
      me.update(raw, foe);
      return;
    }
    if (this.trainDummyMode === 'guard') raw.b = true;
    else if (this.trainDummyMode === 'crouch') { raw.b = true; raw.d = true; }
    me.update(raw, foe);
  }

  trainReset() {
    this.p1.resetRound(150, 1);
    this.p2.resetRound(330, -1);
    this.time = 99;
    this.phase = 'fight';
    this.phaseT = 0;
    this.combo = { p1: null, p2: null };
    this.particles.length = 0;
    this.dmgNums.length = 0;
    this.announce = null;
    this.trainResetT = 0;
  }

  // ── CPU ──
  cpu(me, foe) {
    this.cpuT += 1;
    if (this.phase !== 'fight' || this.announce) return;
    const dx = foe.x - me.x;
    me.facing = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    const raw = { f: false, b: false, u: false, d: false };
    const press = (b) => me.input.press(b);
    if (me.state === 'down') {
      if (me.downT === 8 && Math.random() < 0.7) press(Math.random() < 0.5 ? 3 : 4);
      me.update(raw, foe);
      return;
    }
    if (me.attack || me.stun > 0 || me.state === 'air' || me.state === 'grabVictim') {
      me.update(raw, foe);
      // 공중 콤보 추격
      if (foe.state === 'air' && !me.attack && me.onGround && dist < 70 && this.cpuT % 9 === 0) {
        press([1, 2, 4][Math.floor(Math.random() * 3)]);
      }
      return;
    }
    // 기상 어택 후 일어남은 자동
    if (dist > 120) {
      raw.f = true; // 접근
      if (Math.random() < 0.02) press(2); // 대시 중 ff+2 노림
    } else if (dist > 62) {
      const r = Math.random();
      if (r < 0.55) raw.f = true;
      else if (r < 0.62) { raw.f = true; raw.d = true; press(2); } // df+2 런처!
      else if (r < 0.68) { raw.u = true; press(4); } // 호프킥 시도(근접 공중)
      else if (r < 0.74) { raw.f = true; raw.d = true; press(1); } // df+1 찌르기
      else if (r < 0.8) raw.b = true;
      else if (r < 0.84) { raw.d = true; }
    } else {
      const r = Math.random();
      // 가드: 상대 공격 시작 시 1회 판정(35%) 후 유지 — 매틱 판정은 뚫을 수 없음
      const foeSeq = foe.attack ? foe.attack.seq : -1;
      if (foeSeq !== me._foeSeq) { me._foeSeq = foeSeq; me._guard = !!(foe.attack && Math.random() < 0.35); }
      if (me._guard && foe.attack) raw.b = true;
      else if (r < 0.3) press(1);
      else if (r < 0.45) { press(1); } // 1연타 → 연계는 버퍼로 자동? (CPU는 직접 2연타)
      else if (r < 0.55) press(2);
      else if (r < 0.62) { raw.d = true; press(4); } // 하단
      else if (r < 0.67 && dist < 44) { press(1); me.input.press(3); } // 잡기 시도
      else if (r < 0.72) { raw.f = true; raw.d = true; press(2); }
      else if (r < 0.78) raw.b = true;
      else if (r < 0.82) { raw.d = true; }
      else raw.b = Math.random() < 0.4;
    }
    if (me.rage && !me.rageUsed && dist < 150 && Math.random() < 0.03) {
      me.rageUsed = true;
      me.startMove('rage');
      sfx.rage();
    }
    // 1,1,2 연계: 공격 중이면 후속타 확률
    if (me.attack && me.attack.move.next && Math.random() < 0.5) {
      const nx = me.attack.move.next;
      const btn = Object.keys(nx)[0];
      if (me.attack.t >= me.attack.move.st) press(Number(btn));
    }
    me.update(raw, foe);
  }

  // ── 파티클 ──
  dmgNum(x, y, txt, color = '#fff') {
    this.dmgNums.push({ x, y, txt: String(txt), t: 0, color });
    if (this.dmgNums.length > 12) this.dmgNums.shift();
  }

  dust(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 22, y: y - Math.random() * 4,
        vx: (Math.random() - 0.5) * 1.6, vy: -0.4 - Math.random() * 0.8,
        life: 12 + Math.random() * 8, color: 'rgba(190,170,150,.8)', size: 1 + Math.random() * 2,
      });
    }
  }
  spark(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: 14 + Math.random() * 12, color, size: 1 + Math.random() * 2,
      });
    }
  }

  updateParticles() {
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 1;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.floatText) {
      this.floatText.t += 1;
      if (this.floatText.t > 50) this.floatText = null;
    }
    for (const d of this.dmgNums) { d.t += 1; d.y -= 0.55; }
    this.dmgNums = this.dmgNums.filter((d) => d.t < 42);
    if (this.flash > 0) this.flash -= 1;
    // 연습 모드 KO 후 자동 리셋
    if (this.trainResetT > 0) {
      this.trainResetT -= 1;
      if (this.trainResetT <= 0) this.trainReset();
    }
    // 어트랙트 리셋
    if (this.demoReset) {
      this.demoReset -= 1;
      if (this.demoReset <= 0) {
        this.demoReset = 0;
        this.p1.resetRound(150, 1);
        this.p2.resetRound(330, -1);
        this.time = CFG.ROUND_TIME;
        this.phase = 'fight';
      }
    }
    // KO 후 결과 확정 (슬로모 끝)
    if (this.phase === 'ko' && this.slowT <= 0 && !this.demo && this.phaseT > 60) {
      this.finishRound();
    }
  }

  // ── 렌더 ──
  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    this.drawStage(ctx);
    const s1 = this.sheets[this.p1.charId], s2 = this.sheets[this.p2.charId];
    if (s1 && s2) {
      // 뒤에 있는(위쪽 y?) — 같은 지면이므로 p2 먼저
      this.p2.draw(ctx, s2.img, s2.meta);
      this.p1.draw(ctx, s1.img, s1.meta);
    }
    // 파티클
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 12);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.drawDmgNums(ctx);
    this.drawCombo(ctx);
    this.drawAnnounce(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(this.flash / 7 * 0.4).toFixed(2)})`;
      ctx.fillRect(-10, -10, CFG.W + 20, CFG.H + 20);
    }
    // 착지/대시 먼지
    for (const f of [this.p1, this.p2]) {
      if (f.onGround && !f._wasG) this.dust(f.x, CFG.GROUND_Y, 6);
      if ((f.state === 'dash' || f.state === 'backdash') && f.stateT % 6 === 0) this.dust(f.x, CFG.GROUND_Y, 2);
      f._wasG = f.onGround;
    }
    ctx.restore();
  }

  drawDmgNums(ctx) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    for (const d of this.dmgNums) {
      ctx.globalAlpha = Math.min(1, (42 - d.t) / 14);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(d.txt, Math.round(d.x), Math.round(d.y));
      ctx.fillStyle = d.color;
      ctx.fillText(d.txt, Math.round(d.x), Math.round(d.y));
    }
    ctx.globalAlpha = 1;
  }

  drawStage(ctx) {
    const W = CFG.W, H = CFG.H, GY = CFG.GROUND_Y;
    // 석양 하늘
    const g = ctx.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, '#2a1a4e');
    g.addColorStop(0.45, '#8e2f5c');
    g.addColorStop(0.75, '#e8703a');
    g.addColorStop(1, '#f7b733');
    ctx.fillStyle = g;
    ctx.fillRect(-8, -8, W + 16, GY + 8);
    // 태양
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(240, 168, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,233,168,.25)';
    ctx.beginPath(); ctx.arc(240, 168, 40, 0, Math.PI * 2); ctx.fill();
    // 오층탑 실루엣
    ctx.fillStyle = '#3a2044';
    const pagoda = (x, s) => {
      for (let i = 0; i < 4; i++) {
        const w = (44 - i * 8) * s, y = 150 - i * 22 * s;
        ctx.fillRect(x - w / 2, y, w, 5 * s);
        ctx.fillRect(x - w / 4, y + 5 * s, w / 2, 12 * s);
      }
    };
    pagoda(70, 1); pagoda(415, 1.25); pagoda(330, 0.7);
    // 산 실루엣
    ctx.fillStyle = '#4a2a52';
    ctx.beginPath();
    ctx.moveTo(-8, GY);
    for (let x = -8; x <= W + 8; x += 32) ctx.lineTo(x, 196 - Math.abs(Math.sin(x * 0.05)) * 26);
    ctx.lineTo(W + 8, GY); ctx.closePath(); ctx.fill();
    // 바닥 (석판)
    ctx.fillStyle = '#5c4a3a';
    ctx.fillRect(-8, GY, W + 16, H - GY + 8);
    ctx.fillStyle = '#6e5a46';
    ctx.fillRect(-8, GY, W + 16, 6);
    // 석판 격자 (원근)
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * W;
      ctx.beginPath(); ctx.moveTo(240 + (x - 240) * 0.4, GY + 6); ctx.lineTo(x, H + 8); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const y = GY + 6 + (i / 4) * (H - GY);
      ctx.beginPath(); ctx.moveTo(-8, y); ctx.lineTo(W + 8, y); ctx.stroke();
    }
    // 횃불
    const flick = 0.7 + 0.3 * Math.sin(Date.now() / 90);
    for (const x of [26, 454]) {
      ctx.fillStyle = '#3a2a20';
      ctx.fillRect(x - 2, GY - 46, 4, 46);
      ctx.fillStyle = `rgba(255,${140 + Math.round(60 * flick)},40,.9)`;
      ctx.beginPath(); ctx.arc(x, GY - 52, 5 * flick + 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawCombo(ctx) {
    const draw = (f, side, align) => {
      const c = this.combo[side];
      if (!c || c.hits < 2) return;
      const x = align === 'left' ? 26 : CFG.W - 26;
      ctx.textAlign = align;
      ctx.font = 'italic 900 22px Georgia, serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#400';
      const y = 96;
      ctx.strokeText(`${c.hits} HITS`, x, y);
      ctx.fillStyle = '#ff3b30';
      ctx.fillText(`${c.hits} HITS`, x, y);
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(`${c.dmg} dmg`, x, y + 14);
    };
    draw(this.p1, 'p1', 'left');
    draw(this.p2, 'p2', 'right');
    if (this.floatText) {
      const f = this.floatText.side === 'p1' ? this.p1 : this.p2;
      ctx.textAlign = 'center';
      ctx.font = 'italic 900 16px Georgia, serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(this.floatText.text, f.x, f.y - 116 - this.floatText.t * 0.3);
      ctx.fillStyle = '#ffe45e';
      ctx.fillText(this.floatText.text, f.x, f.y - 116 - this.floatText.t * 0.3);
    }
  }

  drawAnnounce(ctx) {
    if (!this.announce) return;
    const a = this.announce;
    const p = a.t / a.dur;
    const scale = p < 0.15 ? 0.5 + (p / 0.15) * 0.5 : 1;
    ctx.save();
    ctx.translate(CFG.W / 2, CFG.H / 2 - 20);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = `italic 900 ${a.size}px Georgia, serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1a0000';
    ctx.strokeText(a.text, 0, 0);
    const grad = ctx.createLinearGradient(0, -a.size, 0, 0);
    grad.addColorStop(0, '#fff8e0');
    grad.addColorStop(0.5, '#ffd75e');
    grad.addColorStop(1, '#ff5a2a');
    ctx.fillStyle = grad;
    ctx.fillText(a.text, 0, 0);
    if (a.sub) {
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(a.sub, 0, 22);
    }
    ctx.restore();
  }
}
