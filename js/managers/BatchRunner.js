/**
 * @fileoverview Batch Runner
 *
 * 배치 시뮬레이션 실행 및 진행상황 추적.
 *
 * @module managers/BatchRunner
 */

// =============================================================================
// 상수 (이 파일에서만 사용)
// =============================================================================
const DEFAULT_BATCH_STEPS = 200000;
const DEFAULT_BATCH_SAMPLE_EVERY = 1000;
const BATCH_CHUNK_SIZE = 512;
const BATCH_MODAL_MIN_WIDTH = 520;
const BATCH_MODAL_MIN_HEIGHT = 420;
const CHART_COLORS = {
  O_AVG: { border: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.1)' },
  R_TOTAL: { border: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.1)' },
  H_AVG: { border: 'rgb(255, 205, 86)', bg: 'rgba(255, 205, 86, 0.1)' },
  B_TOTAL: { border: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.1)' },
  P_TOTAL: { border: 'rgb(153, 102, 255)', bg: 'rgba(153, 102, 255, 0.1)' },
  P2_TOTAL: { border: 'rgb(255, 138, 101)', bg: 'rgba(255, 138, 101, 0.12)' },
};

export class BatchRunner {
  /**
   * @param {SimulationEngine} engine - Simulation engine
   * @param {SimulationBuffers} buffers - GPU buffers
   * @param {SimulationParameters} parameters - Simulation parameters
   * @param {Function} computeStats - Function to compute field statistics
   */
  constructor(engine, buffers, parameters, computeStats) {
    this.engine = engine;
    this.buffers = buffers;
    this.parameters = parameters;
    this.computeStats = computeStats;

    this.chart = null;
    this.isRunning = false;
    this.cancelRequested = false;
    this.lastResult = null;

    this.modalDrag = {
      isDragging: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0,
    };

    this.modalResize = {
      isResizing: false,
      startX: 0,
      startY: 0,
      startWidth: 0,
      startHeight: 0,
    };
  }

  /**
   * Setup batch run modal and controls
   * @param {HTMLElement} controlsContainer - Container element for controls
   */
  setup(controlsContainer) {
    if (!controlsContainer) return;

    // Create batch section in sidebar
    const batchSection = document.createElement('div');
    batchSection.className = 'parameter-panel collapsed';

    const header = document.createElement('h3');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▶';
    header.appendChild(toggle);
    header.appendChild(document.createTextNode('Batch Run'));

    header.addEventListener('click', () => this.openModal());

    batchSection.appendChild(header);
    controlsContainer.appendChild(batchSection);

    this.setupModal();
  }

  /**
   * Setup modal interactions
   */
  setupModal() {
    const modal = document.getElementById('batchModal');
    if (!modal) return;

    const header = modal.querySelector('.batch-modal-header');
    const closeBtn = document.getElementById('closeBatchModal');
    const resizeHandle = modal.querySelector('.batch-modal-resize-handle');
    const runBtn = document.getElementById('batchRunBtn');
    const stopBtn = document.getElementById('batchStopBtn');
    const resetZoomBtn = document.getElementById('batchResetZoomBtn');

    closeBtn?.addEventListener('click', () => this.closeModal());
    runBtn?.addEventListener('click', () => this.run());
    stopBtn?.addEventListener('click', () => this.stop());
    resetZoomBtn?.addEventListener('click', () => this.resetZoom());

    // Drag functionality
    header?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.batch-modal-close')) return;
      this.modalDrag.isDragging = true;
      const rect = modal.getBoundingClientRect();
      this.modalDrag.startX = e.clientX;
      this.modalDrag.startY = e.clientY;
      this.modalDrag.startLeft = rect.left;
      this.modalDrag.startTop = rect.top;
      modal.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.modalDrag.isDragging) return;
      const deltaX = e.clientX - this.modalDrag.startX;
      const deltaY = e.clientY - this.modalDrag.startY;
      modal.style.left = `${this.modalDrag.startLeft + deltaX}px`;
      modal.style.top = `${this.modalDrag.startTop + deltaY}px`;
      modal.style.transform = 'none';
    });

    window.addEventListener('mouseup', () => {
      if (this.modalDrag.isDragging) {
        modal.style.cursor = '';
        this.modalDrag.isDragging = false;
      }
    });

    // Resize functionality
    resizeHandle?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.modalResize.isResizing = true;
      const rect = modal.getBoundingClientRect();
      this.modalResize.startX = e.clientX;
      this.modalResize.startY = e.clientY;
      this.modalResize.startWidth = rect.width;
      this.modalResize.startHeight = rect.height;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.modalResize.isResizing) return;
      const deltaX = e.clientX - this.modalResize.startX;
      const deltaY = e.clientY - this.modalResize.startY;
      const newWidth = Math.max(BATCH_MODAL_MIN_WIDTH, this.modalResize.startWidth + deltaX);
      const newHeight = Math.max(BATCH_MODAL_MIN_HEIGHT, this.modalResize.startHeight + deltaY);
      modal.style.width = `${newWidth}px`;
      modal.style.height = `${newHeight}px`;
    });

    window.addEventListener('mouseup', () => {
      this.modalResize.isResizing = false;
    });
  }

  openModal() {
    const modal = document.getElementById('batchModal');
    modal?.classList.remove('hidden');
    if (!this.chart) {
      this.initializeChart();
    }
  }

  closeModal() {
    if (this.isRunning) {
      this.stop();
    }
    const modal = document.getElementById('batchModal');
    modal?.classList.add('hidden');
  }

  /**
   * Initialize batch chart
   */
  initializeChart() {
    const canvas = document.getElementById('batchChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Register zoom plugin if available
    try {
      if (window.Chart && window.ChartZoom) {
        window.Chart.register(window.ChartZoom);
      }
    } catch (e) {
      // Ignore duplicate registration
    }

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          this.createDataset('O avg', CHART_COLORS.O_AVG.border),
          this.createDataset('R total', CHART_COLORS.R_TOTAL.border),
          this.createDataset('H avg', CHART_COLORS.H_AVG.border),
          this.createDataset('B total', CHART_COLORS.B_TOTAL.border),
          this.createDataset('P total', CHART_COLORS.P_TOTAL.border),
          this.createDataset('P2 total', CHART_COLORS.P2_TOTAL.border),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#fff', font: { size: 10 } },
          },
          tooltip: { mode: 'index', intersect: false },
          zoom: {
            pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Virtual Time (s)', color: '#fff' },
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
          },
          y: {
            title: { display: true, text: 'Value', color: '#fff' },
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
          },
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
      },
    });
  }

  createDataset(label, color) {
    return {
      label,
      data: [],
      borderColor: color,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
    };
  }

  resetZoom() {
    if (this.chart?.resetZoom) {
      this.chart.resetZoom();
    }
  }

  stop() {
    if (!this.isRunning) return;
    this.cancelRequested = true;
    const stopBtn = document.getElementById('batchStopBtn');
    if (stopBtn) stopBtn.disabled = true;
    this.setUiState({ running: true, progressText: 'Stopping...' });
  }

  setUiState({ running, progressRatio, progressText }) {
    const runBtn = document.getElementById('batchRunBtn');
    const stopBtn = document.getElementById('batchStopBtn');
    const bar = document.getElementById('batchProgressBar');
    const text = document.getElementById('batchProgressText');

    if (runBtn) runBtn.disabled = !!running;
    if (stopBtn) stopBtn.disabled = !running;
    if (bar) bar.style.width = `${Math.max(0, Math.min(1, progressRatio ?? 0)) * 100}%`;
    if (text) text.textContent = progressText ?? (running ? 'Running...' : 'Idle');
  }

  clearChart() {
    if (!this.chart) return;
    this.chart.data.labels = [];
    this.chart.data.datasets.forEach((ds) => (ds.data = []));
    this.chart.update('none');
  }

  appendPoint(time, stats) {
    if (!this.chart) return;
    this.chart.data.labels.push(time);
    this.chart.data.datasets[0].data.push(stats.oAvg);
    this.chart.data.datasets[1].data.push(stats.rTotal);
    this.chart.data.datasets[2].data.push(stats.hAvg);
    this.chart.data.datasets[3].data.push(stats.bTotal);
    this.chart.data.datasets[4].data.push(stats.pTotal);
    this.chart.data.datasets[5].data.push(stats.p2Total);
    this.chart.update('none');
  }

  /**
   * Run batch simulation
   * @param {Object} options
   * @param {number} options.virtualTime - Current virtual time
   * @param {Function} options.onVirtualTimeUpdate - Callback to update virtual time
   * @param {Function} options.onPause - Callback to pause simulation
   * @param {Function} options.onRender - Callback to render final frame
   * @returns {Promise<Object>} Batch result
   */
  async run({ virtualTime, onVirtualTimeUpdate, onPause, onRender }) {
    if (this.isRunning) return null;
    if (!this.engine || !this.buffers) return null;

    const stepsEl = document.getElementById('batchSteps');
    const sampleEl = document.getElementById('batchSampleEvery');
    const totalSteps = Math.max(1, Math.floor(parseFloat(stepsEl?.value ?? DEFAULT_BATCH_STEPS)));
    const sampleEvery = Math.max(
      1,
      Math.floor(parseFloat(sampleEl?.value ?? DEFAULT_BATCH_SAMPLE_EVERY))
    );

    // Pause interactive simulation
    onPause?.();

    this.isRunning = true;
    this.cancelRequested = false;
    this.setUiState({ running: true, progressRatio: 0, progressText: `0 / ${totalSteps} steps` });

    if (!this.chart) {
      this.initializeChart();
    }
    this.clearChart();

    const dt = this.parameters.get('deltaTime');
    let completed = 0;
    let currentVirtualTime = virtualTime;
    const startTime = performance.now();

    // Initial sample
    const initialStats = await this.computeStats();
    this.appendPoint(currentVirtualTime, initialStats);

    // Run in chunks
    while (completed < totalSteps && !this.cancelRequested) {
      const chunkStart = performance.now();
      const chunkTarget = Math.min(totalSteps - completed, BATCH_CHUNK_SIZE);

      for (let i = 0; i < chunkTarget; i++) {
        currentVirtualTime += dt;

        const paramsData = this.parameters.toUniformData();
        paramsData[26] = currentVirtualTime;
        this.buffers.updateParamsBuffer(paramsData);

        this.engine.step();
        completed++;

        if (completed % sampleEvery === 0) {
          const stats = await this.computeStats();
          this.appendPoint(currentVirtualTime, stats);
        }
      }

      const ratio = completed / totalSteps;
      const elapsed = (performance.now() - startTime) / 1000;
      this.setUiState({
        running: true,
        progressRatio: ratio,
        progressText: `${completed} / ${totalSteps} steps  •  ${elapsed.toFixed(1)}s`,
      });

      // Yield to UI thread
      const spent = performance.now() - chunkStart;
      if (spent > 8) {
        await new Promise(requestAnimationFrame);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const elapsed = (performance.now() - startTime) / 1000;
    const finalStats = await this.computeStats();
    this.appendPoint(currentVirtualTime, finalStats);

    this.isRunning = false;
    const wasCancelled = this.cancelRequested;
    this.cancelRequested = false;

    this.lastResult = {
      totalSteps: completed,
      requestedSteps: totalSteps,
      sampleEvery,
      elapsed,
      finalStats,
    };

    this.setUiState({
      running: false,
      progressRatio: completed / totalSteps,
      progressText: wasCancelled
        ? `Stopped: ${completed} steps  •  ${elapsed.toFixed(1)}s`
        : `Done: ${completed} steps  •  ${elapsed.toFixed(1)}s`,
    });

    // Update virtual time and render
    onVirtualTimeUpdate?.(currentVirtualTime);
    onRender?.();

    return this.lastResult;
  }
}
