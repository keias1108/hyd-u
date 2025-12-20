/**
 * Buffer Management for Simulation Fields
 * Creates and manages GPU buffers for field data and parameters
 */

export class SimulationBuffers {
  constructor(device, gridWidth, gridHeight) {
    this.device = device;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.gridSize = gridWidth * gridHeight;
    this.maxParticles = 16384; // fixed max particle capacity
    this.maxPredators = 16384; // fixed max predator capacity

    // Create all buffers
    this.createFieldBuffers();
    this.createUniformBuffers();
  }

  /**
   * Create storage buffers for field data
   */
  createFieldBuffers() {
    const fieldBufferSize = this.gridSize * 4; // f32 = 4 bytes

    // R field (ping-pong for diffusion/advection updates)
    this.rFieldA = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'R Field Buffer A'
    });

    this.rFieldB = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'R Field Buffer B'
    });

    // O field (ping-pong buffers for compute shader updates)
    this.oFieldA = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'O Field Buffer A'
    });

    this.oFieldB = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'O Field Buffer B'
    });

    // C field (computed overlap R * O)
    this.cField = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'C Field Buffer'
    });

    // M field (ping-pong)
    this.mFieldA = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'M Field Buffer A'
    });

    this.mFieldB = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'M Field Buffer B'
    });

    // B field (accumulated feed)
    this.bField = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'B Field Buffer'
    });

    // B long-term average field
    this.bLongField = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'B Long Field Buffer'
    });

    // Particle buffers (ping-pong, each particle = 32 bytes: pos, vel, energy, type, state, age)
    const particleStride = 32; // bytes (was 16)
    const particleBufferSize = this.maxParticles * particleStride;

    this.particleBufferA = this.device.createBuffer({
      size: particleBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'Particle Buffer A'
    });

    this.particleBufferB = this.device.createBuffer({
      size: particleBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'Particle Buffer B'
    });

    // Predator particle buffers (ping-pong)
    const predatorBufferSize = this.maxPredators * particleStride;
    this.predatorBufferA = this.device.createBuffer({
      size: predatorBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'Predator Buffer A'
    });

    this.predatorBufferB = this.device.createBuffer({
      size: predatorBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'Predator Buffer B'
    });

    // Particle density buffers (atomic u32 per cell)
    const densityBufferSize = this.gridSize * 4; // u32 = 4 bytes
    this.pDensity = this.device.createBuffer({
      size: densityBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'P Density Buffer'
    });

    this.p2Density = this.device.createBuffer({
      size: densityBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'P2 Density Buffer'
    });

    // H field (ping-pong for diffusion)
    this.hFieldA = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'H Field Buffer A'
    });

    this.hFieldB = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'H Field Buffer B'
    });

    console.log(`Created field buffers including H field: ${this.gridWidth}x${this.gridHeight} = ${this.gridSize} cells`);
  }

  /**
   * Create uniform buffers for parameters
   */
  createUniformBuffers() {
    // Grid info: width, height, padding (16 bytes aligned)
    this.gridInfoBuffer = this.device.createBuffer({
      size: 16, // 4 * u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Grid Info Buffer'
    });

    // Simulation parameters (must match WGSL struct layout)
    // Aligned to 256 bytes for safety (uniform buffer alignment requirements)
    this.paramsBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Simulation Parameters Buffer'
    });

    // Particle parameters
    this.particleParamsBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Particle Parameters Buffer'
    });

    // Predator parameters
    this.predatorParamsBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Predator Parameters Buffer'
    });

    // Render parameters (visualization mode, color scheme)
    this.renderParamsBuffer = this.device.createBuffer({
      size: 16, // 4 * u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Render Parameters Buffer'
    });

    // Write grid info (constant)
    const gridInfo = new Uint32Array([
      this.gridWidth,
      this.gridHeight,
      0, // padding
      0  // padding
    ]);
    this.device.queue.writeBuffer(this.gridInfoBuffer, 0, gridInfo);

    console.log('Created uniform buffers');
  }

  /**
   * Initialize O field to background concentration O0
   */
  initializeOField(o0) {
    const data = new Float32Array(this.gridSize);
    data.fill(o0);

    this.device.queue.writeBuffer(this.oFieldA, 0, data);
    this.device.queue.writeBuffer(this.oFieldB, 0, data);

    console.log(`Initialized O field to ${o0}`);
  }

  /**
   * Initialize R field to zeros (will be set by compute shader)
   */
  initializeRField() {
    const data = new Float32Array(this.gridSize);
    data.fill(0.0);

    this.device.queue.writeBuffer(this.rFieldA, 0, data);
    this.device.queue.writeBuffer(this.rFieldB, 0, data);

    console.log('Initialized R field to 0');
  }

  /**
   * Initialize C field to zeros
   */
  initializeCField() {
    const data = new Float32Array(this.gridSize);
    data.fill(0.0);

    this.device.queue.writeBuffer(this.cField, 0, data);

    console.log('Initialized C field to 0');
  }

  /**
   * Initialize M field with small noise
   */
  initializeMField(base = 0.001) {
    const data = new Float32Array(this.gridSize);
    for (let i = 0; i < this.gridSize; i++) {
      const noise = (Math.random() - 0.5) * 0.0005; // tiny variation
      data[i] = Math.max(0, base + noise);
    }

    this.device.queue.writeBuffer(this.mFieldA, 0, data);
    this.device.queue.writeBuffer(this.mFieldB, 0, data);

    console.log(`Initialized M field to ~${base} with noise`);
  }

  /**
   * Initialize B field to zeros
   */
  initializeBField() {
    const data = new Float32Array(this.gridSize);
    data.fill(0.0);

    this.device.queue.writeBuffer(this.bField, 0, data);

    console.log('Initialized B field to 0');
  }

  /**
   * Initialize long-term B field to zeros
   */
  initializeBLongField() {
    const data = new Float32Array(this.gridSize);
    data.fill(0.0);

    this.device.queue.writeBuffer(this.bLongField, 0, data);

    console.log('Initialized B long field to 0');
  }

  /**
   * Initialize particle buffers with random positions, zero velocity, and default states
   * Particle structure: pos(vec2), vel(vec2), energy(f32), type(u32), state(u32), age(f32)
   */
  initializeParticles(activeCount) {
    const data = new Float32Array(this.maxParticles * 8); // 4 → 8 floats per particle

    for (let i = 0; i < this.maxParticles; i++) {
      const base = i * 8;

      if (i < activeCount) {
        // Active particle
        data[base]     = Math.random() * this.gridWidth;   // pos.x
        data[base + 1] = Math.random() * this.gridHeight;  // pos.y
        data[base + 2] = 0.0;                              // vel.x
        data[base + 3] = 0.0;                              // vel.y
        data[base + 4] = 1.0;                              // energy (initial = 1.0)

        // u32 type: convert to f32 for buffer (will be interpreted as u32 in shader)
        const typeU32 = new Uint32Array([0]); // type = 0 (default species)
        data[base + 5] = new Float32Array(typeU32.buffer)[0];

        // u32 state: 1 = active
        const stateU32 = new Uint32Array([1]);
        data[base + 6] = new Float32Array(stateU32.buffer)[0];

        data[base + 7] = Math.random() * Math.PI * 2;      // age = random initial direction (0~2π)
      } else {
        // Inactive particle
        for (let j = 0; j < 8; j++) {
          data[base + j] = 0.0;
        }
        // state = 0 (inactive)
        const stateU32 = new Uint32Array([0]);
        data[base + 6] = new Float32Array(stateU32.buffer)[0];
      }
    }

    this.device.queue.writeBuffer(this.particleBufferA, 0, data);
    this.device.queue.writeBuffer(this.particleBufferB, 0, data);

    console.log(`Initialized particles: active ${activeCount}, capacity ${this.maxParticles}, stride 32 bytes`);
  }

  /**
   * Initialize predator buffers with random positions, zero velocity, and default states
   * Particle structure: pos(vec2), vel(vec2), energy(f32), type(u32), state(u32), age(f32)
   */
  initializePredators(activeCount) {
    const data = new Float32Array(this.maxPredators * 8);

    for (let i = 0; i < this.maxPredators; i++) {
      const base = i * 8;

      if (i < activeCount) {
        data[base] = Math.random() * this.gridWidth;
        data[base + 1] = Math.random() * this.gridHeight;
        data[base + 2] = 0.0;
        data[base + 3] = 0.0;
        data[base + 4] = 1.0;

        const typeU32 = new Uint32Array([1]); // type = 1 (predator)
        data[base + 5] = new Float32Array(typeU32.buffer)[0];

        const stateU32 = new Uint32Array([1]);
        data[base + 6] = new Float32Array(stateU32.buffer)[0];

        data[base + 7] = Math.random() * Math.PI * 2;
      } else {
        for (let j = 0; j < 8; j++) {
          data[base + j] = 0.0;
        }
        const stateU32 = new Uint32Array([0]);
        data[base + 6] = new Float32Array(stateU32.buffer)[0];
      }
    }

    this.device.queue.writeBuffer(this.predatorBufferA, 0, data);
    this.device.queue.writeBuffer(this.predatorBufferB, 0, data);

    console.log(`Initialized predators: active ${activeCount}, capacity ${this.maxPredators}, stride 32 bytes`);
  }

  /**
   * Update simulation parameters buffer
   */
  updateParamsBuffer(params) {
    this.device.queue.writeBuffer(this.paramsBuffer, 0, params);
  }

  /**
   * Update particle parameters buffer
   */
  updateParticleParamsBuffer(params) {
    this.device.queue.writeBuffer(this.particleParamsBuffer, 0, params);
  }

  /**
   * Update predator parameters buffer
   */
  updatePredatorParamsBuffer(params) {
    this.device.queue.writeBuffer(this.predatorParamsBuffer, 0, params);
  }

  /**
   * Update render parameters buffer
   */
  updateRenderParamsBuffer(params) {
    this.device.queue.writeBuffer(this.renderParamsBuffer, 0, params);
  }

  /**
   * Get current O buffer based on ping-pong index
   */
  getOBufferCurrent(index) {
    return index === 0 ? this.oFieldA : this.oFieldB;
  }

  /**
   * Get next O buffer based on ping-pong index
   */
  getOBufferNext(index) {
    return index === 0 ? this.oFieldB : this.oFieldA;
  }

  /**
   * Get current R buffer based on ping-pong index
   */
  getRBufferCurrent(index) {
    return index === 0 ? this.rFieldA : this.rFieldB;
  }

  /**
   * Get next R buffer based on ping-pong index
   */
  getRBufferNext(index) {
    return index === 0 ? this.rFieldB : this.rFieldA;
  }

  /**
   * Initialize H field to background concentration h0
   */
  initializeHField(h0) {
    const data = new Float32Array(this.gridSize);
    data.fill(h0);

    this.device.queue.writeBuffer(this.hFieldA, 0, data);
    this.device.queue.writeBuffer(this.hFieldB, 0, data);

    console.log(`Initialized H field to ${h0}`);
  }

  /**
   * Get current H buffer based on ping-pong index
   */
  getHBufferCurrent(index) {
    return index === 0 ? this.hFieldA : this.hFieldB;
  }

  /**
   * Get next H buffer based on ping-pong index
   */
  getHBufferNext(index) {
    return index === 0 ? this.hFieldB : this.hFieldA;
  }

  /**
   * Get current M buffer based on ping-pong index
   */
  getMBufferCurrent(index) {
    return index === 0 ? this.mFieldA : this.mFieldB;
  }

  /**
   * Get next M buffer based on ping-pong index
   */
  getMBufferNext(index) {
    return index === 0 ? this.mFieldB : this.mFieldA;
  }

  /**
   * Get current particle buffer based on ping-pong index
   */
  getParticleBufferCurrent(index) {
    return index === 0 ? this.particleBufferA : this.particleBufferB;
  }

  /**
   * Get next particle buffer based on ping-pong index
   */
  getParticleBufferNext(index) {
    return index === 0 ? this.particleBufferB : this.particleBufferA;
  }

  /**
   * Get current predator buffer based on ping-pong index
   */
  getPredatorBufferCurrent(index) {
    return index === 0 ? this.predatorBufferA : this.predatorBufferB;
  }

  /**
   * Get next predator buffer based on ping-pong index
   */
  getPredatorBufferNext(index) {
    return index === 0 ? this.predatorBufferB : this.predatorBufferA;
  }
}
