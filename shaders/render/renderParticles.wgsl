// Particle Render Shader: instanced quads

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

struct ParticleParams {
  pCount: f32,
  pBiasStrength: f32,
  pFriction: f32,
  pNoiseStrength: f32,
  pSpeed: f32,
  pEatEnabled: f32,
  pEatAmount: f32,
  pPointSize: f32,
  pEnergyDecayRate: f32,
  pEnergyFromEat: f32,
  pMinEnergy: f32,
  _pad3: f32,
}

struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  energy: f32,
  type_: u32,
  state: u32,
  age: f32,
}

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> gridInfo: GridInfo;
@group(0) @binding(2) var<uniform> particleParams: ParticleParams;

fn pcg_hash(v: u32) -> u32 {
  var state = v * 747796405u + 2891336453u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand01(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) / 4294967296.0;
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
  var out: VSOut;

  let p = particles[instanceIndex];

  // Skip inactive particles (render off-screen)
  if (p.state == 0u) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.color = vec3<f32>(0.0, 0.0, 0.0);
    return out;
  }

  // Brighter, higher-contrast coloring (avoid "invisible but alive" perception under alpha blending)
  let energyNorm = clamp(p.energy * 0.15 + 0.85, 0.85, 1.0);
  let baseColor = vec3<f32>(0.6, 0.9, 1.0);
  out.color = min(baseColor * energyNorm * 1.4, vec3<f32>(1.0, 1.0, 1.0));

  // Small quad offsets (two triangles = 6 vertices)
  let sizePx = particleParams.pPointSize;
  let sx = sizePx / f32(gridInfo.width) * 2.0;
  let sy = sizePx / f32(gridInfo.height) * 2.0;

  let offsets = array<vec2<f32>, 6>(
    vec2<f32>(-sx, -sy),
    vec2<f32>(sx, -sy),
    vec2<f32>(-sx, sy),
    vec2<f32>(-sx, sy),
    vec2<f32>(sx, -sy),
    vec2<f32>(sx, sy)
  );

  // Convert grid position to clip space (-1..1)
  let gx = (p.pos.x / f32(gridInfo.width - 1u)) * 2.0 - 1.0;
  let gy = (p.pos.y / f32(gridInfo.height - 1u)) * 2.0 - 1.0;
  var basePos = vec2<f32>(gx, -gy); // flip Y for screen

  // Small deterministic jitter to reduce overdraw stacking (visualization only)
  let jitterPx = 1.0;
  let r0 = rand01(instanceIndex * 1664525u + 1013904223u);
  let r1 = rand01(instanceIndex * 22695477u + 1u);
  let jx = (r0 * 2.0 - 1.0) * (jitterPx / f32(gridInfo.width)) * 2.0;
  let jy = (r1 * 2.0 - 1.0) * (jitterPx / f32(gridInfo.height)) * 2.0;
  basePos = basePos + vec2<f32>(jx, jy);

  out.position = vec4<f32>(basePos + offsets[vertexIndex], 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
