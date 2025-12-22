// Predator (P2) Update Shader
// Predators follow ∇P density with friction and noise; gain energy from local P density

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

  // Terrain parameters (appended)
  terrainEnabled: f32,
  terrainH0: f32,
  terrainDepositionRate: f32,
  terrainBioDepositionRate: f32,
  terrainErosionRate: f32,
  terrainHeightErosionAlpha: f32,
  terrainDiffusionRate: f32,
  terrainThermalErosionEnabled: f32,
  terrainTalusSlope: f32,
  terrainThermalRate: f32,
  terrainFlowStrength: f32,
  terrainParticleDriftStrength: f32,
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

@group(0) @binding(0) var<storage, read> predatorsIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> predatorsOut: array<Particle>;
@group(0) @binding(2) var<storage, read_write> pDensity: array<atomic<u32>>;
@group(0) @binding(3) var<uniform> gridInfo: GridInfo;
@group(0) @binding(4) var<uniform> predatorParams: PredatorParams;
@group(0) @binding(5) var<uniform> simParams: SimParams;
@group(0) @binding(6) var<storage, read> terrainField: array<f32>;

fn is_nan(x: f32) -> bool {
  return x != x;
}

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
  let maxPredators = 16384u;
  if (idx >= maxPredators) {
    return;
  }

  var p = predatorsIn[idx];

  if (p.state == 0u) {
    return;
  }

  let gridW = gridInfo.width;
  let gridH = gridInfo.height;
  let maxX = f32(gridW - 1u);
  let maxY = f32(gridH - 1u);

  // Defensive: kill predators with invalid positions (prevents "alive but invisible" states)
  if (is_nan(p.pos.x) || is_nan(p.pos.y)) {
    p.state = 0u;
    predatorsOut[idx] = p;
    return;
  }

  var x = clamp(p.pos.x, 0.0, maxX);
  var y = clamp(p.pos.y, 0.0, maxY);

  let xi = u32(x);
  let yi = u32(y);
  let base = yi * gridW + xi;

  let pC = f32(atomicLoad(&pDensity[base]));
  let pL = f32(atomicLoad(&pDensity[base - select(0u, 1u, xi > 0u)]));
  let pR = f32(atomicLoad(&pDensity[base + select(0u, 1u, xi < gridW - 1u)]));
  let pU = f32(atomicLoad(&pDensity[base - select(0u, gridW, yi > 0u)]));
  let pD = f32(atomicLoad(&pDensity[base + select(0u, gridW, yi < gridH - 1u)]));

  let grad = vec2<f32>(
    (pR - pL) * 0.5,
    (pD - pU) * 0.5
  );

  let dt = simParams.deltaTime;

  let gradStrength = length(grad);
  let hasPrey = pC > 0.0 || gradStrength > 0.0;

  let timeStep = u32(simParams.currentTime * 60.0);
  let seedBase = idx ^ (timeStep * 1103515245u + 12345u);
  let r0 = rand01(seedBase);
  let r1 = rand01(seedBase ^ 0xC2B2AE35u);
  let r2 = rand01(seedBase ^ 0x27D4EB2Fu);

  let tau = 6.28318530718;
  let pi = 3.14159265359;

  let noiseAngle = r2 * tau;
  let noiseVec = vec2<f32>(cos(noiseAngle), sin(noiseAngle)) * predatorParams.p2NoiseStrength;

  var desiredVel = vec2<f32>(0.0, 0.0);

  if (hasPrey) {
    let gradDir = grad / max(gradStrength, 1e-6);
    let noiseScale = (1.0 - clamp(gradStrength * 0.5, 0.0, 1.0));
    let drive = predatorParams.p2BiasStrength * gradDir + noiseVec * noiseScale;
    let driveLen = length(drive);
    let dir = drive / max(driveLen, 1e-6);
    desiredVel = dir * predatorParams.p2Speed;
  } else {
    var heading = p.age;
    let turnProbability = 0.03;
    if (r0 < turnProbability) {
      let turn = (r1 * 2.0 - 1.0) * pi;
      heading = heading + turn;
      if (heading > pi) { heading = heading - tau; }
      if (heading < -pi) { heading = heading + tau; }
      p.age = heading;
    }
    let dir = vec2<f32>(cos(p.age), sin(p.age));
    desiredVel = dir * predatorParams.p2Speed + noiseVec * 0.5 * predatorParams.p2Speed;
  }

  // Terrain downhill drift (roll / drift)
  if (simParams.terrainEnabled > 0.5 && simParams.terrainParticleDriftStrength > 0.0) {
    let tL = terrainField[base - select(0u, 1u, xi > 0u)];
    let tR = terrainField[base + select(0u, 1u, xi < gridW - 1u)];
    let tU = terrainField[base - select(0u, gridW, yi > 0u)];
    let tD = terrainField[base + select(0u, gridW, yi < gridH - 1u)];

    let dTdx = (tR - tL) * 0.5;
    let dTdy = (tD - tU) * 0.5;
    let scale = 1.0 / max(simParams.terrainH0, 1e-6);
    let drift = -simParams.terrainParticleDriftStrength * vec2<f32>(dTdx, dTdy) * scale;
    desiredVel = desiredVel + drift;
  }

  let damping = clamp(1.0 - predatorParams.p2Friction * dt, 0.0, 1.0);
  p.vel = p.vel * damping + desiredVel * (1.0 - damping);

  let maxSpeed = predatorParams.p2Speed * 2.0;
  if (length(p.vel) > maxSpeed) {
    p.vel = normalize(p.vel) * maxSpeed;
  }

  var newPos = p.pos + p.vel * dt;

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

  // Energy decay
  p.energy = p.energy - predatorParams.p2EnergyDecayRate * dt;

  // Gain energy from local P density
  if (predatorParams.p2EatEnabled > 0.5) {
    let localP = f32(atomicLoad(&pDensity[base]));
    let eatAmount = predatorParams.p2EatAmount * dt * clamp(localP, 0.0, 4.0);
    p.energy = p.energy + eatAmount * predatorParams.p2EnergyFromEat;
  }

  // Reproduction logic
  if (predatorParams.p2ReproduceEnabled > 0.5 && p.energy >= predatorParams.p2ReproduceThreshold && p.state == 1u) {
    let startSlot = u32(r0 * f32(maxPredators));
    var foundSlot = false;
    var targetSlot = 0u;

    for (var attempt = 0u; attempt < 8u; attempt = attempt + 1u) {
      let candidateSlot = (startSlot + attempt * 1237u) % maxPredators;
      let candidate = predatorsIn[candidateSlot];

      if (candidate.state == 0u) {
        targetSlot = candidateSlot;
        foundSlot = true;
        break;
      }
    }

    if (foundSlot) {
      p.energy = p.energy * 0.5;

      var child: Particle;
      let spawnOffsetAngle = r1 * tau;
      let spawnDist = predatorParams.p2ReproduceSpawnRadius * (0.5 + r2 * 0.5);
      let spawnOffset = vec2<f32>(
        cos(spawnOffsetAngle) * spawnDist,
        sin(spawnOffsetAngle) * spawnDist
      );

      child.pos = clamp(
        p.pos + spawnOffset,
        vec2<f32>(0.0, 0.0),
        vec2<f32>(f32(gridW - 1u), f32(gridH - 1u))
      );

      let r3 = rand01(seedBase ^ 0x9E3779B9u);
      let r4 = rand01(seedBase ^ 0x7F4A7C15u);
      child.vel = p.vel * 0.5 + vec2<f32>(
        (r3 * 2.0 - 1.0) * predatorParams.p2Speed * 0.3,
        (r4 * 2.0 - 1.0) * predatorParams.p2Speed * 0.3
      );

      child.energy = p.energy;
      child.type_ = p.type_;
      child.state = 1u;
      child.age = spawnOffsetAngle;

      predatorsOut[targetSlot] = child;
    }
  }

  p.energy = min(p.energy, predatorParams.p2MaxEnergy);

  if (p.energy < predatorParams.p2MinEnergy) {
    p.state = 0u;
  }

  predatorsOut[idx] = p;
}
