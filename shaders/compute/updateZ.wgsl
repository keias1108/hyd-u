// Terrain (Z/H) Update Shader
// Slow geomorphology: deposition + erosion + nonlinear "thermal erosion" (talus) smoothing

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

@group(0) @binding(0) var<storage, read> terrainIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> terrainOut: array<f32>;
@group(0) @binding(2) var<storage, read> terrainRock: array<f32>;
@group(0) @binding(3) var<storage, read> rField: array<f32>;
@group(0) @binding(4) var<storage, read> oField: array<f32>;
@group(0) @binding(5) var<storage, read> mField: array<f32>;
@group(0) @binding(6) var<storage, read> bLongField: array<f32>;
@group(0) @binding(7) var<uniform> gridInfo: GridInfo;
@group(0) @binding(8) var<uniform> params: SimParams;

fn height_to_z(h: f32, h0: f32) -> f32 {
  let safeH0 = max(h0, 1e-6);
  return 1.0 - exp(-max(h, 0.0) / safeH0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;

  if (x >= gridInfo.width || y >= gridInfo.height) {
    return;
  }

  let idx = y * gridInfo.width + x;

  // If disabled, keep terrain unchanged (ping-pong)
  if (params.terrainEnabled < 0.5) {
    terrainOut[idx] = terrainIn[idx];
    return;
  }

  let dt = params.deltaTime;

  let rockH = terrainRock[idx];
  let hC = terrainIn[idx];

  // Terrain neighbors for gradients / Laplacian
  var hL = hC;
  var hR = hC;
  var hU = hC;
  var hD = hC;

  if (x > 0u) { hL = terrainIn[idx - 1u]; }
  if (x < gridInfo.width - 1u) { hR = terrainIn[idx + 1u]; }
  if (y > 0u) { hU = terrainIn[idx - gridInfo.width]; }
  if (y < gridInfo.height - 1u) { hD = terrainIn[idx + gridInfo.width]; }

  let dHdx = (hR - hL) * 0.5;
  let dHdy = (hD - hU) * 0.5;
  let slope = length(vec2<f32>(dHdx, dHdy));

  let lapH = hL + hR + hU + hD - 4.0 * hC;

  // Compute |∇R| as a proxy for strong flow/fronts (erosion driver)
  let rC = rField[idx];
  var rL = rC;
  var rR = rC;
  var rU = rC;
  var rD = rC;
  if (x > 0u) { rL = rField[idx - 1u]; }
  if (x < gridInfo.width - 1u) { rR = rField[idx + 1u]; }
  if (y > 0u) { rU = rField[idx - gridInfo.width]; }
  if (y < gridInfo.height - 1u) { rD = rField[idx + gridInfo.width]; }
  let gradR = vec2<f32>((rR - rL) * 0.5, (rD - rU) * 0.5);
  let flow = length(gradR);

  // Deposition: reaction "waste" (where microbes don't fix the reaction) + long-term B trace
  let oC = oField[idx];
  let mC = mField[idx];
  let bLong = bLongField[idx];

  let C = rC * oC;
  let F_raw = params.reactionRate * C;
  let F = min(F_raw, oC / max(dt, 1e-6));
  let g = clamp(mC, 0.0, 1.0);
  let F_waste = (1.0 - g) * F;

  let deposit = params.terrainDepositionRate * F_waste * dt
    + params.terrainBioDepositionRate * max(bLong, 0.0) * dt;

  // Erosion: driven by |∇R|, amplified at high Z (soft cap), but cannot erode below bedrock.
  let zC = height_to_z(hC, params.terrainH0);
  let heightBoost = 1.0 + params.terrainHeightErosionAlpha * zC;

  // Only erode the portion above bedrock (sediment thickness proxy), saturating for stability.
  let sediment = max(hC - rockH, 0.0);
  let sedimentFactor = clamp(sediment / max(params.terrainH0, 1e-6), 0.0, 1.0);
  let erosion = params.terrainErosionRate * flow * heightBoost * sedimentFactor * dt;

  // Base smoothing diffusion + talus-like nonlinear diffusion when slopes exceed threshold.
  let smoothing = params.terrainDiffusionRate * lapH * dt;

  var thermal = 0.0;
  if (params.terrainThermalErosionEnabled > 0.5) {
    let excess = max(slope - params.terrainTalusSlope, 0.0);
    let k = params.terrainThermalRate * excess;
    thermal = k * lapH * dt;
  }

  var newH = hC + deposit - erosion + smoothing + thermal;

  // Enforce non-erodible bedrock baseline
  newH = max(newH, rockH);

  // Safety cap (prevents runaway with extreme parameters; not a "visual ceiling")
  terrainOut[idx] = clamp(newH, rockH, 1000.0);
}
