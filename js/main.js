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
    this.currentStats = { rTotal: 0, oAvg: 0.8, hAvg: 0.0, mTotal: 0, bTotal: 0, pTotal: 0, p2Total: 0, pInvalid: 0, p2Invalid: 0 };

    // Virtual simulation time (for sub-stepping)
    this.virtualTime = 0;

    // Chart tracking
    this.chart = null;
    this.chartSampleInterval = 10; // Sample every 10 frames
    this.chartFrameCounter = 0;
    this.maxChartDataPoints = 500; // Keep last 500 data points

    // Chart modal drag/resize state
    this.modalDragState = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };
    this.modalResizeState = { isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };

    // Entity selection/inspection (P / P2)
    this.selection = {
      active: false,
      kind: null, // 'P' | 'P2'
      index: -1,
      last: null,
      drag: { isDown: false, startX: 0, startY: 0, lastX: 0, lastY: 0 },
      updateLoopRunning: false,
      readInProgress: false,
      lastReadTime: 0,
      readIntervalMs: 120,
      pickRadiusPx: 14,
    };

    this.entityModalDrag = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };
    this.entityModalResize = { isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };

    // Batch run
    this.batch = {
      chart: null,
      isRunning: false,
      cancelRequested: false,
      lastResult: null,
      modalDrag: { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 },
      modalResize: { isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 },
    };
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
      this.buffers.initializeBLongField();
      this.buffers.initializeParticles(this.parameters.get('pCount'));
      this.buffers.initializePredators(this.parameters.get('p2Count'));

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

      // 7. Load saved parameters from localStorage if available
      this.loadFromLocalStorage();

      // 8. Update GPU buffers with initial parameters
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

    // Sidebar toggle button
    this.setupSidebarToggle();

    // Setup JSON save/load functionality
    this.setupJSONControls();

    // Setup chart panel
    this.setupChartPanel();

    // Setup batch run panel
    this.setupBatchRunPanel();

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

    // Entity selection on canvas (works even when paused)
    this.setupEntitySelection();
  }

  setupBatchRunPanel() {
    const controlsContainer = document.getElementById('controls');
    if (!controlsContainer) return;

    const batchSection = document.createElement('div');
    batchSection.className = 'parameter-panel collapsed';

    const header = document.createElement('h3');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▶';
    header.appendChild(toggle);
    header.appendChild(document.createTextNode('Batch Run'));

    header.addEventListener('click', () => {
      this.openBatchModal();
    });

    batchSection.appendChild(header);
    controlsContainer.appendChild(batchSection);

    this.setupBatchModal();
  }

  setupBatchModal() {
    const modal = document.getElementById('batchModal');
    if (!modal) return;
    const header = modal.querySelector('.batch-modal-header');
    const closeBtn = document.getElementById('closeBatchModal');
    const resizeHandle = modal.querySelector('.batch-modal-resize-handle');
    const runBtn = document.getElementById('batchRunBtn');
    const stopBtn = document.getElementById('batchStopBtn');
    const resetZoomBtn = document.getElementById('batchResetZoomBtn');

    closeBtn?.addEventListener('click', () => this.closeBatchModal());
    runBtn?.addEventListener('click', () => this.runBatch());
    stopBtn?.addEventListener('click', () => this.stopBatch());
    resetZoomBtn?.addEventListener('click', () => this.resetBatchZoom());

    header?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.batch-modal-close')) return;
      this.batch.modalDrag.isDragging = true;
      const rect = modal.getBoundingClientRect();
      this.batch.modalDrag.startX = e.clientX;
      this.batch.modalDrag.startY = e.clientY;
      this.batch.modalDrag.startLeft = rect.left;
      this.batch.modalDrag.startTop = rect.top;
      modal.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.batch.modalDrag.isDragging) return;
      const deltaX = e.clientX - this.batch.modalDrag.startX;
      const deltaY = e.clientY - this.batch.modalDrag.startY;
      modal.style.left = `${this.batch.modalDrag.startLeft + deltaX}px`;
      modal.style.top = `${this.batch.modalDrag.startTop + deltaY}px`;
      modal.style.transform = 'none';
    });

    window.addEventListener('mouseup', () => {
      if (this.batch.modalDrag.isDragging) {
        modal.style.cursor = '';
        this.batch.modalDrag.isDragging = false;
      }
    });

    resizeHandle?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.batch.modalResize.isResizing = true;
      const rect = modal.getBoundingClientRect();
      this.batch.modalResize.startX = e.clientX;
      this.batch.modalResize.startY = e.clientY;
      this.batch.modalResize.startWidth = rect.width;
      this.batch.modalResize.startHeight = rect.height;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.batch.modalResize.isResizing) return;
      const deltaX = e.clientX - this.batch.modalResize.startX;
      const deltaY = e.clientY - this.batch.modalResize.startY;
      const newWidth = Math.max(520, this.batch.modalResize.startWidth + deltaX);
      const newHeight = Math.max(420, this.batch.modalResize.startHeight + deltaY);
      modal.style.width = `${newWidth}px`;
      modal.style.height = `${newHeight}px`;
    });

    window.addEventListener('mouseup', () => {
      this.batch.modalResize.isResizing = false;
    });
  }

  openBatchModal() {
    const modal = document.getElementById('batchModal');
    modal?.classList.remove('hidden');
    if (!this.batch.chart) {
      this.initializeBatchChart();
    }
  }

  closeBatchModal() {
    if (this.batch.isRunning) {
      this.stopBatch();
    }
    const modal = document.getElementById('batchModal');
    modal?.classList.add('hidden');
  }

  initializeBatchChart() {
    const canvas = document.getElementById('batchChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Register zoom plugin if present
    try {
      if (window.Chart && window.ChartZoom) {
        window.Chart.register(window.ChartZoom);
      }
    } catch (e) {
      // ignore duplicate registration
    }

    this.batch.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'O avg', data: [], borderColor: 'rgb(75, 192, 192)', borderWidth: 2, pointRadius: 0, tension: 0.1 },
          { label: 'R total', data: [], borderColor: 'rgb(255, 99, 132)', borderWidth: 2, pointRadius: 0, tension: 0.1 },
          { label: 'H avg', data: [], borderColor: 'rgb(255, 205, 86)', borderWidth: 2, pointRadius: 0, tension: 0.1 },
          { label: 'B total', data: [], borderColor: 'rgb(54, 162, 235)', borderWidth: 2, pointRadius: 0, tension: 0.1 },
          { label: 'P total', data: [], borderColor: 'rgb(153, 102, 255)', borderWidth: 2, pointRadius: 0, tension: 0.1 },
          { label: 'P2 total', data: [], borderColor: 'rgb(255, 138, 101)', borderWidth: 2, pointRadius: 0, tension: 0.1 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#fff', font: { size: 10 } }
          },
          tooltip: { mode: 'index', intersect: false },
          zoom: {
            pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Virtual Time (s)', color: '#fff' },
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          y: {
            title: { display: true, text: 'Value', color: '#fff' },
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });
  }

  resetBatchZoom() {
    if (this.batch.chart && this.batch.chart.resetZoom) {
      this.batch.chart.resetZoom();
    }
  }

  stopBatch() {
    if (!this.batch.isRunning) return;
    this.batch.cancelRequested = true;
    const stopBtn = document.getElementById('batchStopBtn');
    if (stopBtn) stopBtn.disabled = true;
    this.setBatchUiState({ running: true, progressText: 'Stopping...' });
  }

  setBatchUiState({ running, progressRatio, progressText }) {
    const runBtn = document.getElementById('batchRunBtn');
    const stopBtn = document.getElementById('batchStopBtn');
    const bar = document.getElementById('batchProgressBar');
    const text = document.getElementById('batchProgressText');
    if (runBtn) runBtn.disabled = !!running;
    if (stopBtn) stopBtn.disabled = !running;
    if (bar) bar.style.width = `${Math.max(0, Math.min(1, progressRatio ?? 0)) * 100}%`;
    if (text) text.textContent = progressText ?? (running ? 'Running...' : 'Idle');
  }

  clearBatchChart() {
    if (!this.batch.chart) return;
    this.batch.chart.data.labels = [];
    this.batch.chart.data.datasets.forEach(ds => (ds.data = []));
    this.batch.chart.update('none');
  }

  appendBatchPoint(time, stats) {
    if (!this.batch.chart) return;
    this.batch.chart.data.labels.push(time);
    this.batch.chart.data.datasets[0].data.push(stats.oAvg);
    this.batch.chart.data.datasets[1].data.push(stats.rTotal);
    this.batch.chart.data.datasets[2].data.push(stats.hAvg);
    this.batch.chart.data.datasets[3].data.push(stats.bTotal);
    this.batch.chart.data.datasets[4].data.push(stats.pTotal);
    this.batch.chart.data.datasets[5].data.push(stats.p2Total);
    this.batch.chart.update('none');
  }

  async runBatch() {
    if (this.batch.isRunning) return;
    if (!this.engine || !this.buffers || !this.gpuContext) return;

    const stepsEl = document.getElementById('batchSteps');
    const sampleEl = document.getElementById('batchSampleEvery');
    const totalSteps = Math.max(1, Math.floor(parseFloat(stepsEl?.value ?? '200000')));
    const sampleEvery = Math.max(1, Math.floor(parseFloat(sampleEl?.value ?? '1000')));

    // Pause interactive simulation; batch run advances state deterministically from current buffers.
    const wasRunning = this.isRunning;
    if (wasRunning) {
      this.pause();
    }

    this.batch.isRunning = true;
    this.batch.cancelRequested = false;
    this.setBatchUiState({ running: true, progressRatio: 0, progressText: `0 / ${totalSteps} steps` });

    if (!this.batch.chart) {
      this.initializeBatchChart();
    }
    this.clearBatchChart();

    const dt = this.parameters.get('deltaTime');
    let completed = 0;
    const startTime = performance.now();

    // Initial sample
    const initialStats = await this.computeFieldStats();
    this.appendBatchPoint(this.virtualTime, initialStats);

    // Run in chunks to keep UI responsive.
    const chunkSize = 512;
    while (completed < totalSteps && !this.batch.cancelRequested) {
      const chunkStart = performance.now();
      const chunkTarget = Math.min(totalSteps - completed, chunkSize);

      for (let i = 0; i < chunkTarget; i++) {
        this.virtualTime += dt;

        const paramsData = this.parameters.toUniformData();
        // Keep using the app's virtual time as "currentTime" for particle RNG and repeatability
        paramsData[26] = this.virtualTime; // SimParams.currentTime
        this.buffers.updateParamsBuffer(paramsData);

        this.engine.step();
        completed++;

        if (completed % sampleEvery === 0) {
          const stats = await this.computeFieldStats();
          this.appendBatchPoint(this.virtualTime, stats);
        }
      }

      const ratio = completed / totalSteps;
      const elapsed = (performance.now() - startTime) / 1000;
      this.setBatchUiState({
        running: true,
        progressRatio: ratio,
        progressText: `${completed} / ${totalSteps} steps  •  ${elapsed.toFixed(1)}s`
      });

      // Yield to UI thread
      const spent = performance.now() - chunkStart;
      if (spent > 8) {
        await new Promise(requestAnimationFrame);
      } else {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const elapsed = (performance.now() - startTime) / 1000;
    const finalStats = await this.computeFieldStats();
    this.appendBatchPoint(this.virtualTime, finalStats);

    this.batch.isRunning = false;
    const wasCancelled = this.batch.cancelRequested;
    this.batch.cancelRequested = false;
    this.batch.lastResult = { totalSteps: completed, requestedSteps: totalSteps, sampleEvery, elapsed, finalStats };
    this.setBatchUiState({
      running: false,
      progressRatio: completed / totalSteps,
      progressText: wasCancelled ? `Stopped: ${completed} steps  •  ${elapsed.toFixed(1)}s` : `Done: ${completed} steps  •  ${elapsed.toFixed(1)}s`
    });

    // Render once so the user sees the final state when leaving the modal
    this.renderer?.render();

    // Leave paused; user can resume manually.
    if (wasRunning) {
      // keep paused on purpose
    }
  }

  setupEntitySelection() {
    const canvas = document.getElementById('renderCanvas');
    const container = document.getElementById('canvas-container');
    const modal = document.getElementById('entityModal');
    const modalHeader = modal?.querySelector('.entity-modal-header');
    const closeBtn = document.getElementById('closeEntityModal');
    const resizeHandle = modal?.querySelector('.entity-modal-resize-handle');

    if (!canvas || !container || !modal || !modalHeader || !closeBtn || !resizeHandle) {
      console.warn('Entity selection UI elements missing');
      return;
    }

    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('#entityModal')) return;
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

      this.selection.drag.isDown = true;
      this.selection.drag.startX = e.clientX;
      this.selection.drag.startY = e.clientY;
      this.selection.drag.lastX = e.clientX;
      this.selection.drag.lastY = e.clientY;
    };

    const onMove = (e) => {
      if (!this.selection.drag.isDown) return;
      this.selection.drag.lastX = e.clientX;
      this.selection.drag.lastY = e.clientY;
    };

    const onUp = async (e) => {
      if (e.button !== 0) return;
      if (!this.selection.drag.isDown) return;
      this.selection.drag.isDown = false;

      const pick = await this.pickNearestEntityAtClientPoint(e.clientX, e.clientY);
      if (!pick) {
        this.clearSelection();
        return;
      }

      this.setSelection(pick.kind, pick.index);

      const containerRect = container.getBoundingClientRect();
      const margin = 12;
      const preferredLeft = e.clientX - containerRect.left + margin;
      const preferredTop = e.clientY - containerRect.top + margin;
      const maxLeft = containerRect.width - modal.offsetWidth - margin;
      const maxTop = containerRect.height - modal.offsetHeight - margin;
      modal.style.left = `${Math.max(margin, Math.min(maxLeft, preferredLeft))}px`;
      modal.style.top = `${Math.max(margin, Math.min(maxTop, preferredTop))}px`;
      modal.classList.remove('hidden');

      await this.refreshSelectedEntity(true);
      this.ensureSelectionLoop();
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    closeBtn.addEventListener('click', () => this.clearSelection());

    // Modal drag
    modalHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('.entity-modal-close')) return;
      e.preventDefault();
      this.entityModalDrag.isDragging = true;
      const rect = modal.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      this.entityModalDrag.startX = e.clientX;
      this.entityModalDrag.startY = e.clientY;
      this.entityModalDrag.startLeft = rect.left - containerRect.left;
      this.entityModalDrag.startTop = rect.top - containerRect.top;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.entityModalDrag.isDragging) return;
      const containerRect = container.getBoundingClientRect();
      const deltaX = e.clientX - this.entityModalDrag.startX;
      const deltaY = e.clientY - this.entityModalDrag.startY;
      const nextLeft = this.entityModalDrag.startLeft + deltaX;
      const nextTop = this.entityModalDrag.startTop + deltaY;

      const margin = 8;
      const maxLeft = containerRect.width - modal.offsetWidth - margin;
      const maxTop = containerRect.height - modal.offsetHeight - margin;
      modal.style.left = `${Math.max(margin, Math.min(maxLeft, nextLeft))}px`;
      modal.style.top = `${Math.max(margin, Math.min(maxTop, nextTop))}px`;
    });

    window.addEventListener('mouseup', () => {
      this.entityModalDrag.isDragging = false;
    });

    // Modal resize
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.entityModalResize.isResizing = true;
      const rect = modal.getBoundingClientRect();
      this.entityModalResize.startX = e.clientX;
      this.entityModalResize.startY = e.clientY;
      this.entityModalResize.startWidth = rect.width;
      this.entityModalResize.startHeight = rect.height;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.entityModalResize.isResizing) return;
      const deltaX = e.clientX - this.entityModalResize.startX;
      const deltaY = e.clientY - this.entityModalResize.startY;
      const newWidth = Math.max(220, this.entityModalResize.startWidth + deltaX);
      const newHeight = Math.max(140, this.entityModalResize.startHeight + deltaY);
      modal.style.width = `${newWidth}px`;
      modal.style.height = `${newHeight}px`;
    });

    window.addEventListener('mouseup', () => {
      this.entityModalResize.isResizing = false;
    });
  }

  clearSelection() {
    this.selection.active = false;
    this.selection.kind = null;
    this.selection.index = -1;
    this.selection.last = null;

    const modal = document.getElementById('entityModal');
    modal?.classList.add('hidden');

    const marker = document.getElementById('selectionMarker');
    const tether = document.getElementById('selectionTether');
    marker?.classList.add('hidden');
    tether?.classList.add('hidden');
  }

  setSelection(kind, index) {
    this.selection.active = true;
    this.selection.kind = kind;
    this.selection.index = index;
  }

  ensureSelectionLoop() {
    if (this.selection.updateLoopRunning) return;
    this.selection.updateLoopRunning = true;

    const tick = async () => {
      if (!this.selection.active) {
        this.selection.updateLoopRunning = false;
        return;
      }

      this.updateSelectionOverlay();

      const now = performance.now();
      if (this.isRunning && (now - this.selection.lastReadTime) >= this.selection.readIntervalMs) {
        await this.refreshSelectedEntity(false);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  updateSelectionOverlay() {
    const canvas = document.getElementById('renderCanvas');
    const container = document.getElementById('canvas-container');
    const overlay = document.getElementById('selectionOverlay');
    const marker = document.getElementById('selectionMarker');
    const tether = document.getElementById('selectionTether');
    const modal = document.getElementById('entityModal');

    if (!canvas || !container || !overlay || !marker || !tether || !modal) return;
    if (!this.selection.active || !this.selection.last) return;

    const rect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);

    const gridW = this.parameters.get('gridWidth');
    const gridH = this.parameters.get('gridHeight');
    const xPx = rect.left + (this.selection.last.pos.x / (gridW - 1)) * rect.width;
    const yPx = rect.top + (this.selection.last.pos.y / (gridH - 1)) * rect.height;
    const xIn = xPx - containerRect.left;
    const yIn = yPx - containerRect.top;

    const modalRect = modal.getBoundingClientRect();
    const anchorX = modalRect.left - containerRect.left + 10;
    const anchorY = modalRect.top - containerRect.top + 18;

    marker.setAttribute('cx', `${xIn}`);
    marker.setAttribute('cy', `${yIn}`);
    marker.classList.remove('hidden');

    tether.setAttribute('x1', `${xIn}`);
    tether.setAttribute('y1', `${yIn}`);
    tether.setAttribute('x2', `${anchorX}`);
    tether.setAttribute('y2', `${anchorY}`);
    tether.classList.remove('hidden');
  }

  async pickNearestEntityAtClientPoint(clientX, clientY) {
    const canvas = document.getElementById('renderCanvas');
    if (!canvas) return null;
    if (!this.gpuContext || !this.engine || !this.buffers) return null;

    const rect = canvas.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;

    const gridW = this.parameters.get('gridWidth');
    const gridH = this.parameters.get('gridHeight');
    const targetX = u * (gridW - 1);
    const targetY = v * (gridH - 1);

    const pxPerWorld = rect.width / (gridW - 1);
    const radiusWorld = this.selection.pickRadiusPx / Math.max(pxPerWorld, 1e-6);
    const radius2 = radiusWorld * radiusWorld;

    const pPick = await this.findNearestInBuffer(this.engine.getCurrentPBuffer(), this.buffers.maxParticles, targetX, targetY, radius2);
    const p2Pick = await this.findNearestInBuffer(this.engine.getCurrentP2Buffer(), this.buffers.maxPredators, targetX, targetY, radius2);

    if (!pPick && !p2Pick) return null;
    if (pPick && !p2Pick) return { kind: 'P', index: pPick.index };
    if (p2Pick && !pPick) return { kind: 'P2', index: p2Pick.index };
    return pPick.dist2 <= p2Pick.dist2 ? { kind: 'P', index: pPick.index } : { kind: 'P2', index: p2Pick.index };
  }

  async findNearestInBuffer(gpuBuffer, capacity, targetX, targetY, radius2) {
    const size = gpuBuffer.size;
    const readBuffer = this.gpuContext.device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const encoder = this.gpuContext.device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, size);
    this.gpuContext.device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readBuffer.getMappedRange();
    const f32View = new Float32Array(arrayBuffer);
    const u32View = new Uint32Array(arrayBuffer);

    let bestIndex = -1;
    let bestDist2 = Number.POSITIVE_INFINITY;

    for (let i = 0; i < capacity; i++) {
      const base = i * 8;
      const state = u32View[base + 6];
      if (state === 0) continue;

      const x = f32View[base];
      const y = f32View[base + 1];
      const dx = x - targetX;
      const dy = y - targetY;
      const d2 = dx * dx + dy * dy;
      if (d2 <= radius2 && d2 < bestDist2) {
        bestDist2 = d2;
        bestIndex = i;
      }
    }

    readBuffer.unmap();
    readBuffer.destroy();

    if (bestIndex === -1) return null;
    return { index: bestIndex, dist2: bestDist2 };
  }

  async refreshSelectedEntity(force) {
    if (!this.selection.active) return;
    if (this.selection.readInProgress) return;
    const now = performance.now();
    if (!force && (now - this.selection.lastReadTime) < this.selection.readIntervalMs) return;

    this.selection.readInProgress = true;
    try {
      const buffer = this.selection.kind === 'P2' ? this.engine.getCurrentP2Buffer() : this.engine.getCurrentPBuffer();
      const entity = await this.readParticleStructAt(buffer, this.selection.index);
      this.selection.last = entity;
      this.selection.lastReadTime = now;
      this.updateEntityModal(entity);
      this.updateSelectionOverlay();
    } finally {
      this.selection.readInProgress = false;
    }
  }

  async readParticleStructAt(gpuBuffer, index) {
    const stride = 32;
    const offset = index * stride;
    const readBuffer = this.gpuContext.device.createBuffer({
      size: stride,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const encoder = this.gpuContext.device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpuBuffer, offset, readBuffer, 0, stride);
    this.gpuContext.device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const data = readBuffer.getMappedRange();
    const dv = new DataView(data);
    const posX = dv.getFloat32(0, true);
    const posY = dv.getFloat32(4, true);
    const velX = dv.getFloat32(8, true);
    const velY = dv.getFloat32(12, true);
    const energy = dv.getFloat32(16, true);
    const type = dv.getUint32(20, true);
    const state = dv.getUint32(24, true);
    const age = dv.getFloat32(28, true);
    readBuffer.unmap();
    readBuffer.destroy();

    return { pos: { x: posX, y: posY }, vel: { x: velX, y: velY }, energy, type, state, age };
  }

  updateEntityModal(entity) {
    const title = document.getElementById('entityModalTitle');
    const typeEl = document.getElementById('entityType');
    const indexEl = document.getElementById('entityIndex');
    const posEl = document.getElementById('entityPos');
    const velEl = document.getElementById('entityVel');
    const energyEl = document.getElementById('entityEnergy');
    const stateEl = document.getElementById('entityState');
    const ageEl = document.getElementById('entityAge');

    if (title) title.textContent = `${this.selection.kind} #${this.selection.index}`;
    if (typeEl) typeEl.textContent = `${entity.type}`;
    if (indexEl) indexEl.textContent = `${this.selection.index}`;
    if (posEl) posEl.textContent = `(${entity.pos.x.toFixed(2)}, ${entity.pos.y.toFixed(2)})`;
    if (velEl) velEl.textContent = `(${entity.vel.x.toFixed(2)}, ${entity.vel.y.toFixed(2)})`;
    if (energyEl) energyEl.textContent = `${entity.energy.toFixed(3)}`;
    if (stateEl) stateEl.textContent = `${entity.state}`;
    if (ageEl) ageEl.textContent = `${entity.age.toFixed(2)}`;
  }

  /**
   * Setup sidebar toggle
   */
  setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('controls-sidebar');

    // Load saved state from localStorage
    const savedState = localStorage.getItem('sidebar-visible');
    const isVisible = savedState === null ? true : savedState === 'true';

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
      if (sidebar.classList.contains('sidebar-visible')) {
        // Hide sidebar
        sidebar.classList.remove('sidebar-visible');
        sidebar.classList.add('sidebar-hidden');
        toggleBtn.textContent = '▶';
        localStorage.setItem('sidebar-visible', 'false');
      } else {
        // Show sidebar
        sidebar.classList.remove('sidebar-hidden');
        sidebar.classList.add('sidebar-visible');
        toggleBtn.textContent = '◀';
        localStorage.setItem('sidebar-visible', 'true');
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

    // Load saved state from localStorage
    const savedState = localStorage.getItem('panel-state-Data');
    const isExpanded = savedState === null ? true : savedState === 'expanded';

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

      if (jsonSection.classList.contains('collapsed')) {
        toggle.textContent = '▶';
        localStorage.setItem('panel-state-Data', 'collapsed');
      } else {
        toggle.textContent = '▼';
        localStorage.setItem('panel-state-Data', 'expanded');
      }
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
    loadBtn.style.marginBottom = '8px';
    loadBtn.addEventListener('click', () => this.loadParametersJSON());

    // Save to localStorage button
    const saveDefaultBtn = document.createElement('button');
    saveDefaultBtn.textContent = 'Save as My Default';
    saveDefaultBtn.style.width = '100%';
    saveDefaultBtn.style.marginBottom = '8px';
    saveDefaultBtn.addEventListener('click', () => this.saveToLocalStorage());

    // Clear localStorage button
    const clearDefaultBtn = document.createElement('button');
    clearDefaultBtn.textContent = 'Clear Saved Settings';
    clearDefaultBtn.style.width = '100%';
    clearDefaultBtn.addEventListener('click', () => this.clearLocalStorage());

    content.appendChild(saveBtn);
    content.appendChild(loadBtn);
    content.appendChild(saveDefaultBtn);
    content.appendChild(clearDefaultBtn);
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
   * Save current parameters to localStorage
   */
  saveToLocalStorage() {
    const json = this.controls.exportParameters();
    localStorage.setItem('hydrothermal-params', json);
    console.log('Parameters saved to localStorage');
    alert('Current parameters saved as your default!');
  }

  /**
   * Clear saved parameters from localStorage
   */
  clearLocalStorage() {
    localStorage.removeItem('hydrothermal-params');
    console.log('Saved parameters cleared from localStorage');
    alert('Saved settings cleared! Refresh page to use factory defaults.');
  }

  /**
   * Load parameters from localStorage if available
   */
  loadFromLocalStorage() {
    const saved = localStorage.getItem('hydrothermal-params');
    if (saved) {
      const success = this.controls.importParameters(saved);
      if (success) {
        console.log('Parameters loaded from localStorage');
        return true;
      } else {
        console.warn('Failed to load saved parameters, using defaults');
        localStorage.removeItem('hydrothermal-params');
        return false;
      }
    }
    return false;
  }

  /**
   * Setup chart panel (now opens floating modal)
   */
  setupChartPanel() {
    const controlsContainer = document.getElementById('controls');

    const chartSection = document.createElement('div');
    chartSection.className = 'parameter-panel collapsed';

    const header = document.createElement('h3');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▶';
    header.appendChild(toggle);
    header.appendChild(document.createTextNode('Chart'));

    header.addEventListener('click', () => {
      this.openChartModal();
    });

    chartSection.appendChild(header);
    controlsContainer.appendChild(chartSection);

    // Setup modal interactions
    this.setupChartModal();
  }

  /**
   * Setup chart modal interactions
   */
  setupChartModal() {
    const modal = document.getElementById('chartModal');
    const header = modal.querySelector('.chart-modal-header');
    const closeBtn = document.getElementById('closeChartModal');
    const resizeHandle = modal.querySelector('.chart-modal-resize-handle');

    // Close button
    closeBtn.addEventListener('click', () => this.closeChartModal());

    // Drag functionality
    header.addEventListener('mousedown', (e) => this.startDragging(e));
    document.addEventListener('mousemove', (e) => this.onDragging(e));
    document.addEventListener('mouseup', () => this.stopDragging());

    // Resize functionality
    resizeHandle.addEventListener('mousedown', (e) => this.startResizing(e));
    document.addEventListener('mousemove', (e) => this.onResizing(e));
    document.addEventListener('mouseup', () => this.stopResizing());
  }

  /**
   * Open chart modal
   */
  openChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('hidden');

    // Initialize chart if not already created
    if (!this.chart) {
      this.initializeChart();
    }
  }

  /**
   * Close chart modal
   */
  closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.add('hidden');
  }

  /**
   * Start dragging modal
   */
  startDragging(e) {
    if (e.target.closest('.chart-modal-close')) return;

    this.modalDragState.isDragging = true;
    const modal = document.getElementById('chartModal');
    const rect = modal.getBoundingClientRect();

    this.modalDragState.startX = e.clientX;
    this.modalDragState.startY = e.clientY;
    this.modalDragState.startLeft = rect.left;
    this.modalDragState.startTop = rect.top;

    modal.style.cursor = 'grabbing';
  }

  /**
   * On dragging modal
   */
  onDragging(e) {
    if (!this.modalDragState.isDragging) return;

    const modal = document.getElementById('chartModal');
    const deltaX = e.clientX - this.modalDragState.startX;
    const deltaY = e.clientY - this.modalDragState.startY;

    const newLeft = this.modalDragState.startLeft + deltaX;
    const newTop = this.modalDragState.startTop + deltaY;

    modal.style.left = `${newLeft}px`;
    modal.style.top = `${newTop}px`;
    modal.style.transform = 'none';
  }

  /**
   * Stop dragging modal
   */
  stopDragging() {
    if (this.modalDragState.isDragging) {
      const modal = document.getElementById('chartModal');
      modal.style.cursor = '';
      this.modalDragState.isDragging = false;
    }
  }

  /**
   * Start resizing modal
   */
  startResizing(e) {
    e.preventDefault();
    e.stopPropagation();

    this.modalResizeState.isResizing = true;
    const modal = document.getElementById('chartModal');
    const rect = modal.getBoundingClientRect();

    this.modalResizeState.startX = e.clientX;
    this.modalResizeState.startY = e.clientY;
    this.modalResizeState.startWidth = rect.width;
    this.modalResizeState.startHeight = rect.height;
  }

  /**
   * On resizing modal
   */
  onResizing(e) {
    if (!this.modalResizeState.isResizing) return;

    const modal = document.getElementById('chartModal');
    const deltaX = e.clientX - this.modalResizeState.startX;
    const deltaY = e.clientY - this.modalResizeState.startY;

    const newWidth = Math.max(400, this.modalResizeState.startWidth + deltaX);
    const newHeight = Math.max(300, this.modalResizeState.startHeight + deltaY);

    modal.style.width = `${newWidth}px`;
    modal.style.height = `${newHeight}px`;
  }

  /**
   * Stop resizing modal
   */
  stopResizing() {
    this.modalResizeState.isResizing = false;
  }

  /**
   * Initialize Chart.js
   */
  initializeChart() {
    const canvas = document.getElementById('floatingStatsChart');
    if (!canvas || this.chart) return;

    const ctx = canvas.getContext('2d');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [], // Virtual time
        datasets: [
          {
            label: 'O avg',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: 'R total',
            data: [],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: 'H avg',
            data: [],
            borderColor: 'rgb(255, 205, 86)',
            backgroundColor: 'rgba(255, 205, 86, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: 'B total',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: 'P total',
            data: [],
            borderColor: 'rgb(153, 102, 255)',
            backgroundColor: 'rgba(153, 102, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: 'P2 total',
            data: [],
            borderColor: 'rgb(255, 138, 101)',
            backgroundColor: 'rgba(255, 138, 101, 0.12)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable animation for better performance
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#fff',
              font: {
                size: 10
              }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Virtual Time (s)',
              color: '#fff'
            },
            ticks: {
              color: '#aaa'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Value',
              color: '#fff'
            },
            ticks: {
              color: '#aaa'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });

    console.log('Chart initialized');
  }

  /**
   * Update chart with current stats
   */
  updateChart() {
    if (!this.chart) return;

    const time = this.virtualTime;
    const stats = this.currentStats;

    // Add new data point
    this.chart.data.labels.push(time);
    this.chart.data.datasets[0].data.push(stats.oAvg);
    this.chart.data.datasets[1].data.push(stats.rTotal);
    this.chart.data.datasets[2].data.push(stats.hAvg);
    this.chart.data.datasets[3].data.push(stats.bTotal);
    this.chart.data.datasets[4].data.push(stats.pTotal);
    this.chart.data.datasets[5].data.push(stats.p2Total);

    // Keep only last N data points
    if (this.chart.data.labels.length > this.maxChartDataPoints) {
      this.chart.data.labels.shift();
      this.chart.data.datasets.forEach(dataset => dataset.data.shift());
    }

    this.chart.update('none'); // Update without animation
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

    // Update predator parameters buffer
    const predatorParamsData = this.parameters.toPredatorUniformData();
    this.buffers.updatePredatorParamsBuffer(predatorParamsData);
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
      this.clearSelection();
    }
    if (name === 'p2Count') {
      this.buffers.initializePredators(value);
      this.engine.p2BufferIndex = 0;
      this.clearSelection();
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
    this.buffers.initializeBLongField();
    this.buffers.initializeParticles(this.parameters.get('pCount'));
    this.buffers.initializePredators(this.parameters.get('p2Count'));

    // Reset engine frame count and buffer indices
    this.engine.frameCount = 0;
    this.engine.rBufferIndex = 0;
    this.engine.oBufferIndex = 0;
    this.engine.mBufferIndex = 0;
    this.engine.hBufferIndex = 0;
    this.engine.pBufferIndex = 0;
    this.engine.p2BufferIndex = 0;

    // Reset FPS counter
    this.frameCount = 0;
    this.fps = 0;

    // Reset chart
    this.chartFrameCounter = 0;
    if (this.chart) {
      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      this.chart.update('none');
    }

    // Update display
    this.updateParameters();
    this.renderer.render();

    // Buffers were reinitialized; clear selection
    this.clearSelection();

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
      paramsData[26] = this.virtualTime; // SimParams.currentTime (for particle RNG)
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

    // Update chart (every N frames)
    this.chartFrameCounter++;
    if (this.chartFrameCounter >= this.chartSampleInterval) {
      this.updateChart();
      this.chartFrameCounter = 0;
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
      const pStats = await this.analyzeAliveFromParticleBuffer(this.engine.getCurrentPBuffer(), this.buffers.maxParticles);
      const p2Stats = await this.analyzeAliveFromParticleBuffer(this.engine.getCurrentP2Buffer(), this.buffers.maxPredators);

      if (pStats.invalidCount > 0) {
        console.warn(`P invalid positions: ${pStats.invalidCount} (NaN: ${pStats.nanCount}, OOB: ${pStats.oobCount})`);
      }
      if (p2Stats.invalidCount > 0) {
        console.warn(`P2 invalid positions: ${p2Stats.invalidCount} (NaN: ${p2Stats.nanCount}, OOB: ${p2Stats.oobCount})`);
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
      return this.currentStats; // Return last valid stats
    }
  }

  /**
   * Analyze alive entities and invalid positions from a particle-structured buffer.
   * Particle stride: 32 bytes = 8 * u32 words.
   * pos is at f32[base+0..1], state is at u32[base+6].
   */
  async analyzeAliveFromParticleBuffer(gpuBuffer, capacity) {
    const size = gpuBuffer.size;
    const gridW = this.parameters.get('gridWidth');
    const gridH = this.parameters.get('gridHeight');
    const maxXExclusive = gridW;
    const maxYExclusive = gridH;

    const readBuffer = this.gpuContext.device.createBuffer({
      size: size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const encoder = this.gpuContext.device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, size);
    this.gpuContext.device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readBuffer.getMappedRange();

    const f32View = new Float32Array(arrayBuffer);
    const u32View = new Uint32Array(arrayBuffer);

    let aliveCount = 0;
    let invalidCount = 0;
    let nanCount = 0;
    let oobCount = 0;

    let minX = Number.POSITIVE_INFINITY;
    let maxXSeen = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxYSeen = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < capacity; i++) {
      const base = i * 8;
      const state = u32View[base + 6];
      if (state === 0) continue;

      aliveCount++;

      const x = f32View[base];
      const y = f32View[base + 1];

      const nan = Number.isNaN(x) || Number.isNaN(y);
      const oob = !nan && (x < 0 || x >= maxXExclusive || y < 0 || y >= maxYExclusive);
      if (nan || oob) {
        invalidCount++;
        if (nan) nanCount++;
        if (oob) oobCount++;
        continue;
      }

      if (x < minX) minX = x;
      if (x > maxXSeen) maxXSeen = x;
      if (y < minY) minY = y;
      if (y > maxYSeen) maxYSeen = y;
    }

    readBuffer.unmap();
    readBuffer.destroy();

    return { aliveCount, invalidCount, nanCount, oobCount, minX, maxXSeen, minY, maxYSeen };
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
   * Count alive predators by reading predator buffer from GPU
   */
  async countAlivePredators() {
    try {
      const p2Buffer = this.engine.getCurrentP2Buffer();
      const size = p2Buffer.size;

      const readBuffer = this.gpuContext.device.createBuffer({
        size: size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });

      const encoder = this.gpuContext.device.createCommandEncoder();
      encoder.copyBufferToBuffer(p2Buffer, 0, readBuffer, 0, size);
      this.gpuContext.device.queue.submit([encoder.finish()]);

      await readBuffer.mapAsync(GPUMapMode.READ);
      const arrayBuffer = readBuffer.getMappedRange();

      const particleStride = 32;
      const particleStrideInU32 = particleStride / 4;
      const stateOffsetInU32 = 24 / 4;

      const u32View = new Uint32Array(arrayBuffer);
      const maxPredators = this.buffers.maxPredators;

      let aliveCount = 0;
      for (let i = 0; i < maxPredators; i++) {
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
      console.error('Failed to count alive predators:', error);
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
    const p2TotalEl = document.getElementById('p2-total');
    const pInvalidEl = document.getElementById('p-invalid');
    const p2InvalidEl = document.getElementById('p2-invalid');

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
    if (p2TotalEl) {
      p2TotalEl.textContent = this.currentStats.p2Total.toFixed(0);
    }
    if (pInvalidEl) {
      pInvalidEl.textContent = `${this.currentStats.pInvalid}`;
    }
    if (p2InvalidEl) {
      p2InvalidEl.textContent = `${this.currentStats.p2Invalid}`;
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
