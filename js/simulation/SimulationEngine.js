/**
 * Simulation Engine
 * Orchestrates compute shader execution for field updates
 */

export class SimulationEngine {
  constructor(device, buffers, parameters) {
    this.device = device;
    this.buffers = buffers;
    this.parameters = parameters;

    // Ping-pong buffer index for O field (0 = A current, 1 = B current)
    this.oBufferIndex = 0;

    // Frame counter
    this.frameCount = 0;

    // Compute pipelines (will be initialized in init())
    this.rPipeline = null;
    this.oPipeline = null;
    this.cPipeline = null;

    // Bind groups
    this.rBindGroup = null;
    this.oBindGroupA = null;  // Read from A, write to B
    this.oBindGroupB = null;  // Read from B, write to A
    this.cBindGroupA = null;  // Use O from A
    this.cBindGroupB = null;  // Use O from B
  }

  /**
   * Initialize compute pipelines
   */
  async init() {
    // Load shader code
    const updateRCode = await this.loadShader('shaders/compute/updateR.wgsl');
    const updateOCode = await this.loadShader('shaders/compute/updateO.wgsl');
    const computeCCode = await this.loadShader('shaders/compute/computeC.wgsl');

    // Create pipelines
    await this.createRPipeline(updateRCode);
    await this.createOPipeline(updateOCode);
    await this.createCPipeline(computeCCode);

    console.log('Simulation engine initialized');
  }

  /**
   * Load shader code from file
   */
  async loadShader(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${path}`);
    }
    return await response.text();
  }

  /**
   * Create R field update pipeline
   */
  async createRPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'R Field Update Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'R Field Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'R Field Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.rPipeline = this.device.createComputePipeline({
      label: 'R Field Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create bind group
    this.rBindGroup = this.device.createBindGroup({
      label: 'R Field Bind Group',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.rField } },
        { binding: 1, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 2, resource: { buffer: this.buffers.paramsBuffer } },
      ],
    });
  }

  /**
   * Create O field update pipeline
   */
  async createOPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'O Field Update Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'O Field Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'O Field Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.oPipeline = this.device.createComputePipeline({
      label: 'O Field Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create bind groups for both ping-pong directions
    // A -> B (read from A, write to B)
    this.oBindGroupA = this.device.createBindGroup({
      label: 'O Field Bind Group A',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.oFieldA } },
        { binding: 1, resource: { buffer: this.buffers.oFieldB } },
        { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 3, resource: { buffer: this.buffers.paramsBuffer } },
      ],
    });

    // B -> A (read from B, write to A)
    this.oBindGroupB = this.device.createBindGroup({
      label: 'O Field Bind Group B',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.oFieldB } },
        { binding: 1, resource: { buffer: this.buffers.oFieldA } },
        { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 3, resource: { buffer: this.buffers.paramsBuffer } },
      ],
    });
  }

  /**
   * Create C field computation pipeline
   */
  async createCPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'C Field Compute Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'C Field Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'C Field Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.cPipeline = this.device.createComputePipeline({
      label: 'C Field Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create bind groups for both O buffer states
    // Use O from A (when index = 0 -> wrote to B, so current is B)
    // Wait, after step: if index was 0, we read A write B, then swap to index 1
    // So when index = 1, current O is in B
    this.cBindGroupA = this.device.createBindGroup({
      label: 'C Field Bind Group A',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.rField } },
        { binding: 1, resource: { buffer: this.buffers.oFieldB } },  // After A->B swap
        { binding: 2, resource: { buffer: this.buffers.cField } },
        { binding: 3, resource: { buffer: this.buffers.gridInfoBuffer } },
      ],
    });

    this.cBindGroupB = this.device.createBindGroup({
      label: 'C Field Bind Group B',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.rField } },
        { binding: 1, resource: { buffer: this.buffers.oFieldA } },  // After B->A swap
        { binding: 2, resource: { buffer: this.buffers.cField } },
        { binding: 3, resource: { buffer: this.buffers.gridInfoBuffer } },
      ],
    });
  }

  /**
   * Execute one simulation step
   */
  step() {
    const encoder = this.device.createCommandEncoder({
      label: 'Simulation Step Command Encoder'
    });

    const workgroupsX = Math.ceil(this.buffers.gridWidth / 8);
    const workgroupsY = Math.ceil(this.buffers.gridHeight / 8);

    // 1. Update R field (forced injection pattern)
    {
      const pass = encoder.beginComputePass({ label: 'Update R Field' });
      pass.setPipeline(this.rPipeline);
      pass.setBindGroup(0, this.rBindGroup);
      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // 2. Update O field (relaxation with ping-pong)
    {
      const pass = encoder.beginComputePass({ label: 'Update O Field' });
      pass.setPipeline(this.oPipeline);

      // Use appropriate bind group based on current buffer index
      const bindGroup = this.oBufferIndex === 0 ? this.oBindGroupA : this.oBindGroupB;
      pass.setBindGroup(0, bindGroup);

      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // Swap O buffer index BEFORE computing C (so C uses the newly written buffer)
    this.oBufferIndex = 1 - this.oBufferIndex;

    // 3. Compute C = R * O
    {
      const pass = encoder.beginComputePass({ label: 'Compute C Field' });
      pass.setPipeline(this.cPipeline);

      // Use appropriate bind group (now index points to newly written O buffer)
      const bindGroup = this.oBufferIndex === 0 ? this.cBindGroupB : this.cBindGroupA;
      pass.setBindGroup(0, bindGroup);

      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
    this.frameCount++;
  }

  /**
   * Get current O buffer for rendering
   */
  getCurrentOBuffer() {
    return this.oBufferIndex === 0 ? this.buffers.oFieldA : this.buffers.oFieldB;
  }
}
