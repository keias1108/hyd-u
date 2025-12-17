// R Field Update Shader
// Maintains central injection pattern (forced, not evolved)

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

@group(0) @binding(0) var<storage, read_write> rField: array<f32>;
@group(0) @binding(1) var<uniform> gridInfo: GridInfo;
@group(0) @binding(2) var<uniform> params: SimParams;

// Smoothstep function for smooth falloff
fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
  let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;

  // Bounds check
  if (x >= gridInfo.width || y >= gridInfo.height) {
    return;
  }

  let idx = y * gridInfo.width + x;

  // Calculate distance from injection center
  let dx = f32(x) - params.rCenterX;
  let dy = f32(y) - params.rCenterY;
  let dist = sqrt(dx * dx + dy * dy);

  // Normalize distance by decay radius
  let normalizedDist = dist / params.rDecayRadius;

  // Apply smooth falloff
  // 1.0 at center, 0.0 beyond radius
  let falloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);

  // Apply power curve for falloff shape control
  let strengthFactor = pow(falloff, params.rFalloffPower);

  // Force R field to injection pattern
  rField[idx] = params.rMaxStrength * strengthFactor;
}
