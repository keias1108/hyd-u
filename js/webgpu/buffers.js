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
   * Update simulation parameters buffer
   */
  updateParamsBuffer(params) {
    this.device.queue.writeBuffer(this.paramsBuffer, 0, params);
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
}
