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

    // R field (single buffer, overwritten each frame)
    this.rField = this.device.createBuffer({
      size: fieldBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'R Field Buffer'
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

    console.log(`Created field buffers: ${this.gridWidth}x${this.gridHeight} = ${this.gridSize} cells`);
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

    this.device.queue.writeBuffer(this.rField, 0, data);

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
}
