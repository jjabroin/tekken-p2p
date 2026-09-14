# 🥊 Tekken P2P

서버 없이 방 코드로 맞붙는 1v1 격투 게임. **GitHub Pages**에서 바로 실행됩니다.
베이스: Canvas 2D + [Trystero](https://github.com/dmotz/trystero) torrent 전략(WebRTC 시그널링, 서버 불필요).

## 플레이

| 조작 | 키 |
|---|---|
| 이동 | `A` / `D` |
| 점프 | `W` |
| 가드 | `S` (데미지 85% 경감) |
| 펀치 | `J` |
| 킥 | `K` |
| 필살기 | `L` (게이지 100% 필요) |
| 📱 | `◀/▶` 이동 · `🛡/⬆/👊/🦵` 버튼 |

- 먼저 **2라운드**를 따내면 매치 승리
- 라운드 시간 60초, 시간 초과 시 남은 체력이 많은 쪽 승리
- 공격하면 게이지가 차고, 게이지 100%에서 필살기(22뎀) 사용 가능

## P2P 멀티플레이 (서버 불필요)

1. `새 방 만들기` → 생성된 6자리 코드 확인 (클릭하면 복사)
2. 친구에게 코드 전달 → 친구는 코드 입력 후 `참가하기`
3. 호스트 = P1(왼쪽), 게스트 = P2(오른쪽)
4. 20Hz 상태 동기화 + 공격 액션/타격 판정 이벤트 전송

> V1 한계: 간이 보간 방식이라 핑이 높으면 약간 떨릴 수 있음.
> 타격 판정은 공격자 측에서 판정 후 데미지 이벤트를 전송합니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # dist/ 프로덕션 빌드
```

## 배포 (GitHub Pages)

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드 → Pages에 배포합니다.

1. GitHub에서 새 저장소 `tekken-p2p` 생성
2. `git remote add origin <url>` 후 push
3. 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정
4. `https://<username>.github.io/tekken-p2p/` 에서 플레이

## 구조

```
src/
  game/    config(상수/기술표) · fighter(파이터/렌더) · engine(라운드/판정/CPU) · audio(효과음)
  net/     p2p(Trystero 룸/액션 정의)
  main.js  메뉴/입력/루프/HUD 바인딩
```
