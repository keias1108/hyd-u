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
  new ParameterDefinition("gridWidth", 512, 64, 1024, 64, "Grid", "Grid width"),
  new ParameterDefinition(
    "gridHeight",
    512,
    64,
    1024,
    64,
    "Grid",
    "Grid height"
  ),

  // R Field (Reducing substance)
  new ParameterDefinition(
    "rCenterX",
    256,
    0,
    512,
    1,
    "R Field",
    "Injection center X"
  ),
  new ParameterDefinition(
    "rCenterY",
    256,
    0,
    512,
    1,
    "R Field",
    "Injection center Y"
  ),
  new ParameterDefinition(
    "rMaxStrength",
    0.01,
    0,
    1,
    0.01,
    "R Field",
    "Max R at center"
  ),
  new ParameterDefinition(
    "rDecayRadius",
    200,
    1,
    200,
    1,
    "R Field",
    "Injection radius"
  ),
  new ParameterDefinition(
    "rFalloffPower",
    5,
    0.5,
    5,
    0.1,
    "R Field",
    "Falloff curve"
  ),
  new ParameterDefinition(
    "rDiffusionRate",
    2,
    0,
    2,
    0.01,
    "R Field",
    "R diffusion rate"
  ),
  new ParameterDefinition(
    "rDecayRate",
    0.01,
    0,
    1,
    0.01,
    "R Field",
    "R decay rate"
  ),
  new ParameterDefinition(
    "rAdvectionEnabled",
    0,
    0,
    1,
    1,
    "R Field",
    "R advection ON/OFF"
  ),
  new ParameterDefinition(
    "rAdvectionVX",
    0.5,
    -0.5,
    0.5,
    0.01,
    "R Field",
    "R advection base speed"
  ),
  new ParameterDefinition(
    "rAdvectionVY",
    0.03,
    -0.5,
    0.5,
    0.01,
    "R Field",
    "R advection base speed (Y component)"
  ),

  // O Field (Oxidizing substance)
  new ParameterDefinition("o0", 0.88, 0, 1, 0.01, "O Field", "Background O₀"),
  new ParameterDefinition(
    "oRelaxationRate",
    0.005,
    0,
    1,
    0.01,
    "O Field",
    "Relaxation rate"
  ),
  new ParameterDefinition(
    "oDiffusionRate",
    1,
    0,
    2,
    0.01,
    "O Field",
    "O diffusion rate"
  ),

  // Reaction
  new ParameterDefinition(
    "reactionRate",
    2,
    0,
    2,
    0.01,
    "Reaction",
    "반응 계수"
  ),
  new ParameterDefinition(
    "restoreRate",
    0.06189,
    0,
    1,
    0.01,
    "Reaction",
    "O 복원율"
  ),

  // H Field (Heat/Loss trace)
  new ParameterDefinition("h0", 0.0, 0, 1, 0.01, "H Field", "H 배경 농도"),
  new ParameterDefinition(
    "hDecayRate",
    0.02,
    0,
    1,
    0.01,
    "H Field",
    "H 감쇠율"
  ),
  new ParameterDefinition(
    "hDiffusionRate",
    0.8,
    0,
    1,
    0.01,
    "H Field",
    "H 확산율"
  ),

  // M Field (microbe/biomass)
  new ParameterDefinition(
    "mGrowRate",
    0.3,
    0,
    5,
    0.01,
    "M Field",
    "M growth rate from B"
  ),
  new ParameterDefinition(
    "mDeathRate",
    0.15,
    0,
    1,
    0.01,
    "M Field",
    "M death rate"
  ),
  new ParameterDefinition(
    "bDecayRate",
    0.001,
    0,
    1,
    0.01,
    "M Field",
    "B decay rate (sink to environment)"
  ),
  new ParameterDefinition(
    "kBase",
    0.8,
    0.1,
    10,
    0.1,
    "M Field",
    "M carrying capacity base K0"
  ),
  new ParameterDefinition(
    "kAlpha",
    0.5,
    0,
    5,
    0.01,
    "M Field",
    "Km sensitivity to long-term B"
  ),
  new ParameterDefinition(
    "bLongRate",
    0.01,
    0,
    2,
    0.01,
    "M Field",
    "Long-term B averaging rate"
  ),
  new ParameterDefinition(
    "mYield",
    0.8,
    0,
    5,
    0.01,
    "M Field",
    "B consumption per positive M growth"
  ),

  // Particle Agents (P)
  new ParameterDefinition(
    "pCount",
    3072,
    0,
    16384,
    256,
    "Particles",
    "Initial particle count (can grow via reproduction)"
  ),
  new ParameterDefinition(
    "pBiasStrength",
    0.001,
    0,
    5,
    0.01,
    "Particles",
    "Bias toward ∇B"
  ),
  new ParameterDefinition(
    "pFriction",
    0.2,
    0,
    2,
    0.01,
    "Particles",
    "Velocity friction"
  ),
  new ParameterDefinition(
    "pNoiseStrength",
    0.01,
    0,
    2,
    0.01,
    "Particles",
    "Random walk strength"
  ),
  new ParameterDefinition(
    "pSpeed",
    1.0,
    0,
    5,
    0.01,
    "Particles",
    "Movement speed scale"
  ),
  new ParameterDefinition(
    "pEatEnabled",
    1,
    0,
    1,
    1,
    "Particles",
    "Particle eating ON/OFF"
  ),
  new ParameterDefinition(
    "pEatAmount",
    0.05,
    0,
    0.05,
    0.0005,
    "Particles",
    "B consumption per step"
  ),
  new ParameterDefinition(
    "pPointSize",
    1.0,
    1,
    8,
    0.5,
    "Particles",
    "Particle point size (px)"
  ),
  new ParameterDefinition(
    "pEnergyDecayRate",
    0.003,
    0,
    0.1,
    0.0001,
    "Particles",
    "Energy decay per step"
  ),
  new ParameterDefinition(
    "pEnergyFromEat",
    0.1,
    0,
    0.5,
    0.001,
    "Particles",
    "Energy gain coefficient from B consumption"
  ),
  new ParameterDefinition(
    "pMinEnergy",
    0.1,
    0,
    1,
    0.01,
    "Particles",
    "Minimum energy threshold for survival"
  ),
  new ParameterDefinition(
    "pMaxEnergy",
    2.0,
    0.5,
    5.0,
    0.1,
    "Particles",
    "Maximum energy cap"
  ),
  new ParameterDefinition(
    "pReproduceEnabled",
    1,
    0,
    1,
    1,
    "Particles",
    "Reproduction ON/OFF"
  ),
  new ParameterDefinition(
    "pReproduceThreshold",
    1.5,
    0.5,
    3.0,
    0.1,
    "Particles",
    "Energy required to reproduce"
  ),
  new ParameterDefinition(
    "pReproduceSpawnRadius",
    5.0,
    1.0,
    20.0,
    0.5,
    "Particles",
    "Child spawn distance from parent"
  ),

  // Predator Particles (P2)
  new ParameterDefinition(
    "p2Count",
    512,
    0,
    16384,
    256,
    "Predators",
    "Initial predator count (can grow via reproduction)"
  ),
  new ParameterDefinition(
    "p2BiasStrength",
    0.002,
    0,
    5,
    0.01,
    "Predators",
    "Bias toward ∇P"
  ),
  new ParameterDefinition(
    "p2Friction",
    0.25,
    0,
    2,
    0.01,
    "Predators",
    "Velocity friction"
  ),
  new ParameterDefinition(
    "p2NoiseStrength",
    0.02,
    0,
    2,
    0.01,
    "Predators",
    "Random walk strength"
  ),
  new ParameterDefinition(
    "p2Speed",
    1.2,
    0,
    5,
    0.01,
    "Predators",
    "Movement speed scale"
  ),
  new ParameterDefinition(
    "p2EatEnabled",
    1,
    0,
    1,
    1,
    "Predators",
    "Predator eating ON/OFF"
  ),
  new ParameterDefinition(
    "p2EatAmount",
    0.15,
    0,
    0.5,
    0.005,
    "Predators",
    "Local P density usage per step"
  ),
  new ParameterDefinition(
    "p2PointSize",
    1.8,
    1,
    8,
    0.5,
    "Predators",
    "Predator point size (px)"
  ),
  new ParameterDefinition(
    "p2EnergyDecayRate",
    0.004,
    0,
    0.1,
    0.0001,
    "Predators",
    "Energy decay per step"
  ),
  new ParameterDefinition(
    "p2EnergyFromEat",
    0.2,
    0,
    0.5,
    0.001,
    "Predators",
    "Energy gain coefficient from predation"
  ),
  new ParameterDefinition(
    "p2MinEnergy",
    0.1,
    0,
    1,
    0.01,
    "Predators",
    "Minimum energy threshold for survival"
  ),
  new ParameterDefinition(
    "p2MaxEnergy",
    2.5,
    0.5,
    5.0,
    0.1,
    "Predators",
    "Maximum energy cap"
  ),
  new ParameterDefinition(
    "p2ReproduceEnabled",
    1,
    0,
    1,
    1,
    "Predators",
    "Reproduction ON/OFF"
  ),
  new ParameterDefinition(
    "p2ReproduceThreshold",
    1.6,
    0.5,
    3.0,
    0.1,
    "Predators",
    "Energy required to reproduce"
  ),
  new ParameterDefinition(
    "p2ReproduceSpawnRadius",
    6.0,
    1.0,
    20.0,
    0.5,
    "Predators",
    "Child spawn distance from parent"
  ),
  new ParameterDefinition(
    "p2PredationStrength",
    0.015,
    0,
    0.8,
    0.001,
    "Predators",
    "P energy loss per nearby predator"
  ),

  // Simulation
  new ParameterDefinition(
    "deltaTime",
    0.05,
    0.001,
    0.5,
    0.001,
    "Simulation",
    "Time step (dt)"
  ),
  new ParameterDefinition(
    "speedMultiplier",
    10,
    1,
    30,
    1,
    "Simulation",
    "Speed multiplier (sub-steps per frame)"
  ),

  // Terrain (height field / Z axis)
  new ParameterDefinition(
    "terrainEnabled",
    1,
    0,
    1,
    1,
    "Terrain",
    "Terrain feedback ON/OFF"
  ),
  new ParameterDefinition(
    "terrainH0",
    1.0,
    0.05,
    10.0,
    0.05,
    "Terrain",
    "Height tone-map scale (H0)"
  ),
  new ParameterDefinition(
    "terrainDepositionRate",
    0.1,
    0,
    2.0,
    0.01,
    "Terrain",
    "Deposition rate from (waste reaction)"
  ),
  new ParameterDefinition(
    "terrainBioDepositionRate",
    0.002,
    0,
    0.1,
    0.0005,
    "Terrain",
    "Deposition rate from long-term B"
  ),
  new ParameterDefinition(
    "terrainErosionRate",
    0.05,
    0,
    2.0,
    0.01,
    "Terrain",
    "Erosion rate from |∇R|"
  ),
  new ParameterDefinition(
    "terrainHeightErosionAlpha",
    2.0,
    0,
    20.0,
    0.1,
    "Terrain",
    "Extra erosion at high Z"
  ),
  new ParameterDefinition(
    "terrainDiffusionRate",
    0.01,
    0,
    1.0,
    0.001,
    "Terrain",
    "Terrain smoothing diffusion"
  ),
  new ParameterDefinition(
    "terrainThermalErosionEnabled",
    1,
    0,
    1,
    1,
    "Terrain",
    "Thermal erosion (talus) ON/OFF"
  ),
  new ParameterDefinition(
    "terrainTalusSlope",
    0.3,
    0.01,
    2.0,
    0.01,
    "Terrain",
    "Talus slope threshold"
  ),
  new ParameterDefinition(
    "terrainThermalRate",
    0.2,
    0,
    5.0,
    0.01,
    "Terrain",
    "Thermal erosion strength"
  ),
  new ParameterDefinition(
    "terrainFlowStrength",
    0.08,
    0,
    2.0,
    0.01,
    "Terrain",
    "Downhill flow strength (fields)"
  ),
  new ParameterDefinition(
    "terrainParticleDriftStrength",
    0.12,
    0,
    2.0,
    0.01,
    "Terrain",
    "Downhill drift strength (particles)"
  ),

  // Visualization
  new ParameterDefinition(
    "visualizationMode",
    4,
    0,
    6,
    1,
    "Visualization",
    "Display mode"
  ),
  new ParameterDefinition(
    "colorScheme",
    0,
    0,
    3,
    1,
    "Visualization",
    "Color scheme"
  ),
];

/**
 * Visualization mode labels
 */
export const VIZ_MODE_LABELS = [
  "R Field",
  "O Field",
  "H Field",
  "C=R×O Overlap",
  "M Field",
  "B Field",
  "Terrain (Z)",
];

/**
 * Color scheme labels
 */
export const COLOR_SCHEME_LABELS = ["Grayscale", "Heatmap", "Viridis", "Ocean"];

/**
 * Main parameter manager
 */
export class SimulationParameters {
  constructor() {
    this.values = {};

    // Initialize with default values
    PARAMETER_DEFS.forEach((def) => {
      this.values[def.name] = def.defaultValue;
    });
  }

  /**
   * Set a parameter value with validation
   */
  set(name, value) {
    const def = PARAMETER_DEFS.find((d) => d.name === name);
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
    data[offset++] = this.values.kBase;
    data[offset++] = this.values.kAlpha;
    data[offset++] = this.values.bLongRate;
    data[offset++] = this.values.mYield;

    // Simulation parameters
    data[offset++] = this.values.deltaTime;
    data[offset++] = performance.now() / 1000.0; // currentTime in seconds

    // Terrain parameters (appended; keeps old offsets stable)
    data[offset++] = this.values.terrainEnabled;
    data[offset++] = this.values.terrainH0;
    data[offset++] = this.values.terrainDepositionRate;
    data[offset++] = this.values.terrainBioDepositionRate;
    data[offset++] = this.values.terrainErosionRate;
    data[offset++] = this.values.terrainHeightErosionAlpha;
    data[offset++] = this.values.terrainDiffusionRate;
    data[offset++] = this.values.terrainThermalErosionEnabled;
    data[offset++] = this.values.terrainTalusSlope;
    data[offset++] = this.values.terrainThermalRate;
    data[offset++] = this.values.terrainFlowStrength;
    data[offset++] = this.values.terrainParticleDriftStrength;

    // Padding for alignment / safety
    while (offset < data.length) {
      data[offset++] = 0.0;
    }

    return data;
  }

  /**
   * Serialize particle parameters to Float32Array (separate uniform buffer)
   */
  toParticleUniformData() {
    const data = new Float32Array(16);
    let offset = 0;

    data[offset++] = this.values.pCount;
    data[offset++] = this.values.pBiasStrength;
    data[offset++] = this.values.pFriction;
    data[offset++] = this.values.pNoiseStrength;
    data[offset++] = this.values.pSpeed;
    data[offset++] = this.values.pEatEnabled;
    data[offset++] = this.values.pEatAmount;
    data[offset++] = this.values.pPointSize;
    data[offset++] = this.values.pEnergyDecayRate;
    data[offset++] = this.values.pEnergyFromEat;
    data[offset++] = this.values.pMinEnergy;
    data[offset++] = this.values.pMaxEnergy;
    data[offset++] = this.values.pReproduceEnabled;
    data[offset++] = this.values.pReproduceThreshold;
    data[offset++] = this.values.pReproduceSpawnRadius;

    while (offset < data.length) {
      data[offset++] = 0.0;
    }

    return data;
  }

  /**
   * Serialize predator parameters to Float32Array (separate uniform buffer)
   */
  toPredatorUniformData() {
    const data = new Float32Array(16);
    let offset = 0;

    data[offset++] = this.values.p2Count;
    data[offset++] = this.values.p2BiasStrength;
    data[offset++] = this.values.p2Friction;
    data[offset++] = this.values.p2NoiseStrength;
    data[offset++] = this.values.p2Speed;
    data[offset++] = this.values.p2EatEnabled;
    data[offset++] = this.values.p2EatAmount;
    data[offset++] = this.values.p2PointSize;
    data[offset++] = this.values.p2EnergyDecayRate;
    data[offset++] = this.values.p2EnergyFromEat;
    data[offset++] = this.values.p2MinEnergy;
    data[offset++] = this.values.p2MaxEnergy;
    data[offset++] = this.values.p2ReproduceEnabled;
    data[offset++] = this.values.p2ReproduceThreshold;
    data[offset++] = this.values.p2ReproduceSpawnRadius;
    data[offset++] = this.values.p2PredationStrength;

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
    return PARAMETER_DEFS.find((d) => d.name === name);
  }

  /**
   * Get parameters grouped by category (for UI)
   */
  getByCategory() {
    const categories = {};

    PARAMETER_DEFS.forEach((def) => {
      // Skip grid size parameters (not adjustable in runtime)
      if (def.category === "Grid") {
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
