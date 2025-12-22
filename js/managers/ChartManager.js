/**
 * Chart Manager
 * Handles Chart.js initialization and updates for statistics visualization
 */

import {
  CHART_COLORS,
  MAX_CHART_DATA_POINTS,
  CHART_MODAL_MIN_WIDTH,
  CHART_MODAL_MIN_HEIGHT,
} from '../core/constants.js';

export class ChartManager {
  constructor() {
    this.chart = null;
    this.maxDataPoints = MAX_CHART_DATA_POINTS;

    // Modal drag state
    this.dragState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0,
    };

    // Modal resize state
    this.resizeState = {
      isResizing: false,
      startX: 0,
      startY: 0,
      startWidth: 0,
      startHeight: 0,
    };
  }

  /**
   * Initialize chart and modal interactions
   */
  setup() {
    this.setupModalInteractions();
  }

  /**
   * Setup modal drag and resize interactions
   */
  setupModalInteractions() {
    const modal = document.getElementById('chartModal');
    if (!modal) return;

    const header = modal.querySelector('.chart-modal-header');
    const closeBtn = document.getElementById('closeChartModal');
    const resizeHandle = modal.querySelector('.chart-modal-resize-handle');

    closeBtn?.addEventListener('click', () => this.closeModal());

    header?.addEventListener('mousedown', (e) => this.startDragging(e, modal));

    resizeHandle?.addEventListener('mousedown', (e) => this.startResizing(e, modal));

    document.addEventListener('mousemove', (e) => {
      this.onDragging(e, modal);
      this.onResizing(e, modal);
    });

    document.addEventListener('mouseup', () => {
      this.stopDragging(modal);
      this.stopResizing();
    });
  }

  /**
   * Open chart modal
   */
  openModal() {
    const modal = document.getElementById('chartModal');
    modal?.classList.remove('hidden');

    if (!this.chart) {
      this.initializeChart();
    }
  }

  /**
   * Close chart modal
   */
  closeModal() {
    const modal = document.getElementById('chartModal');
    modal?.classList.add('hidden');
  }

  /**
   * Start dragging modal
   */
  startDragging(e, modal) {
    if (e.target.closest('.chart-modal-close')) return;

    this.dragState.isDragging = true;
    const rect = modal.getBoundingClientRect();

    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.startLeft = rect.left;
    this.dragState.startTop = rect.top;

    modal.style.cursor = 'grabbing';
  }

  /**
   * Handle dragging motion
   */
  onDragging(e, modal) {
    if (!this.dragState.isDragging) return;

    const deltaX = e.clientX - this.dragState.startX;
    const deltaY = e.clientY - this.dragState.startY;

    modal.style.left = `${this.dragState.startLeft + deltaX}px`;
    modal.style.top = `${this.dragState.startTop + deltaY}px`;
    modal.style.transform = 'none';
  }

  /**
   * Stop dragging modal
   */
  stopDragging(modal) {
    if (this.dragState.isDragging) {
      modal.style.cursor = '';
      this.dragState.isDragging = false;
    }
  }

  /**
   * Start resizing modal
   */
  startResizing(e, modal) {
    e.preventDefault();
    e.stopPropagation();

    this.resizeState.isResizing = true;
    const rect = modal.getBoundingClientRect();

    this.resizeState.startX = e.clientX;
    this.resizeState.startY = e.clientY;
    this.resizeState.startWidth = rect.width;
    this.resizeState.startHeight = rect.height;
  }

  /**
   * Handle resizing motion
   */
  onResizing(e, modal) {
    if (!this.resizeState.isResizing) return;

    const deltaX = e.clientX - this.resizeState.startX;
    const deltaY = e.clientY - this.resizeState.startY;

    const newWidth = Math.max(CHART_MODAL_MIN_WIDTH, this.resizeState.startWidth + deltaX);
    const newHeight = Math.max(CHART_MODAL_MIN_HEIGHT, this.resizeState.startHeight + deltaY);

    modal.style.width = `${newWidth}px`;
    modal.style.height = `${newHeight}px`;
  }

  /**
   * Stop resizing modal
   */
  stopResizing() {
    this.resizeState.isResizing = false;
  }

  /**
   * Initialize Chart.js instance
   */
  initializeChart() {
    const canvas = document.getElementById('floatingStatsChart');
    if (!canvas || this.chart) return;

    const ctx = canvas.getContext('2d');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          this.createDataset('O avg', CHART_COLORS.O_AVG),
          this.createDataset('R total', CHART_COLORS.R_TOTAL),
          this.createDataset('H avg', CHART_COLORS.H_AVG),
          this.createDataset('B total', CHART_COLORS.B_TOTAL),
          this.createDataset('P total', CHART_COLORS.P_TOTAL),
          this.createDataset('P2 total', CHART_COLORS.P2_TOTAL),
        ],
      },
      options: this.getChartOptions(),
    });

    console.log('Chart initialized');
  }

  /**
   * Create a dataset configuration
   */
  createDataset(label, colors) {
    return {
      label,
      data: [],
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
    };
  }

  /**
   * Get chart options configuration
   */
  getChartOptions() {
    return {
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
    };
  }

  /**
   * Update chart with new data point
   * @param {number} time - Virtual time
   * @param {Object} stats - Current statistics
   */
  update(time, stats) {
    if (!this.chart) return;

    this.chart.data.labels.push(time);
    this.chart.data.datasets[0].data.push(stats.oAvg);
    this.chart.data.datasets[1].data.push(stats.rTotal);
    this.chart.data.datasets[2].data.push(stats.hAvg);
    this.chart.data.datasets[3].data.push(stats.bTotal);
    this.chart.data.datasets[4].data.push(stats.pTotal);
    this.chart.data.datasets[5].data.push(stats.p2Total);

    // Keep only last N data points
    if (this.chart.data.labels.length > this.maxDataPoints) {
      this.chart.data.labels.shift();
      this.chart.data.datasets.forEach((ds) => ds.data.shift());
    }

    this.chart.update('none');
  }

  /**
   * Reset chart data
   */
  reset() {
    if (!this.chart) return;

    this.chart.data.labels = [];
    this.chart.data.datasets.forEach((ds) => {
      ds.data = [];
    });
    this.chart.update('none');
  }
}
