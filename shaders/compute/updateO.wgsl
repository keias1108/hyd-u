// O Field Update Shader
// Relaxation towards background concentration O0 + Reaction consumption

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

struct SimParams {
  rCenterX: f32,
  rCenterY: f32,
  rMaxStrength: f32,
  rDecayRadius: f32,
  rFalloffPower: f32,
  rDiffusionRate: f32,
  rDecayRate: f32,
  rAdvectionEnabled: f32,
  rAdvectionVX: f32,
  rAdvectionVY: f32,
  o0: f32,
  oRelaxationRate: f32,
  restoreRate: f32,
  oDiffusionRate: f32,
  reactionRate: f32,
  h0: f32,
  hDecayRate: f32,
  hDiffusionRate: f32,
  mGrowRate: f32,
  mDeathRate: f32,
  bDecayRate: f32,
  kBase: f32,
  kAlpha: f32,
  bLongRate: f32,
  mYield: f32,
  deltaTime: f32,
  currentTime: f32,

  // Terrain parameters (appended)
  terrainEnabled: f32,
  terrainH0: f32,
  terrainDepositionRate: f32,
  terrainBioDepositionRate: f32,
  terrainErosionRate: f32,
  terrainHeightErosionAlpha: f32,
  terrainDiffusionRate: f32,
  terrainThermalErosionEnabled: f32,
  terrainTalusSlope: f32,
  terrainThermalRate: f32,
  terrainFlowStrength: f32,
  terrainParticleDriftStrength: f32,
}

@group(0) @binding(0) var<storage, read> oFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> oFieldOut: array<f32>;
@group(0) @binding(2) var<storage, read> rField: array<f32>;
@group(0) @binding(3) var<storage, read> mField: array<f32>;
@group(0) @binding(4) var<storage, read_write> bField: array<f32>;
@group(0) @binding(5) var<uniform> gridInfo: GridInfo;
@group(0) @binding(6) var<uniform> params: SimParams;
@group(0) @binding(7) var<storage, read> terrainField: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;

  // Bounds check
  if (x >= gridInfo.width || y >= gridInfo.height) {
    return;
  }

  let idx = y * gridInfo.width + x;
  let currentO = oFieldIn[idx];
  let currentR = rField[idx];
  let currentM = mField[idx];
  let currentB = bField[idx];

  // 5-point stencil Laplacian for O diffusion (Neumann-like boundaries)
  var left = currentO;
  var right = currentO;
  var up = currentO;
  var down = currentO;

  if (x > 0u) {
    left = oFieldIn[idx - 1u];
  }
  if (x < gridInfo.width - 1u) {
    right = oFieldIn[idx + 1u];
  }
  if (y > 0u) {
    up = oFieldIn[idx - gridInfo.width];
  }
  if (y < gridInfo.height - 1u) {
    down = oFieldIn[idx + gridInfo.width];
  }

  let laplacian = left + right + up + down - 4.0 * currentO;
  let diffusion = params.oDiffusionRate * laplacian * params.deltaTime;

  // Terrain-driven downhill flow (adds advection term)
  var advection = 0.0;
  if (params.terrainEnabled > 0.5 && params.terrainFlowStrength > 0.0) {
    let dOdx = (right - left) * 0.5;
    let dOdy = (down - up) * 0.5;

    let hC = terrainField[idx];
    var hL = hC;
    var hR = hC;
    var hU = hC;
    var hD = hC;
    if (x > 0u) { hL = terrainField[idx - 1u]; }
    if (x < gridInfo.width - 1u) { hR = terrainField[idx + 1u]; }
    if (y > 0u) { hU = terrainField[idx - gridInfo.width]; }
    if (y < gridInfo.height - 1u) { hD = terrainField[idx + gridInfo.width]; }

    let dHdx = (hR - hL) * 0.5;
    let dHdy = (hD - hU) * 0.5;
    let v = -params.terrainFlowStrength * vec2<f32>(dHdx, dHdy);

    advection = -(v.x * dOdx + v.y * dOdy) * params.deltaTime;
  }

  // Reaction flux calculation (nonlinear R·O) with partitioning by M
  let C = currentR * currentO;
  let F_raw = params.reactionRate * C;
  let F = min(F_raw, currentO / params.deltaTime); // Prevent O from going negative
  let g = clamp(currentM, 0.0, 1.0);
  let F_fix = g * F;
  let F_waste = (1.0 - g) * F;

  // O update: restoration - reaction consumption
  let restore = params.restoreRate * (params.o0 - currentO) * params.deltaTime;
  let consumption = F * params.deltaTime;
  let newO = currentO + restore + diffusion + advection - consumption;

  // Clamp to valid range [0, 1]
  oFieldOut[idx] = clamp(newO, 0.0, 1.0);

  // Update B: accumulate fixed portion
  // B update: accumulate fixed portion and natural decay
  let newB = currentB + F_fix * params.deltaTime - currentB * params.bDecayRate * params.deltaTime;
  bField[idx] = clamp(newB, 0.0, 10.0);
}
