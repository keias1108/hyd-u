// H Field Diffusion Shader
// Spatial diffusion using 5-point stencil Laplacian

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

@group(0) @binding(0) var<storage, read> hFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> hFieldOut: array<f32>;
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
  let center = hFieldIn[idx];

  // 5-point stencil Laplacian with boundary handling
  var left = center;
  var right = center;
  var up = center;
  var down = center;

  if (x > 0u) {
    left = hFieldIn[idx - 1u];
  }
  if (x < gridInfo.width - 1u) {
    right = hFieldIn[idx + 1u];
  }
  if (y > 0u) {
    up = hFieldIn[idx - gridInfo.width];
  }
  if (y < gridInfo.height - 1u) {
    down = hFieldIn[idx + gridInfo.width];
  }

  // Laplacian = sum of neighbors - 4 * center
  let laplacian = left + right + up + down - 4.0 * center;

  // Diffusion: H_new = H + D * ∇²H * dt
  let diffusion = params.hDiffusionRate * laplacian * params.deltaTime;
  let newH = center + diffusion;

  // Clamp to reasonable range [0, 10]
  hFieldOut[idx] = clamp(newH, 0.0, 10.0);
}
