// Clear particle buffer by zeroing u32 words
// Assumes fixed capacity = 16384 and stride = 32 bytes (8 u32 per particle)

@group(0) @binding(0) var<storage, read_write> data: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  let totalU32 = 16384u * 8u;
  if (idx >= totalU32) {
    return;
  }
  data[idx] = 0u;
}
