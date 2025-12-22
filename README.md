# Hydrothermal Vent Simulation - WebGPU

WebGPU 기반 열수분출구 생태계 시뮬레이션

## 개요

2D 격자에서 열수분출구 화학/생물학적 프로세스를 시뮬레이션:

| 필드 | 설명 |
|-----|------|
| **R** | 환원물질 (중심 주입, 확산) |
| **O** | 산화물질 (배경 농도로 이완) |
| **C** | R × O 오버랩 |
| **H** | 열/에너지 (감쇠 + 확산) |
| **M** | 미생물 (성장/사멸) |
| **B** | 축적 영양분 |
| **P** | 먹이 파티클 (최대 16,384) |
| **P2** | 포식자 파티클 (최대 16,384) |

## 실행 방법

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server -p 8000
```

브라우저: `http://localhost:8000` (Chrome 113+ 권장)

## 프로젝트 구조

```
js/
├── main.js                      # 진입점, 애니메이션 루프
├── utils/
│   └── gpuUtils.js              # GPU 버퍼 읽기 유틸리티
├── managers/
│   ├── StorageManager.js        # localStorage/JSON 저장
│   ├── ChartManager.js          # Chart.js 통계 시각화
│   ├── EntityInspector.js       # 파티클 선택/검사
│   └── BatchRunner.js           # 배치 시뮬레이션
├── simulation/
│   ├── SimulationEngine.js      # GPU 컴퓨트 파이프라인
│   └── parameters.js            # 파라미터 정의
├── rendering/
│   └── Renderer.js              # 렌더 파이프라인
├── ui/
│   └── Controls.js              # 사이드바 UI
└── webgpu/
    ├── context.js               # WebGPU 초기화
    └── buffers.js               # 버퍼 관리

shaders/
├── compute/                     # 컴퓨트 셰이더
│   ├── updateR.wgsl             # R 필드
│   ├── updateO.wgsl             # O 필드 + 반응
│   ├── updateH.wgsl             # H 필드
│   ├── updateM.wgsl             # M 필드
│   ├── updateP.wgsl             # 먹이 파티클
│   ├── updateP2.wgsl            # 포식자 파티클
│   └── ...
└── render/                      # 렌더 셰이더
    ├── visualize.wgsl           # 필드 시각화
    ├── renderParticles.wgsl     # P 렌더링
    └── renderPredators.wgsl     # P2 렌더링
```

## 주요 기능

### 시뮬레이션
- 실시간 필드 업데이트 (GPU 가속)
- 파티클 이동/번식/사멸
- 포식자-먹이 상호작용

### UI
- 실시간 파라미터 조정
- 통계 차트 (Chart.js)
- 파티클 클릭 검사
- 배치 실행 모드
- JSON 저장/로드

### 단축키
| 키 | 동작 |
|----|------|
| Space | 일시정지/재개 |
| Alt+S | 파라미터 저장 |
| Alt+Z | 리셋 |

## 확장 가이드

### 파라미터 추가
1. `parameters.js` - `PARAMETER_DEFS` 배열에 추가
2. `parameters.js` - `toUniformData()` 직렬화 순서에 추가
3. 셰이더 - `SimParams` 구조체에 동일 순서로 추가

### 새 필드 추가
1. `buffers.js` - 버퍼 생성
2. `SimulationEngine.js` - 파이프라인 추가
3. `shaders/compute/` - 셰이더 생성
4. `Renderer.js` - 시각화 (선택)

## 기술 스택

- **WebGPU** - GPU 컴퓨트/렌더링
- **WGSL** - 셰이더 언어
- **Chart.js** - 통계 시각화
- **Vanilla JS** - ES6 모듈

## 성능

- 60 FPS @ 512×512 그리드
- GPU 병렬 처리 (최대 32k 파티클)
- 비동기 통계 읽기

## 문서

- **AGENTS.md** - LLM/개발자 가이드 (파일 구조, 수정 규칙)
- 각 파일 상단 `@fileoverview` - 모듈별 역할/의존성

## 라이센스

교육 및 연구 목적 자유 사용
