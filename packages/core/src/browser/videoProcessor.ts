import { FACE, type Point3 } from "../gaze/landmarks.js";

/**
 * Real-time video effects on the GPU (WebGL2), applied before video leaves the
 * device:
 *
 *  - Saccade-aware eye contact (module 2): a local warp that moves the iris
 *    toward the camera. Its strength is the ReadingGate weight, so it is only
 *    active while the speaker is reading and fades in and out smoothly.
 *  - Corneal reflection shield (module 5): blurs the iris/cornea region so
 *    the prompter text reflected in the eyes cannot be recovered.
 *
 * Without a face, frames pass through untouched.
 */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec2 u_size;          // frame size in px
uniform vec4 u_eye[2];        // xy: eye centre (px), z: eye half-width (px), w: unused
uniform vec4 u_iris[2];       // xy: iris centre (px), z: iris radius (px)
uniform vec2 u_shift;         // warp shift in px (applied with falloff)
uniform float u_warp;         // 0..1 eye-contact strength
uniform float u_shield;       // 0..1 corneal blur strength

vec4 blurAt(vec2 px, float r) {
  vec4 acc = vec4(0.0);
  float n = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 o = vec2(float(i), float(j)) * (r * 0.5);
      acc += texture(u_tex, (px + o) / u_size);
      n += 1.0;
    }
  }
  return acc / n;
}

void main() {
  vec2 px = v_uv * u_size;
  vec2 src = px;
  for (int e = 0; e < 2; e++) {
    vec2 c = u_eye[e].xy;
    float hw = u_eye[e].z;
    if (hw <= 0.0) continue;
    // Elliptical eye region: wider than tall.
    vec2 d = (px - c) / vec2(hw * 1.15, hw * 0.75);
    float r = length(d);
    float fall = 1.0 - smoothstep(0.35, 1.0, r);
    src -= u_shift * fall * u_warp;
  }
  vec4 col = texture(u_tex, src / u_size);
  if (u_shield > 0.0) {
    for (int e = 0; e < 2; e++) {
      float ir = u_iris[e].z;
      if (ir <= 0.0) continue;
      float dist = length(src - u_iris[e].xy);
      float m = (1.0 - smoothstep(ir * 0.7, ir * 1.05, dist)) * u_shield;
      if (m > 0.0) {
        vec4 b = blurAt(src, ir * 0.35);
        // Also compress highlights, where reflections live.
        b.rgb = min(b.rgb, vec3(0.82));
        col = mix(col, b, m);
      }
    }
  }
  outColor = col;
}`;

export interface ProcessParams {
  landmarks: Point3[] | null;
  /** 0..1 eye-contact correction weight (from ReadingGate). */
  eyeContact: number;
  /** Corneal shield on/off. */
  shield: boolean;
  /** Upward iris shift as a fraction of eye width at full strength. */
  shiftFraction?: number;
}

export class VideoProcessor {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (this.gl) this.init(this.gl);
  }

  get supported(): boolean {
    return this.gl !== null && this.program !== null;
  }

  private init(gl: WebGL2RenderingContext): void {
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    this.program = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(p, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const name of ["u_tex", "u_size", "u_eye", "u_iris", "u_shift", "u_warp", "u_shield"]) {
      this.loc[name] = gl.getUniformLocation(p, name);
    }
  }

  /** Draw one processed frame of `video` into the canvas. */
  process(video: HTMLVideoElement, params: ProcessParams): void {
    const gl = this.gl;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!gl || !this.program || !w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    const eyes = new Float32Array(8);
    const irises = new Float32Array(8);
    let shiftY = 0;
    const lm = params.landmarks;
    if (lm) {
      [FACE.eyeA, FACE.eyeB].forEach((eye, i) => {
        const o = lm[eye.outer];
        const n = lm[eye.inner];
        const c = lm[eye.irisCenter];
        const edge = lm[eye.iris[0]];
        if (!o || !n || !c || !edge) return;
        const halfW = (Math.hypot((o.x - n.x) * w, (o.y - n.y) * h) / 2) * 1.1;
        eyes.set([((o.x + n.x) / 2) * w, ((o.y + n.y) / 2) * h, halfW, 0], i * 4);
        const irisR = Math.hypot((edge.x - c.x) * w, (edge.y - c.y) * h);
        irises.set([c.x * w, c.y * h, irisR, 0], i * 4);
        shiftY = Math.max(shiftY, halfW * 2 * (params.shiftFraction ?? 0.09));
      });
    }

    gl.uniform1i(this.loc.u_tex!, 0);
    gl.uniform2f(this.loc.u_size!, w, h);
    gl.uniform4fv(this.loc.u_eye!, eyes);
    gl.uniform4fv(this.loc.u_iris!, irises);
    // Sampling from below moves the iris up (toward a camera above the screen).
    gl.uniform2f(this.loc.u_shift!, 0, -shiftY);
    gl.uniform1f(this.loc.u_warp!, lm ? params.eyeContact : 0);
    gl.uniform1f(this.loc.u_shield!, lm && params.shield ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
