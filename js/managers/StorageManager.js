/**
 * Storage Manager
 * Handles localStorage operations and JSON import/export for parameters
 */

import { STORAGE_KEYS } from '../core/constants.js';

export class StorageManager {
  /**
   * @param {Controls} controls - UI controls instance
   */
  constructor(controls) {
    this.controls = controls;
  }

  /**
   * Save parameters to JSON file download
   */
  saveToFile() {
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

    console.log('Parameters saved to JSON file');
  }

  /**
   * Load parameters from JSON file
   * @returns {Promise<boolean>} Success status
   */
  async loadFromFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';

      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
          resolve(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const success = this.controls.importParameters(event.target.result);
          if (success) {
            console.log('Parameters loaded from JSON file');
            alert('Parameters loaded successfully!');
          } else {
            alert('Failed to load parameters. Please check the file format.');
          }
          resolve(success);
        };
        reader.readAsText(file);
      });

      input.click();
    });
  }

  /**
   * Save current parameters to localStorage
   */
  saveToLocalStorage() {
    const json = this.controls.exportParameters();
    localStorage.setItem(STORAGE_KEYS.PARAMETERS, json);
    console.log('Parameters saved to localStorage');
    alert('Current parameters saved as your default!');
  }

  /**
   * Clear saved parameters from localStorage
   */
  clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEYS.PARAMETERS);
    console.log('Saved parameters cleared from localStorage');
    alert('Saved settings cleared! Refresh page to use factory defaults.');
  }

  /**
   * Load parameters from localStorage if available
   * @returns {boolean} Success status
   */
  loadFromLocalStorage() {
    const saved = localStorage.getItem(STORAGE_KEYS.PARAMETERS);
    if (!saved) return false;

    const success = this.controls.importParameters(saved);
    if (success) {
      console.log('Parameters loaded from localStorage');
      return true;
    }

    console.warn('Failed to load saved parameters, using defaults');
    localStorage.removeItem(STORAGE_KEYS.PARAMETERS);
    return false;
  }

  /**
   * Get sidebar visibility state from localStorage
   * @returns {boolean}
   */
  getSidebarVisible() {
    const saved = localStorage.getItem(STORAGE_KEYS.SIDEBAR_VISIBLE);
    return saved === null ? true : saved === 'true';
  }

  /**
   * Set sidebar visibility state in localStorage
   * @param {boolean} visible
   */
  setSidebarVisible(visible) {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_VISIBLE, String(visible));
  }

  /**
   * Get panel expanded state from localStorage
   * @param {string} panelName
   * @returns {boolean}
   */
  getPanelExpanded(panelName) {
    const saved = localStorage.getItem(STORAGE_KEYS.PANEL_STATE_PREFIX + panelName);
    return saved === null ? true : saved === 'expanded';
  }

  /**
   * Set panel expanded state in localStorage
   * @param {string} panelName
   * @param {boolean} expanded
   */
  setPanelExpanded(panelName, expanded) {
    localStorage.setItem(
      STORAGE_KEYS.PANEL_STATE_PREFIX + panelName,
      expanded ? 'expanded' : 'collapsed'
    );
  }
}
