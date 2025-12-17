// C Field Computation Shader
// Computes overlap C = R * O

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

@group(0) @binding(0) var<storage, read> rField: array<f32>;
@group(0) @binding(1) var<storage, read> oField: array<f32>;
@group(0) @binding(2) var<storage, read_write> cField: array<f32>;
@group(0) @binding(3) var<uniform> gridInfo: GridInfo;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;

  // Bounds check
  if (x >= gridInfo.width || y >= gridInfo.height) {
    return;
  }

  let idx = y * gridInfo.width + x;

  // Simple product: C = R * O
  // This represents overlap of reducing and oxidizing substances
  cField[idx] = rField[idx] * oField[idx];

  // Note: In future, this could compute reaction rates or other derived fields
  // e.g., reactionRate = k * rField[idx] * oField[idx];
}
