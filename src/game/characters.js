// ── 철권식 무브리스트 ─────────────────────────────
// 버튼: 1=LP(J) 2=RP(K) 3=LK(U) 4=RK(I)
// 방향: 상대 기준 f/b/u/d (+대각선), crouch=앉은 상태, rise=일어나며, dash=대시 중
// h/m/l = 상/중/하단, ub = 가드불능, launch = 띄우기(vy), kd = 눕히기, screw = 스크류

export const MOVES = {
  // --- 기본 손 (빠른 발동) ---
  m1:   { n: '1', btn: 1, st: 5, ac: 3, rc: 5, dmg: 7, range: 46, h: 'h', next: { 1: 'm11', 2: 'm12' }, anim: ['jab1', 'jab2'] },
  m11:  { n: '1,1', btn: 1, st: 6, ac: 3, rc: 7, dmg: 8, range: 46, h: 'h', chainOnly: true, next: { 2: 'm112' }, anim: ['jab2', 'jab4'] },
  m112: { n: '1,1,2', btn: 2, st: 10, ac: 4, rc: 17, dmg: 14, range: 50, h: 'm', chainOnly: true, kd: true, push: 5, anim: ['cross1', 'cross2', 'cross3'] },
  m2:   { n: '2', btn: 2, st: 6, ac: 3, rc: 5, dmg: 9, range: 48, h: 'h', next: { 1: 'm21' }, anim: ['cross1', 'cross2'] },
  m21:  { n: '2,1', btn: 1, st: 8, ac: 3, rc: 6, dmg: 10, range: 48, h: 'm', chainOnly: true, anim: ['jab2', 'jab3'] },
  m12:  { n: '1,2', btn: 2, st: 8, ac: 3, rc: 6, dmg: 11, range: 48, h: 'h', chainOnly: true, anim: ['cross2', 'cross3'] },
  // --- 앞 방향기 ---
  f1:   { n: 'f+1', btn: 1, dir: 'f', st: 8, ac: 3, rc: 11, dmg: 10, range: 50, h: 'm', push: 3, anim: ['jab2', 'cross2'] },
  f3:   { n: 'f+3', btn: 3, dir: 'f', st: 11, ac: 4, rc: 14, dmg: 12, range: 58, h: 'm', push: 3, anim: ['lk0', 'lk1', 'lk2'] },
  f4:   { n: 'f+4', btn: 4, dir: 'f', st: 13, ac: 4, rc: 17, dmg: 15, range: 64, h: 'm', push: 5, anim: ['rk0', 'rk1', 'rk2'] },
  // --- 뒤 방향기 ---
  b1:   { n: 'b+1', btn: 1, dir: 'b', st: 7, ac: 3, rc: 10, dmg: 8, range: 48, h: 'h', anim: ['jab1', 'jab2'] },
  b2:   { n: 'b+2', btn: 2, dir: 'b', st: 11, ac: 4, rc: 14, dmg: 13, range: 52, h: 'm', push: 4, anim: ['cross1', 'cross2', 'up1'] },
  b3:   { n: 'b+3', btn: 3, dir: 'b', st: 12, ac: 4, rc: 16, dmg: 10, range: 56, h: 'l', anim: ['lk1', 'lk2', 'lk0'] },
  b4:   { n: 'b+4', btn: 4, dir: 'b', st: 14, ac: 4, rc: 18, dmg: 15, range: 60, h: 'm', push: 6, anim: ['rk1', 'rk2', 'rk3'] },
  // --- 점프 방향기 ---
  uf1:  { n: 'uf+1', btn: 1, dir: 'uf', st: 8, ac: 5, rc: 11, dmg: 10, range: 52, h: 'm', anim: ['jump1', 'air0', 'air1'] },
  uf2:  { n: 'uf+2', btn: 2, dir: 'uf', st: 10, ac: 5, rc: 13, dmg: 12, range: 54, h: 'm', anim: ['jump1', 'air0', 'air1'] },
  // --- 중단/하단 ---
  df1:  { n: 'df+1', btn: 1, dir: 'df', st: 8, ac: 4, rc: 10, dmg: 9, range: 52, h: 'm', anim: ['jab1', 'jab2', 'jab1'] },
  s3:   { n: '3', btn: 3, st: 8, ac: 4, rc: 11, dmg: 9, range: 56, h: 'm', anim: ['lk0', 'lk1', 'lk2'] },
  s4:   { n: '4', btn: 4, st: 11, ac: 4, rc: 15, dmg: 13, range: 60, h: 'm', push: 3, anim: ['rk0', 'rk1', 'rk2'] },
  d1:   { n: 'd+1', btn: 1, crouch: true, st: 8, ac: 3, rc: 10, dmg: 7, range: 46, h: 'm', anim: ['jab2'] },
  d3:   { n: 'd+3', btn: 3, crouch: true, st: 10, ac: 4, rc: 12, dmg: 8, range: 54, h: 'l', anim: ['lk0', 'lk1', 'lk2'] },
  d4:   { n: 'd+4', btn: 4, crouch: true, st: 13, ac: 4, rc: 17, dmg: 12, range: 58, h: 'l', kd: true, push: 4, anim: ['rk1', 'rk2', 'rk3'] },
  d2:   { n: 'd+2', btn: 2, crouch: true, st: 9, ac: 3, rc: 11, dmg: 7, range: 46, h: 'l', next: { 3: 'd23' }, anim: ['jab1', 'jab2'] },
  d23:  { n: 'd+2,3', btn: 3, st: 10, ac: 4, rc: 14, dmg: 10, range: 54, h: 'l', chainOnly: true, anim: ['lk1', 'lk2', 'lk1'] },
  db3:  { n: 'db+3', btn: 3, dir: 'db', st: 12, ac: 4, rc: 14, dmg: 9, range: 54, h: 'l', anim: ['lk1', 'lk2', 'lk0'] },
  db4:  { n: 'db+4 스위프', btn: 4, dir: 'db', st: 15, ac: 4, rc: 18, dmg: 13, range: 60, h: 'l', kd: true, push: 5, anim: ['rk1', 'rk2', 'rk3'] },
  ws1:  { n: 'ws+1', btn: 1, rise: true, st: 9, ac: 3, rc: 11, dmg: 9, range: 48, h: 'm', anim: ['jab1', 'jab2'] },
  ws2:  { n: 'ws+2', btn: 2, rise: true, st: 12, ac: 4, rc: 15, dmg: 14, range: 52, h: 'm', push: 3, anim: ['cross1', 'cross2', 'up1'] },
  ws3:  { n: 'ws+3', btn: 3, rise: true, st: 10, ac: 4, rc: 13, dmg: 10, range: 54, h: 'm', anim: ['lk0', 'lk1', 'lk2'] },
  ws4:  { n: 'ws+4', btn: 4, rise: true, st: 10, ac: 4, rc: 14, dmg: 13, range: 56, h: 'm', launch: -5.5, anim: ['rk0', 'rk1', 'rk2'] },
  // --- 런처 ---
  df2:  { n: 'df+2', btn: 2, dir: 'df', st: 13, ac: 4, rc: 21, dmg: 15, range: 54, h: 'm', launch: -10.5, push: 3, anim: ['up0', 'up1', 'up1'] },
  uf4:  { n: 'uf+4', btn: 4, dir: 'uf', st: 12, ac: 6, rc: 19, dmg: 18, range: 56, h: 'm', launch: -10, anim: ['hop0', 'hop1', 'hop2'] },
  uf3:  { n: 'uf+3', btn: 3, dir: 'uf', st: 11, ac: 6, rc: 18, dmg: 15, range: 56, h: 'm', launch: -9.5, anim: ['hop0', 'hop1', 'hop2'] },
  wgf:  { n: 'f,n,d,df+2', btn: 2, special: 'wgf', st: 9, ac: 4, rc: 19, dmg: 25, range: 56, h: 'm', launch: -11.5, electric: true, anim: ['up0', 'up1', 'cross2'] },
  // --- 대시 ---
  ff2:  { n: 'f,f+2', btn: 2, dash: true, st: 10, ac: 4, rc: 17, dmg: 14, range: 60, h: 'm', push: 4, anim: ['cross1', 'cross2', 'cross3'] },
  death: { n: 'f,f+2 데스피스트', btn: 2, dash: true, st: 16, ac: 4, rc: 24, dmg: 30, range: 72, h: 'm', push: 9, heavy: true, anim: ['cross1', 'cross2', 'cross3'] },
  // --- 잡기 (1+3 / 2+4, 근접 가드불능) ---
  t13:  { n: '1+3 잡기', btn: 13, st: 8, ac: 6, rc: 18, dmg: 32, range: 42, h: 'ub', grab: true, anim: ['jab1', 'jab2', 'cross2'] },
  t24:  { n: '2+4 잡기', btn: 24, st: 8, ac: 6, rc: 18, dmg: 32, range: 42, h: 'ub', grab: true, flip: true, anim: ['cross1', 'jab2', 'cross2'] },
  // --- 스크류 (공중 콤보 연장, 콤보당 1회) ---
  screw12: { n: '1+2 스크류', btn: 12, st: 14, ac: 4, rc: 21, dmg: 12, range: 54, h: 'm', screw: true, push: 3, anim: ['cross2', 'up1'] },
  // --- 무릎/특수 ---
  df4:  { n: 'df+4 니킥', btn: 4, dir: 'df', st: 12, ac: 4, rc: 16, dmg: 16, range: 52, h: 'm', push: 4, anim: ['rk0', 'rk1', 'rk2'] },
  hammer: { n: 'b+1+2 해머', btn: 12, dir: 'b', st: 24, ac: 6, rc: 24, dmg: 30, range: 60, h: 'ub', kd: true, heavy: true, push: 10, anim: ['up0', 'up1', 'cross3'] },
  // --- 레이지 아츠 (체력 25% 이하, R) ---
  rage: { n: 'RAGE ART', btn: 0, st: 8, ac: 30, rc: 30, dmg: 55, range: 130, h: 'ub', rageMove: true, anim: ['rage0', 'rage1', 'rage0', 'rage1'] },
  // --- 누운 상태 기상킥 ---
  get3: { n: '기상 3', btn: 3, down: true, st: 9, ac: 6, rc: 16, dmg: 8, range: 56, h: 'l', anim: ['lk1', 'lk2'] },
  get4: { n: '기상 4', btn: 4, down: true, st: 12, ac: 6, rc: 19, dmg: 12, range: 60, h: 'm', kd: true, anim: ['rk1', 'rk2', 'rk3'] },
  // --- 점프 공격 ---
  air1: { n: '공중 1', btn: 1, air: true, st: 6, ac: 10, rc: 10, dmg: 8, range: 48, h: 'm', anim: ['air0', 'air1'] },
  air4: { n: '공중 4', btn: 4, air: true, st: 8, ac: 10, rc: 12, dmg: 11, range: 54, h: 'm', anim: ['airk0', 'airk1', 'airk0'] },
};

const CORE = ['m1', 'm11', 'm112', 'm2', 'm21', 'm12', 'f1', 'f3', 'f4', 'b1', 'b2', 'b3', 'b4',
  'uf1', 'uf2', 'df1', 's3', 's4', 'd1', 'd3', 'd4', 'db3', 'db4', 'ws1', 'ws2', 'ws3',
  'ws4', 'df2', 'uf4', 'ff2', 't13', 't24', 'screw12', 'rage', 'get3', 'get4', 'air1', 'air4'];

export const CHARS = [
  { id: 0, name: 'KAZUMA', style: '미시마류 가라테', hp: 175, speed: 1.0, power: 1.0, weight: 1.0,
    desc: '전격 풍신권을 노려라', moves: [...CORE, 'wgf'],
    key: ['1,1,2', 'df+2', 'f,n,d,df+2'] },
  { id: 1, name: 'PAULO', style: '파워 스트라이커', hp: 185, speed: 0.9, power: 1.2, weight: 1.1,
    desc: '한 방의 데스피스트', moves: [...CORE.filter((m) => m !== 'ff2'), 'death'],
    key: ['f,f+2', 'df+2', 'd+4'] },
  { id: 2, name: 'KINGU', style: '루차 레슬러', hp: 195, speed: 0.85, power: 1.1, weight: 1.25,
    desc: '잡기 데미지 +50%', moves: CORE, throwBonus: 1.5,
    key: ['1+3 잡기', 'df+2', '1,1,2'] },
  { id: 3, name: 'SAKDA', style: '무에타이', hp: 175, speed: 1.0, power: 1.05, weight: 1.05,
    desc: '무릎과 로우의 압박', moves: [...CORE, 'df4'],
    key: ['df+4', 'd+4', 'uf+4'] },
  { id: 4, name: 'RICO', style: '카포에이라', hp: 165, speed: 1.15, power: 0.9, weight: 0.9,
    desc: '빠른 발놀림', moves: [...CORE, 'uf3'],
    key: ['uf+3', '1,1,2', 'ws+4'] },
  { id: 5, name: 'AYAME', style: '쿠노이치', hp: 160, speed: 1.2, power: 0.85, weight: 0.85,
    desc: '최속의 하단 이지선다', moves: [...CORE, 'd2', 'd23'],
    key: ['d+2,3', 'df+2', '1,2'] },
  { id: 6, name: 'HEIJI', style: '노장 가라테', hp: 185, speed: 0.9, power: 1.15, weight: 1.15,
    desc: '묵직한 풍신권', moves: [...CORE, 'wgf'], wgfDmg: 28,
    key: ['f,n,d,df+2', 'df+1', '1+3 잡기'] },
  { id: 7, name: 'JACKAL', style: '격투 로봇', hp: 200, speed: 0.8, power: 1.1, weight: 1.4,
    desc: '가드불능 해머', moves: [...CORE, 'hammer'],
    key: ['b+1+2', 'df+2', 'd+4'] },
];

export function getMove(id) { return MOVES[id]; }
export function charById(id) { return CHARS[id] || CHARS[0]; }
