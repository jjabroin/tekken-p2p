import { CFG } from './game/config.js';
import { Game } from './game/engine.js';
import { createNet, makeCode } from './net/p2p.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

function toast(text, ms = 1800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

let game = new Game(canvas, { onEvent });
let mode = 'menu'; // menu|solo|p2p
let net = null;
let roomCode = null;
let isHost = false;
let nick = 'P1';
let lastSync = 0;

function onEvent(type, data) {
  if (type === 'toast') toast(data.text);
  if (type === 'round') { $('round').textContent = `ROUND ${data.round} · 먼저 ${CFG.WIN_ROUNDS}승`; }
  if (type === 'match') {
    toast(data.winner === game.localSide ? '🎉 매치 승리!' : '😭 매치 패배…', 3000);
  }
  if (type === 'action' && net) {
    net.sendAction(data); // { kind, seq }
  }
}

// ---------- 입력 ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (mode === 'menu') return;
  if (e.code === 'KeyJ') game.localAttack('punch');
  if (e.code === 'KeyK') game.localAttack('kick');
  if (e.code === 'KeyL') {
    if (game.local.meter < 100) toast('게이지가 부족해요! (100% 필요)');
    else game.localAttack('special');
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

function readLocalInput() {
  return {
    left: !!(keys.KeyA || keys.ArrowLeft || touch.left),
    right: !!(keys.KeyD || keys.ArrowRight || touch.right),
    jump: !!keys.KeyW || !!keys.ArrowUp || !!touch.jump,
    block: !!(keys.KeyS || keys.ArrowDown || touch.guard),
  };
}
// 점프는 엣지 트리거 (꾹 누르면 연속 점프 방지)
let prevJump = false;

const touch = { left: false, right: false, jump: false, guard: false };
function bindHold(id, key) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); touch[key] = true; };
  const off = (e) => { e.preventDefault(); touch[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindHold('tLeft', 'left');
bindHold('tRight', 'right');
bindHold('tGuard', 'guard');
bindHold('tJump', 'jump');
$('tPunch').addEventListener('pointerdown', (e) => { e.preventDefault(); game.localAttack('punch'); });
$('tKick').addEventListener('pointerdown', (e) => { e.preventDefault(); game.localAttack('kick'); });

// ---------- 메뉴 ----------
$('btnSolo').onclick = () => {
  nick = $('nick').value.trim() || '나';
  startSolo();
};
$('btnCreate').onclick = () => {
  nick = $('nick').value.trim() || '호스트';
  roomCode = makeCode();
  isHost = true;
  startP2P(roomCode, true);
};
$('btnJoin').onclick = () => {
  nick = $('nick').value.trim() || '게스트';
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 6) return toast('6자리 방 코드를 입력하세요');
  roomCode = code;
  isHost = false;
  startP2P(roomCode, false);
};

function showGameUI() {
  $('menu').classList.add('hidden');
  $('hud').classList.add('visible');
  $('name1').textContent = game.p1.name;
  $('name2').textContent = game.p2.name;
}

function startSolo() {
  mode = 'solo';
  game = new Game(canvas, { p1Name: nick, p2Name: 'CPU', onEvent });
  game.setLocalSide('p1');
  showGameUI();
  toast('CPU와 대결! J: 펀치, K: 킥, L: 필살기');
  loop();
}

function startP2P(code, host) {
  mode = 'p2p';
  const p1Name = host ? nick : '상대';
  const p2Name = host ? '상대' : nick;
  game = new Game(canvas, { p1Name, p2Name, onEvent });
  game.setLocalSide(host ? 'p1' : 'p2');
  showGameUI();
  $('roomPill').style.display = 'block';
  $('roomCode').textContent = code;
  $('roomPill').onclick = () => {
    navigator.clipboard?.writeText(code).then(() => toast('방 코드 복사됨! 친구에게 공유하세요'));
  };

  net = createNet({
    code,
    onPeerJoin: (id) => {
      toast('👋 상대가 입장했습니다!');
      // 호스트가 이름 전달 → 양쪽 이름 확정
      net.sendHello({ nick, host });
    },
    onPeerLeave: () => toast('상대가 나갔습니다'),
    onHello: (h) => {
      if (host) {
        // 호스트: p2 이름 = 상대 닉
        game.p2.name = h.nick || '상대';
      } else {
        // 게스트: p1 이름 = 상대 닉, 내 이름 p2에
        game.p1.name = h.nick || '상대';
        game.p2.name = nick;
        // 게스트도 자기 닉 회신
        net.sendHello({ nick, host: false });
      }
      $('name1').textContent = game.p1.name;
      $('name2').textContent = game.p2.name;
    },
    onState: (snap) => game.applyRemoteSnapshot(snap),
    onAction: (a) => game.applyRemoteAction(a),
    onHit: (h) => {
      // 상대(공격자)가 판정한 데미지만 적용
      game.applyRemoteHit(h);
    },
  });

  // 호스트도 자기 닉 브로드캐스트 (게스트가 나중에 들어와도 받도록 주기적 hello는 생략, join 이벤트로 충분)
  setTimeout(() => host && net && net.sendHello({ nick, host: true }), 1500);

  toast(host ? `방 생성됨! 코드 ${code}를 공유하세요` : `방 ${code}에 연결 중…`);
  loop();
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
  acc += dt;

  const input = readLocalInput();
  // 점프 엣지 처리
  const jumpEdge = input.jump && !prevJump;
  prevJump = input.jump;
  const edgeInput = { ...input, jump: jumpEdge };

  while (acc >= 1 / 60) {
    game.step(edgeInput, 1, net);
    acc -= 1 / 60;
  }

  // 상태 동기화 (20Hz)
  if (net && now - lastSync > 1000 / CFG.SYNC_HZ) {
    lastSync = now;
    net.sendState(game.local.snapshot());
  }

  // HUD
  $('hp1').style.width = `${game.p1.hp}%`;
  $('hp2').style.width = `${game.p2.hp}%`;
  $('timer').textContent = Math.max(0, Math.ceil(game.time));
  const r = game.round;
  if ($('round').textContent.startsWith('ROUND')) {
    $('round').textContent = `ROUND ${r} · 먼저 ${CFG.WIN_ROUNDS}승 · ${game.wins.p1}:${game.wins.p2}`;
  }
}
