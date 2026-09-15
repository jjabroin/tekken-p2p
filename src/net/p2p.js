import { joinRoom } from '@trystero-p2p/torrent';

// 방 코드 6자리 (헷갈리는 문자 제외)
export function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const APP_ID = 'tekken-p2p-v2';

// Trystero v0.25 API:
// - makeAction()은 { send, onMessage } 객체 반환 (구 튜플 아님)
// - onPeerJoin/onPeerLeave는 setter 프로퍼티 (메서드 아님)
// - send()는 promise 반환 → catch 필수
// - rtcConfig: STUN + 무료 TURN(OpenRelay)으로 NAT 통과율 확보 (모바일망 대응)
export function createNet({ code, onPeerJoin, onPeerLeave, onState, onAction, onHit, onHello, onSys }) {
  const room = joinRoom({
    appId: APP_ID,
    rtcConfig: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    },
  }, code);

  const st = room.makeAction('st');
  const ac = room.makeAction('ac');
  const hit = room.makeAction('hit');
  const hi = room.makeAction('hi');
  const sys = room.makeAction('sys');

  st.onMessage = (data) => onState?.(data);
  ac.onMessage = (data) => onAction?.(data);
  hit.onMessage = (data) => onHit?.(data);
  hi.onMessage = (data) => onHello?.(data);
  sys.onMessage = (data) => onSys?.(data);

  room.onPeerJoin = (peerId) => onPeerJoin?.(peerId);
  room.onPeerLeave = (peerId) => onPeerLeave?.(peerId);

  const safe = (a, d) => { try { a.send(d)?.catch?.(() => {}); } catch { /* noop */ } };

  return {
    room,
    sendState: (snap) => safe(st, snap),
    sendAction: (a) => safe(ac, a),
    sendHit: (h) => safe(hit, h),
    sendHello: (h) => safe(hi, h),
    sendSys: (s) => safe(sys, s),
    leave: () => { try { room.leave(); } catch { /* noop */ } },
  };
}
