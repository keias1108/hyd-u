// Accumulate particle density into atomic u32 grid

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  energy: f32,
  type_: u32,
  state: u32,
  age: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> density: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> gridInfo: GridInfo;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  let maxParticles = 16384u;
  if (idx >= maxParticles) {
    return;
  }

  let p = particles[idx];
  if (p.state == 0u) {
    return;
  }

  let x = clamp(p.pos.x, 0.0, f32(gridInfo.width - 1u));
  let y = clamp(p.pos.y, 0.0, f32(gridInfo.height - 1u));

  let xi = u32(x);
  let yi = u32(y);
  let cell = yi * gridInfo.width + xi;

  atomicAdd(&density[cell], 1u);
}
