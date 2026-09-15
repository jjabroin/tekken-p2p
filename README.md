# 🥊 IRON FIST P2P

서버 없이 방 코드로 맞붙는 **철권식 도트 격투 게임**. **GitHub Pages**에서 바로 실행됩니다.
베이스: Canvas 2D(480×270 저해상도 + 스캔라인) + [Trystero](https://github.com/dmotz/trystero) torrent 전략(WebRTC P2P, 서버 불필요).

> 상표권 회피를 위해 제목·캐릭터는 오리지널(패러디)이며, 표기법·시스템만 철권식을 따릅니다.
> 파이터 스프라이트는 CC0 라이선스 기반입니다 (아래 크레딧 참고).

## 게임 흐름

타이틀(어트랙트 데모) → 방 만들기/참가/혼자하기/**기술 연습** → **캐릭터 선택 (8명)** → VS 화면 → 대전 (먼저 2승) → 재대전/캐릭터선택

## 조작 (철권식 4버튼)

| 입력 | 동작 |
|---|---|
| `A` / `D` | 이동 (→→ 대시, ←← 백대시) |
| `W` / `S` | 점프 / 앉기 |
| **뒤 방향 홀드** | 가드 (서서: 상·중단, 앉아: 하단) |
| `J` = 1 (LP) · `K` = 2 (RP) · `U` = 3 (LK) · `I` = 4 (RK) | 기본기 |
| `R` | 레이지아츠 (체력 25% 이하, 라운드당 1회) |
| `J+U` / `K+I` | 잡기 (근접 가드불능) |
| `H` / `📋` | 커맨드표 (내 캐릭터 기술 목록) |
| 방향 + 버튼 | `f+1/f+3/f+4` · `b+1~4` · `uf+1/2` · `d+1` · `db+3/4` · `ws+1~4` (방향마다 다른 기술) |

## 🥋 기술 연습 모드

- 메뉴 → 기술 연습: 타이머·라운드 없이 무한 연습
- 더미 조작: `G` 스탠드/가드/앉기 전환 · `X` 위치 리셋 · `Esc` 나가기
- 내 입력 표기법 + 마지막 기술 프레임 정보(발동/판정/데미지) 표시
- 타격 시 데미지 숫자, 검기(타격 궤적), 착지/대시 먼지 연출
| `J+K` | 스크류 (공중 콤보 연장) |
| 📱 | `◀▶▼▲` + `1 2 3 4` + `R` 버튼 |

## 콤보 시스템 (실제 철권 표기법)

- **1**: LP, **2**: RP, **3**: LK, **4**: RK / **f,n,b,d,u** + `df+2` 같은 동시입력
- `1,1,2` 스트링, `df+1` 중딘 찌르기, `d+4` 하단, `ws+4` 일어나며 발차기
- `df+2` · `uf+4` 런처 → 공중 콤보 (히트수·스케일링 데미지 표시)
- `f,n,d,df+2` **풍신권** (KAZUMA/HEIJI), `f,f+2` 데스피스트 (PAULO)
- 카운터히트 보너스, 가드 시 칩데미지, 기상킥, 레이지 보정

참고: [TekkenDocs](https://tekkendocs.com) 프레임데이터 표기, GameFAQs 철권 표기법 가이드.

## 파이터 8명

| 이름 | 스타일 | 특징 |
|---|---|---|
| KAZUMA | 미시마류 가라테 | 풍신권, 밸런스 |
| PAULO | 파워 스트라이커 | 데스피스트 한 방 |
| KINGU | 루차 레슬러 | 잡기 데미지 +50%, 고체력 |
| SAKDA | 무에타이 | 니킥 압박 |
| RICO | 카포에이라 | 최속급 발놀림 |
| AYAME | 쿠노이치 | 하단 이지선다 |
| HEIJI | 노장 가라테 | 강화 풍신권 |
| JACKAL | 격투 로봇 | 가드불능 해머, 탱커 |

## P2P 멀티플레이 (서버 불필요)

1. `새 방 만들기` → 6자리 코드 확인 (클릭하면 복사)
2. 친구에게 코드 전달 → 코드 입력 후 `참가하기`
3. 각자 캐릭터 선택 (상대 커서 실시간 표시) → 둘 다 확정 시 VS 화면
4. 20Hz 상태 동기화 + 공격 액션/타격 판정 이벤트 (공격자 측 판정)

## 실행

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # dist/ 프로덕션 빌드
```

## 배포 (GitHub Pages)

`main` 푸시 → `.github/workflows/deploy.yml` 자동 빌드·배포.
저장소 Settings → Pages → Source를 **GitHub Actions**로 설정하면
`https://<username>.github.io/tekken-p2p/` 에서 플레이 가능.

## 구조

```
public/assets/chars/  8명 아틀라스 + 초상화 + atlas.json (CC0 기반 생성물)
tools/build_sprites.py  팔레트 스왑 아틀라스 빌더
src/
  game/  config · characters(무브리스트) · input(철권 입력버퍼)
         fighter(상태머신/스프라이트) · engine(판정/콤보/스테이지/CPU) · audio(신스)
  net/   p2p(Trystero 룸 v2: 상태/액션/타격/선택동기/리매치)
  main.js  타이틀/메뉴/셀렉트/VS/대전/결과 화면 상태머신
```

## 크레딧

- 베이스 스프라이트: **"Angry Guy" by nemezes** (OpenGameArt.org, **CC0**) — `public/assets/chars/CREDITS.txt`
- 8 파이터는 `tools/build_sprites.py`로 생성한 팔레트 스왑 변형입니다.
- TEKKEN®은 BANDAI NAMCO Entertainment Inc.의 등록 상표이며, 본 프로젝트와 무관합니다.
