/**
 * WebGPU Context Management
 * Handles GPU adapter and device initialization
 */

export class WebGPUContext {
  constructor() {
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.canvas = null;
    this.presentationFormat = 'bgra8unorm';
  }

  /**
   * Initialize WebGPU adapter, device, and canvas context
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // Check WebGPU support
      if (!navigator.gpu) {
        throw new Error('WebGPU is not supported in this browser');
      }

      // Get canvas
      this.canvas = document.getElementById('renderCanvas');
      if (!this.canvas) {
        throw new Error('Canvas element not found');
      }

      // Request adapter
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (!this.adapter) {
        throw new Error('Failed to get WebGPU adapter');
      }

      // Request device
      this.device = await this.adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {
          maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize,
          maxBufferSize: this.adapter.limits.maxBufferSize,
        }
      });

      // Handle device lost
      this.device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message);
        if (info.reason !== 'destroyed') {
          console.error('Device lost reason:', info.reason);
        }
      });

      // Configure canvas context
      this.context = this.canvas.getContext('webgpu');
      if (!this.context) {
        throw new Error('Failed to get WebGPU context from canvas');
      }

      this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      this.context.configure({
        device: this.device,
        format: this.presentationFormat,
        alphaMode: 'opaque',
      });

      console.log('WebGPU initialized successfully');
      console.log('Adapter:', this.adapter);
      console.log('Device limits:', this.device.limits);
      console.log('Presentation format:', this.presentationFormat);

      return true;
    } catch (error) {
      console.error('Failed to initialize WebGPU:', error);
      this.showError(error.message);
      return false;
    }
  }

  /**
   * Show error message to user
   */
  showError(message) {
    const errorDiv = document.getElementById('error-message');
    const appDiv = document.getElementById('app');

    if (errorDiv && appDiv) {
      errorDiv.classList.remove('hidden');
      appDiv.style.display = 'none';

      const errorText = errorDiv.querySelector('p');
      if (errorText) {
        errorText.textContent = message;
      }
    }
  }

  /**
   * Create a storage buffer
   */
  createStorageBuffer(size, usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC) {
    return this.device.createBuffer({
      size: size,
      usage: usage,
      mappedAtCreation: false,
    });
  }

  /**
   * Create a uniform buffer
   */
  createUniformBuffer(size) {
    return this.device.createBuffer({
      size: size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });
  }
}
