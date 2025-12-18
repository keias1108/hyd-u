/**
 * Main Application Entry Point
 * Initializes and runs the hydrothermal vent simulation
 */

import { WebGPUContext } from './webgpu/context.js';
import { SimulationBuffers } from './webgpu/buffers.js';
import { SimulationParameters } from './simulation/parameters.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import { Renderer } from './rendering/Renderer.js';
import { Controls } from './ui/Controls.js';

class HydrothermalVentSimulation {
  constructor() {
    this.isRunning = false;
    this.parameters = new SimulationParameters();

    // WebGPU components
    this.gpuContext = null;
    this.buffers = null;
    this.engine = null;
    this.renderer = null;
    this.controls = null;

    // FPS tracking
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsUpdateInterval = 500; // Update FPS display every 500ms
    this.lastFpsUpdate = 0;

    // Stats tracking
    this.lastStatsUpdate = 0;
    this.statsUpdateInterval = 100; // Update stats every 100ms
    this.currentStats = { rTotal: 0, oAvg: 0.8, hAvg: 0.0, mTotal: 0, bTotal: 0 };
  }

  /**
   * Initialize the simulation
   */
  async initialize() {
    try {
      console.log('Initializing hydrothermal vent simulation...');

      // 1. Initialize WebGPU context
      this.gpuContext = new WebGPUContext();
      const success = await this.gpuContext.initialize();
      if (!success) {
        throw new Error('Failed to initialize WebGPU');
      }

      // 2. Create buffers
      const gridWidth = this.parameters.get('gridWidth');
      const gridHeight = this.parameters.get('gridHeight');

      this.buffers = new SimulationBuffers(
        this.gpuContext.device,
        gridWidth,
        gridHeight
      );

      // 3. Initialize field data
      this.buffers.initializeRField();
      this.buffers.initializeOField(this.parameters.get('o0'));
      this.buffers.initializeCField();
      this.buffers.initializeHField(this.parameters.get('h0'));
      this.buffers.initializeMField();
      this.buffers.initializeBField();
      this.buffers.initializeParticles(this.parameters.get('pCount'));

      // 4. Initialize simulation engine
      this.engine = new SimulationEngine(
        this.gpuContext.device,
        this.buffers,
        this.parameters
      );
      await this.engine.init();

      // 5. Initialize renderer
      this.renderer = new Renderer(
        this.gpuContext.device,
        this.gpuContext.context,
        this.buffers,
        this.parameters,
        this.engine
      );
      await this.renderer.init();

      // 6. Setup UI controls
      this.setupUI();

      // 7. Update GPU buffers with initial parameters
      this.updateParameters();

      // 8. Render initial frame
      this.renderer.render();

      console.log('Simulation initialized successfully');

      // Auto-start
      this.start();

    } catch (error) {
      console.error('Initialization failed:', error);
      this.showError(error.message);
    }
  }

  /**
   * Setup UI controls
   */
  setupUI() {
    const controlsContainer = document.getElementById('controls');
    this.controls = new Controls(this.parameters, (name, value) => {
      this.onParameterChange(name, value);
    });
    this.controls.createUI(controlsContainer);

    // Start/Stop button
    const startButton = document.getElementById('startButton');
    startButton.addEventListener('click', () => this.toggleSimulation());

    // Reset button
    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => this.reset());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
          return;
        }
        e.preventDefault();
        this.toggleSimulation();
      }
    });
  }

  /**
   * Update GPU buffers when parameters change
   */
  updateParameters() {
    // Update simulation parameters buffer
    const paramsData = this.parameters.toUniformData();
    this.buffers.updateParamsBuffer(paramsData);

    // Update render parameters buffer
    const renderParamsData = this.parameters.toRenderUniformData();
    this.buffers.updateRenderParamsBuffer(renderParamsData);

    // Update particle parameters buffer
    const particleParamsData = this.parameters.toParticleUniformData();
    this.buffers.updateParticleParamsBuffer(particleParamsData);
  }

  /**
   * Handle parameter change from UI
   */
  onParameterChange(name, value) {
    console.log(`Parameter changed: ${name} = ${value}`);

    // Special handling for field background values - reinitialize fields
    if (name === 'o0') {
      this.buffers.initializeOField(value);
    }
    if (name === 'h0') {
      this.buffers.initializeHField(value);
    }
    // Reinitialize particles if count changed
    if (name === 'pCount') {
      this.buffers.initializeParticles(value);
      this.engine.pBufferIndex = 0;
    }

    this.updateParameters();
  }

  /**
   * Toggle simulation running state
   */
  toggleSimulation() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  /**
   * Start simulation
   */
  start() {
    this.isRunning = true;
    document.getElementById('startButton').textContent = 'Pause';
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = this.lastFrameTime;
    this.animate();
    console.log('Simulation started');
  }

  /**
   * Pause simulation
   */
  pause() {
    this.isRunning = false;
    document.getElementById('startButton').textContent = 'Start';
    console.log('Simulation paused');
  }

  /**
   * Reset simulation
   */
  reset() {
    console.log('Resetting simulation...');

    // Reinitialize fields
    this.buffers.initializeRField();
    this.buffers.initializeOField(this.parameters.get('o0'));
    this.buffers.initializeCField();
    this.buffers.initializeHField(this.parameters.get('h0'));
    this.buffers.initializeMField();
    this.buffers.initializeBField();
    this.buffers.initializeParticles(this.parameters.get('pCount'));

    // Reset engine frame count and buffer indices
    this.engine.frameCount = 0;
    this.engine.rBufferIndex = 0;
    this.engine.oBufferIndex = 0;
    this.engine.mBufferIndex = 0;
    this.engine.hBufferIndex = 0;
    this.engine.pBufferIndex = 0;

    // Reset FPS counter
    this.frameCount = 0;
    this.fps = 0;

    // Update display
    this.updateParameters();
    this.renderer.render();

    console.log('Simulation reset');
  }

  /**
   * Main animation loop
   */
  animate() {
    if (!this.isRunning) return;

    const now = performance.now();

    // Keep simParams.currentTime moving (used by particle RNG)
    // This only updates the shared sim uniform buffer; fields remain unchanged unless explicitly time-dependent.
    this.buffers.updateParamsBuffer(this.parameters.toUniformData());

    // Update simulation
    this.engine.step();

    // Render
    this.renderer.render();

    // Update FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.updateFpsDisplay();
    }

    // Update statistics (100ms interval)
    if (now - this.lastStatsUpdate >= this.statsUpdateInterval) {
      this.updateStats();
      this.lastStatsUpdate = now;
    }

    this.lastFrameTime = now;

    // Continue loop
    requestAnimationFrame(() => this.animate());
  }

  /**
   * Update statistics (async, non-blocking)
   */
  async updateStats() {
    const stats = await this.computeFieldStats();
    this.currentStats = stats;
    this.updateStatsDisplay();
  }

  /**
   * Update FPS display
   */
  updateFpsDisplay() {
    const fpsCounter = document.getElementById('fps-counter');
    if (fpsCounter) {
      fpsCounter.textContent = this.fps;
    }
  }

  /**
   * Read GPU buffer to CPU
   */
  async readBuffer(gpuBuffer) {
    const size = gpuBuffer.size;

    // Create read buffer
    const readBuffer = this.gpuContext.device.createBuffer({
      size: size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    // Copy command
    const encoder = this.gpuContext.device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, size);
    this.gpuContext.device.queue.submit([encoder.finish()]);

    // Read to CPU
    await readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(readBuffer.getMappedRange());
    const result = new Float32Array(data); // Copy
    readBuffer.unmap();
    readBuffer.destroy();

    return result;
  }

  /**
   * Compute field statistics
   */
  async computeFieldStats() {
    try {
      // Read R, O, and H fields from GPU
      const rBuffer = await this.readBuffer(this.engine.getCurrentRBuffer());
      const oBuffer = await this.readBuffer(this.engine.getCurrentOBuffer());
      const hBuffer = await this.readBuffer(this.engine.getCurrentHBuffer());
      const mBuffer = await this.readBuffer(this.engine.getCurrentMBuffer());
      const bBuffer = await this.readBuffer(this.buffers.bField);

      // Calculate statistics
      let rTotal = 0;
      let oSum = 0;
      let hSum = 0;
      let mTotal = 0;
      let bTotal = 0;
      // Particle totals not aggregated (positions only)
      const gridSize = this.parameters.get('gridWidth') * this.parameters.get('gridHeight');

      for (let i = 0; i < gridSize; i++) {
        rTotal += rBuffer[i];
        oSum += oBuffer[i];
        hSum += hBuffer[i];
        mTotal += mBuffer[i];
        bTotal += bBuffer[i];
      }

      const oAvg = oSum / gridSize;
      const hAvg = hSum / gridSize;

      return { rTotal, oAvg, hAvg, mTotal, bTotal };
    } catch (error) {
      console.error('Failed to compute field stats:', error);
      return this.currentStats; // Return last valid stats
    }
  }

  /**
   * Update statistics display
   */
  updateStatsDisplay() {
    const oAvgEl = document.getElementById('o-avg');
    const rTotalEl = document.getElementById('r-total');
    const hAvgEl = document.getElementById('h-avg');
    const mTotalEl = document.getElementById('m-total');
    const bTotalEl = document.getElementById('b-total');

    if (oAvgEl) {
      oAvgEl.textContent = this.currentStats.oAvg.toFixed(3);
    }
    if (rTotalEl) {
      rTotalEl.textContent = this.currentStats.rTotal.toFixed(1);
    }
    if (hAvgEl) {
      hAvgEl.textContent = this.currentStats.hAvg.toFixed(3);
    }
    if (mTotalEl) {
      mTotalEl.textContent = this.currentStats.mTotal.toFixed(1);
    }
    if (bTotalEl) {
      bTotalEl.textContent = this.currentStats.bTotal.toFixed(1);
    }
  }

  /**
   * Show error message
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
}

// Entry point
window.addEventListener('DOMContentLoaded', async () => {
  const simulation = new HydrothermalVentSimulation();
  await simulation.initialize();
});
