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
    this.renderBindGroup = null;

    // Presentation format
    this.presentationFormat = context.getCurrentTexture().format;
  }

  /**
   * Initialize render pipeline
   */
  async init() {
    // Load shader code
    const shaderCode = await this.loadShader('shaders/render/visualize.wgsl');

    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'Visualization Shader',
      code: shaderCode,
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Render Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
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

    // Create initial bind group (will be updated in render if O buffer changes)
    this.createBindGroup();

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
   * Create bind group with current O buffer
   */
  createBindGroup() {
    const currentOBuffer = this.simulationEngine.getCurrentOBuffer();

    this.renderBindGroup = this.device.createBindGroup({
      label: 'Render Bind Group',
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.rField } },
        { binding: 1, resource: { buffer: currentOBuffer } },
        { binding: 2, resource: { buffer: this.buffers.cField } },
        { binding: 3, resource: { buffer: this.buffers.gridInfoBuffer } },
        { binding: 4, resource: { buffer: this.buffers.renderParamsBuffer } },
      ],
    });
  }

  /**
   * Render current frame
   */
  render() {
    // Recreate bind group with current O buffer
    this.createBindGroup();

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
    renderPass.end();

    // Submit commands
    this.device.queue.submit([encoder.finish()]);
  }
}
