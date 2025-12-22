/**
 * @fileoverview Application Constants
 *
 * 모든 매직 넘버와 설정값을 중앙 관리.
 *
 * ## 사용법
 * ```js
 * import { FPS_UPDATE_INTERVAL_MS, STORAGE_KEYS } from './core/constants.js';
 * ```
 *
 * ## 카테고리
 * - TIMING: 업데이트 주기 (FPS, 통계, 엔티티 읽기)
 * - CHART: 차트 샘플링, 데이터 포인트 제한
 * - PARTICLE: 최대 파티클 수, 스트라이드
 * - GPU: 워크그룹 크기
 * - UI: 모달 크기, 마진, 선택 반경
 * - BATCH: 배치 실행 설정
 * - STORAGE_KEYS: localStorage 키 이름
 * - CHART_COLORS: 차트 색상 정의
 * - DEFAULT_STATS: 기본 통계값
 *
 * @module core/constants
 */

// =============================================================================
// TIMING CONSTANTS
// =============================================================================

/** FPS display update interval in milliseconds */
export const FPS_UPDATE_INTERVAL_MS = 500;

/** Statistics update interval in milliseconds */
export const STATS_UPDATE_INTERVAL_MS = 100;

/** Entity selection read interval in milliseconds */
export const ENTITY_READ_INTERVAL_MS = 120;

// =============================================================================
// CHART CONSTANTS
// =============================================================================

/** Sample chart data every N frames */
export const CHART_SAMPLE_INTERVAL = 10;

/** Maximum data points to keep in chart */
export const MAX_CHART_DATA_POINTS = 500;

// =============================================================================
// PARTICLE CONSTANTS
// =============================================================================

/** Maximum particle capacity */
export const MAX_PARTICLES = 16384;

/** Maximum predator capacity */
export const MAX_PREDATORS = 16384;

/** Particle data stride in bytes (pos, vel, energy, type, state, age) */
export const PARTICLE_STRIDE_BYTES = 32;

/** Particle stride in u32 words */
export const PARTICLE_STRIDE_U32 = PARTICLE_STRIDE_BYTES / 4;

/** State field offset in u32 words */
export const PARTICLE_STATE_OFFSET_U32 = 6;

// =============================================================================
// GPU WORKGROUP CONSTANTS
// =============================================================================

/** Default workgroup size for 2D compute shaders */
export const WORKGROUP_SIZE_2D = 8;

/** Default workgroup size for 1D compute shaders */
export const WORKGROUP_SIZE_1D = 64;

/** Workgroup size for density clear operations */
export const DENSITY_CLEAR_WORKGROUP_SIZE = 256;

// =============================================================================
// UI CONSTANTS
// =============================================================================

/** Entity selection pick radius in pixels */
export const ENTITY_PICK_RADIUS_PX = 14;

/** Minimum modal width for chart modal */
export const CHART_MODAL_MIN_WIDTH = 400;

/** Minimum modal height for chart modal */
export const CHART_MODAL_MIN_HEIGHT = 300;

/** Minimum modal width for batch modal */
export const BATCH_MODAL_MIN_WIDTH = 520;

/** Minimum modal height for batch modal */
export const BATCH_MODAL_MIN_HEIGHT = 420;

/** Minimum modal width for entity modal */
export const ENTITY_MODAL_MIN_WIDTH = 220;

/** Minimum modal height for entity modal */
export const ENTITY_MODAL_MIN_HEIGHT = 140;

/** Modal margin in pixels */
export const MODAL_MARGIN_PX = 8;

// =============================================================================
// BATCH RUN CONSTANTS
// =============================================================================

/** Default batch run steps */
export const DEFAULT_BATCH_STEPS = 200000;

/** Default batch sample interval */
export const DEFAULT_BATCH_SAMPLE_EVERY = 1000;

/** Batch run chunk size for UI responsiveness */
export const BATCH_CHUNK_SIZE = 512;

// =============================================================================
// LOCAL STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  SIDEBAR_VISIBLE: 'sidebar-visible',
  PARAMETERS: 'hydrothermal-params',
  PANEL_STATE_PREFIX: 'panel-state-',
};

// =============================================================================
// CHART COLORS
// =============================================================================

export const CHART_COLORS = {
  O_AVG: { border: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.1)' },
  R_TOTAL: { border: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.1)' },
  H_AVG: { border: 'rgb(255, 205, 86)', bg: 'rgba(255, 205, 86, 0.1)' },
  B_TOTAL: { border: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.1)' },
  P_TOTAL: { border: 'rgb(153, 102, 255)', bg: 'rgba(153, 102, 255, 0.1)' },
  P2_TOTAL: { border: 'rgb(255, 138, 101)', bg: 'rgba(255, 138, 101, 0.12)' },
};

// =============================================================================
// DEFAULT STATS
// =============================================================================

export const DEFAULT_STATS = {
  rTotal: 0,
  oAvg: 0.8,
  hAvg: 0.0,
  mTotal: 0,
  bTotal: 0,
  pTotal: 0,
  p2Total: 0,
  pInvalid: 0,
  p2Invalid: 0,
};
