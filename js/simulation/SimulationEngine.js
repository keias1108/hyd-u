/**
 * Simulation Engine
 * Orchestrates compute shader execution for field updates
 */

export class SimulationEngine {
  constructor(device, buffers, parameters) {
    this.device = device;
    this.buffers = buffers;
    this.parameters = parameters;

    // Ping-pong buffer indices (0 = A current, 1 = B current)
    this.rBufferIndex = 0;
    // Ping-pong buffer index for O field
    this.oBufferIndex = 0;

    // Ping-pong buffer index for M field
    this.mBufferIndex = 0;

    // Ping-pong buffer index for H field (0 = A current, 1 = B current)
    this.hBufferIndex = 0;

    // Ping-pong buffer index for Particles
    this.pBufferIndex = 0;
    this.p2BufferIndex = 0;

    // Frame counter
    this.frameCount = 0;

    // Compute pipelines (will be initialized in init())
    this.rPipeline = null;
    this.oPipeline = null;
    this.cPipeline = null;
    this.mPipeline = null;
    this.hPipeline = null;
    this.hDiffusePipeline = null;
    this.pPipeline = null;
    this.p2Pipeline = null;
    this.clearDensityPipeline = null;
    this.accumulateDensityPipeline = null;
    this.clearPredatorsPipeline = null;

    // Bind groups
    this.rBindGroup = null;
    this.oBindGroupA = null;  // Read from A, write to B
    this.oBindGroupB = null;  // Read from B, write to A
    this.cBindGroupA = null;  // Use O from A
    this.cBindGroupB = null;  // Use O from B
    this.hBindGroupA = null;  // H: Read from A, write to B
    this.hBindGroupB = null;  // H: Read from B, write to A
    this.hDiffuseBindGroupA = null;  // H diffusion: A → B
    this.hDiffuseBindGroupB = null;  // H diffusion: B → A
  }

  /**
   * Initialize compute pipelines
   */
  async init() {
    // Load shader code
    const updateRCode = await this.loadShader('shaders/compute/updateR.wgsl');
    const updateOCode = await this.loadShader('shaders/compute/updateO.wgsl');
    const computeCCode = await this.loadShader('shaders/compute/computeC.wgsl');
    const updateMCode = await this.loadShader('shaders/compute/updateM.wgsl');
    const updateHCode = await this.loadShader('shaders/compute/updateH.wgsl');
    const diffuseHCode = await this.loadShader('shaders/compute/diffuseH.wgsl');
    const updatePCode = await this.loadShader('shaders/compute/updateP.wgsl');
    const updateP2Code = await this.loadShader('shaders/compute/updateP2.wgsl');
    const clearDensityCode = await this.loadShader('shaders/compute/clearDensity.wgsl');
    const accumulateDensityCode = await this.loadShader('shaders/compute/accumulateDensity.wgsl');
    const clearParticlesCode = await this.loadShader('shaders/compute/clearParticlesU32.wgsl');

    // Create pipelines
    await this.createRPipeline(updateRCode);
    await this.createOPipeline(updateOCode);
    await this.createCPipeline(computeCCode);
    await this.createMPipeline(updateMCode);
    await this.createHPipeline(updateHCode);
    await this.createHDiffusePipeline(diffuseHCode);
    await this.createPPipeline(updatePCode);
    await this.createP2Pipeline(updateP2Code);
    await this.createClearDensityPipeline(clearDensityCode);
    await this.createAccumulateDensityPipeline(accumulateDensityCode);
    await this.createClearPredatorsPipeline(clearParticlesCode);

    console.log('Simulation engine initialized with H field');
  }

  /**
   * Load shader code from file
   */
  async loadShader(path) {
    const cacheBustedPath = `${path}?v=${Date.now()}`;
    const response = await fetch(cacheBustedPath, { cache: 'no-store' });
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
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // rFieldIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // rFieldOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // params
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
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // oFieldIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // oFieldOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // rField
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // mField
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // bField
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // params
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

    // Bind groups are created dynamically in step() to follow ping-pong buffers
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

    // Bind groups are created dynamically in step()
  }

  /**
   * Create M field update pipeline
   */
  async createMPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'M Field Update Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'M Field Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // mFieldIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // mFieldOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // bField
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // bLongField
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // params
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'M Field Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.mPipeline = this.device.createComputePipeline({
      label: 'M Field Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Create H field update pipeline
   */
  async createHPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'H Field Update Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'H Field Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // hFieldIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // hFieldOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // rField
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // oField
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // mField
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // params
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'H Field Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.hPipeline = this.device.createComputePipeline({
      label: 'H Field Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Bind groups are created dynamically in step()
  }

  /**
   * Create H field diffusion pipeline
   */
  async createHDiffusePipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'H Field Diffusion Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'H Diffuse Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // hFieldIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // hFieldOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // params
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'H Diffuse Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.hDiffusePipeline = this.device.createComputePipeline({
      label: 'H Diffuse Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create bind groups
    this.hDiffuseBindGroupA = this.device.createBindGroup({
      label: 'H Diffuse Bind Group A',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.hFieldA } },
        { binding: 1, resource: { buffer: this.buffers.hFieldB } },
        { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 3, resource: { buffer: this.buffers.paramsBuffer } },
      ],
    });

    this.hDiffuseBindGroupB = this.device.createBindGroup({
      label: 'H Diffuse Bind Group B',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.hFieldB } },
        { binding: 1, resource: { buffer: this.buffers.hFieldA } },
        { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 3, resource: { buffer: this.buffers.paramsBuffer } },
      ],
    });
  }

  /**
   * Create Particle update pipeline
   */
  async createPPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'Particle Update Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Particle Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particlesIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // particlesOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // bField
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // particleParams
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // simParams
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // p2Density
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // predatorParams
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Particle Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.pPipeline = this.device.createComputePipeline({
      label: 'Particle Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Create Predator update pipeline
   */
  async createP2Pipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'Predator Update Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Predator Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // predatorsIn
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // predatorsOut
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // pDensity
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // predatorParams
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // simParams
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Predator Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.p2Pipeline = this.device.createComputePipeline({
      label: 'Predator Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Create density clear pipeline
   */
  async createClearDensityPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'Density Clear Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Density Clear Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // density
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, // gridInfo
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Density Clear Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.clearDensityPipeline = this.device.createComputePipeline({
      label: 'Density Clear Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Create density accumulation pipeline
   */
  async createAccumulateDensityPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'Density Accumulate Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Density Accumulate Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particles
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // density
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // gridInfo
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Density Accumulate Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.accumulateDensityPipeline = this.device.createComputePipeline({
      label: 'Density Accumulate Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Create predator buffer clear pipeline (u32 zeroing)
   */
  async createClearPredatorsPipeline(code) {
    const shaderModule = this.device.createShaderModule({
      label: 'Predator Buffer Clear Shader',
      code: code,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Predator Buffer Clear Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // data (u32)
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Predator Buffer Clear Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.clearPredatorsPipeline = this.device.createComputePipeline({
      label: 'Predator Buffer Clear Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
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

    // 1. Update R field (source + diffusion + optional advection, ping-pong)
    {
      const pass = encoder.beginComputePass({ label: 'Update R Field' });
      pass.setPipeline(this.rPipeline);

      const currentRBuffer = this.buffers.getRBufferCurrent(this.rBufferIndex);
      const nextRBuffer = this.buffers.getRBufferNext(this.rBufferIndex);

      const rBindGroup = this.device.createBindGroup({
        label: 'R Field Bind Group (dynamic)',
        layout: this.rPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentRBuffer } },
          { binding: 1, resource: { buffer: nextRBuffer } },
          { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
          { binding: 3, resource: { buffer: this.buffers.paramsBuffer } },
        ],
      });

      pass.setBindGroup(0, rBindGroup);
      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // Swap R buffer index
    this.rBufferIndex = 1 - this.rBufferIndex;

    // 2. Update O field (relaxation + reaction + diffusion with ping-pong)
    {
      const pass = encoder.beginComputePass({ label: 'Update O Field' });
      pass.setPipeline(this.oPipeline);

      const currentOBuffer = this.buffers.getOBufferCurrent(this.oBufferIndex);
      const nextOBuffer = this.buffers.getOBufferNext(this.oBufferIndex);
      const currentRBuffer = this.buffers.getRBufferCurrent(this.rBufferIndex);
      const currentMBuffer = this.buffers.getMBufferCurrent(this.mBufferIndex);

      const oBindGroup = this.device.createBindGroup({
        label: 'O Field Bind Group (dynamic)',
        layout: this.oPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentOBuffer } },
          { binding: 1, resource: { buffer: nextOBuffer } },
          { binding: 2, resource: { buffer: currentRBuffer } },
          { binding: 3, resource: { buffer: currentMBuffer } },
          { binding: 4, resource: { buffer: this.buffers.bField } },
          { binding: 5, resource: { buffer: this.buffers.gridInfoBuffer } },
          { binding: 6, resource: { buffer: this.buffers.paramsBuffer } },
        ],
      });

      pass.setBindGroup(0, oBindGroup);

      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // Swap O buffer index BEFORE computing C (so C uses the newly written buffer)
    this.oBufferIndex = 1 - this.oBufferIndex;

    // 3. Compute C = R * O
    {
      const pass = encoder.beginComputePass({ label: 'Compute C Field' });
      pass.setPipeline(this.cPipeline);

      const currentOBuffer = this.buffers.getOBufferCurrent(this.oBufferIndex);
      const currentRBuffer = this.buffers.getRBufferCurrent(this.rBufferIndex);

      const cBindGroup = this.device.createBindGroup({
        label: 'C Field Bind Group (dynamic)',
        layout: this.cPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentRBuffer } },
          { binding: 1, resource: { buffer: currentOBuffer } },
          { binding: 2, resource: { buffer: this.buffers.cField } },
          { binding: 3, resource: { buffer: this.buffers.gridInfoBuffer } },
        ],
      });

      pass.setBindGroup(0, cBindGroup);

      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // 4. Update H field (production + decay)
    // Note: H bind groups reference oFieldA statically, but we need current O buffer
    // For simplicity, we create bind groups dynamically here
    {
      const pass = encoder.beginComputePass({ label: 'Update H Field' });
      pass.setPipeline(this.hPipeline);

      // Create dynamic bind group with current O buffer
      const currentOBuffer = this.oBufferIndex === 0 ? this.buffers.oFieldA : this.buffers.oFieldB;
      const currentHBuffer = this.hBufferIndex === 0 ? this.buffers.hFieldA : this.buffers.hFieldB;
      const nextHBuffer = this.hBufferIndex === 0 ? this.buffers.hFieldB : this.buffers.hFieldA;
      const currentMBuffer = this.buffers.getMBufferCurrent(this.mBufferIndex);

      const hBindGroup = this.device.createBindGroup({
        label: 'H Field Bind Group (dynamic)',
        layout: this.hPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentHBuffer } },
          { binding: 1, resource: { buffer: nextHBuffer } },
          { binding: 2, resource: { buffer: this.buffers.getRBufferCurrent(this.rBufferIndex) } },
          { binding: 3, resource: { buffer: currentOBuffer } },
          { binding: 4, resource: { buffer: currentMBuffer } },
          { binding: 5, resource: { buffer: this.buffers.gridInfoBuffer } },
          { binding: 6, resource: { buffer: this.buffers.paramsBuffer } },
        ],
      });

      pass.setBindGroup(0, hBindGroup);
      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // 4.5 Swap H buffer index
    this.hBufferIndex = 1 - this.hBufferIndex;

    // 5. Diffuse H field
    {
      const pass = encoder.beginComputePass({ label: 'Diffuse H Field' });
      pass.setPipeline(this.hDiffusePipeline);

      // Use appropriate bind group based on current buffer index
      const bindGroup = this.hBufferIndex === 0 ? this.hDiffuseBindGroupA : this.hDiffuseBindGroupB;
      pass.setBindGroup(0, bindGroup);

      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // 5.5 Swap H buffer index again
    this.hBufferIndex = 1 - this.hBufferIndex;

    // 6. Update M field (growth/decay)
    {
      const pass = encoder.beginComputePass({ label: 'Update M Field' });
      pass.setPipeline(this.mPipeline);

      const currentMBuffer = this.buffers.getMBufferCurrent(this.mBufferIndex);
      const nextMBuffer = this.buffers.getMBufferNext(this.mBufferIndex);

      const mBindGroup = this.device.createBindGroup({
        label: 'M Field Bind Group (dynamic)',
        layout: this.mPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentMBuffer } },
          { binding: 1, resource: { buffer: nextMBuffer } },
          { binding: 2, resource: { buffer: this.buffers.bField } },
          { binding: 3, resource: { buffer: this.buffers.bLongField } },
          { binding: 4, resource: { buffer: this.buffers.gridInfoBuffer } },
          { binding: 5, resource: { buffer: this.buffers.paramsBuffer } },
        ],
      });

      pass.setBindGroup(0, mBindGroup);
      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
    }

    // Swap M buffer index
    this.mBufferIndex = 1 - this.mBufferIndex;

    // 7. Clear P density buffer
    {
      const pass = encoder.beginComputePass({ label: 'Clear P Density Buffer' });
      pass.setPipeline(this.clearDensityPipeline);

      const clearWorkgroups = Math.ceil((this.buffers.gridWidth * this.buffers.gridHeight) / 256);

      const pDensityBindGroup = this.device.createBindGroup({
        label: 'Clear P Density Bind Group',
        layout: this.clearDensityPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.pDensity } },
          { binding: 1, resource: { buffer: this.buffers.gridInfoBuffer } },
        ],
      });

      pass.setBindGroup(0, pDensityBindGroup);
      pass.dispatchWorkgroups(clearWorkgroups);
      pass.end();
    }

    // 8. Accumulate P density
    {
      const pass = encoder.beginComputePass({ label: 'Accumulate P Density' });
      pass.setPipeline(this.accumulateDensityPipeline);

      const currentPBuffer = this.buffers.getParticleBufferCurrent(this.pBufferIndex);
      const pDensityBindGroup = this.device.createBindGroup({
        label: 'Accumulate P Density Bind Group',
        layout: this.accumulateDensityPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentPBuffer } },
          { binding: 1, resource: { buffer: this.buffers.pDensity } },
          { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
        ],
      });

      const particleWorkgroups = Math.ceil(this.buffers.maxParticles / 64);
      pass.setBindGroup(0, pDensityBindGroup);
      pass.dispatchWorkgroups(particleWorkgroups);
      pass.end();
    }

    // 9. Clear next predator buffer (avoid spawn overwrite race)
    {
      const pass = encoder.beginComputePass({ label: 'Clear Next P2 Buffer' });
      pass.setPipeline(this.clearPredatorsPipeline);

      const nextP2Buffer = this.buffers.getPredatorBufferNext(this.p2BufferIndex);
      const clearBindGroup = this.device.createBindGroup({
        label: 'Clear Next P2 Bind Group',
        layout: this.clearPredatorsPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: nextP2Buffer } },
        ],
      });

      const clearWorkgroups = Math.ceil((this.buffers.maxPredators * 8) / 256);
      pass.setBindGroup(0, clearBindGroup);
      pass.dispatchWorkgroups(clearWorkgroups);
      pass.end();
    }

    // 10. Update Predators (follow ∇P)
    {
      const pass = encoder.beginComputePass({ label: 'Update P2 Predators' });
      pass.setPipeline(this.p2Pipeline);

      const currentP2Buffer = this.buffers.getPredatorBufferCurrent(this.p2BufferIndex);
      const nextP2Buffer = this.buffers.getPredatorBufferNext(this.p2BufferIndex);

      const p2BindGroup = this.device.createBindGroup({
        label: 'P2 Bind Group (dynamic)',
        layout: this.p2Pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentP2Buffer } },
          { binding: 1, resource: { buffer: nextP2Buffer } },
          { binding: 2, resource: { buffer: this.buffers.pDensity } },
          { binding: 3, resource: { buffer: this.buffers.gridInfoBuffer } },
          { binding: 4, resource: { buffer: this.buffers.predatorParamsBuffer } },
          { binding: 5, resource: { buffer: this.buffers.paramsBuffer } },
        ],
      });

      const predatorWorkgroups = Math.ceil(this.buffers.maxPredators / 64);
      pass.setBindGroup(0, p2BindGroup);
      pass.dispatchWorkgroups(predatorWorkgroups);
      pass.end();
    }

    // Swap predator buffer index
    this.p2BufferIndex = 1 - this.p2BufferIndex;

    // 11. Clear P2 density buffer (after predator movement)
    {
      const pass = encoder.beginComputePass({ label: 'Clear P2 Density Buffer' });
      pass.setPipeline(this.clearDensityPipeline);

      const clearWorkgroups = Math.ceil((this.buffers.gridWidth * this.buffers.gridHeight) / 256);
      const p2DensityBindGroup = this.device.createBindGroup({
        label: 'Clear P2 Density Bind Group',
        layout: this.clearDensityPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.p2Density } },
          { binding: 1, resource: { buffer: this.buffers.gridInfoBuffer } },
        ],
      });

      pass.setBindGroup(0, p2DensityBindGroup);
      pass.dispatchWorkgroups(clearWorkgroups);
      pass.end();
    }

    // 12. Accumulate P2 density (after movement)
    {
      const pass = encoder.beginComputePass({ label: 'Accumulate P2 Density' });
      pass.setPipeline(this.accumulateDensityPipeline);

      const currentP2Buffer = this.buffers.getPredatorBufferCurrent(this.p2BufferIndex);
      const p2DensityBindGroup = this.device.createBindGroup({
        label: 'Accumulate P2 Density Bind Group',
        layout: this.accumulateDensityPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentP2Buffer } },
          { binding: 1, resource: { buffer: this.buffers.p2Density } },
          { binding: 2, resource: { buffer: this.buffers.gridInfoBuffer } },
        ],
      });

      const predatorWorkgroups = Math.ceil(this.buffers.maxPredators / 64);
      pass.setBindGroup(0, p2DensityBindGroup);
      pass.dispatchWorkgroups(predatorWorkgroups);
      pass.end();
    }

    // 13. Update Particles (follow ∇B + avoid predators)
    {
      const pass = encoder.beginComputePass({ label: 'Update P Particles' });
      pass.setPipeline(this.pPipeline);

      const currentPBuffer = this.buffers.getParticleBufferCurrent(this.pBufferIndex);
      const nextPBuffer = this.buffers.getParticleBufferNext(this.pBufferIndex);

      const pBindGroup = this.device.createBindGroup({
        label: 'P Field Bind Group (dynamic)',
        layout: this.pPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: currentPBuffer } },
          { binding: 1, resource: { buffer: nextPBuffer } },
          { binding: 2, resource: { buffer: this.buffers.bField } },
          { binding: 3, resource: { buffer: this.buffers.gridInfoBuffer } },
          { binding: 4, resource: { buffer: this.buffers.particleParamsBuffer } },
          { binding: 5, resource: { buffer: this.buffers.paramsBuffer } },
          { binding: 6, resource: { buffer: this.buffers.p2Density } },
          { binding: 7, resource: { buffer: this.buffers.predatorParamsBuffer } },
        ],
      });

      // Dispatch for ALL particles (not just active count), shader filters by state
      const particleWorkgroups = Math.ceil(this.buffers.maxParticles / 64);
      pass.setBindGroup(0, pBindGroup);
      pass.dispatchWorkgroups(particleWorkgroups);
      pass.end();
    }

    // Swap particle buffer index
    this.pBufferIndex = 1 - this.pBufferIndex;

    this.device.queue.submit([encoder.finish()]);
    this.frameCount++;
  }

  /**
   * Get current O buffer for rendering
   */
  getCurrentOBuffer() {
    return this.oBufferIndex === 0 ? this.buffers.oFieldA : this.buffers.oFieldB;
  }

  /**
   * Get current R buffer for rendering/stats
   */
  getCurrentRBuffer() {
    return this.rBufferIndex === 0 ? this.buffers.rFieldA : this.buffers.rFieldB;
  }

  /**
   * Get current M buffer for rendering/stats
   */
  getCurrentMBuffer() {
    return this.mBufferIndex === 0 ? this.buffers.mFieldA : this.buffers.mFieldB;
  }

  /**
   * Get current H buffer for rendering
   */
  getCurrentHBuffer() {
    return this.hBufferIndex === 0 ? this.buffers.hFieldA : this.buffers.hFieldB;
  }

  /**
   * Get current Particle buffer for rendering
   */
  getCurrentPBuffer() {
    return this.pBufferIndex === 0 ? this.buffers.particleBufferA : this.buffers.particleBufferB;
  }

  /**
   * Get current Predator buffer for rendering
   */
  getCurrentP2Buffer() {
    return this.p2BufferIndex === 0 ? this.buffers.predatorBufferA : this.buffers.predatorBufferB;
  }
}
