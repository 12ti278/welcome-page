/* ============================================================
   FluxLines · WebGL2 流体线（React Bits 组件的 vanilla 移植）
   原组件：https://reactbits.dev  ·  FluxLines
   用法：window.HJFluxLines.create(container, options)
       返回 { update(opts), wake(), destroy() }
   ============================================================ */
(function(){
  'use strict';

  var MAX_COLORS = 8;
  var INTRO_SECONDS = 1.8;
  var FLOW = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

  var VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  var FIELD = `
float hash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smin(float a, float b, float k) {
  float r = exp2(-a / k) + exp2(-b / k);
  return -k * log2(r);
}

float sinlerp(float a, float b, float w) {
  return mix(a, b, (sin(w * 3.14159265 - 3.14159265 / 2.0) + 1.0) / 2.0);
}

float vn(vec2 p, float s, float seed) {
  vec2 cellp = floor(p / s);
  vec2 relp = mod(p, s);
  float g1 = hash(vec3(cellp, seed));
  float g2 = hash(vec3(cellp.x + 1.0, cellp.y, seed));
  float g3 = hash(vec3(cellp.x + 1.0, cellp.y + 1.0, seed));
  float g4 = hash(vec3(cellp.x, cellp.y + 1.0, seed));
  float bx = sinlerp(g1, g2, relp.x / s);
  float tx = sinlerp(g4, g3, relp.x / s);
  return sinlerp(bx, tx, relp.y / s);
}

float dbn(vec2 p, float s, float seed) {
  float o = s / 2.0;
  float n0 = vn(p, s, seed);
  float n1 = vn(p + vec2(o, o), s, seed + 0.1);
  float n2 = vn(p + vec2(-o, o), s, seed + 0.2);
  float n3 = vn(p + vec2(o, -o), s, seed + 0.3);
  float n4 = vn(p + vec2(-o, -o), s, seed + 0.4);
  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;
}
`;

  var FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uFlow;
uniform float uSpeed;
uniform float uScale;
uniform float uTurbulence;
uniform float uFluidity;
uniform float uRimWidth;
uniform float uSharpness;
uniform float uShimmer;
uniform float uGlow;
uniform float uLine;
uniform float uMaxHalf;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform vec4 uMagnet;
uniform vec4 uSwirl;
uniform float uReveal;
uniform float uLight;
uniform float uOpaque;
uniform vec3 uBackground;
uniform float uOpacity;
out vec4 outColor;
${FIELD}

vec3 palette(float h) {
  float x = clamp(h, 0.0, 1.0) * float(uColorCount - 1);
  int i = int(floor(x));
  int j = min(i + 1, uColorCount - 1);
  return mix(uColors[i], uColors[j], smoothstep(0.0, 1.0, x - float(i)));
}

void main() {
  float ref = 700.0 / max(uScale, 0.05);
  vec2 frag = gl_FragCoord.xy;
  vec2 toMagnet = (frag - uMagnet.xy) / uResolution.y;
  float pull = uMagnet.z * exp(-dot(toMagnet, toMagnet) / (uMagnet.w * uMagnet.w));
  if (pull > 0.001) {
    float angle = pull * 0.55;
    float c = cos(angle);
    float s = sin(angle);
    frag = uMagnet.xy + mat2(c, s, -s, c) * (frag - uMagnet.xy);
  }
  if (uSwirl.w > 0.0) {
    vec2 d = frag - uSwirl.xy;
    float reach = uSwirl.z;
    float angle = uSwirl.w * exp(-dot(d, d) / (reach * reach));
    float c = cos(angle);
    float s = sin(angle);
    frag = uSwirl.xy + mat2(c, s, -s, c) * d;
  }
  vec2 p = frag / uResolution.y * ref;

  float spd = 200.0 * uSpeed;
  float t = uTime;
  vec2 dir = uFlow;
  vec2 perp = vec2(-dir.y, dir.x);
  float distort1 = vn(p + perp * (t * spd), 60.0, 10.0) * 50.0 * uTurbulence;
  float distort2 = vn(p - perp * (t * spd), 120.0, 15.0) * 100.0 * uTurbulence;
  float peaks = dbn(p + distort1 + dir * (t * spd * 0.5), 40.0, 1.0);
  float peaks2 = dbn(p + distort2 - dir * (t * spd * 0.5), 40.0, 0.0);
  float field = smin(peaks, peaks2, max(uFluidity, 0.001));

  float slope = length(vec2(dFdx(field), dFdy(field)));
  float gap = abs(field - 0.4);
  float pixels = gap / max(slope, 1e-6);
  float halfBand = max(uRimWidth, 0.001) * 0.5;
  float across = max(gap / halfBand, pixels / uMaxHalf);
  float band = 5.0 * uRimWidth * (1.0 - across);
  float reveal = smoothstep(0.2, 0.85, pull);
  float shimmer = vn(p + dir * (t * spd * 0.5), 60.0, 12.0) * uShimmer * (1.0 - reveal * 0.75);
  float lit = clamp(band - shimmer, 0.0, 1.0);
  float glow = pow(lit, uSharpness) * uGlow * (1.0 + reveal * 0.25);
  float core = uLine > 0.0 ? smoothstep(uLine + 0.75, uLine - 0.75, pixels) * max(smoothstep(0.08, 0.6, glow), reveal) : 0.0;
  float shine = clamp(glow, 0.0, 1.0);
  float energy = max(shine * shine, core * 0.85) * uReveal;

  float h = clamp(0.5 + (peaks - peaks2) * 0.8, 0.0, 1.0);
  vec3 tint = palette(h);

  if (uLight > 0.5) {
    float chroma = max(tint.r, max(tint.g, tint.b)) - min(tint.r, min(tint.g, tint.b));
    vec3 ink = mix(vec3(0.07, 0.07, 0.08), tint * 0.55, clamp(chroma * 1.6, 0.0, 1.0));
    float cover = energy * uOpacity;
    outColor = uOpaque > 0.5 ? vec4(mix(uBackground, ink, cover), 1.0) : vec4(ink * cover, cover);
    return;
  }

  vec3 light = tint * energy * uOpacity;
  outColor = uOpaque > 0.5 ? vec4(uBackground + light, 1.0) : vec4(light, max(light.r, max(light.g, light.b)));
}`;

  function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }

  function compile(gl, type, source){
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  function link(gl){
    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
      gl.deleteProgram(program);
      return null;
    }
    var uniforms = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++){
      var info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(program, info.name);
    }
    return { program: program, uniforms: uniforms };
  }

  var DEFAULTS = {
    colors: ['#ffffff', '#ffffff', '#ffffff'],
    speed: 0.5,
    scale: 1.6,
    turbulence: 1,
    fluidity: 0.1,
    rimWidth: 0.2,
    sharpness: 2.5,
    shimmer: 1.5,
    glow: 2,
    lineWidth: 1,
    flowDirection: 'down',
    opacity: 1,
    mouseInteraction: true,
    mouseStrength: 1,
    mouseRadius: 0.35,
    mouseDampening: 0.15,
    clickSwirl: true,
    intro: true,
    lightMode: false,
    transparent: true,
    backgroundColor: undefined,
    paused: false,
    dpr: undefined
  };

  function normalize(opts){
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    if (opts){
      for (var j in opts) if (opts[j] !== undefined) s[j] = opts[j];
    }
    s.colors = (Array.isArray(s.colors) && s.colors.length) ? s.colors.slice(0, MAX_COLORS) : ['#ffffff'];
    s.speed = +s.speed || 0;
    s.scale = Math.max(0.05, +s.scale || 0.05);
    s.turbulence = +s.turbulence || 0;
    s.fluidity = Math.max(0.001, +s.fluidity || 0.001);
    s.rimWidth = Math.max(0.001, +s.rimWidth || 0.001);
    s.sharpness = Math.max(0.1, +s.sharpness || 0.1);
    s.shimmer = Math.max(0, +s.shimmer || 0);
    s.glow = Math.max(0, +s.glow || 0);
    s.lineWidth = Math.max(0, +s.lineWidth || 0);
    s.flow = FLOW[s.flowDirection] || FLOW.down;
    s.opacity = clamp(+s.opacity, 0, 1);
    s.mouseInteraction = s.mouseInteraction !== false;
    s.mouseStrength = Math.max(0, +s.mouseStrength || 0);
    s.mouseRadius = Math.max(0.01, +s.mouseRadius || 0.01);
    s.mouseDampening = Math.max(0, +s.mouseDampening || 0);
    s.clickSwirl = s.clickSwirl !== false;
    s.intro = s.intro !== false;
    s.lightMode = !!s.lightMode;
    s.transparent = s.transparent !== false;
    s.paused = !!s.paused;
    return s;
  }

  function create(container, options){
    if (!container) return { update: function(){}, wake: function(){}, destroy: function(){}, canvas: null };

    var settings = normalize(options);
    var canvas = document.createElement('canvas');
    canvas.className = 'flux-lines-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;';
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(canvas);

    var gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false
      });
    } catch (e) { gl = null; }

    if (!gl){
      container.classList.add('flux-fallback');
      canvas.remove();
      return { update: function(){}, wake: function(){}, destroy: function(){}, canvas: null };
    }

    var program = link(gl);
    if (!program){
      container.classList.add('flux-fallback');
      canvas.remove();
      try { gl.getExtension('WEBGL_lose_context') && gl.getExtension('WEBGL_lose_context').loseContext(); } catch (e) {}
      return { update: function(){}, wake: function(){}, destroy: function(){}, canvas: null };
    }

    var u = program.uniforms;
    var buffer = gl.createBuffer();
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    var cache = new Map();
    function parse(value, fallback){
      if (!value) return fallback;
      var key = String(value);
      if (cache.has(key)) return cache.get(key);
      var rgb = fallback;
      if (probe){
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#000000';
        probe.fillStyle = key;
        probe.fillRect(0, 0, 1, 1);
        var data = probe.getImageData(0, 0, 1, 1).data;
        rgb = [data[0] / 255, data[1] / 255, data[2] / 255];
      }
      cache.set(key, rgb);
      return rgb;
    }
    var palette = new Float32Array(MAX_COLORS * 3);

    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var pointer = { x: 0, y: 0, inside: false };
    var magnet = { x: 0, y: 0, active: 0 };
    var swirl = { x: 0, y: 0, age: 10 };
    var time = 0;
    var reveal = settings.intro && !reduce ? 0 : 1;
    var raf = 0;
    var last = 0;
    var visible = true;
    var alive = true;

    function render(){
      var s = settings;
      var ratio = canvas.width / Math.max(1, container.clientWidth);
      for (var i = 0; i < s.colors.length; i++) palette.set(parse(s.colors[i], [1, 1, 1]), i * 3);
      var intro = Math.min(1, reveal);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program.program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, time);
      gl.uniform2f(u.uFlow, s.flow[0], s.flow[1]);
      gl.uniform1f(u.uSpeed, s.speed);
      gl.uniform1f(u.uScale, s.scale);
      gl.uniform1f(u.uTurbulence, s.turbulence);
      gl.uniform1f(u.uFluidity, s.fluidity);
      gl.uniform1f(u.uRimWidth, s.rimWidth);
      gl.uniform1f(u.uSharpness, s.sharpness);
      gl.uniform1f(u.uShimmer, s.shimmer);
      gl.uniform1f(u.uGlow, s.glow);
      gl.uniform1f(u.uLine, s.lineWidth * ratio * 0.5);
      gl.uniform1f(u.uMaxHalf, 28 * ratio);
      gl.uniform3fv(u.uColors, palette);
      gl.uniform1i(u.uColorCount, s.colors.length);
      gl.uniform4f(u.uMagnet, magnet.x, magnet.y, magnet.active * s.mouseStrength, s.mouseRadius);
      var age = swirl.age;
      var twist = 1.9 * Math.min(1, age / 0.23) * Math.exp(-Math.max(0, age - 0.23) * 1.1);
      gl.uniform4f(u.uSwirl, swirl.x, swirl.y, canvas.height * 0.22 * (1 + age * 0.5), age < 6 ? twist : 0);
      gl.uniform1f(u.uReveal, intro * intro * (3 - 2 * intro));
      gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
      gl.uniform1f(u.uOpaque, s.transparent ? 0 : 1);
      gl.uniform3fv(u.uBackground, parse(s.backgroundColor, s.lightMode ? [1, 1, 1] : [0.0706, 0.0588, 0.0902]));
      gl.uniform1f(u.uOpacity, s.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now){
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      var s = settings;
      var dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
      last = now;
      var motion = (s.paused || reduce) ? 0 : 1;
      time += dt * motion;
      swirl.age += dt;
      if (s.intro && !reduce && reveal < 1) reveal = Math.min(1, reveal + dt / INTRO_SECONDS);
      else if (!s.intro || reduce) reveal = 1;

      var engaged = s.mouseInteraction && pointer.inside;
      var follow = s.mouseDampening > 0 ? 1 - Math.exp(-dt / s.mouseDampening) : 1;
      if (engaged){
        magnet.x += (pointer.x - magnet.x) * follow;
        magnet.y += (pointer.y - magnet.y) * follow;
      }
      var target = engaged ? 1 : 0;
      magnet.active += (target - magnet.active) * (1 - Math.exp(-dt / 0.3));
      if (Math.abs(target - magnet.active) < 0.001) magnet.active = target;

      render();
      var busy = motion > 0 || magnet.active !== target || reveal < 1 || swirl.age < 6;
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    function wake(){
      if (!alive) return;
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function resize(){
      var width = Math.max(1, container.clientWidth);
      var height = Math.max(1, container.clientHeight);
      var ratio = Math.min(settings.dpr || window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      render();
      wake();
    }

    function locate(event){
      var rect = container.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      var ratio = canvas.width / Math.max(1, rect.width);
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x * ratio;
      pointer.y = (rect.height - y) * ratio;
    }

    function onPointerMove(event){
      var wasInside = pointer.inside;
      locate(event);
      if (pointer.inside && !wasInside && magnet.active < 0.05){
        magnet.x = pointer.x;
        magnet.y = pointer.y;
      }
      wake();
    }

    function onPointerDown(event){
      onPointerMove(event);
      if (!pointer.inside || !settings.clickSwirl || reduce) return;
      swirl.x = pointer.x;
      swirl.y = pointer.y;
      swirl.age = 0;
      wake();
    }

    function onPointerUp(event){
      if (event.pointerType !== 'mouse') pointer.inside = false;
    }

    function onPointerLeave(){ pointer.inside = false; }

    function onVisibility(){ last = 0; wake(); }

    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    var intersection = new IntersectionObserver(function(entries){
      visible = entries.some(function(entry){ return entry.isIntersecting; });
      if (visible){ last = 0; wake(); }
    });
    intersection.observe(container);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    return {
      canvas: canvas,
      update: function(opts){
        if (!alive) return;
        settings = normalize(opts);
        resize();
        wake();
      },
      wake: wake,
      destroy: function(){
        if (!alive) return;
        alive = false;
        cancelAnimationFrame(raf);
        raf = 0;
        resizeObserver.disconnect();
        intersection.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        document.documentElement.removeEventListener('pointerleave', onPointerLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        gl.deleteProgram(program.program);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        try {
          var lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        } catch (e) {}
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.HJFluxLines = { create: create };
})();
