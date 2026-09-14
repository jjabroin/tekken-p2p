import { joinRoom } from '@trystero-p2p/torrent';

// 방 코드 6자리 (헷갈리는 문자 제외)
export function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const APP_ID = 'tekken-p2p-v2';

export function createNet({ code, onPeerJoin, onPeerLeave, onState, onAction, onHit, onHello, onSys }) {
  const room = joinRoom({ appId: APP_ID }, code);

  const [sendState, getState] = room.makeAction('st');
  const [sendAction, getAction] = room.makeAction('ac');
  const [sendHit, getHit] = room.makeAction('hit');
  const [sendHello, getHello] = room.makeAction('hi');
  const [sendSys, getSys] = room.makeAction('sys');

  room.onPeerJoin((id) => onPeerJoin?.(id));
  room.onPeerLeave((id) => onPeerLeave?.(id));
  getState((snap, id) => onState?.(snap, id));
  getAction((a, id) => onAction?.(a, id));
  getHit((h, id) => onHit?.(h, id));
  getHello((h, id) => onHello?.(h, id));
  getSys((s, id) => onSys?.(s, id));

  return {
    room,
    peers: () => Object.keys(room.getPeers() || {}),
    sendState: (snap) => sendState(snap),
    sendAction: (a) => sendAction(a),
    sendHit: (h) => sendHit(h),
    sendHello: (h) => sendHello(h),
    sendSys: (s) => sendSys(s),
    leave: () => room.leave(),
  };
}
