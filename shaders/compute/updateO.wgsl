// O Field Update Shader
// Relaxation towards background concentration O0

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
  o0: f32,
  oRelaxationRate: f32,
  deltaTime: f32,
  currentTime: f32,
}

@group(0) @binding(0) var<storage, read> oFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> oFieldOut: array<f32>;
@group(0) @binding(2) var<uniform> gridInfo: GridInfo;
@group(0) @binding(3) var<uniform> params: SimParams;

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

  // Relaxation towards O0 (exponential decay to equilibrium)
  // dO/dt = (O0 - O) * relaxationRate
  let delta = (params.o0 - currentO) * params.oRelaxationRate * params.deltaTime;
  let newO = currentO + delta;

  // Clamp to valid range [0, 1]
  oFieldOut[idx] = clamp(newO, 0.0, 1.0);

  // Note: In future, reaction depletion can be added here:
  // let reactionRate = kReaction * rField[idx] * currentO;
  // let depletion = reactionRate * params.deltaTime;
  // let newO = currentO + delta - depletion;
}
