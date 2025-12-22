/**
 * @fileoverview GPU Utility Functions
 *
 * GPU 버퍼 읽기 및 파티클 분석 유틸리티.
 *
 * ## 사용처
 * - main.js: computeFieldStats()에서 필드 통계 읽기
 * - EntityInspector.js: 파티클 선택 시 데이터 읽기
 *
 * ## 주요 함수
 * - readGpuBuffer(): GPU→CPU 버퍼 복사
 * - readParticleAt(): 단일 파티클 데이터 읽기
 * - analyzeParticleBuffer(): 파티클 통계 분석
 * - findNearestEntity(): 좌표 기반 파티클 검색
 *
 * @module utils/gpuUtils
 */

/**
 * GPU 버퍼 내용을 CPU로 읽기
 * @param {GPUDevice} device - WebGPU 디바이스
 * @param {GPUBuffer} gpuBuffer - 소스 GPU 버퍼
 * @returns {Promise<Float32Array>} 버퍼 내용
 */
export async function readGpuBuffer(device, gpuBuffer) {
  const size = gpuBuffer.size;

  const readBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, size);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(readBuffer.getMappedRange());
  const result = new Float32Array(data);
  readBuffer.unmap();
  readBuffer.destroy();

  return result;
}

/**
 * Read a single particle struct from GPU buffer
 * @param {GPUDevice} device - WebGPU device
 * @param {GPUBuffer} gpuBuffer - Particle buffer
 * @param {number} index - Particle index
 * @param {number} stride - Particle stride in bytes (default 32)
 * @returns {Promise<Object>} Particle data object
 */
export async function readParticleAt(device, gpuBuffer, index, stride = 32) {
  const offset = index * stride;

  const readBuffer = device.createBuffer({
    size: stride,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(gpuBuffer, offset, readBuffer, 0, stride);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const data = readBuffer.getMappedRange();
  const dv = new DataView(data);

  const particle = {
    pos: {
      x: dv.getFloat32(0, true),
      y: dv.getFloat32(4, true),
    },
    vel: {
      x: dv.getFloat32(8, true),
      y: dv.getFloat32(12, true),
    },
    energy: dv.getFloat32(16, true),
    type: dv.getUint32(20, true),
    state: dv.getUint32(24, true),
    age: dv.getFloat32(28, true),
  };

  readBuffer.unmap();
  readBuffer.destroy();

  return particle;
}

/**
 * Analyze alive entities and invalid positions from particle buffer
 * @param {GPUDevice} device - WebGPU device
 * @param {GPUBuffer} gpuBuffer - Particle buffer
 * @param {number} capacity - Maximum particle count
 * @param {number} gridWidth - Grid width for bounds checking
 * @param {number} gridHeight - Grid height for bounds checking
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeParticleBuffer(device, gpuBuffer, capacity, gridWidth, gridHeight) {
  const size = gpuBuffer.size;

  const readBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, size);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = readBuffer.getMappedRange();
  const f32View = new Float32Array(arrayBuffer);
  const u32View = new Uint32Array(arrayBuffer);

  let aliveCount = 0;
  let invalidCount = 0;
  let nanCount = 0;
  let oobCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxXSeen = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxYSeen = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < capacity; i++) {
    const base = i * 8;
    const state = u32View[base + 6];

    if (state === 0) continue;
    aliveCount++;

    const x = f32View[base];
    const y = f32View[base + 1];

    const isNaN = Number.isNaN(x) || Number.isNaN(y);
    const isOOB = !isNaN && (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight);

    if (isNaN || isOOB) {
      invalidCount++;
      if (isNaN) nanCount++;
      if (isOOB) oobCount++;
      continue;
    }

    if (x < minX) minX = x;
    if (x > maxXSeen) maxXSeen = x;
    if (y < minY) minY = y;
    if (y > maxYSeen) maxYSeen = y;
  }

  readBuffer.unmap();
  readBuffer.destroy();

  return { aliveCount, invalidCount, nanCount, oobCount, minX, maxXSeen, minY, maxYSeen };
}

/**
 * Find nearest entity to a target point within radius
 * @param {GPUDevice} device - WebGPU device
 * @param {GPUBuffer} gpuBuffer - Particle buffer
 * @param {number} capacity - Maximum particle count
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @param {number} radius2 - Squared search radius
 * @returns {Promise<Object|null>} Nearest entity info or null
 */
export async function findNearestEntity(device, gpuBuffer, capacity, targetX, targetY, radius2) {
  const size = gpuBuffer.size;

  const readBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, size);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = readBuffer.getMappedRange();
  const f32View = new Float32Array(arrayBuffer);
  const u32View = new Uint32Array(arrayBuffer);

  let bestIndex = -1;
  let bestDist2 = Number.POSITIVE_INFINITY;

  for (let i = 0; i < capacity; i++) {
    const base = i * 8;
    const state = u32View[base + 6];

    if (state === 0) continue;

    const x = f32View[base];
    const y = f32View[base + 1];
    const dx = x - targetX;
    const dy = y - targetY;
    const d2 = dx * dx + dy * dy;

    if (d2 <= radius2 && d2 < bestDist2) {
      bestDist2 = d2;
      bestIndex = i;
    }
  }

  readBuffer.unmap();
  readBuffer.destroy();

  if (bestIndex === -1) return null;
  return { index: bestIndex, dist2: bestDist2 };
}
