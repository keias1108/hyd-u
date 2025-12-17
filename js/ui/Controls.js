/**
 * UI Controls
 * Creates and manages parameter control UI
 */

import { VIZ_MODE_LABELS, COLOR_SCHEME_LABELS } from '../simulation/parameters.js';

export class Controls {
  constructor(parameters, onParameterChange) {
    this.parameters = parameters;
    this.onParameterChange = onParameterChange;
    this.controls = {};
  }

  /**
   * Create UI controls
   */
  createUI(containerElement) {
    const categories = this.parameters.getByCategory();

    // Create panels for each category
    for (const [category, defs] of Object.entries(categories)) {
      const panel = this.createPanel(category, defs);
      containerElement.appendChild(panel);
    }

    console.log('UI controls created');
  }

  /**
   * Create a panel for a category
   */
  createPanel(categoryName, definitions) {
    const panel = document.createElement('div');
    panel.className = 'parameter-panel';

    const header = document.createElement('h3');
    header.textContent = categoryName;
    panel.appendChild(header);

    definitions.forEach(def => {
      const control = this.createControl(def);
      panel.appendChild(control);
    });

    return panel;
  }

  /**
   * Create a control for a parameter
   */
  createControl(def) {
    const container = document.createElement('div');
    container.className = 'parameter-control';

    // Special handling for visualization mode and color scheme
    if (def.name === 'visualizationMode') {
      return this.createSelectControl(def, VIZ_MODE_LABELS);
    } else if (def.name === 'colorScheme') {
      return this.createSelectControl(def, COLOR_SCHEME_LABELS);
    }

    // Standard slider control
    const label = document.createElement('label');
    label.textContent = def.description;

    const controlRow = document.createElement('div');
    controlRow.className = 'parameter-control-row';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = def.min;
    input.max = def.max;
    input.step = def.step;
    input.value = this.parameters.get(def.name);

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value-display';
    valueDisplay.textContent = this.formatValue(parseFloat(input.value), def.step);

    input.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.parameters.set(def.name, value);
      valueDisplay.textContent = this.formatValue(value, def.step);
      this.onParameterChange(def.name, value);
    });

    controlRow.appendChild(input);
    controlRow.appendChild(valueDisplay);

    container.appendChild(label);
    container.appendChild(controlRow);

    this.controls[def.name] = { input, valueDisplay };

    return container;
  }

  /**
   * Create a select dropdown control
   */
  createSelectControl(def, labels) {
    const container = document.createElement('div');
    container.className = 'parameter-control';

    const label = document.createElement('label');
    label.textContent = def.description;

    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '8px';
    select.style.backgroundColor = '#333';
    select.style.color = '#e0e0e0';
    select.style.border = '1px solid #555';
    select.style.borderRadius = '4px';
    select.style.fontSize = '0.9rem';
    select.style.cursor = 'pointer';
    select.style.marginTop = '5px';

    labels.forEach((labelText, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = labelText;
      select.appendChild(option);
    });

    select.value = this.parameters.get(def.name);

    select.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      this.parameters.set(def.name, value);
      this.onParameterChange(def.name, value);

      // Update field info display
      if (def.name === 'visualizationMode') {
        this.updateFieldInfo(labels[value]);
      }
    });

    container.appendChild(label);
    container.appendChild(select);

    this.controls[def.name] = { select };

    return container;
  }

  /**
   * Format value for display
   */
  formatValue(value, step) {
    // Ensure value is a number
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '0';

    if (step >= 1) {
      return num.toFixed(0);
    } else if (step >= 0.1) {
      return num.toFixed(1);
    } else if (step >= 0.01) {
      return num.toFixed(2);
    } else {
      return num.toFixed(3);
    }
  }

  /**
   * Update field info display
   */
  updateFieldInfo(fieldName) {
    const fieldInfo = document.getElementById('field-info');
    if (fieldInfo) {
      fieldInfo.textContent = `Field: ${fieldName}`;
    }
  }

  /**
   * Update control value (external change)
   */
  updateControl(name, value) {
    const control = this.controls[name];
    if (!control) return;

    if (control.input) {
      control.input.value = value;
      const def = this.parameters.getDefinition(name);
      control.valueDisplay.textContent = this.formatValue(value, def.step);
    } else if (control.select) {
      control.select.value = value;
    }
  }
}
