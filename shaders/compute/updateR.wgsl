// R Field Update Shader
// Source injection + diffusion + optional (time-varying) advection

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

@group(0) @binding(0) var<storage, read> rFieldIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> rFieldOut: array<f32>;
@group(0) @binding(2) var<uniform> gridInfo: GridInfo;
@group(0) @binding(3) var<uniform> params: SimParams;
@group(0) @binding(4) var<storage, read> terrainField: array<f32>;

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
  let currentR = rFieldIn[idx];

  // Neighbors for diffusion/advection
  var left = currentR;
  var right = currentR;
  var up = currentR;
  var down = currentR;

  if (x > 0u) {
    left = rFieldIn[idx - 1u];
  }
  if (x < gridInfo.width - 1u) {
    right = rFieldIn[idx + 1u];
  }
  if (y > 0u) {
    up = rFieldIn[idx - gridInfo.width];
  }
  if (y < gridInfo.height - 1u) {
    down = rFieldIn[idx + gridInfo.width];
  }

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

  // Source injection (adds material)
  let source = params.rMaxStrength * strengthFactor;

  // Diffusion
  let laplacian = left + right + up + down - 4.0 * currentR;
  let diffusion = params.rDiffusionRate * laplacian * params.deltaTime;

  // Central differences for advection terms
  let dRdx = (right - left) * 0.5;
  let dRdy = (down - up) * 0.5;

  // Optional advection (simple central difference approximation)
  var advection = 0.0;
  if (params.rAdvectionEnabled > 0.5) {
    // Time-varying rotation of the velocity vector for simple unsteady flow
    let angle = params.currentTime * 0.5; // rad/sec factor
    let c = cos(angle);
    let s = sin(angle);
    let vx = params.rAdvectionVX * c - params.rAdvectionVY * s;
    let vy = params.rAdvectionVX * s + params.rAdvectionVY * c;

    advection = -(vx * dRdx + vy * dRdy) * params.deltaTime;
  }

  // Terrain-driven downhill flow (adds additional advection term)
  if (params.terrainEnabled > 0.5 && params.terrainFlowStrength > 0.0) {
    let hC = terrainField[idx];
    var hL = hC;
    var hR = hC;
    var hU = hC;
    var hD = hC;
    if (x > 0u) { hL = terrainField[idx - 1u]; }
    if (x < gridInfo.width - 1u) { hR = terrainField[idx + 1u]; }
    if (y > 0u) { hU = terrainField[idx - gridInfo.width]; }
    if (y < gridInfo.height - 1u) { hD = terrainField[idx + gridInfo.width]; }

    let dHdx = (hR - hL) * 0.5;
    let dHdy = (hD - hU) * 0.5;
    let v = -params.terrainFlowStrength * vec2<f32>(dHdx, dHdy);
    advection = advection - (v.x * dRdx + v.y * dRdy) * params.deltaTime;
  }

  // Decay to prevent unbounded fill
  let decay = currentR * params.rDecayRate * params.deltaTime;

  let newR = currentR + source * params.deltaTime + diffusion + advection - decay;

  // Clamp to [0, 1]
  rFieldOut[idx] = clamp(newR, 0.0, 1.0);
}
