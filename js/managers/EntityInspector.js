/**
 * @fileoverview Entity Inspector
 *
 * 파티클 선택/검사 및 정보 모달 표시.
 *
 * @module managers/EntityInspector
 */

import { findNearestEntity, readParticleAt } from '../utils/gpuUtils.js';

// =============================================================================
// 상수 (이 파일에서만 사용)
// =============================================================================
const ENTITY_PICK_RADIUS_PX = 14;
const ENTITY_READ_INTERVAL_MS = 120;
const ENTITY_MODAL_MIN_WIDTH = 220;
const ENTITY_MODAL_MIN_HEIGHT = 140;
const MODAL_MARGIN_PX = 8;

export class EntityInspector {
  /**
   * @param {GPUDevice} device - WebGPU device
   * @param {SimulationParameters} parameters - Simulation parameters
   * @param {SimulationEngine} engine - Simulation engine
   * @param {SimulationBuffers} buffers - GPU buffers
   */
  constructor(device, parameters, engine, buffers) {
    this.device = device;
    this.parameters = parameters;
    this.engine = engine;
    this.buffers = buffers;

    this.selection = {
      active: false,
      kind: null, // 'P' | 'P2'
      index: -1,
      last: null,
      updateLoopRunning: false,
      readInProgress: false,
      lastReadTime: 0,
    };

    this.drag = {
      isDown: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
    };

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
   * Setup entity selection on canvas
   */
  setup() {
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

    // Mouse down on canvas
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e, canvas));

    // Mouse move (track for click detection)
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));

    // Mouse up - select entity
    window.addEventListener('mouseup', (e) => this.onMouseUp(e, canvas, container, modal));

    // Close button
    closeBtn.addEventListener('click', () => this.clearSelection());

    // Modal drag
    modalHeader.addEventListener('mousedown', (e) => this.startModalDrag(e, modal, container));
    window.addEventListener('mousemove', (e) => this.onModalDrag(e, modal, container));
    window.addEventListener('mouseup', () => this.stopModalDrag());

    // Modal resize
    resizeHandle.addEventListener('mousedown', (e) => this.startModalResize(e, modal));
    window.addEventListener('mousemove', (e) => this.onModalResize(e, modal));
    window.addEventListener('mouseup', () => this.stopModalResize());
  }

  onMouseDown(e, canvas) {
    if (e.button !== 0) return;
    if (e.target.closest('#entityModal')) return;

    const rect = canvas.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      return;
    }

    this.drag.isDown = true;
    this.drag.startX = e.clientX;
    this.drag.startY = e.clientY;
    this.drag.lastX = e.clientX;
    this.drag.lastY = e.clientY;
  }

  onMouseMove(e) {
    if (!this.drag.isDown) return;
    this.drag.lastX = e.clientX;
    this.drag.lastY = e.clientY;
  }

  async onMouseUp(e, canvas, container, modal) {
    if (e.button !== 0) return;
    if (!this.drag.isDown) return;
    this.drag.isDown = false;

    const pick = await this.pickNearestEntity(e.clientX, e.clientY, canvas);
    if (!pick) {
      this.clearSelection();
      return;
    }

    this.setSelection(pick.kind, pick.index);

    // Position modal near click
    const containerRect = container.getBoundingClientRect();
    const margin = MODAL_MARGIN_PX + 4;
    const preferredLeft = e.clientX - containerRect.left + margin;
    const preferredTop = e.clientY - containerRect.top + margin;
    const maxLeft = containerRect.width - modal.offsetWidth - margin;
    const maxTop = containerRect.height - modal.offsetHeight - margin;

    modal.style.left = `${Math.max(margin, Math.min(maxLeft, preferredLeft))}px`;
    modal.style.top = `${Math.max(margin, Math.min(maxTop, preferredTop))}px`;
    modal.classList.remove('hidden');

    await this.refreshSelectedEntity(true);
    this.ensureSelectionLoop();
  }

  /**
   * Pick nearest entity at client coordinates
   */
  async pickNearestEntity(clientX, clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;

    if (u < 0 || u > 1 || v < 0 || v > 1) return null;

    const gridW = this.parameters.get('gridWidth');
    const gridH = this.parameters.get('gridHeight');
    const targetX = u * (gridW - 1);
    const targetY = v * (gridH - 1);

    const pxPerWorld = rect.width / (gridW - 1);
    const radiusWorld = ENTITY_PICK_RADIUS_PX / Math.max(pxPerWorld, 1e-6);
    const radius2 = radiusWorld * radiusWorld;

    const pPick = await findNearestEntity(
      this.device,
      this.engine.getCurrentPBuffer(),
      this.buffers.maxParticles,
      targetX,
      targetY,
      radius2
    );

    const p2Pick = await findNearestEntity(
      this.device,
      this.engine.getCurrentP2Buffer(),
      this.buffers.maxPredators,
      targetX,
      targetY,
      radius2
    );

    if (!pPick && !p2Pick) return null;
    if (pPick && !p2Pick) return { kind: 'P', index: pPick.index };
    if (p2Pick && !pPick) return { kind: 'P2', index: p2Pick.index };

    return pPick.dist2 <= p2Pick.dist2
      ? { kind: 'P', index: pPick.index }
      : { kind: 'P2', index: p2Pick.index };
  }

  /**
   * Clear current selection
   */
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

  /**
   * Set current selection
   */
  setSelection(kind, index) {
    this.selection.active = true;
    this.selection.kind = kind;
    this.selection.index = index;
  }

  /**
   * Ensure selection update loop is running
   * @param {Function} isRunningFn - Function to check if simulation is running
   */
  ensureSelectionLoop(isRunningFn) {
    if (this.selection.updateLoopRunning) return;
    this.selection.updateLoopRunning = true;

    const tick = async () => {
      if (!this.selection.active) {
        this.selection.updateLoopRunning = false;
        return;
      }

      this.updateSelectionOverlay();

      const now = performance.now();
      const isRunning = isRunningFn ? isRunningFn() : true;

      if (isRunning && now - this.selection.lastReadTime >= ENTITY_READ_INTERVAL_MS) {
        await this.refreshSelectedEntity(false);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  /**
   * Update overlay markers
   */
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

  /**
   * Refresh selected entity data
   */
  async refreshSelectedEntity(force) {
    if (!this.selection.active) return;
    if (this.selection.readInProgress) return;

    const now = performance.now();
    if (!force && now - this.selection.lastReadTime < ENTITY_READ_INTERVAL_MS) return;

    this.selection.readInProgress = true;
    try {
      const buffer =
        this.selection.kind === 'P2'
          ? this.engine.getCurrentP2Buffer()
          : this.engine.getCurrentPBuffer();

      const entity = await readParticleAt(this.device, buffer, this.selection.index);
      this.selection.last = entity;
      this.selection.lastReadTime = now;
      this.updateEntityModal(entity);
      this.updateSelectionOverlay();
    } finally {
      this.selection.readInProgress = false;
    }
  }

  /**
   * Update entity modal display
   */
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

  // Modal drag methods
  startModalDrag(e, modal, container) {
    if (e.target.closest('.entity-modal-close')) return;
    e.preventDefault();

    this.modalDrag.isDragging = true;
    const rect = modal.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    this.modalDrag.startX = e.clientX;
    this.modalDrag.startY = e.clientY;
    this.modalDrag.startLeft = rect.left - containerRect.left;
    this.modalDrag.startTop = rect.top - containerRect.top;
  }

  onModalDrag(e, modal, container) {
    if (!this.modalDrag.isDragging) return;

    const containerRect = container.getBoundingClientRect();
    const deltaX = e.clientX - this.modalDrag.startX;
    const deltaY = e.clientY - this.modalDrag.startY;
    const nextLeft = this.modalDrag.startLeft + deltaX;
    const nextTop = this.modalDrag.startTop + deltaY;

    const maxLeft = containerRect.width - modal.offsetWidth - MODAL_MARGIN_PX;
    const maxTop = containerRect.height - modal.offsetHeight - MODAL_MARGIN_PX;

    modal.style.left = `${Math.max(MODAL_MARGIN_PX, Math.min(maxLeft, nextLeft))}px`;
    modal.style.top = `${Math.max(MODAL_MARGIN_PX, Math.min(maxTop, nextTop))}px`;
  }

  stopModalDrag() {
    this.modalDrag.isDragging = false;
  }

  // Modal resize methods
  startModalResize(e, modal) {
    e.preventDefault();
    e.stopPropagation();

    this.modalResize.isResizing = true;
    const rect = modal.getBoundingClientRect();

    this.modalResize.startX = e.clientX;
    this.modalResize.startY = e.clientY;
    this.modalResize.startWidth = rect.width;
    this.modalResize.startHeight = rect.height;
  }

  onModalResize(e, modal) {
    if (!this.modalResize.isResizing) return;

    const deltaX = e.clientX - this.modalResize.startX;
    const deltaY = e.clientY - this.modalResize.startY;

    const newWidth = Math.max(ENTITY_MODAL_MIN_WIDTH, this.modalResize.startWidth + deltaX);
    const newHeight = Math.max(ENTITY_MODAL_MIN_HEIGHT, this.modalResize.startHeight + deltaY);

    modal.style.width = `${newWidth}px`;
    modal.style.height = `${newHeight}px`;
  }

  stopModalResize() {
    this.modalResize.isResizing = false;
  }
}
