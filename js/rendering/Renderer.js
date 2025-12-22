/**
 * Renderer
 * Handles visualization of simulation fields
 */

export class Renderer {
  constructor(device, context, buffers, parameters, simulationEngine) {
    this.device = device;
    this.context = context;
    this.buffers = buffers;
    this.parameters = parameters;
    this.simulationEngine = simulationEngine;

    // Render pipeline
    this.renderPipeline = null;
    this.particlePipeline = null;
    this.predatorPipeline = null;
    this.renderBindGroup = null;
    this.particleBindGroup = null;
    this.predatorBindGroup = null;

    // Presentation format
    this.presentationFormat = context.getCurrentTexture().format;
  }

  /**
   * Initialize render pipeline
   */
  async init() {
    // Load shader code
    const shaderCode = await this.loadShader('shaders/render/visualize.wgsl');
    const particleShaderCode = await this.loadShader('shaders/render/renderParticles.wgsl');
    const predatorShaderCode = await this.loadShader('shaders/render/renderPredators.wgsl');

    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'Visualization Shader',
      code: shaderCode,
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Render Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // rField
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // oField
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // hField
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // cField
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // mField
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // bField
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },           // renderParams
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // terrainField
        { binding: 9, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },           // simParams
      ],
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Render Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    // Create render pipeline
    this.renderPipeline = this.device.createRenderPipeline({
      label: 'Visualization Render Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // Particle pipeline
    const particleShaderModule = this.device.createShaderModule({
      label: 'Particle Render Shader',
      code: particleShaderCode,
    });

    const particleBindGroupLayout = this.device.createBindGroupLayout({
      label: 'Particle Render Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // particles
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },           // particle params
      ],
    });

    const particlePipelineLayout = this.device.createPipelineLayout({
      label: 'Particle Render Pipeline Layout',
      bindGroupLayouts: [particleBindGroupLayout],
    });

    this.particlePipeline = this.device.createRenderPipeline({
      label: 'Particle Render Pipeline',
      layout: particlePipelineLayout,
      vertex: {
        module: particleShaderModule,
        entryPoint: 'vs_main',
        buffers: [],
      },
      fragment: {
        module: particleShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
      multisample: {
        count: 1,
      },
    });

    // Predator pipeline
    const predatorShaderModule = this.device.createShaderModule({
      label: 'Predator Render Shader',
      code: predatorShaderCode,
    });

    const predatorBindGroupLayout = this.device.createBindGroupLayout({
      label: 'Predator Render Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // predators
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },           // gridInfo
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },           // predator params
      ],
    });

    const predatorPipelineLayout = this.device.createPipelineLayout({
      label: 'Predator Render Pipeline Layout',
      bindGroupLayouts: [predatorBindGroupLayout],
    });

    this.predatorPipeline = this.device.createRenderPipeline({
      label: 'Predator Render Pipeline',
      layout: predatorPipelineLayout,
      vertex: {
        module: predatorShaderModule,
        entryPoint: 'vs_main',
        buffers: [],
      },
      fragment: {
        module: predatorShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
      multisample: {
        count: 1,
      },
    });

    // Create initial bind group (will be updated in render if O buffer changes)
    this.createBindGroup();
    this.createParticleBindGroup();
    this.createPredatorBindGroup();

    console.log('Renderer initialized');
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
   * Create bind group with current O and H buffers
   */
  createBindGroup() {
    const currentOBuffer = this.simulationEngine.getCurrentOBuffer();
    const currentHBuffer = this.simulationEngine.getCurrentHBuffer();
    const currentRBuffer = this.simulationEngine.getCurrentRBuffer
      ? this.simulationEngine.getCurrentRBuffer()
      : (this.buffers.getRBufferCurrent ? this.buffers.getRBufferCurrent(0) : this.buffers.rFieldA);
    const currentMBuffer = this.simulationEngine.getCurrentMBuffer
      ? this.simulationEngine.getCurrentMBuffer()
      : (this.buffers.getMBufferCurrent ? this.buffers.getMBufferCurrent(0) : this.buffers.mFieldA);
    const currentZBuffer = this.simulationEngine.getCurrentZBuffer
      ? this.simulationEngine.getCurrentZBuffer()
      : (this.buffers.getTerrainBufferCurrent ? this.buffers.getTerrainBufferCurrent(0) : this.buffers.terrainFieldA);

    this.renderBindGroup = this.device.createBindGroup({
      label: 'Render Bind Group',
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: currentRBuffer } },
        { binding: 1, resource: { buffer: currentOBuffer } },
        { binding: 2, resource: { buffer: currentHBuffer } },
        { binding: 3, resource: { buffer: this.buffers.cField } },
        { binding: 4, resource: { buffer: currentMBuffer } },
        { binding: 5, resource: { buffer: this.buffers.bField } },
        { binding: 6, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 7, resource: { buffer: this.buffers.renderParamsBuffer } },
        { binding: 8, resource: { buffer: currentZBuffer } },
        { binding: 9, resource: { buffer: this.buffers.paramsBuffer } },
      ],
    });
  }

  createParticleBindGroup() {
    const currentPBuffer = this.simulationEngine.getCurrentPBuffer();
    this.particleBindGroup = this.device.createBindGroup({
      label: 'Particle Render Bind Group',
      layout: this.particlePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: currentPBuffer } },
        { binding: 1, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 2, resource: { buffer: this.buffers.particleParamsBuffer } },
      ],
    });
  }

  createPredatorBindGroup() {
    const currentP2Buffer = this.simulationEngine.getCurrentP2Buffer();
    this.predatorBindGroup = this.device.createBindGroup({
      label: 'Predator Render Bind Group',
      layout: this.predatorPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: currentP2Buffer } },
        { binding: 1, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 2, resource: { buffer: this.buffers.predatorParamsBuffer } },
      ],
    });
  }

  /**
   * Render current frame
   */
  render() {
    // Recreate bind group with current O buffer
    this.createBindGroup();
    this.createParticleBindGroup();
    this.createPredatorBindGroup();

    // Get current texture from canvas context
    const textureView = this.context.getCurrentTexture().createView();

    // Create command encoder
    const encoder = this.device.createCommandEncoder({
      label: 'Render Command Encoder'
    });

    // Render pass
    const renderPass = encoder.beginRenderPass({
      label: 'Render Pass',
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(6, 1, 0, 0);  // 6 vertices for full-screen quad

    // Draw particles on top
    renderPass.setPipeline(this.particlePipeline);
    renderPass.setBindGroup(0, this.particleBindGroup);
    // Draw full capacity so reproduction beyond initial pCount is visible and matches HUD totals
    renderPass.draw(6, this.buffers.maxParticles, 0, 0); // 6 verts per quad, instanced

    // Draw predators on top
    renderPass.setPipeline(this.predatorPipeline);
    renderPass.setBindGroup(0, this.predatorBindGroup);
    // Draw full capacity so reproduction beyond initial p2Count is visible and matches HUD/Chart totals
    renderPass.draw(6, this.buffers.maxPredators, 0, 0);
    renderPass.end();

    // Submit commands
    this.device.queue.submit([encoder.finish()]);
  }
}
