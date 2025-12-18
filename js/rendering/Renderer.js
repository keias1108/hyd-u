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
    this.renderBindGroup = null;
    this.particleBindGroup = null;

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
                dstFactor: 'one',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one',
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

    console.log('Renderer initialized');
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

  /**
   * Render current frame
   */
  render() {
    // Recreate bind group with current O buffer
    this.createBindGroup();
    this.createParticleBindGroup();

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
    const particleCount = Math.floor(this.parameters.get('pCount'));
    renderPass.draw(6, particleCount, 0, 0); // 6 verts per quad, instanced
    renderPass.end();

    // Submit commands
    this.device.queue.submit([encoder.finish()]);
  }
}
