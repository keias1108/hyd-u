// M Field Update Shader
// Simple growth from B and death decay

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
  deltaTime: f32,
  currentTime: f32,
}

@group(0) @binding(0) var<storage, read> mFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> mFieldOut: array<f32>;
@group(0) @binding(2) var<storage, read> bField: array<f32>;
@group(0) @binding(3) var<uniform> gridInfo: GridInfo;
@group(0) @binding(4) var<uniform> params: SimParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;

  // Bounds check
  if (x >= gridInfo.width || y >= gridInfo.height) {
    return;
  }

  let idx = y * gridInfo.width + x;
  let currentM = mFieldIn[idx];
  let currentB = bField[idx];

  let growth = params.mGrowRate * currentB;
  let death = params.mDeathRate * currentM;
  let newM = currentM + (growth - death) * params.deltaTime;

  mFieldOut[idx] = clamp(newM, 0.0, 10.0);
}
