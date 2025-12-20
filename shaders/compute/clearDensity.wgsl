// Clear density buffer (atomic u32)

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

@group(0) @binding(0) var<storage, read_write> density: array<atomic<u32>>;
@group(0) @binding(1) var<uniform> gridInfo: GridInfo;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  let total = gridInfo.width * gridInfo.height;
  if (idx >= total) {
    return;
  }
  atomicStore(&density[idx], 0u);
}
