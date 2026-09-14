// 게임 전역 상수
export const CFG = {
  W: 960,
  H: 540,
  GROUND_Y: 460,
  GRAVITY: 0.7,
  MOVE_SPEED: 4.2,
  JUMP_V: -14,
  ROUND_TIME: 60,
  WIN_ROUNDS: 2,
  SYNC_HZ: 20,
};

export const MOVES = {
  punch: { dmg: 7, range: 78, startup: 6, active: 6, recover: 12, stun: 14, push: 4, meter: 8 },
  kick: { dmg: 11, range: 92, startup: 10, active: 6, recover: 20, stun: 22, push: 7, meter: 12 },
  special: { dmg: 22, range: 110, startup: 14, active: 8, recover: 28, stun: 34, push: 12, meter: -100 },
};
