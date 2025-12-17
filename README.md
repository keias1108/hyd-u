# Hydrothermal Vent Simulation - WebGPU

WebGPU 기반 열수분출구 최소 모델 시뮬레이션 (R-O 필드)

## 개요

이 프로젝트는 2D 격자 공간에서 열수분출구 환경을 시뮬레이션합니다:

- **R Field (환원물질)**: 중심점에서 주입되는 물질, 거리에 따라 감쇠
- **O Field (산화물질)**: 배경 농도 O₀로 복원되는 물질
- **C Field (겹침)**: R × O 오버랩 값

## 실행 방법

### 1. 로컬 서버 실행

WebGPU는 보안상 로컬 서버에서 실행해야 합니다.

**Python 3 사용:**
```bash
python -m http.server 8000
```

**Node.js 사용 (http-server 설치 필요):**
```bash
npx http-server -p 8000
```

### 2. 브라우저에서 열기

```
http://localhost:8000
```

**지원 브라우저:**
- Chrome 113+ (권장)
- Edge 113+
- 최신 Firefox (WebGPU 지원 활성화 필요)

## 프로젝트 구조

```
.
├── index.html              # 메인 HTML
├── css/
│   └── styles.css          # UI 스타일
├── js/
│   ├── main.js            # 메인 앱 진입점
│   ├── webgpu/
│   │   ├── context.js     # WebGPU 초기화
│   │   └── buffers.js     # 버퍼 관리
│   ├── simulation/
│   │   ├── SimulationEngine.js  # 컴퓨트 셰이더 오케스트레이션
│   │   └── parameters.js        # 파라미터 시스템
│   ├── rendering/
│   │   └── Renderer.js    # 렌더링 파이프라인
│   └── ui/
│       └── Controls.js    # UI 컨트롤
└── shaders/
    ├── compute/
    │   ├── updateR.wgsl   # R 필드 주입
    │   ├── updateO.wgsl   # O 필드 이완
    │   └── computeC.wgsl  # C = R × O
    └── render/
        └── visualize.wgsl # 필드 시각화
```

## 주요 기능

### 시뮬레이션 규칙

1. **R Field (환원물질)**
   - 중심점 (rCenterX, rCenterY)에서 주입
   - 원형 범위 내에서 부드럽게 감쇠
   - 매 스텝마다 강제로 유지 (외부 드라이버)

2. **O Field (산화물질)**
   - 배경 농도 O₀로 복원 (지수 이완)
   - 복원률 oRelaxationRate로 제어
   - Ping-pong 버퍼 사용

3. **C Field (겹침)**
   - C = R × O 단순 곱셈
   - 반응이 일어날 수 있는 영역 표시

### 파라미터 제어

**R Field:**
- Injection center X/Y: 주입 중심 좌표
- Max R at center: 중심에서의 최대 R 값
- Injection radius: 주입 영향 반경
- Falloff curve: 감쇠 곡선 (거듭제곱)

**O Field:**
- Background O₀: 목표 배경 농도
- Relaxation rate: 복원 속도

**Visualization:**
- Display mode: R / O / C=R×O 선택
- Color scheme: Grayscale / Heatmap / Viridis

### 색상 맵

- **Grayscale**: 단순 흑백
- **Heatmap**: 검정 → 빨강 → 노랑 → 흰색
- **Viridis**: 지각적으로 균일한 색상 맵 (권장)

## 향후 확장

이 코드는 향후 확장을 위해 모듈화되어 있습니다:

### 새 필드 추가 (M, B, H)

1. `js/webgpu/buffers.js`에 버퍼 추가
2. `js/simulation/parameters.js`에 파라미터 추가
3. `shaders/compute/updateM.wgsl` 생성
4. `SimulationEngine.js`에 파이프라인 및 업데이트 메서드 추가

### 반응 규칙 추가

`shaders/compute/updateO.wgsl` 수정:
```wgsl
// 반응 소모
let reactionRate = kReaction * rField[idx] * currentO;
let depletion = reactionRate * params.deltaTime;
let newO = currentO + relaxation - depletion;
```

### 확산 추가

새 셰이더 `shaders/compute/diffusion.wgsl` 생성:
```wgsl
// 5-포인트 스텐실 라플라시안
let laplacian = left + right + up + down - 4.0 * center;
let newValue = center + diffusionRate * laplacian * deltaTime;
```

## 기술 스택

- **WebGPU**: GPU 컴퓨트 셰이더 및 렌더링
- **WGSL**: WebGPU Shading Language
- **JavaScript ES6 Modules**: 모듈화된 구조
- **Vanilla JS**: 프레임워크 없이 순수 JavaScript

## 성능

- 60 FPS 목표 (현대 GPU 기준)
- 512×512 그리드 (262,144 셀)
- 실시간 파라미터 조정

## 문제 해결

### WebGPU를 사용할 수 없습니다

- Chrome/Edge 113 이상 사용
- `chrome://flags`에서 "Unsafe WebGPU" 활성화 (개발용)
- GPU 드라이버 업데이트

### 검은 화면

- 브라우저 콘솔 확인 (F12)
- 로컬 서버에서 실행 중인지 확인
- 셰이더 로딩 오류 확인

## 라이센스

이 프로젝트는 교육 및 연구 목적으로 자유롭게 사용할 수 있습니다.

## 참고

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)
