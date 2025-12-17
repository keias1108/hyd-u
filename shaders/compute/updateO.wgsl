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
  deltaTime: f32,
  currentTime: f32,
}

@group(0) @binding(0) var<storage, read> oFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> oFieldOut: array<f32>;
@group(0) @binding(2) var<storage, read> rField: array<f32>;
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
  let currentO = oFieldIn[idx];
  let currentR = rField[idx];

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

  // Reaction flux calculation (nonlinear R·O)
  let C = currentR * currentO;
  let F_raw = params.reactionRate * C;
  let F = min(F_raw, currentO / params.deltaTime); // Prevent O from going negative

  // O update: restoration - reaction consumption
  let restore = params.restoreRate * (params.o0 - currentO) * params.deltaTime;
  let consumption = F * params.deltaTime;
  let newO = currentO + restore + diffusion - consumption;

  // Clamp to valid range [0, 1]
  oFieldOut[idx] = clamp(newO, 0.0, 1.0);
}
