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
    this.currentStats = { rTotal: 0, oAvg: 0.8, hAvg: 0.0, mTotal: 0, bTotal: 0, pTotal: 0 };

    // Virtual simulation time (for sub-stepping)
    this.virtualTime = 0;
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

    // Setup JSON save/load functionality
    this.setupJSONControls();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Alt+S: Save parameters to JSON
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        this.saveParametersJSON();
        return;
      }

      // Alt+Z: Reset simulation (Z for Zero)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        this.reset();
        return;
      }

      // Space: Toggle simulation
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
   * Setup JSON save/load controls
   */
  setupJSONControls() {
    // Create a section for JSON controls if it doesn't exist
    const controlsContainer = document.getElementById('controls');

    const jsonSection = document.createElement('div');
    jsonSection.className = 'parameter-panel expanded';

    const header = document.createElement('h3');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▼';
    header.appendChild(toggle);
    header.appendChild(document.createTextNode('Data'));

    header.addEventListener('click', () => {
      jsonSection.classList.toggle('expanded');
      jsonSection.classList.toggle('collapsed');
      toggle.textContent = jsonSection.classList.contains('collapsed') ? '▶' : '▼';
    });

    jsonSection.appendChild(header);

    const content = document.createElement('div');
    content.className = 'panel-content';

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Parameters JSON';
    saveBtn.style.width = '100%';
    saveBtn.style.marginBottom = '8px';
    saveBtn.addEventListener('click', () => this.saveParametersJSON());

    // Load button
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load Parameters JSON';
    loadBtn.style.width = '100%';
    loadBtn.addEventListener('click', () => this.loadParametersJSON());

    content.appendChild(saveBtn);
    content.appendChild(loadBtn);
    jsonSection.appendChild(content);

    controlsContainer.appendChild(jsonSection);
  }

  /**
   * Save parameters to JSON file
   */
  saveParametersJSON() {
    const json = this.controls.exportParameters();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `hydrothermal-params-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Parameters saved to JSON');
  }

  /**
   * Load parameters from JSON file
   */
  loadParametersJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const success = this.controls.importParameters(event.target.result);
        if (success) {
          console.log('Parameters loaded from JSON');
          alert('Parameters loaded successfully!');
        } else {
          alert('Failed to load parameters. Please check the file format.');
        }
      };
      reader.readAsText(file);
    });

    input.click();
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

    // Reset virtual time
    this.virtualTime = 0;

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
    const speedMultiplier = Math.floor(this.parameters.get('speedMultiplier'));
    const dt = this.parameters.get('deltaTime');

    // Sub-stepping: speedMultiplier번 step() 반복
    for (let substep = 0; substep < speedMultiplier; substep++) {
      this.virtualTime += dt;

      const paramsData = this.parameters.toUniformData();
      paramsData[23] = this.virtualTime; // Override currentTime for particle RNG
      this.buffers.updateParamsBuffer(paramsData);

      this.engine.step();
    }

    // 모든 sub-step 완료 후 최종 상태만 렌더링
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

    // Performance warning
    const frameTime = performance.now() - now;
    if (frameTime > 16.67 * 1.5) {
      console.warn(`Frame time ${frameTime.toFixed(1)}ms exceeds budget. Consider reducing speedMultiplier.`);
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
    const stepsCounter = document.getElementById('steps-per-second');

    if (fpsCounter) {
      fpsCounter.textContent = this.fps;
    }

    // Steps/sec counter
    if (stepsCounter) {
      const multiplier = this.parameters.get('speedMultiplier');
      const stepsPerSec = this.fps * multiplier;
      stepsCounter.textContent = stepsPerSec.toFixed(0);
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

      // Count alive particles from GPU buffer
      const pTotal = await this.countAliveParticles();

      return { rTotal, oAvg, hAvg, mTotal, bTotal, pTotal };
    } catch (error) {
      console.error('Failed to compute field stats:', error);
      return this.currentStats; // Return last valid stats
    }
  }

  /**
   * Count alive particles by reading particle buffer from GPU
   */
  async countAliveParticles() {
    try {
      const pBuffer = this.engine.getCurrentPBuffer();
      const size = pBuffer.size;

      // Create read buffer
      const readBuffer = this.gpuContext.device.createBuffer({
        size: size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });

      // Copy command
      const encoder = this.gpuContext.device.createCommandEncoder();
      encoder.copyBufferToBuffer(pBuffer, 0, readBuffer, 0, size);
      this.gpuContext.device.queue.submit([encoder.finish()]);

      // Read to CPU
      await readBuffer.mapAsync(GPUMapMode.READ);
      const arrayBuffer = readBuffer.getMappedRange();

      // Each particle is 32 bytes: pos(8) + vel(8) + energy(4) + type(4) + state(4) + age(4)
      // state is at offset 24 (6th u32)
      const particleStride = 32; // bytes
      const particleStrideInU32 = particleStride / 4; // 8 u32s per particle
      const stateOffsetInU32 = 24 / 4; // state is 6th u32 (index 6)

      const u32View = new Uint32Array(arrayBuffer);
      const maxParticles = this.buffers.maxParticles;

      let aliveCount = 0;
      for (let i = 0; i < maxParticles; i++) {
        const stateIndex = i * particleStrideInU32 + stateOffsetInU32;
        const state = u32View[stateIndex];
        if (state !== 0) {
          aliveCount++;
        }
      }

      readBuffer.unmap();
      readBuffer.destroy();

      return aliveCount;
    } catch (error) {
      console.error('Failed to count alive particles:', error);
      return 0;
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
    const pTotalEl = document.getElementById('p-total');

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
    if (pTotalEl) {
      pTotalEl.textContent = this.currentStats.pTotal.toFixed(0);
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
