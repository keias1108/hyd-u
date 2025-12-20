// Predator Render Shader: instanced quads

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

struct PredatorParams {
  p2Count: f32,
  p2BiasStrength: f32,
  p2Friction: f32,
  p2NoiseStrength: f32,
  p2Speed: f32,
  p2EatEnabled: f32,
  p2EatAmount: f32,
  p2PointSize: f32,
  p2EnergyDecayRate: f32,
  p2EnergyFromEat: f32,
  p2MinEnergy: f32,
  p2MaxEnergy: f32,
  p2ReproduceEnabled: f32,
  p2ReproduceThreshold: f32,
  p2ReproduceSpawnRadius: f32,
  p2PredationStrength: f32,
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

@group(0) @binding(0) var<storage, read> predators: array<Particle>;
@group(0) @binding(1) var<uniform> gridInfo: GridInfo;
@group(0) @binding(2) var<uniform> predatorParams: PredatorParams;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
  var out: VSOut;

  let count = u32(predatorParams.p2Count);
  if (instanceIndex >= count) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.color = vec3<f32>(1.0, 1.0, 1.0);
    return out;
  }

  let p = predators[instanceIndex];
  if (p.state == 0u) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.color = vec3<f32>(0.0, 0.0, 0.0);
    return out;
  }

  let energyNorm = clamp(p.energy * 0.35 + 0.3, 0.3, 1.0);
  let baseColor = vec3<f32>(1.0, 0.35, 0.2);
  out.color = baseColor * energyNorm;

  let sizePx = predatorParams.p2PointSize;
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

  let gx = (p.pos.x / f32(gridInfo.width - 1u)) * 2.0 - 1.0;
  let gy = (p.pos.y / f32(gridInfo.height - 1u)) * 2.0 - 1.0;
  let basePos = vec2<f32>(gx, -gy);

  out.position = vec4<f32>(basePos + offsets[vertexIndex], 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
