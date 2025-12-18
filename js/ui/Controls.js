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
    panel.className = 'parameter-panel expanded'; // 기본 펼침 상태

    const header = document.createElement('h3');

    // 토글 아이콘 추가
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▼';

    header.appendChild(toggle);
    header.appendChild(document.createTextNode(categoryName));

    // 클릭 이벤트로 토글
    header.addEventListener('click', () => {
      panel.classList.toggle('expanded');
      panel.classList.toggle('collapsed');

      // 토글 아이콘 회전
      if (panel.classList.contains('collapsed')) {
        toggle.textContent = '▶';
      } else {
        toggle.textContent = '▼';
      }
    });

    panel.appendChild(header);

    // 컨텐츠 컨테이너
    const content = document.createElement('div');
    content.className = 'panel-content';

    definitions.forEach(def => {
      const control = this.createControl(def);
      content.appendChild(control);
    });

    panel.appendChild(content);

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

    // Add input number field
    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = def.min;
    numberInput.max = def.max;
    numberInput.step = def.step;
    numberInput.value = this.parameters.get(def.name);
    numberInput.className = 'value-input';

    // Slider input event
    input.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.parameters.set(def.name, value);
      numberInput.value = value;
      this.onParameterChange(def.name, value);
    });

    // Number input event
    numberInput.addEventListener('input', (e) => {
      let value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        value = Math.max(def.min, Math.min(def.max, value));
        this.parameters.set(def.name, value);
        input.value = value;
        this.onParameterChange(def.name, value);
      }
    });

    // Mouse wheel event on slider
    input.addEventListener('wheel', (e) => {
      e.preventDefault();
      const currentValue = parseFloat(input.value);
      const delta = e.deltaY < 0 ? def.step : -def.step;
      const newValue = Math.max(def.min, Math.min(def.max, currentValue + delta));

      input.value = newValue;
      numberInput.value = newValue;
      this.parameters.set(def.name, newValue);
      this.onParameterChange(def.name, newValue);
    }, { passive: false });

    controlRow.appendChild(input);
    controlRow.appendChild(numberInput);

    container.appendChild(label);
    container.appendChild(controlRow);

    this.controls[def.name] = { input, numberInput };

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
   * Update control value (external change)
   */
  updateControl(name, value) {
    const control = this.controls[name];
    if (!control) return;

    if (control.input) {
      control.input.value = value;
      if (control.numberInput) {
        control.numberInput.value = value;
      }
    } else if (control.select) {
      control.select.value = value;
    }
  }

  /**
   * Export parameters to JSON
   */
  exportParameters() {
    return JSON.stringify(this.parameters.getAll(), null, 2);
  }

  /**
   * Import parameters from JSON
   */
  importParameters(jsonString) {
    try {
      const params = JSON.parse(jsonString);
      for (const [name, value] of Object.entries(params)) {
        if (this.parameters.getDefinition(name)) {
          this.parameters.set(name, value);
          this.updateControl(name, value);
          this.onParameterChange(name, value);
        }
      }
      return true;
    } catch (error) {
      console.error('Failed to import parameters:', error);
      return false;
    }
  }
}
