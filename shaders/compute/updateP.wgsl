// Particle (P) Update Shader
// Particles follow ∇B with friction and noise; optional B consumption

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
  bDecayRate: f32,
  kBase: f32,
  kAlpha: f32,
  bLongRate: f32,
  mYield: f32,
  deltaTime: f32,
  currentTime: f32,
}

struct ParticleParams {
  pCount: f32,
  pBiasStrength: f32,
  pFriction: f32,
  pNoiseStrength: f32,
  pSpeed: f32,
  pEatEnabled: f32,
  pEatAmount: f32,
  pPointSize: f32, // unused here (for render)
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

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(2) var<storage, read_write> bField: array<f32>;
@group(0) @binding(3) var<uniform> gridInfo: GridInfo;
@group(0) @binding(4) var<uniform> particleParams: ParticleParams;
@group(0) @binding(5) var<uniform> simParams: SimParams;

fn pcg_hash(v: u32) -> u32 {
  var state = v * 747796405u + 2891336453u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand01(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) / 4294967296.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  let count = u32(particleParams.pCount);
  if (idx >= count) {
    return;
  }

  var p = particlesIn[idx];

  // Skip inactive particles
  if (p.state == 0u) {
    particlesOut[idx] = p;
    return;
  }

  let gridW = gridInfo.width;
  let gridH = gridInfo.height;

  // Clamp position to grid
  var x = clamp(p.pos.x, 0.0, f32(gridW - 1u));
  var y = clamp(p.pos.y, 0.0, f32(gridH - 1u));

  let xi = u32(x);
  let yi = u32(y);
  let base = yi * gridW + xi;

  // Sample B and neighbors for gradient (central differences)
  let bC = bField[base];
  let bL = bField[base - select(0u, 1u, xi > 0u)];
  let bR = bField[base + select(0u, 1u, xi < gridW - 1u)];
  let bU = bField[base - select(0u, gridW, yi > 0u)];
  let bD = bField[base + select(0u, gridW, yi < gridH - 1u)];

  let grad = vec2<f32>(
    (bR - bL) * 0.5,
    (bD - bU) * 0.5
  );

  let dt = simParams.deltaTime;

  // Evaluate gradient strength
  let gradStrength = length(grad);
  let hasFood = gradStrength > 0.002;

  // Deterministic per-particle randomness (avoid directional bias / platform-dependent trig noise)
  let timeStep = u32(simParams.currentTime * 60.0);
  let seedBase = idx ^ (timeStep * 1664525u + 1013904223u);
  let r0 = rand01(seedBase);
  let r1 = rand01(seedBase ^ 0xA511E9B3u);
  let r2 = rand01(seedBase ^ 0x63D83595u);

  // Hunger factor: low energy = high hunger
  let hungerFactor = clamp(1.0 - p.energy, 0.0, 1.0);

  let tau = 6.28318530718;
  let pi = 3.14159265359;

  let noiseAngle = r2 * tau;
  let noiseVec = vec2<f32>(cos(noiseAngle), sin(noiseAngle)) * particleParams.pNoiseStrength;

  var desiredVel = vec2<f32>(0.0, 0.0);

  if (hasFood) {
    let gradDir = grad / max(gradStrength, 1e-6);

    // When gradient is strong, reduce noise; when weak, allow more exploration.
    let noiseScale = (1.0 - clamp(gradStrength * 5.0, 0.0, 1.0));
    let drive = particleParams.pBiasStrength * gradDir + noiseVec * noiseScale;
    let driveLen = length(drive);
    let dir = drive / max(driveLen, 1e-6);
    desiredVel = dir * particleParams.pSpeed;
  } else {
    // Exploration: persistent heading stored in p.age (radians)
    var heading = p.age;

    // Higher hunger -> more frequent/stronger turns
    let turnProbability = 0.02 + hungerFactor * 0.08;
    if (r0 < turnProbability) {
      let turn = (r1 * 2.0 - 1.0) * pi;
      heading = heading + turn;
      if (heading > pi) { heading = heading - tau; }
      if (heading < -pi) { heading = heading + tau; }
      p.age = heading;
    }

    let dir = vec2<f32>(cos(p.age), sin(p.age));
    desiredVel = dir * particleParams.pSpeed + noiseVec * (0.25 + 0.75 * hungerFactor) * particleParams.pSpeed;
  }

  // Velocity smoothing toward desired velocity (stable, avoids one-sided drift)
  let damping = clamp(1.0 - particleParams.pFriction * dt, 0.0, 1.0);
  p.vel = p.vel * damping + desiredVel * (1.0 - damping);

  // Speed limit
  let maxSpeed = particleParams.pSpeed * 2.0;
  if (length(p.vel) > maxSpeed) {
    p.vel = normalize(p.vel) * maxSpeed;
  }

  // Position update + reflection without "sticking" to the wall
  var newPos = p.pos + p.vel * dt;
  let maxX = f32(gridW - 1u);
  let maxY = f32(gridH - 1u);

  var bounced = false;
  if (newPos.x < 0.0) {
    newPos.x = -newPos.x;
    p.vel.x = abs(p.vel.x);
    bounced = true;
  } else if (newPos.x > maxX) {
    newPos.x = 2.0 * maxX - newPos.x;
    p.vel.x = -abs(p.vel.x);
    bounced = true;
  }
  if (newPos.y < 0.0) {
    newPos.y = -newPos.y;
    p.vel.y = abs(p.vel.y);
    bounced = true;
  } else if (newPos.y > maxY) {
    newPos.y = 2.0 * maxY - newPos.y;
    p.vel.y = -abs(p.vel.y);
    bounced = true;
  }

  p.pos = clamp(newPos, vec2<f32>(0.0, 0.0), vec2<f32>(maxX, maxY));

  if (bounced) {
    p.vel = p.vel * 0.7;
    p.age = atan2(p.vel.y, p.vel.x);
  }

  // Energy decay over time
  p.energy = p.energy - particleParams.pEnergyDecayRate * dt;

  // Optional eating: consume B and gain energy
  if (particleParams.pEatEnabled > 0.5) {
    let eatIdx = u32(p.pos.y) * gridW + u32(p.pos.x);
    let currentB = bField[eatIdx];
    let consumeAmount = min(particleParams.pEatAmount * dt, currentB);
    bField[eatIdx] = currentB - consumeAmount;

    // Convert consumed B to energy
    p.energy = p.energy + consumeAmount * particleParams.pEnergyFromEat;
  }

  // Cap energy at maximum
  p.energy = min(p.energy, 2.0);

  // Check if particle dies (energy too low)
  if (p.energy < particleParams.pMinEnergy) {
    p.state = 0u; // Mark as inactive
  }

  particlesOut[idx] = p;
}
