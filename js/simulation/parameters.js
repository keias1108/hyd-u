/**
 * Simulation Parameter System
 * Manages all simulation parameters with validation and GPU serialization
 */

/**
 * Parameter definition with metadata for UI generation
 */
export class ParameterDefinition {
  constructor(name, defaultValue, min, max, step, category, description) {
    this.name = name;
    this.defaultValue = defaultValue;
    this.min = min;
    this.max = max;
    this.step = step;
    this.category = category;
    this.description = description;
  }
}

/**
 * All parameter definitions
 */
export const PARAMETER_DEFS = [
  // Grid
  new ParameterDefinition('gridWidth', 512, 64, 1024, 64, 'Grid', 'Grid width'),
  new ParameterDefinition('gridHeight', 512, 64, 1024, 64, 'Grid', 'Grid height'),

  // R Field (Reducing substance)
  new ParameterDefinition('rCenterX', 256, 0, 512, 1, 'R Field', 'Injection center X'),
  new ParameterDefinition('rCenterY', 256, 0, 512, 1, 'R Field', 'Injection center Y'),
  new ParameterDefinition('rMaxStrength', 1.0, 0, 1, 0.01, 'R Field', 'Max R at center'),
  new ParameterDefinition('rDecayRadius', 50, 1, 200, 1, 'R Field', 'Injection radius'),
  new ParameterDefinition('rFalloffPower', 2.0, 0.5, 5, 0.1, 'R Field', 'Falloff curve'),
  new ParameterDefinition('rDiffusionRate', 0.15, 0, 2, 0.01, 'R Field', 'R diffusion rate'),
  new ParameterDefinition('rDecayRate', 0.05, 0, 1, 0.01, 'R Field', 'R decay rate'),
  new ParameterDefinition('rAdvectionEnabled', 0, 0, 1, 1, 'R Field', 'R advection ON/OFF'),
  new ParameterDefinition('rAdvectionVX', 0.03, -0.5, 0.5, 0.01, 'R Field', 'R advection base speed'),
  new ParameterDefinition('rAdvectionVY', 0.0, -0.5, 0.5, 0.01, 'R Field', 'R advection base speed (Y component)'),

  // O Field (Oxidizing substance)
  new ParameterDefinition('o0', 0.8, 0, 1, 0.01, 'O Field', 'Background O₀'),
  new ParameterDefinition('oRelaxationRate', 0.06, 0, 1, 0.01, 'O Field', 'Relaxation rate'),
  new ParameterDefinition('oDiffusionRate', 0.08, 0, 2, 0.01, 'O Field', 'O diffusion rate'),

  // Reaction
  new ParameterDefinition('reactionRate', 0.1, 0, 2, 0.01, 'Reaction', '반응 계수'),
  new ParameterDefinition('restoreRate', 0.04, 0, 1, 0.01, 'Reaction', 'O 복원율'),

  // H Field (Heat/Loss trace)
  new ParameterDefinition('h0', 0.0, 0, 1, 0.01, 'H Field', 'H 배경 농도'),
  new ParameterDefinition('hDecayRate', 0.02, 0, 1, 0.01, 'H Field', 'H 감쇠율'),
  new ParameterDefinition('hDiffusionRate', 0.1, 0, 1, 0.01, 'H Field', 'H 확산율'),

  // M Field (microbe/biomass)
  new ParameterDefinition('mGrowRate', 0.5, 0, 5, 0.01, 'M Field', 'M growth rate from B'),
  new ParameterDefinition('mDeathRate', 0.05, 0, 1, 0.01, 'M Field', 'M death rate'),
  new ParameterDefinition('bDecayRate', 0.03, 0, 1, 0.01, 'M Field', 'B decay rate (sink to environment)'),

  // Simulation
  new ParameterDefinition('deltaTime', 0.016, 0.001, 0.1, 0.001, 'Simulation', 'Time step'),

  // Visualization
  new ParameterDefinition('visualizationMode', 0, 0, 5, 1, 'Visualization', 'Display mode'),
  new ParameterDefinition('colorScheme', 1, 0, 2, 1, 'Visualization', 'Color scheme'),
];

/**
 * Visualization mode labels
 */
export const VIZ_MODE_LABELS = ['R Field', 'O Field', 'H Field', 'C=R×O Overlap', 'M Field', 'B Field'];

/**
 * Color scheme labels
 */
export const COLOR_SCHEME_LABELS = ['Grayscale', 'Heatmap', 'Viridis'];

/**
 * Main parameter manager
 */
export class SimulationParameters {
  constructor() {
    this.values = {};

    // Initialize with default values
    PARAMETER_DEFS.forEach(def => {
      this.values[def.name] = def.defaultValue;
    });
  }

  /**
   * Set a parameter value with validation
   */
  set(name, value) {
    const def = PARAMETER_DEFS.find(d => d.name === name);
    if (!def) {
      console.warn(`Unknown parameter: ${name}`);
      return;
    }

    // Clamp to valid range
    const clamped = Math.max(def.min, Math.min(def.max, value));
    this.values[name] = clamped;

    return clamped;
  }

  /**
   * Get a parameter value
   */
  get(name) {
    return this.values[name];
  }

  /**
   * Get all parameters as object
   */
  getAll() {
    return { ...this.values };
  }

  /**
   * Serialize to Float32Array for GPU uniform buffer
   * Must match SimParams struct in WGSL
   */
  toUniformData() {
    const data = new Float32Array(64); // 256 bytes / 4 = 64 floats
    let offset = 0;

    // R field parameters (offset 0-4)
    data[offset++] = this.values.rCenterX;
    data[offset++] = this.values.rCenterY;
    data[offset++] = this.values.rMaxStrength;
    data[offset++] = this.values.rDecayRadius;
    data[offset++] = this.values.rFalloffPower;
    data[offset++] = this.values.rDiffusionRate;
    data[offset++] = this.values.rDecayRate;
    data[offset++] = this.values.rAdvectionEnabled;
    data[offset++] = this.values.rAdvectionVX;
    data[offset++] = this.values.rAdvectionVY;

    // O field parameters
    data[offset++] = this.values.o0;
    data[offset++] = this.values.oRelaxationRate;
    data[offset++] = this.values.restoreRate;
    data[offset++] = this.values.oDiffusionRate;

    // Reaction parameters
    data[offset++] = this.values.reactionRate;

    // H field parameters
    data[offset++] = this.values.h0;
    data[offset++] = this.values.hDecayRate;
    data[offset++] = this.values.hDiffusionRate;

    // M field parameters
    data[offset++] = this.values.mGrowRate;
    data[offset++] = this.values.mDeathRate;
    data[offset++] = this.values.bDecayRate;

    // Simulation parameters
    data[offset++] = this.values.deltaTime;
    data[offset++] = performance.now() / 1000.0; // currentTime in seconds

    // Padding for alignment
    while (offset < 32) {
      data[offset++] = 0.0;
    }

    return data;
  }

  /**
   * Serialize render parameters to Uint32Array
   */
  toRenderUniformData() {
    const data = new Uint32Array(4);
    data[0] = Math.floor(this.values.visualizationMode);
    data[1] = Math.floor(this.values.colorScheme);
    data[2] = 0; // padding
    data[3] = 0; // padding
    return data;
  }

  /**
   * Get parameter definition by name
   */
  getDefinition(name) {
    return PARAMETER_DEFS.find(d => d.name === name);
  }

  /**
   * Get parameters grouped by category (for UI)
   */
  getByCategory() {
    const categories = {};

    PARAMETER_DEFS.forEach(def => {
      // Skip grid size parameters (not adjustable in runtime)
      if (def.category === 'Grid') {
        return;
      }

      if (!categories[def.category]) {
        categories[def.category] = [];
      }
      categories[def.category].push(def);
    });

    return categories;
  }
}
