// H Field Update Shader
// Heat/Loss trace production from reaction + decay

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
}

@group(0) @binding(0) var<storage, read> hFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> hFieldOut: array<f32>;
@group(0) @binding(2) var<storage, read> rField: array<f32>;
@group(0) @binding(3) var<storage, read> oField: array<f32>;
@group(0) @binding(4) var<storage, read> mField: array<f32>;
@group(0) @binding(5) var<uniform> gridInfo: GridInfo;
@group(0) @binding(6) var<uniform> params: SimParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;

  // Bounds check
  if (x >= gridInfo.width || y >= gridInfo.height) {
    return;
  }

  let idx = y * gridInfo.width + x;
  let currentH = hFieldIn[idx];
  let currentR = rField[idx];
  let currentO = oField[idx];
  let currentM = mField[idx];

  // Reaction flux (same as O consumption)
  let C = currentR * currentO;
  let F_raw = params.reactionRate * C;
  let F = min(F_raw, currentO / params.deltaTime);
  let g = clamp(currentM, 0.0, 1.0);
  let F_waste = (1.0 - g) * F;

  // H update: production from reaction + decay
  let production = F_waste * params.deltaTime;
  let decay = currentH * params.hDecayRate * params.deltaTime;
  let newH = currentH + production - decay;

  // Clamp to reasonable range [0, 10]
  hFieldOut[idx] = clamp(newH, 0.0, 10.0);
}
