import mqtt from 'mqtt';

// 방 코드 6자리 (헷갈리는 문자 제외)
export function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const TOPIC_ROOT = 'tekken-p2p-v1';

// 공개 MQTT 브로커 (가입 불필요, 순서대로 접속 시도)
const BROKERS = [
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://test.mosquitto.org:8081/mqtt' },
];

// 게임 데이터를 브로커 경유로 직접 주고받음 (WebRTC 없음 → NAT/방화벽 무관).
// 인터페이스: createNet과 동일 (sendState/Action/Hit/Hello/Sys + 콜백).
// - presence: hello + state가 곧 하트비트. 8초 침묵한 상대는 나간 것으로 처리.
// - 송신은 QoS 0 (빠른 대신 간혹 유실 — 상태 20Hz 재전송으로 커버).
export function createNet({ code, onPeerJoin, onPeerLeave, onState, onAction, onHit, onHello, onSys, onDown }) {
  const id = Math.random().toString(36).slice(2, 10);
  const base = `${TOPIC_ROOT}/${code}`;
  const route = { st: onState, ac: onAction, hit: onHit, hi: onHello, sys: onSys };
  const peers = new Map(); // peerId -> lastSeen
  let client = null;
  let dead = false;
  let sweep = 0;

  const seen = (pid) => {
    if (pid === id || dead) return;
    const isNew = !peers.has(pid);
    peers.set(pid, performance.now());
    if (isNew) {
      try { onPeerJoin?.(pid); } catch { /* noop */ }
    }
  };

  const onMsg = (topic, payload) => {
    if (dead) return;
    let msg;
    try { msg = JSON.parse(payload.toString()); } catch { return; }
    if (!msg || msg.from === id) return;
    const ch = topic.slice(base.length + 1);
    seen(msg.from);
    try { route[ch]?.(msg.body); } catch { /* noop */ }
  };

  const tryOne = (b) => new Promise((resolve, reject) => {
    let done = false;
    const c = mqtt.connect(b.url, {
      username: b.username, password: b.password,
      connectTimeout: 8000, reconnectPeriod: 3000, keepalive: 20,
      clientId: `tk_${id}`, clean: true,
    });
    const to = setTimeout(() => { if (!done) { done = true; try { c.end(true); } catch { /* noop */ } reject(new Error('timeout')); } }, 9000);
    c.once('connect', () => { if (!done) { done = true; clearTimeout(to); resolve(c); } });
    c.once('error', (e) => { if (!done) { done = true; clearTimeout(to); try { c.end(true); } catch { /* noop */ } reject(e); } });
  });

  (async () => {
    for (const b of BROKERS) {
      if (dead) return;
      try {
        client = await tryOne(b);
        break;
      } catch { client = null; }
    }
    if (dead) { if (client) { try { client.end(true); } catch { /* noop */ } } return; }
    if (!client) {
      try { onDown?.(); } catch { /* noop */ }
      return;
    }
    client.on('message', onMsg);
    client.on('error', () => {});
    client.subscribe(`${base}/+`, { qos: 0 });
    sweep = setInterval(() => {
      if (dead) return;
      const now = performance.now();
      for (const [pid, t] of peers) {
        if (now - t > 8000) {
          peers.delete(pid);
          try { onPeerLeave?.(pid); } catch { /* noop */ }
        }
      }
    }, 2000);
  })();

  const send = (ch, body) => {
    if (dead || !client || !client.connected) return;
    try { client.publish(`${base}/${ch}`, JSON.stringify({ from: id, body }), { qos: 0 }); } catch { /* noop */ }
  };

  return {
    sendState: (snap) => send('st', snap),
    sendAction: (a) => send('ac', a),
    sendHit: (h) => send('hit', h),
    sendHello: (h) => send('hi', h),
    sendSys: (s) => send('sys', s),
    leave: () => {
      dead = true;
      if (sweep) clearInterval(sweep);
      if (client) { try { client.end(true); } catch { /* noop */ } client = null; }
    },
  };
}
