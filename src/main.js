import { CFG } from './game/config.js';
import { CHARS } from './game/characters.js';
import { Game } from './game/engine.js';
import { createNet, makeCode } from './net/p2p.js';
import { sfx } from './game/audio.js';

Game.setChars(CHARS);

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ---------- 에셋 로딩 ----------
const sheets = {};
const portraits = [];
let atlasMeta = null;

async function loadAssets() {
  const meta = await (await fetch('./assets/chars/atlas.json')).json();
  atlasMeta = meta;
  for (let i = 0; i < 8; i++) {
    const img = new Image();
    img.src = `./assets/chars/char${i}.png`;
    await img.decode();
    sheets[i] = { img, meta };
    const p = new Image();
    p.src = `./assets/chars/portraits/portrait${i}.png`;
    await p.decode();
    portraits.push(p);
  }
}

// ---------- 상태 ----------
let screen = 'boot'; // boot|title|menu|select|vs|fight|result
let game = null;
let mode = 'menu'; // solo|p2p
let net = null;
let roomCode = null;
let isHost = false;
let nick = 'P1';
let lastSync = 0;
let mySide = 'p1';

// 셀렉트 상태
let sel = null;
function newSelect() {
  sel = {
    cursor: { p1: 0, p2: 1 },
    locked: { p1: false, p2: false },
    charId: { p1: 0, p2: 1 },
    t: 20 * 60,
    helloT: 0,
  };
}

// ---------- 유틸 ----------
function toast(text, ms = 1800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function onEvent(type, data) {
  if (type === 'toast') toast(data.text);
  if (type === 'round') {
    $('round').textContent = `ROUND ${data.round} · 먼저 ${CFG.WIN_ROUNDS}승`;
    updatePips();
  }
  if (type === 'match') {
    setTimeout(() => { if (screen === 'fight') showResult(data.winner); }, 900);
  }
  if (type === 'roundEnd') updatePips();
}

function updatePips() {
  if (!game) return;
  const pip = (w) => '●'.repeat(w) + '○'.repeat(Math.max(0, CFG.WIN_ROUNDS - w));
  $('pips1').textContent = pip(game.wins.p1);
  $('pips2').textContent = pip(game.wins.p2);
}

// ---------- 입력 ----------
const keys = {};
const touch = { left: false, right: false, up: false, down: false };

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  handleKey(e.code);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

function myFighter() {
  return game ? game[mySide] : null;
}

// 상대 기준 방향으로 변환
function readRaw() {
  const f = myFighter();
  const facing = f ? f.facing : 1;
  const left = !!(keys.KeyA || keys.ArrowLeft || touch.left);
  const right = !!(keys.KeyD || keys.ArrowRight || touch.right);
  // facing 기준 f/b
  const fwd = facing === 1 ? right : left;
  const back = facing === 1 ? left : right;
  return {
    f: fwd, b: back,
    u: !!(keys.KeyW || keys.ArrowUp || touch.up),
    d: !!(keys.KeyS || keys.ArrowDown || touch.down),
  };
}

function handleKey(code) {
  if (screen === 'title') {
    toMenu();
    return;
  }
  if (screen === 'select') {
    const me = mySide;
    if (sel.locked[me]) {
      if (code === 'KeyK') { sel.locked[me] = false; sfx.cancel(); broadcastHello(); }
      return;
    }
    if (code === 'KeyA' || code === 'ArrowLeft') { sel.cursor[me] = (sel.cursor[me] + 7) % 8; sfx.select(); broadcastHello(); }
    if (code === 'KeyD' || code === 'ArrowRight') { sel.cursor[me] = (sel.cursor[me] + 1) % 8; sfx.select(); broadcastHello(); }
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'KeyS' || code === 'ArrowDown') {
      sel.cursor[me] = (sel.cursor[me] + 4) % 8; sfx.select(); broadcastHello();
    }
    if (code === 'KeyJ') {
      sel.locked[me] = true;
      sel.charId[me] = sel.cursor[me];
      sfx.confirm();
      broadcastHello();
      checkSelectDone();
    }
    return;
  }
  if (screen === 'fight' && game) {
    if (code === 'KeyJ') game.localAttack(1);
    if (code === 'KeyK') game.localAttack(2);
    if (code === 'KeyU') game.localAttack(3);
    if (code === 'KeyI') game.localAttack(4);
    if (code === 'KeyR') game.rageArt();
    return;
  }
  if (screen === 'result') {
    if (code === 'KeyR') wantRematch();
    if (code === 'KeyC') toSelect(true);
    if (code === 'KeyM' || code === 'Escape') toMenu();
  }
}

// 터치 바인딩
function bindHold(id, key) {
  const el = $(id);
  if (!el) return;
  const on = (e) => { e.preventDefault(); touch[key] = true; };
  const off = (e) => { e.preventDefault(); touch[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
function bindBtn(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
}

// ---------- 화면 전환 ----------
function showOnly(id) {
  for (const m of ['menu', 'hud', 'roomPill', 'resultBar']) $(m).style.display = 'none';
  if (id) $(id).style.display = id === 'hud' ? 'block' : '';
}

function startDemo() {
  game = new Game(canvas, {
    sheets, demo: true, onEvent: () => {},
    p1: { name: 'KAZUMA', charId: Math.floor(Math.random() * 8) },
    p2: { name: 'PAULO', charId: Math.floor(Math.random() * 8) },
  });
  game.cpuP1 = true; game.cpuP2 = true;
  screen = 'title';
  showOnly(null);
}

function toMenu() {
  if (net) { try { net.leave(); } catch {} net = null; }
  screen = 'menu';
  $('menu').style.display = 'flex';
  $('hud').style.display = 'none';
  $('roomPill').style.display = 'none';
  $('resultBar').style.display = 'none';
}

function startSolo() {
  mode = 'solo';
  mySide = 'p1';
  newSelect();
  screen = 'select';
  showOnly(null);
}

function startP2P(code, host) {
  mode = 'p2p';
  isHost = host;
  mySide = host ? 'p1' : 'p2';
  newSelect();
  net = createNet({
    code,
    onPeerJoin: () => { toast('👋 상대가 입장했습니다!'); broadcastHello(); },
    onPeerLeave: () => toast('상대가 나갔습니다'),
    onHello: (h) => {
      const foe = mySide === 'p1' ? 'p2' : 'p1';
      if (typeof h.cursor === 'number') sel.cursor[foe] = h.cursor;
      if (typeof h.charId === 'number') sel.charId[foe] = h.charId;
      if (typeof h.locked === 'boolean') sel.locked[foe] = h.locked;
      if (h.nick) sel['nick_' + foe] = h.nick;
      checkSelectDone();
    },
    onState: (snap) => game && screen === 'fight' && game.applyRemoteSnapshot(snap),
    onAction: (a) => game && screen === 'fight' && game.applyRemoteAction(a),
    onHit: (h) => game && screen === 'fight' && game.applyRemoteHit(h),
    onSys: (s) => {
      if (s.t === 'rematch') { remoteRematch = true; checkRematch(); }
      if (s.t === 'toSelect') toSelect(false);
    },
  });
  screen = 'select';
  showOnly(null);
  $('roomPill').style.display = 'block';
  $('roomCode').textContent = code;
  $('roomPill').onclick = () => {
    navigator.clipboard?.writeText(code).then(() => toast('방 코드 복사됨!'));
  };
  toast(host ? `방 생성! 코드 ${code}를 공유하세요` : `방 ${code}에 연결 중…`);
}

function broadcastHello() {
  if (!net || !sel || screen !== 'select') return;
  net.sendHello({ nick, cursor: sel.cursor[mySide], charId: sel.cursor[mySide], locked: sel.locked[mySide] });
}

function checkSelectDone() {
  if (screen !== 'select' || !sel) return;
  if (mode === 'solo') {
    if (sel.locked.p1) {
      sel.charId.p2 = (sel.charId.p1 + 1 + Math.floor(Math.random() * 7)) % 8;
      sel['nick_p2'] = 'CPU';
      startVs();
    }
    return;
  }
  if (sel.locked.p1 && sel.locked.p2 && sel.t < 20 * 60 - 30) startVs();
}

function startVs() {
  screen = 'vs';
  sel.vsT = 0;
  sfx.confirm();
}

function startFight() {
  const p1 = { name: mode === 'solo' ? nick : (mySide === 'p1' ? nick : (sel.nick_p1 || '상대')), charId: sel.charId.p1 };
  const p2 = { name: mode === 'solo' ? 'CPU' : (mySide === 'p2' ? nick : (sel.nick_p2 || '상대')), charId: sel.charId.p2 };
  game = new Game(canvas, { sheets, onEvent, p1, p2 });
  game.setLocalSide(mySide);
  if (mode === 'solo') game.cpuP2 = true;
  $('menu').style.display = 'none';
  $('hud').style.display = 'block';
  $('name1').textContent = `${CHARS[p1.charId].name}`;
  $('name2').textContent = `${CHARS[p2.charId].name}`;
  $('sub1').textContent = p1.name;
  $('sub2').textContent = p2.name;
  updatePips();
  screen = 'fight';
  loop();
}

function showResult(winner) {
  screen = 'result';
  localRematch = false; remoteRematch = false;
  const el = $('resultBar');
  el.style.display = 'block';
  const mine = winner === mySide;
  $('resultTitle').textContent = !winner ? 'DRAW' : mine ? 'YOU WIN' : 'YOU LOSE';
  $('resultTitle').style.color = !winner ? '#ccc' : mine ? '#ffd75e' : '#ff5a5a';
  $('resultSub').textContent = mode === 'solo'
    ? 'R 다시대전 · C 캐릭터선택 · M 메뉴'
    : 'R 다시대전(둘 다) · C 캐릭터선택 · M 메뉴';
}

let localRematch = false, remoteRematch = false;
function wantRematch() {
  localRematch = true;
  if (mode === 'solo') return doRematch();
  if (net) net.sendSys({ t: 'rematch' });
  $('resultSub').textContent = '상대 대기 중…';
  checkRematch();
}
function checkRematch() {
  if (localRematch && remoteRematch && screen === 'result') doRematch();
}
function doRematch() {
  $('resultBar').style.display = 'none';
  game.resetMatch(
    { name: game.p1.name, charId: game.p1.charId },
    { name: game.p2.name, charId: game.p2.charId },
  );
  game.setLocalSide(mySide);
  if (mode === 'solo') game.cpuP2 = true;
  updatePips();
  screen = 'fight';
}

function toSelect(fromResult) {
  if (mode === 'p2p' && net && fromResult) net.sendSys({ t: 'toSelect' });
  $('resultBar').style.display = 'none';
  newSelect();
  // 닉 유지
  screen = 'select';
}

// ---------- 메뉴 버튼 ----------
$('btnSolo').onclick = () => { nick = $('nick').value.trim() || '나'; startSolo(); };
$('btnCreate').onclick = () => {
  nick = $('nick').value.trim() || '호스트';
  roomCode = makeCode();
  startP2P(roomCode, true);
};
$('btnJoin').onclick = () => {
  nick = $('nick').value.trim() || '게스트';
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 6) return toast('6자리 방 코드를 입력하세요');
  startP2P(code, false);
};
$('roomPill').onclick = () => {
  if (roomCode) navigator.clipboard?.writeText(roomCode).then(() => toast('방 코드 복사됨!'));
};

bindHold('tLeft', 'left');
bindHold('tRight', 'right');
bindHold('tDown', 'down');
bindHold('tUp', 'up');
bindBtn('t1', () => btnPress(1));
bindBtn('t2', () => btnPress(2));
bindBtn('t3', () => btnPress(3));
bindBtn('t4', () => btnPress(4));
bindBtn('tRage', () => { if (screen === 'fight' && game) game.rageArt(); });
bindBtn('tSelL', () => handleKey(screen === 'select' ? 'KeyA' : ''));
bindBtn('tSelR', () => handleKey(screen === 'select' ? 'KeyD' : ''));

function btnPress(b) {
  if (screen === 'select') { handleKey('KeyJ'); return; }
  if (screen === 'fight' && game) game.localAttack(b);
  if (screen === 'title') toMenu();
  if (screen === 'result' && b === 1) wantRematch();
}

// ---------- 셀렉트/타이틀/VS 렌더 ----------
function drawTitle() {
  // 데모 대전 렌더
  game.step({}, null);
  ctx.fillStyle = 'rgba(5,0,10,.55)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  ctx.textAlign = 'center';
  // 로고
  ctx.font = 'italic 900 52px Georgia, serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#100';
  const y = 108;
  ctx.strokeText('IRON FIST', CFG.W / 2, y);
  ctx.strokeText('P2P', CFG.W / 2, y + 52);
  const grad = ctx.createLinearGradient(0, y - 44, 0, y + 56);
  grad.addColorStop(0, '#fff8e0');
  grad.addColorStop(0.5, '#ffd75e');
  grad.addColorStop(0.55, '#c02020');
  grad.addColorStop(1, '#701010');
  ctx.fillStyle = grad;
  ctx.fillText('IRON FIST', CFG.W / 2, y);
  ctx.fillText('P2P', CFG.W / 2, y + 52);
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#ff9f1c';
  ctx.fillText('— TEKKEN-STYLE DOT FIGHTER —', CFG.W / 2, y + 74);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('PRESS ANY KEY', CFG.W / 2, 218);
  }
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText('1=LP 2=RP 3=LK 4=RK · BACK TO BLOCK · CC0 SPRITES', CFG.W / 2, 244);
}

function drawSelect() {
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  ctx.textAlign = 'center';
  ctx.font = 'italic 900 26px Georgia, serif';
  ctx.fillStyle = '#ffd75e';
  ctx.fillText(mode === 'solo' ? 'SELECT YOUR FIGHTER' : `SELECT (ROOM ${roomCode || ''})`, CFG.W / 2, 30);
  // 타이머
  const t = Math.ceil(sel.t / 60);
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = t <= 5 ? '#ff5a5a' : '#fff';
  ctx.fillText(`${t}`, CFG.W / 2, 48);

  // 초상화 그리드 4x2 (80x72)
  const cw = 104, pw = 80, ph = 72, x0 = (CFG.W - cw * 4) / 2, y0 = 56, rowH = 82;
  for (let i = 0; i < 8; i++) {
    const cx = x0 + (i % 4) * cw, cy = y0 + Math.floor(i / 4) * rowH;
    ctx.drawImage(portraits[i], cx + (cw - pw) / 2, cy, pw, ph);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(CHARS[i].name, cx + cw / 2, cy + ph + 6);
  }
  // 커서
  const drawCursor = (side, color) => {
    const i = sel.cursor[side];
    const cx = x0 + (i % 4) * cw, cy = y0 + Math.floor(i / 4) * rowH;
    ctx.strokeStyle = color;
    ctx.lineWidth = sel.locked[side] ? 5 : 3;
    if (!sel.locked[side] && Math.floor(performance.now() / 250) % 2 === 0) return;
    ctx.strokeRect(cx + 2, cy - 2, cw - 4, ph + 4);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = color;
    ctx.fillText(side.toUpperCase(), cx + cw / 2, cy - 6);
  };
  drawCursor('p1', '#4da6ff');
  if (mode === 'p2p') drawCursor('p2', '#ff5a5a');

  // 선택 캐릭터 정보 (내 커서)
  const me = sel.cursor[mySide];
  const c = CHARS[me];
  ctx.textAlign = 'left';
  ctx.font = 'italic 900 20px Georgia, serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(c.name, 24, 244);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#ff9f1c';
  ctx.fillText(`${c.style} · ${c.desc}`, 24, 258);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ccc';
  ctx.fillText('주요기: ' + c.key.join(' / '), CFG.W - 24, 244);
  ctx.fillStyle = '#888';
  ctx.fillText(mode === 'solo' ? 'A/D 선택 · J 결정' : 'A/D 선택 · J 결정 · K 해제', CFG.W - 24, 258);
  ctx.textAlign = 'center';
}

function drawVs() {
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  const a = CHARS[sel.charId.p1], b = CHARS[sel.charId.p2];
  ctx.drawImage(portraits[sel.charId.p1], 40, 60, 176, 160);
  ctx.drawImage(portraits[sel.charId.p2], CFG.W - 216, 60, 176, 160);
  ctx.textAlign = 'center';
  ctx.font = 'italic 900 22px Georgia, serif';
  ctx.fillStyle = '#4da6ff';
  ctx.fillText(a.name, 128, 48);
  ctx.fillStyle = '#ff5a5a';
  ctx.fillText(b.name, CFG.W - 128, 48);
  ctx.font = 'italic 900 54px Georgia, serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#100';
  ctx.strokeText('VS', CFG.W / 2, 150);
  ctx.fillStyle = '#ffd75e';
  ctx.fillText('VS', CFG.W / 2, 150);
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#ccc';
  ctx.fillText('STONE DOJO — SUNSET · FIRST TO 2', CFG.W / 2, 246);
}

// ---------- 메인 루프 ----------
let last = performance.now();
let acc = 0;
let started = false;

function loop() {
  if (started) return;
  started = true;
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  if (screen === 'title') { drawTitle(); return; }
  if (screen === 'menu') { if (game) game.step({}, null); drawMenuBg(); return; }
  if (screen === 'select') {
    sel.t -= 1;
    sel.helloT -= 1;
    if (sel.helloT <= 0) { sel.helloT = 30; broadcastHello(); }
    if (sel.t <= 0 && !sel.locked[mySide]) {
      sel.cursor[mySide] = Math.floor(Math.random() * 8);
      sel.locked[mySide] = true;
      sel.charId[mySide] = sel.cursor[mySide];
      broadcastHello();
      checkSelectDone();
    }
    drawSelect();
    return;
  }
  if (screen === 'vs') {
    sel.vsT += 1;
    drawVs();
    if (sel.vsT > 150) startFight();
    return;
  }
  if (screen === 'result') {
    // 배경 대전은 멈추고 마지막 프레임 유지 + 결과 바는 DOM
    return;
  }

  // fight
  acc += dt;
  const raw = readRaw();
  while (acc >= 1 / 60) {
    game.step(raw, net);
    acc -= 1 / 60;
  }
  if (net) {
    if (now - lastSync > 1000 / CFG.SYNC_HZ) {
      lastSync = now;
      net.sendState(game.local.snapshot());
    }
    // 액션 전송: attack 시작 감지 (seq 변화)
    const l = game.local;
    if (l.attack && !l.attack.sent) {
      l.attack.sent = true;
      net.sendAction({ move: l.attack.id, seq: l.attack.seq });
    }
  }
  // HUD
  $('hp1').style.width = `${(100 * game.p1.hp / game.p1.maxHp).toFixed(1)}%`;
  $('hp2').style.width = `${(100 * game.p2.hp / game.p2.maxHp).toFixed(1)}%`;
  $('timer').textContent = Math.max(0, Math.ceil(game.time));
  $('round').textContent = `ROUND ${game.round} · 먼저 ${CFG.WIN_ROUNDS}승`;
  $('rage1').style.visibility = game.p1.rage && game.p1.hp > 0 ? 'visible' : 'hidden';
  $('rage2').style.visibility = game.p2.rage && game.p2.hp > 0 ? 'visible' : 'hidden';
}

function drawMenuBg() {
  ctx.fillStyle = 'rgba(5,0,10,.72)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
}

// ---------- 부트 ----------
(async () => {
  try {
    await loadAssets();
  } catch (e) {
    toast('스프라이트 로드 실패: ' + e.message);
    return;
  }
  // 터치 셀렉트 버튼
  if (isTouch) {
    $('touchSel').style.display = 'flex';
  }
  startDemo();
  loop();
})();
// E2E 확인용 현재 화면 노출
Object.defineProperty(window, '__screen', { get: () => screen });
Object.defineProperty(window, '__game', { get: () => game });
