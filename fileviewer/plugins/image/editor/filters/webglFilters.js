// WebGL2-accelerated image filters.
// Exposes applyWebGL(canvas, filterId, params) → true on success, false to fall back to CPU.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = (a_pos + 1.0) * 0.5;
}`

// ── Fragment shaders ──────────────────────────────────────────────────────────

const F = {

brightness: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_value; out vec4 o;
void main() { vec4 c=texture(u_img,v_uv); o=vec4(clamp(c.rgb+u_value,0.,1.),c.a); }`,

contrast: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_value; out vec4 o;
void main() {
  vec4 c=texture(u_img,v_uv);
  float f=(259.*(u_value*255.+255.))/(255.*(259.-u_value*255.));
  o=vec4(clamp(f*(c.rgb-0.5019608)+0.5019608,0.,1.),c.a);
}`,

brightness_contrast: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_brightness; uniform float u_contrast; out vec4 o;
void main() {
  vec4 c=texture(u_img,v_uv);
  vec3 rgb=clamp(c.rgb+u_brightness,0.,1.);
  float f=(259.*(u_contrast*255.+255.))/(255.*(259.-u_contrast*255.));
  o=vec4(clamp(f*(rgb-0.5019608)+0.5019608,0.,1.),c.a);
}`,

hue_saturation_lightness: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img;
uniform float u_hue; uniform float u_saturation; uniform float u_lightness;
out vec4 o;

vec3 rgb2hsl(vec3 c) {
  float mx=max(max(c.r,c.g),c.b), mn=min(min(c.r,c.g),c.b);
  float l=(mx+mn)*.5, d=mx-mn;
  if(d==0.) return vec3(0.,0.,l);
  float s=l>.5?d/(2.-mx-mn):d/(mx+mn);
  float h;
  if(mx==c.r) h=mod((c.g-c.b)/d+6.,6.);
  else if(mx==c.g) h=(c.b-c.r)/d+2.;
  else h=(c.r-c.g)/d+4.;
  return vec3(h*60.,s,l);
}
float h2r(float p,float q,float t){
  t=fract(t);
  if(t<1./6.) return p+(q-p)*6.*t;
  if(t<.5) return q;
  if(t<2./3.) return p+(q-p)*(2./3.-t)*6.;
  return p;
}
vec3 hsl2rgb(vec3 hsl){
  float h=hsl.x/360.,s=hsl.y,l=hsl.z;
  if(s==0.) return vec3(l);
  float q=l<.5?l*(1.+s):l+s-l*s, p=2.*l-q;
  return vec3(h2r(p,q,h+1./3.),h2r(p,q,h),h2r(p,q,h-1./3.));
}
void main(){
  vec4 c=texture(u_img,v_uv);
  vec3 hsl=rgb2hsl(c.rgb);
  hsl.x=mod(hsl.x+u_hue+360.,360.);
  hsl.y=clamp(hsl.y+u_saturation,0.,1.);
  hsl.z=clamp(hsl.z+u_lightness,0.,1.);
  o=vec4(hsl2rgb(hsl),c.a);
}`,

exposure: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_value; out vec4 o;
void main(){ vec4 c=texture(u_img,v_uv); o=vec4(clamp(c.rgb*pow(2.,u_value),0.,1.),c.a); }`,

vibrance: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_value; out vec4 o;
void main(){
  vec4 c=texture(u_img,v_uv);
  float mx=max(max(c.r,c.g),c.b), avg=(c.r+c.g+c.b)/3.;
  float amt=(mx-avg)*u_value;
  o=vec4(clamp(c.rgb+(mx-c.rgb)*amt,0.,1.),c.a);
}`,

// shadows/midtones/highlights passed pre-divided by 255
color_balance: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img;
uniform vec3 u_shadows; uniform vec3 u_midtones; uniform vec3 u_highlights;
out vec4 o;
void main(){
  vec4 c=texture(u_img,v_uv);
  float lum=dot(c.rgb,vec3(.299,.587,.114));
  float sf=max(0.,.5-lum)*2., hf=max(0.,lum-.5)*2., mf=1.-sf-hf;
  o=vec4(clamp(c.rgb+u_shadows*sf+u_midtones*mf+u_highlights*hf,0.,1.),c.a);
}`,

shadows_highlights: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_shadows; uniform float u_highlights; out vec4 o;
void main(){
  vec4 c=texture(u_img,v_uv);
  float lum=dot(c.rgb,vec3(.299,.587,.114));
  float sf=max(0.,1.-lum*2.), hf=max(0.,lum*2.-1.);
  o=vec4(clamp(c.rgb+sf*u_shadows+hf*u_highlights,0.,1.),c.a);
}`,

// LUT passed as 256×1 texture (R=lutR, G=lutG, B=lutB)
apply_lut: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform sampler2D u_lut; out vec4 o;
void main(){
  vec4 c=texture(u_img,v_uv);
  float r=texture(u_lut,vec2(c.r*(255./256.)+.5/256.,0.5)).r;
  float g=texture(u_lut,vec2(c.g*(255./256.)+.5/256.,0.5)).g;
  float b=texture(u_lut,vec2(c.b*(255./256.)+.5/256.,0.5)).b;
  o=vec4(r,g,b,c.a);
}`,

invert: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; out vec4 o;
void main(){ vec4 c=texture(u_img,v_uv); o=vec4(1.-c.rgb,c.a); }`,

grayscale: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; out vec4 o;
void main(){ vec4 c=texture(u_img,v_uv); float v=dot(c.rgb,vec3(.2126,.7152,.0722)); o=vec4(v,v,v,c.a); }`,

sepia: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; out vec4 o;
void main(){
  vec4 c=texture(u_img,v_uv); float r=c.r,g=c.g,b=c.b;
  o=vec4(clamp(r*.393+g*.769+b*.189,0.,1.),
         clamp(r*.349+g*.686+b*.168,0.,1.),
         clamp(r*.272+g*.534+b*.131,0.,1.),c.a);
}`,

// dist computed in pixel space to match CPU exactly
vignette: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_strength; uniform float u_radius; out vec4 o;
void main(){
  vec4 c=texture(u_img,v_uv);
  vec2 res=vec2(textureSize(u_img,0));
  vec2 d=(v_uv-0.5)*res;           // pixel offset from center
  float maxDist=length(res*0.5);
  float dist=length(d)/maxDist;
  float f=1.-max(0.,(dist-u_radius)/max(0.001,1.-u_radius))*u_strength;
  o=vec4(clamp(c.rgb*f,0.,1.),c.a);
}`,

// Nearest block center — matches visual effect without O(block²) averaging cost
pixelate: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; uniform float u_size; out vec4 o;
void main(){
  vec2 res=vec2(textureSize(u_img,0));
  vec2 px=floor(v_uv*res/u_size)*u_size/res+u_size/(2.*res);
  o=texture(u_img,px);
}`,

// Separable Gaussian blur — one shader, horizontal/vertical controlled by uniform
_blur: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img;
uniform int u_kLen; uniform float u_kernel[201];
uniform bool u_horiz;
out vec4 o;
void main(){
  vec2 res=vec2(textureSize(u_img,0));
  vec2 step=u_horiz?vec2(1./res.x,0.):vec2(0.,1./res.y);
  int r=u_kLen/2;
  vec4 acc=vec4(0.);
  for(int k=0;k<u_kLen;k++){
    vec2 uv=v_uv+step*float(k-r);
    uv=clamp(uv,vec2(0.),vec2(1.));
    acc+=texture(u_img,uv)*u_kernel[k];
  }
  o=acc;
}`,

emboss: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; out vec4 o;
void main(){
  vec2 p=1./vec2(textureSize(u_img,0));
  float k[9];
  k[0]=-2.;k[1]=-1.;k[2]=0.;k[3]=-1.;k[4]=1.;k[5]=1.;k[6]=0.;k[7]=1.;k[8]=2.;
  vec3 acc=vec3(0.); int i=0;
  for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++){
    acc+=texture(u_img,v_uv+vec2(float(dx),float(dy))*p).rgb*k[i++];
  }
  o=vec4(clamp(acc,0.,1.),texture(u_img,v_uv).a);
}`,

edge_detect: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img; out vec4 o;
void main(){
  vec2 p=1./vec2(textureSize(u_img,0));
  float k[9];
  k[0]=-1.;k[1]=-1.;k[2]=-1.;k[3]=-1.;k[4]=8.;k[5]=-1.;k[6]=-1.;k[7]=-1.;k[8]=-1.;
  vec3 acc=vec3(0.); int i=0;
  for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++){
    acc+=texture(u_img,v_uv+vec2(float(dx),float(dy))*p).rgb*k[i++];
  }
  o=vec4(clamp(acc,0.,1.),texture(u_img,v_uv).a);
}`,

// Combines original (u_orig) and blurred (u_blur) for sharpen / unsharp_mask
_sharpen_combine: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig; uniform sampler2D u_blur;
uniform float u_amount; uniform float u_factor;
uniform float u_threshold; uniform bool u_use_threshold;
out vec4 o;
void main(){
  vec4 orig=texture(u_orig,v_uv);
  vec4 blur=texture(u_blur,v_uv);
  vec3 diff=orig.rgb-blur.rgb;
  vec3 rgb;
  if(u_use_threshold){
    rgb=orig.rgb;
    for(int c=0;c<3;c++){
      if(abs(diff[c])>=u_threshold) rgb[c]=clamp(orig.rgb[c]+diff[c]*u_factor,0.,1.);
    }
  } else {
    rgb=clamp(orig.rgb+diff*u_factor,0.,1.);
  }
  o=vec4(rgb,orig.a);
}`,

chromatic_aberration: `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_img;
uniform int u_mode; // 0=radial, 1=linear
uniform float u_amount;
uniform float u_centerX; uniform float u_centerY;
uniform float u_angleCos; uniform float u_angleSin;
out vec4 o;
void main(){
  if(u_amount==0.){ o=texture(u_img,v_uv); return; }
  vec2 res=vec2(textureSize(u_img,0));
  // centerY is in image-top=0 coords; v_uv.y=1 is image top (after UNPACK_FLIP_Y)
  vec2 center=vec2(u_centerX, 1.-u_centerY);
  vec4 orig=texture(u_img,v_uv);
  vec2 shiftUV;
  if(u_mode==0){
    vec2 d=(v_uv-center)*res; // pixel offset
    float dist=length(d);
    if(dist<0.5){ o=orig; return; }
    vec2 n=d/dist;
    vec2 maxC=max(center,1.-center)*res;
    float maxDist=length(maxC);
    float shift=dist/maxDist*u_amount;
    shiftUV=n*shift/res;
  } else {
    shiftUV=vec2(u_angleCos,u_angleSin)*u_amount/res;
    // y is flipped in UV vs pixel, but shift is symmetric, no sign issue
  }
  float r=texture(u_img,clamp(v_uv+shiftUV,0.,1.)).r;
  float b=texture(u_img,clamp(v_uv-shiftUV,0.,1.)).b;
  o=vec4(r,orig.g,b,orig.a);
}`,

// Noise: GPU PRNG via integer hash; u_seed changes each call so pattern differs every apply.
// Per-channel noise when u_monochrome==0, same offset for all channels when u_monochrome!=0.
noise: `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv; uniform sampler2D u_img;
uniform float u_amount; uniform int u_monochrome; uniform uint u_seed;
out vec4 o;

uint ihash(uint x) {
  x ^= x >> 16u; x *= 0x45d9f3bu; x ^= x >> 16u; return x;
}
float rnd(uvec2 px, uint ch) {
  return float(ihash(px.x*1664525u + px.y*1013904223u + ch + u_seed)) / 4294967295.0;
}
void main(){
  vec4 c=texture(u_img,v_uv);
  uvec2 px=uvec2(v_uv*vec2(textureSize(u_img,0)));
  float s=u_amount/255.0;
  if(u_monochrome!=0){
    float n=(rnd(px,0u)-.5)*2.*s;
    o=vec4(clamp(c.rgb+n,0.,1.),c.a);
  } else {
    o=vec4(
      clamp(c.r+(rnd(px,0u)-.5)*2.*s,0.,1.),
      clamp(c.g+(rnd(px,1u)-.5)*2.*s,0.,1.),
      clamp(c.b+(rnd(px,2u)-.5)*2.*s,0.,1.),
      c.a);
  }
}`,

// Median filter via two-level histogram (16-bin coarse + 16-bin fine).
// Registers: int[16]×3 = 192 B, independent of kernel size.
// Supports up to 15×15; size>15 falls back to CPU.
//
// Algorithm per channel:
//   Pass 1 – 16-bin coarse histogram (bin = value>>4).
//             Walk to find which coarse bin rb holds the median and
//             how far into that bin we need (r_rem, 1-indexed).
//   Pass 2 – 16-bin fine histogram counting only pixels in coarse bin rb
//             (fine bin = value & 0xF).
//             Walk to get exact 0-255 value = rb*16 + fine_bin.
reduce_noise: `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv; uniform sampler2D u_img;
uniform int u_half; uniform int u_n;
out vec4 o;

void main(){
  vec2 t=1.0/vec2(textureSize(u_img,0));
  int need=u_n/2+1;          // 1-indexed position of median

  int rh[16],gh[16],bh[16];
  for(int i=0;i<16;i++){ rh[i]=0; gh[i]=0; bh[i]=0; }

  // ── Pass 1: coarse histogram ─────────────────────────────────────────────────
  for(int dy=-u_half;dy<=u_half;dy++){
    for(int dx=-u_half;dx<=u_half;dx++){
      ivec3 px=ivec3(texture(u_img,clamp(v_uv+vec2(float(dx),float(dy))*t,0.,1.)).rgb*255.+.5);
      rh[px.r>>4]++; gh[px.g>>4]++; bh[px.b>>4]++;
    }
  }

  // ── Find target coarse bin and remaining 1-indexed offset within it ──────────
  int rb=0; int r_rem=need;
  for(int i=0;i<16;i++){ if(r_rem<=rh[i]){ rb=i; break; } r_rem-=rh[i]; }
  int gb=0; int g_rem=need;
  for(int i=0;i<16;i++){ if(g_rem<=gh[i]){ gb=i; break; } g_rem-=gh[i]; }
  int bb=0; int b_rem=need;
  for(int i=0;i<16;i++){ if(b_rem<=bh[i]){ bb=i; break; } b_rem-=bh[i]; }

  // ── Pass 2: fine histogram (only pixels inside target coarse bin) ────────────
  for(int i=0;i<16;i++){ rh[i]=0; gh[i]=0; bh[i]=0; }
  for(int dy=-u_half;dy<=u_half;dy++){
    for(int dx=-u_half;dx<=u_half;dx++){
      ivec3 px=ivec3(texture(u_img,clamp(v_uv+vec2(float(dx),float(dy))*t,0.,1.)).rgb*255.+.5);
      if((px.r>>4)==rb) rh[px.r&0xF]++;
      if((px.g>>4)==gb) gh[px.g&0xF]++;
      if((px.b>>4)==bb) bh[px.b&0xF]++;
    }
  }

  // ── Find exact value within fine bin ────────────────────────────────────────
  int rmed=rb*16; for(int i=0;i<16;i++){ if(r_rem<=rh[i]){ rmed+=i; break; } r_rem-=rh[i]; }
  int gmed=gb*16; for(int i=0;i<16;i++){ if(g_rem<=gh[i]){ gmed+=i; break; } g_rem-=gh[i]; }
  int bmed=bb*16; for(int i=0;i<16;i++){ if(b_rem<=bh[i]){ bmed+=i; break; } b_rem-=bh[i]; }

  o=vec4(float(rmed)/255.,float(gmed)/255.,float(bmed)/255.,texture(u_img,v_uv).a);
}`,

}

// ── Engine ────────────────────────────────────────────────────────────────────

class WebGLFilterEngine {
  constructor() {
    this._oc = new OffscreenCanvas(1, 1)
    const gl = this._oc.getContext('webgl2')
    if (!gl) throw new Error('no webgl2')
    this.gl = gl
    this._initQuad()
    this._progs = {}
    this._locs = {}
    this._texSrc = this._newTex()
    this._texA   = this._newTex()
    this._texB   = this._newTex()
    this._fbA    = this._newFB(this._texA)
    this._fbB    = this._newFB(this._texB)
    this._lutTex = this._newTex()
    this._w = 0; this._h = 0
    this._compile()
  }

  _initQuad() {
    const gl = this.gl
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    this._quadBuf = buf
  }

  _shader(type, src) {
    const gl = this.gl
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s))
    return s
  }

  _compile() {
    const gl = this.gl
    const vert = this._shader(gl.VERTEX_SHADER, VERT)
    for (const [id, fragSrc] of Object.entries(F)) {
      const frag = this._shader(gl.FRAGMENT_SHADER, fragSrc)
      const prog = gl.createProgram()
      gl.attachShader(prog, vert)
      gl.attachShader(prog, frag)
      gl.linkProgram(prog)
      gl.deleteShader(frag)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(`WebGL link ${id}: ${gl.getProgramInfoLog(prog)}`)
      this._progs[id] = prog
      // Cache uniform locations
      const locs = { a_pos: gl.getAttribLocation(prog, 'a_pos') }
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i)
        const name = info.name.replace(/\[0\]$/, '')
        locs[name] = gl.getUniformLocation(prog, name)
      }
      this._locs[id] = locs
    }
    gl.deleteShader(vert)
  }

  _newTex() {
    const gl = this.gl
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  _newFB(tex) {
    const gl = this.gl
    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return fb
  }

  _resize(w, h) {
    if (w === this._w && h === this._h) return
    const gl = this.gl
    for (const tex of [this._texSrc, this._texA, this._texB]) {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }
    this._w = w; this._h = h
  }

  _upload(tex, canvas) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE,
      canvas.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height))
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  _useProgram(id) {
    const gl = this.gl
    const prog = this._progs[id]
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    const posLoc = this._locs[id].a_pos
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    return this._locs[id]
  }

  _bindTex(unit, tex) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
  }

  _draw(fb, w, h) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  // ReadPixels → flip rows → write to canvas
  _readback(canvas, fb, w, h) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    const pixels = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    // Flip rows: GL bottom-to-top → ImageData top-to-bottom
    const row = w * 4
    const tmp = new Uint8Array(row)
    for (let y = 0; y < (h >> 1); y++) {
      const a = y * row, b = (h - 1 - y) * row
      tmp.set(pixels.subarray(a, a + row))
      pixels.set(pixels.subarray(b, b + row), a)
      pixels.set(tmp, b)
    }
    canvas.getContext('2d', { willReadFrequently: true })
      .putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), w, h), 0, 0)
  }

  // Single-pass filter: upload src, render src → fbB, readback
  _onePass(canvas, progId, setUniforms) {
    const { gl } = this
    const w = canvas.width, h = canvas.height
    this._resize(w, h)
    this._upload(this._texSrc, canvas)
    const locs = this._useProgram(progId)
    this._bindTex(0, this._texSrc)
    gl.uniform1i(locs.u_img, 0)
    setUniforms(locs)
    this._draw(this._fbB, w, h)
    this._readback(canvas, this._fbB, w, h)
  }

  // Two-pass Gaussian blur: src → fbA (horiz), texA → fbB (vert)
  _blur(srcTex, outFB, w, h, radius) {
    const gl = this.gl
    const r = Math.max(1, Math.round(radius))
    const kernel = buildKernel(r)
    const kLen = kernel.length

    const locs = this._useProgram('_blur')
    gl.uniform1i(locs.u_kLen, kLen)
    gl.uniform1fv(locs.u_kernel, kernel)

    // Horizontal pass: srcTex → fbA
    this._bindTex(0, srcTex)
    gl.uniform1i(locs.u_img, 0)
    gl.uniform1i(locs.u_horiz, 1)
    this._draw(this._fbA, w, h)

    // Vertical pass: texA → outFB
    this._bindTex(0, this._texA)
    gl.uniform1i(locs.u_img, 0)
    gl.uniform1i(locs.u_horiz, 0)
    this._draw(outFB, w, h)
  }

  // ── Public dispatch ───────────────────────────────────────────────────────

  apply(canvas, filterId, params) {
    const { gl } = this
    const w = canvas.width, h = canvas.height
    this._resize(w, h)

    switch (filterId) {

      case 'brightness':
        this._onePass(canvas, 'brightness', (l) => gl.uniform1f(l.u_value, params.value ?? 0))
        break

      case 'contrast':
        this._onePass(canvas, 'contrast', (l) => gl.uniform1f(l.u_value, params.value ?? 0))
        break

      case 'brightness_contrast':
        this._onePass(canvas, 'brightness_contrast', (l) => {
          gl.uniform1f(l.u_brightness, params.brightness ?? 0)
          gl.uniform1f(l.u_contrast,   params.contrast   ?? 0)
        })
        break

      case 'hue_saturation_lightness':
        this._onePass(canvas, 'hue_saturation_lightness', (l) => {
          gl.uniform1f(l.u_hue,        params.hue        ?? 0)
          gl.uniform1f(l.u_saturation, params.saturation ?? 0)
          gl.uniform1f(l.u_lightness,  params.lightness  ?? 0)
        })
        break

      case 'exposure':
        this._onePass(canvas, 'exposure', (l) => gl.uniform1f(l.u_value, params.value ?? 0))
        break

      case 'vibrance':
        this._onePass(canvas, 'vibrance', (l) => gl.uniform1f(l.u_value, params.value ?? 0))
        break

      case 'color_balance': {
        // Slider range is [-100, 100]; CPU adds directly to 0-255 pixels → divide by 255 for GPU
        const s = (params.shadows    ?? [0,0,0]).map(v => v / 255)
        const m = (params.midtones   ?? [0,0,0]).map(v => v / 255)
        const hi = (params.highlights ?? [0,0,0]).map(v => v / 255)
        this._onePass(canvas, 'color_balance', (l) => {
          gl.uniform3fv(l.u_shadows,    s)
          gl.uniform3fv(l.u_midtones,   m)
          gl.uniform3fv(l.u_highlights, hi)
        })
        break
      }

      case 'shadows_highlights':
        this._onePass(canvas, 'shadows_highlights', (l) => {
          gl.uniform1f(l.u_shadows,    params.shadows    ?? 0)
          gl.uniform1f(l.u_highlights, params.highlights ?? 0)
        })
        break

      case 'apply_lut': {
        const { lutR, lutG, lutB } = params
        // Pack LUTs into a 256×1 RGBA texture
        const data = new Uint8Array(256 * 4)
        for (let i = 0; i < 256; i++) {
          data[i*4]   = lutR[i]
          data[i*4+1] = lutG[i]
          data[i*4+2] = lutB[i]
          data[i*4+3] = 255
        }
        gl.bindTexture(gl.TEXTURE_2D, this._lutTex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)

        this._upload(this._texSrc, canvas)
        const locs = this._useProgram('apply_lut')
        this._bindTex(0, this._texSrc)
        gl.uniform1i(locs.u_img, 0)
        this._bindTex(1, this._lutTex)
        gl.uniform1i(locs.u_lut, 1)
        this._draw(this._fbB, w, h)
        this._readback(canvas, this._fbB, w, h)
        break
      }

      case 'invert':
        this._onePass(canvas, 'invert', () => {})
        break

      case 'grayscale':
        this._onePass(canvas, 'grayscale', () => {})
        break

      case 'sepia':
        this._onePass(canvas, 'sepia', () => {})
        break

      case 'vignette':
        this._onePass(canvas, 'vignette', (l) => {
          gl.uniform1f(l.u_strength, params.strength ?? 0.5)
          gl.uniform1f(l.u_radius,   params.radius   ?? 0.75)
        })
        break

      case 'pixelate':
        this._onePass(canvas, 'pixelate', (l) =>
          gl.uniform1f(l.u_size, Math.max(1, Math.round(params.size ?? 10))))
        break

      case 'gaussian_blur': {
        this._upload(this._texSrc, canvas)
        this._blur(this._texSrc, this._fbB, w, h, params.radius ?? 3)
        this._readback(canvas, this._fbB, w, h)
        break
      }

      case 'sharpen': {
        const amount = params.amount ?? 0.5
        this._upload(this._texSrc, canvas)
        // Blur src → fbB (blurred in texB)
        this._blur(this._texSrc, this._fbB, w, h, 2)
        // Combine: src + (src - blurred) * amount * 3 → fbA
        const locs = this._useProgram('_sharpen_combine')
        this._bindTex(0, this._texSrc); gl.uniform1i(locs.u_orig, 0)
        this._bindTex(1, this._texB);   gl.uniform1i(locs.u_blur, 1)
        gl.uniform1f(locs.u_factor,         amount * 3)
        gl.uniform1f(locs.u_threshold,      0)
        gl.uniform1i(locs.u_use_threshold,  0)
        this._draw(this._fbA, w, h)
        this._readback(canvas, this._fbA, w, h)
        break
      }

      case 'unsharp_mask': {
        const { radius = 2, percent = 150, threshold = 3 } = params
        this._upload(this._texSrc, canvas)
        this._blur(this._texSrc, this._fbB, w, h, radius)
        const locs = this._useProgram('_sharpen_combine')
        this._bindTex(0, this._texSrc); gl.uniform1i(locs.u_orig, 0)
        this._bindTex(1, this._texB);   gl.uniform1i(locs.u_blur, 1)
        gl.uniform1f(locs.u_factor,        percent / 100)
        // threshold is in 0-255 pixel units; convert to 0-1
        gl.uniform1f(locs.u_threshold,     threshold / 255)
        gl.uniform1i(locs.u_use_threshold, 1)
        this._draw(this._fbA, w, h)
        this._readback(canvas, this._fbA, w, h)
        break
      }

      case 'emboss':
        this._onePass(canvas, 'emboss', () => {})
        break

      case 'edge_detect':
        this._onePass(canvas, 'edge_detect', () => {})
        break

      case 'chromatic_aberration': {
        const { mode = 'radial', amount = 5, centerX = 0.5, centerY = 0.5, angle = 0 } = params
        if (amount === 0) break
        const rad = angle * Math.PI / 180
        this._onePass(canvas, 'chromatic_aberration', (l) => {
          gl.uniform1i(l.u_mode,      mode === 'radial' ? 0 : 1)
          gl.uniform1f(l.u_amount,    amount)
          gl.uniform1f(l.u_centerX,   centerX)
          gl.uniform1f(l.u_centerY,   centerY)
          gl.uniform1f(l.u_angleCos,  Math.cos(rad))
          gl.uniform1f(l.u_angleSin,  Math.sin(rad))
        })
        break
      }

      case 'noise': {
        // Use a fresh integer seed so each apply call produces a different pattern
        const seed = (Math.random() * 0x100000000) >>> 0
        this._onePass(canvas, 'noise', (l) => {
          gl.uniform1f(l.u_amount,     params.amount     ?? 25)
          gl.uniform1i(l.u_monochrome, params.monochrome ? 1 : 0)
          gl.uniform1ui(l.u_seed,      seed)
        })
        break
      }

      case 'reduce_noise': {
        const size = Math.max(1, Math.round(params.size ?? 3))
        if (size > 15) return false   // >15×15; let CPU handle it
        const half = Math.floor(size / 2)
        const n    = size * size
        this._onePass(canvas, 'reduce_noise', (l) => {
          gl.uniform1i(l.u_half, half)
          gl.uniform1i(l.u_n,   n)
        })
        break
      }

      default:
        return false
    }
    return true
  }
}

function buildKernel(r) {
  const sigma = r / 3
  const size = 2 * r + 1
  const k = new Float32Array(size)
  let sum = 0
  for (let i = 0; i < size; i++) {
    const x = i - r
    k[i] = Math.exp(-x * x / (2 * sigma * sigma))
    sum += k[i]
  }
  for (let i = 0; i < size; i++) k[i] /= sum
  return k
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _engine = null
let _supported = null

function getEngine() {
  if (_engine) return _engine
  if (_supported === false) return null
  try {
    _engine = new WebGLFilterEngine()
    _supported = true
    return _engine
  } catch (e) {
    _supported = false
    console.warn('WebGL filter engine unavailable:', e.message)
    return null
  }
}

export function isWebGLSupported() {
  return getEngine() !== null
}

// Returns true if the filter was handled by GPU, false to fall back to CPU.
export function applyWebGL(canvas, filterId, params) {
  const eng = getEngine()
  if (!eng) return false
  try {
    return eng.apply(canvas, filterId, params)
  } catch (e) {
    console.warn(`WebGL filter "${filterId}" failed, falling back to CPU:`, e)
    return false
  }
}
