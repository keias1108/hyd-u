/**
 * @fileoverview Main Application Entry Point
 *
 * 이 파일은 시뮬레이션의 진입점입니다.
 *
 * ## 역할
 * - WebGPU 초기화 및 버퍼 생성
 * - 시뮬레이션 엔진/렌더러 초기화
 * - 애니메이션 루프 실행
 * - UI 매니저 통합
 *
 * ## 의존성
 * - webgpu/context.js: GPU 컨텍스트
 * - webgpu/buffers.js: GPU 버퍼
 * - simulation/SimulationEngine.js: 컴퓨트 파이프라인
 * - rendering/Renderer.js: 렌더 파이프라인
 * - managers/*: UI/기능 매니저
 *
 * ## 주요 메서드
 * - initialize(): 전체 초기화
 * - animate(): 메인 루프
 * - computeFieldStats(): GPU→CPU 통계 읽기
 *
 * @module main
 */

import { WebGPUContext } from './webgpu/context.js';
import { SimulationBuffers } from './webgpu/buffers.js';
import { SimulationParameters } from './simulation/parameters.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import { Renderer } from './rendering/Renderer.js';
import { Controls } from './ui/Controls.js';
import { StorageManager } from './managers/StorageManager.js';
import { ChartManager } from './managers/ChartManager.js';
import { EntityInspector } from './managers/EntityInspector.js';
import { BatchRunner } from './managers/BatchRunner.js';
import { readGpuBuffer, analyzeParticleBuffer } from './utils/gpuUtils.js';

// =============================================================================
// 상수 (이 파일에서만 사용)
// =============================================================================
const FPS_UPDATE_INTERVAL_MS = 500;
const STATS_UPDATE_INTERVAL_MS = 100;
const CHART_SAMPLE_INTERVAL = 10;
const DEFAULT_STATS = {
  rTotal: 0, oAvg: 0.8, hAvg: 0.0, mTotal: 0, bTotal: 0,
  pTotal: 0, p2Total: 0, pInvalid: 0, p2Invalid: 0,
};

// =============================================================================
// MAIN APPLICATION CLASS
// =============================================================================

class HydrothermalVentSimulation {
  constructor() {
    // Simulation state
    this.isRunning = false;
    this.virtualTime = 0;
    this.parameters = new SimulationParameters();

    // WebGPU components
    this.gpuContext = null;
    this.buffers = null;
    this.engine = null;
    this.renderer = null;
    this.controls = null;

    // Managers
    this.storageManager = null;
    this.chartManager = null;
    this.entityInspector = null;
    this.batchRunner = null;

    // FPS tracking
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = 0;

    // Stats tracking
    this.lastStatsUpdate = 0;
    this.currentStats = { ...DEFAULT_STATS };

    // Chart tracking
    this.chartFrameCounter = 0;
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

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
      this.buffers = new SimulationBuffers(this.gpuContext.device, gridWidth, gridHeight);

      // 3. Initialize field data
      this.initializeFields();

      // 4. Initialize simulation engine
      this.engine = new SimulationEngine(this.gpuContext.device, this.buffers, this.parameters);
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

      // 6. Setup UI
      this.setupUI();

      // 7. Load saved parameters
      this.storageManager.loadFromLocalStorage();

      // 8. Update GPU buffers
      this.updateParameters();

      // 9. Render initial frame
      this.renderer.render();

      console.log('Simulation initialized successfully');

      // Auto-start
      this.start();
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showError(error.message);
    }
  }

  initializeFields() {
    this.buffers.initializeRField();
    this.buffers.initializeOField(this.parameters.get('o0'));
    this.buffers.initializeCField();
    this.buffers.initializeHField(this.parameters.get('h0'));
    this.buffers.initializeTerrainFields(0.0);
    this.buffers.initializeMField();
    this.buffers.initializeBField();
    this.buffers.initializeBLongField();
    this.buffers.initializeParticles(this.parameters.get('pCount'));
    this.buffers.initializePredators(this.parameters.get('p2Count'));
  }

  // ===========================================================================
  // UI SETUP
  // ===========================================================================

  setupUI() {
    const controlsContainer = document.getElementById('controls');

    // Create controls
    this.controls = new Controls(this.parameters, (name, value) => {
      this.onParameterChange(name, value);
    });
    this.controls.createUI(controlsContainer);

    // Initialize managers
    this.storageManager = new StorageManager(this.controls);
    this.chartManager = new ChartManager();
    this.entityInspector = new EntityInspector(
      this.gpuContext.device,
      this.parameters,
      this.engine,
      this.buffers
    );
    this.batchRunner = new BatchRunner(
      this.engine,
      this.buffers,
      this.parameters,
      () => this.computeFieldStats()
    );

    // Setup components
    this.chartManager.setup();
    this.entityInspector.setup();
    this.batchRunner.setup(controlsContainer);

    // Setup buttons
    this.setupButtons();

    // Setup sidebar toggle
    this.setupSidebarToggle();

    // Setup data panel
    this.setupDataPanel(controlsContainer);

    // Setup chart panel
    this.setupChartPanel(controlsContainer);

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();
  }

  setupButtons() {
    const startButton = document.getElementById('startButton');
    const resetButton = document.getElementById('resetButton');

    startButton?.addEventListener('click', () => this.toggleSimulation());
    resetButton?.addEventListener('click', () => this.reset());
  }

  setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('controls-sidebar');
    if (!toggleBtn || !sidebar) return;

    const isVisible = this.storageManager.getSidebarVisible();

    if (isVisible) {
      sidebar.classList.add('sidebar-visible');
      sidebar.classList.remove('sidebar-hidden');
      toggleBtn.textContent = '◀';
    } else {
      sidebar.classList.add('sidebar-hidden');
      sidebar.classList.remove('sidebar-visible');
      toggleBtn.textContent = '▶';
    }

    toggleBtn.addEventListener('click', () => {
      const nowVisible = sidebar.classList.contains('sidebar-visible');
      if (nowVisible) {
        sidebar.classList.remove('sidebar-visible');
        sidebar.classList.add('sidebar-hidden');
        toggleBtn.textContent = '▶';
        this.storageManager.setSidebarVisible(false);
      } else {
        sidebar.classList.remove('sidebar-hidden');
        sidebar.classList.add('sidebar-visible');
        toggleBtn.textContent = '◀';
        this.storageManager.setSidebarVisible(true);
      }
    });
  }

  setupDataPanel(controlsContainer) {
    const isExpanded = this.storageManager.getPanelExpanded('Data');

    const jsonSection = document.createElement('div');
    jsonSection.className = `parameter-panel ${isExpanded ? 'expanded' : 'collapsed'}`;

    const header = document.createElement('h3');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = isExpanded ? '▼' : '▶';
    header.appendChild(toggle);
    header.appendChild(document.createTextNode('Data'));

    header.addEventListener('click', () => {
      jsonSection.classList.toggle('expanded');
      jsonSection.classList.toggle('collapsed');

      const expanded = jsonSection.classList.contains('expanded');
      toggle.textContent = expanded ? '▼' : '▶';
      this.storageManager.setPanelExpanded('Data', expanded);
    });

    jsonSection.appendChild(header);

    const content = document.createElement('div');
    content.className = 'panel-content';

    const buttons = [
      { text: 'Save Parameters JSON', action: () => this.storageManager.saveToFile() },
      { text: 'Load Parameters JSON', action: () => this.storageManager.loadFromFile() },
      { text: 'Save as My Default', action: () => this.storageManager.saveToLocalStorage() },
      { text: 'Clear Saved Settings', action: () => this.storageManager.clearLocalStorage() },
    ];

    buttons.forEach((btn, i) => {
      const button = document.createElement('button');
      button.textContent = btn.text;
      button.style.width = '100%';
      button.style.marginBottom = i < buttons.length - 1 ? '8px' : '0';
      button.addEventListener('click', btn.action);
      content.appendChild(button);
    });

    jsonSection.appendChild(content);
    controlsContainer.appendChild(jsonSection);
  }

  setupChartPanel(controlsContainer) {
    const chartSection = document.createElement('div');
    chartSection.className = 'parameter-panel collapsed';

    const header = document.createElement('h3');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▶';
    header.appendChild(toggle);
    header.appendChild(document.createTextNode('Chart'));

    header.addEventListener('click', () => {
      this.chartManager.openModal();
    });

    chartSection.appendChild(header);
    controlsContainer.appendChild(chartSection);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Alt+S: Save parameters
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        this.storageManager.saveToFile();
        return;
      }

      // Alt+Z: Reset simulation
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.reset();
        return;
      }

      // Space: Toggle simulation
      if (e.code === 'Space') {
        const tag = e.target?.tagName?.toLowerCase() || '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
          return;
        }
        e.preventDefault();
        this.toggleSimulation();
      }
    });
  }

  // ===========================================================================
  // PARAMETER HANDLING
  // ===========================================================================

  updateParameters() {
    this.buffers.updateParamsBuffer(this.parameters.toUniformData());
    this.buffers.updateRenderParamsBuffer(this.parameters.toRenderUniformData());
    this.buffers.updateParticleParamsBuffer(this.parameters.toParticleUniformData());
    this.buffers.updatePredatorParamsBuffer(this.parameters.toPredatorUniformData());
  }

  onParameterChange(name, value) {
    console.log(`Parameter changed: ${name} = ${value}`);

    // Handle special field reinitializations
    if (name === 'o0') {
      this.buffers.initializeOField(value);
    }
    if (name === 'h0') {
      this.buffers.initializeHField(value);
    }
    if (name === 'pCount') {
      this.buffers.initializeParticles(value);
      this.engine.pBufferIndex = 0;
      this.entityInspector.clearSelection();
    }
    if (name === 'p2Count') {
      this.buffers.initializePredators(value);
      this.engine.p2BufferIndex = 0;
      this.entityInspector.clearSelection();
    }

    this.updateParameters();
  }

  // ===========================================================================
  // SIMULATION CONTROL
  // ===========================================================================

  toggleSimulation() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    this.isRunning = true;
    document.getElementById('startButton').textContent = 'Pause';
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = this.lastFrameTime;
    this.animate();
    console.log('Simulation started');
  }

  pause() {
    this.isRunning = false;
    document.getElementById('startButton').textContent = 'Start';
    console.log('Simulation paused');
  }

  reset() {
    console.log('Resetting simulation...');

    this.virtualTime = 0;
    this.initializeFields();

    // Reset engine indices
    this.engine.frameCount = 0;
    this.engine.rBufferIndex = 0;
    this.engine.oBufferIndex = 0;
    this.engine.mBufferIndex = 0;
    this.engine.hBufferIndex = 0;
    this.engine.zBufferIndex = 0;
    this.engine.pBufferIndex = 0;
    this.engine.p2BufferIndex = 0;

    // Reset counters
    this.frameCount = 0;
    this.fps = 0;
    this.chartFrameCounter = 0;

    // Reset chart
    this.chartManager.reset();

    // Update and render
    this.updateParameters();
    this.renderer.render();

    // Clear entity selection
    this.entityInspector.clearSelection();

    console.log('Simulation reset');
  }

  // ===========================================================================
  // ANIMATION LOOP
  // ===========================================================================

  animate() {
    if (!this.isRunning) return;

    const now = performance.now();
    const speedMultiplier = Math.floor(this.parameters.get('speedMultiplier'));
    const dt = this.parameters.get('deltaTime');

    // Sub-stepping
    for (let substep = 0; substep < speedMultiplier; substep++) {
      this.virtualTime += dt;

      const paramsData = this.parameters.toUniformData();
      paramsData[26] = this.virtualTime;
      this.buffers.updateParamsBuffer(paramsData);

      this.engine.step();
    }

    // Render
    this.renderer.render();

    // Update FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= FPS_UPDATE_INTERVAL_MS) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.updateFpsDisplay();
    }

    // Update statistics
    if (now - this.lastStatsUpdate >= STATS_UPDATE_INTERVAL_MS) {
      this.updateStats();
      this.lastStatsUpdate = now;
    }

    // Update chart
    this.chartFrameCounter++;
    if (this.chartFrameCounter >= CHART_SAMPLE_INTERVAL) {
      this.chartManager.update(this.virtualTime, this.currentStats);
      this.chartFrameCounter = 0;
    }

    // Performance warning
    const frameTime = performance.now() - now;
    if (frameTime > 16.67 * 1.5) {
      console.warn(`Frame time ${frameTime.toFixed(1)}ms exceeds budget`);
    }

    this.lastFrameTime = now;
    requestAnimationFrame(() => this.animate());
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  async updateStats() {
    const stats = await this.computeFieldStats();
    this.currentStats = stats;
    this.updateStatsDisplay();
  }

  async computeFieldStats() {
    try {
      const device = this.gpuContext.device;
      const gridSize = this.parameters.get('gridWidth') * this.parameters.get('gridHeight');
      const gridW = this.parameters.get('gridWidth');
      const gridH = this.parameters.get('gridHeight');

      // Read field buffers
      const rBuffer = await readGpuBuffer(device, this.engine.getCurrentRBuffer());
      const oBuffer = await readGpuBuffer(device, this.engine.getCurrentOBuffer());
      const hBuffer = await readGpuBuffer(device, this.engine.getCurrentHBuffer());
      const mBuffer = await readGpuBuffer(device, this.engine.getCurrentMBuffer());
      const bBuffer = await readGpuBuffer(device, this.buffers.bField);

      // Calculate statistics
      let rTotal = 0, oSum = 0, hSum = 0, mTotal = 0, bTotal = 0;

      for (let i = 0; i < gridSize; i++) {
        rTotal += rBuffer[i];
        oSum += oBuffer[i];
        hSum += hBuffer[i];
        mTotal += mBuffer[i];
        bTotal += bBuffer[i];
      }

      const oAvg = oSum / gridSize;
      const hAvg = hSum / gridSize;

      // Analyze particles
      const pStats = await analyzeParticleBuffer(
        device,
        this.engine.getCurrentPBuffer(),
        this.buffers.maxParticles,
        gridW,
        gridH
      );

      const p2Stats = await analyzeParticleBuffer(
        device,
        this.engine.getCurrentP2Buffer(),
        this.buffers.maxPredators,
        gridW,
        gridH
      );

      if (pStats.invalidCount > 0) {
        console.warn(`P invalid: ${pStats.invalidCount}`);
      }
      if (p2Stats.invalidCount > 0) {
        console.warn(`P2 invalid: ${p2Stats.invalidCount}`);
      }

      return {
        rTotal,
        oAvg,
        hAvg,
        mTotal,
        bTotal,
        pTotal: pStats.aliveCount,
        p2Total: p2Stats.aliveCount,
        pInvalid: pStats.invalidCount,
        p2Invalid: p2Stats.invalidCount,
      };
    } catch (error) {
      console.error('Failed to compute field stats:', error);
      return this.currentStats;
    }
  }

  updateFpsDisplay() {
    const fpsCounter = document.getElementById('fps-counter');
    const stepsCounter = document.getElementById('steps-per-second');

    if (fpsCounter) {
      fpsCounter.textContent = this.fps;
    }

    if (stepsCounter) {
      const multiplier = this.parameters.get('speedMultiplier');
      stepsCounter.textContent = (this.fps * multiplier).toFixed(0);
    }
  }

  updateStatsDisplay() {
    const stats = this.currentStats;
    const elements = {
      'o-avg': stats.oAvg.toFixed(3),
      'r-total': stats.rTotal.toFixed(1),
      'h-avg': stats.hAvg.toFixed(3),
      'm-total': stats.mTotal.toFixed(1),
      'b-total': stats.bTotal.toFixed(1),
      'p-total': stats.pTotal.toFixed(0),
      'p2-total': stats.p2Total.toFixed(0),
      'p-invalid': String(stats.pInvalid),
      'p2-invalid': String(stats.p2Invalid),
    };

    for (const [id, value] of Object.entries(elements)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
  }

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

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

// =============================================================================
// ENTRY POINT
// =============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  const simulation = new HydrothermalVentSimulation();
  await simulation.initialize();
});
