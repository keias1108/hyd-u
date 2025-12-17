// Visualization Render Shader
// Full-screen quad rendering with field sampling and color mapping

struct GridInfo {
  width: u32,
  height: u32,
  padding0: u32,
  padding1: u32,
}

struct RenderParams {
  visualizationMode: u32,  // 0=R, 1=O, 2=H, 3=C, 4=M, 5=B
  colorScheme: u32,        // 0=grayscale, 1=heatmap, 2=viridis
  padding0: u32,
  padding1: u32,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

// ============================================================================
// VERTEX SHADER
// ============================================================================

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  // Full-screen quad (two triangles)
  let positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),  // Bottom-left
    vec2<f32>(1.0, -1.0),   // Bottom-right
    vec2<f32>(-1.0, 1.0),   // Top-left
    vec2<f32>(-1.0, 1.0),   // Top-left
    vec2<f32>(1.0, -1.0),   // Bottom-right
    vec2<f32>(1.0, 1.0)     // Top-right
  );

  // UV coordinates (flipped Y for correct orientation)
  let uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0)
  );

  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

// ============================================================================
// COLOR MAPPING FUNCTIONS
// ============================================================================

// Grayscale colormap
fn grayscale(value: f32) -> vec4<f32> {
  return vec4<f32>(value, value, value, 1.0);
}

// Heatmap: black -> red -> yellow -> white
fn heatmap(value: f32) -> vec4<f32> {
  let r = clamp(value * 2.0, 0.0, 1.0);
  let g = clamp((value - 0.5) * 2.0, 0.0, 1.0);
  let b = clamp((value - 0.75) * 4.0, 0.0, 1.0);
  return vec4<f32>(r, g, b, 1.0);
}

// Viridis-inspired colormap (perceptually uniform)
fn viridis(t: f32) -> vec4<f32> {
  // Key color stops from viridis colormap
  let c0 = vec3<f32>(0.267004, 0.004874, 0.329415);
  let c1 = vec3<f32>(0.282623, 0.140926, 0.457517);
  let c2 = vec3<f32>(0.253935, 0.265254, 0.529983);
  let c3 = vec3<f32>(0.163625, 0.471133, 0.558148);
  let c4 = vec3<f32>(0.134692, 0.658636, 0.517649);
  let c5 = vec3<f32>(0.477504, 0.821444, 0.318195);
  let c6 = vec3<f32>(0.993248, 0.906157, 0.143936);

  var color: vec3<f32>;

  // Piecewise linear interpolation
  if (t < 0.166) {
    color = mix(c0, c1, t / 0.166);
  } else if (t < 0.333) {
    color = mix(c1, c2, (t - 0.166) / 0.167);
  } else if (t < 0.5) {
    color = mix(c2, c3, (t - 0.333) / 0.167);
  } else if (t < 0.666) {
    color = mix(c3, c4, (t - 0.5) / 0.166);
  } else if (t < 0.833) {
    color = mix(c4, c5, (t - 0.666) / 0.167);
  } else {
    color = mix(c5, c6, (t - 0.833) / 0.167);
  }

  return vec4<f32>(color, 1.0);
}

// Apply color scheme based on selection
fn applyColorScheme(value: f32, scheme: u32) -> vec4<f32> {
  if (scheme == 0u) {
    return grayscale(value);
  } else if (scheme == 1u) {
    return heatmap(value);
  } else {
    return viridis(value);
  }
}

// ============================================================================
// FRAGMENT SHADER
// ============================================================================

@group(0) @binding(0) var<storage, read> rField: array<f32>;
@group(0) @binding(1) var<storage, read> oField: array<f32>;
@group(0) @binding(2) var<storage, read> hField: array<f32>;
@group(0) @binding(3) var<storage, read> cField: array<f32>;
@group(0) @binding(4) var<storage, read> mField: array<f32>;
@group(0) @binding(5) var<storage, read> bField: array<f32>;
@group(0) @binding(6) var<uniform> gridInfo: GridInfo;
@group(0) @binding(7) var<uniform> renderParams: RenderParams;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // Sample field at UV coordinate
  let x = u32(input.uv.x * f32(gridInfo.width - 1u));
  let y = u32(input.uv.y * f32(gridInfo.height - 1u));
  let idx = y * gridInfo.width + x;

  // Select field based on visualization mode
  var value: f32;
  if (renderParams.visualizationMode == 0u) {
    value = rField[idx];  // R field
  } else if (renderParams.visualizationMode == 1u) {
    value = oField[idx];  // O field
  } else if (renderParams.visualizationMode == 2u) {
    value = hField[idx] / 10.0;  // H field (normalized from 0-10 to 0-1)
  } else if (renderParams.visualizationMode == 3u) {
    value = cField[idx];  // C = R * O overlap
  } else if (renderParams.visualizationMode == 4u) {
    value = clamp(mField[idx], 0.0, 1.0);
  } else { // 5=B
    value = clamp(bField[idx] * 0.5, 0.0, 1.0); // scale down if needed
  }

  // Apply color scheme and return
  return applyColorScheme(value, renderParams.colorScheme);
}
