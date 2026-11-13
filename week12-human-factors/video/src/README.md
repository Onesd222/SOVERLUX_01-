# 12주차 업무압박 데이터 3D 영상: 렌더 소스

`../12주차_업무압박_데이터_3D.mp4`(1920×1080, 30fps, H.264 yuv420p, 114초, 오디오 없음)를 만드는 소스입니다.
모든 장면은 Three.js 기본 도형으로 직접 만들었고, 외부 모델·이미지·음악은 쓰지 않았습니다. 글꼴은 Noto Sans KR(OFL, npm `@fontsource/noto-sans-kr`)입니다.

## 파일

| 파일 | 내용 |
|---|---|
| `content.js` | 화면 자막과 3D 라벨의 모든 문자열, 자막 표시 시각, 색상 |
| `main.js` | 3D 장면(격납고, 여객기, 사람, 막대, 게이지, 카드, 그래프, 타일, 보고서)과 `window.renderAt(t)` |
| `boot.js` | 한글 글꼴을 먼저 다 불러온 뒤 `main.js` 를 불러옴 |
| `index.html`, `style.css` | 1920×1080 무대와 자막 스타일 |
| `render.js` | 로컬 서버 + 헤드리스 Chromium(Playwright)으로 프레임을 하나씩 찍고 ffmpeg 로 인코딩 |

## 다시 렌더하기

필요한 것: Node 18 이상, Playwright 와 Chromium(이 환경에는 설치되어 있음), ffmpeg(libx264).

```bash
cd week12-human-factors/video/src

# 1) 의존성 (node_modules 는 커밋하지 않습니다. 다른 곳에 설치하고 MODULES_DIR 로 가리켜도 됩니다)
npm install

# 2) 중간 파일 위치(프레임 JPEG 약 3,400장, 약 0.5GB)와 Playwright 위치
export WORK_DIR=/tmp/week12-video-work
export NODE_PATH=$(npm root -g)          # playwright 가 전역 설치된 경우. 이 환경은 /opt/node-tools/node_modules

# 3) 글꼴·자막 검사만
node render.js check

# 4) 확인용 정지 화면 (초 단위, $WORK_DIR/stills/*.png)
node render.js stills 4,20,33,44,58,74,86,99,110

# 5) 전체 렌더 + 인코딩 (뒤 숫자는 동시에 띄울 브라우저 수)
node render.js all 3
```

`all` 은 `frames`(프레임 저장)와 `encode`(MP4 만들기)를 차례로 실행합니다. 이미 있는 프레임은 건너뛰므로,
소스를 고친 뒤에는 `$WORK_DIR/frames` 를 지우거나 `FORCE=1` 을 붙이십시오. 인코딩 품질은 `CRF=21`(기본) 로 바꿀 수 있고,
출력 경로는 `OUT=...` 로 바꿀 수 있습니다.

`node_modules` 를 이 폴더 밖에 둔 경우(예: 이번 제작에서는 스크래치 폴더)는 `MODULES_DIR=/그/경로/node_modules` 를 함께 지정합니다.

## 구조 메모

- 렌더는 실시간 재생에 의존하지 않습니다. `renderAt(t)` 는 시각 t 만으로 장면 전체를 정하므로 어떤 프레임이든 따로 다시 찍을 수 있습니다.
- 자막은 HTML 오버레이이며, 3D 안의 글자(카드, 라벨, 시계 등)는 캔버스 텍스처입니다. 둘 다 같은 페이지 스크린샷에 함께 찍힙니다.
- 렌더 시작 때 `document.fonts.check` 로 모든 문자열의 글꼴 로드를 확인하고, 실패하면 렌더를 멈춥니다. 같은 자리 자막의 시간 겹침도 검사합니다.
- 문구나 표시 시간을 바꾸려면 `content.js` 의 `CAPS`(자막)와 `STR`(3D 라벨)를 고칩니다. 그래프 값은 `STR.pct` 입니다.
- 그래프 수치(06-10시 0%, 10-14시 11%, 14-18시 71%, 18-22시 0%, 22-06시 0%)는 가상 예시 데이터입니다. 게이지 기준(0.8, 1.0)은 수업용 값이며 규정이 아닙니다.
