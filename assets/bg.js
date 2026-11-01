// dzz background: fluted (reeded) glass in front of a slow, living light. A WebGL fragment shader: each flute is a
// half-cylinder lens that bends the light behind it, darkens toward its edges, carries a thin highlight and a seam;
// the light rises from the bottom in a soft V, drifts, gathers under the cursor and swells while dzz is searching.
// Film grain and a vignette finish it. Colours follow the theme (assets/theme.js). Rendered at reduced resolution,
// paused in hidden tabs, and replaced by a plain gradient where WebGL is missing or motion is reduced.
//   DZZBG.activity(0..1)   how busy the search is      DZZBG.flash()   a found address
;(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const cv = document.createElement('canvas'); cv.id = 'dzz-bg'
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block'
  const mount = () => document.body.prepend(cv)
  document.body ? mount() : addEventListener('DOMContentLoaded', mount)
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' })
  const hex = (h) => { const n = parseInt(String(h).trim().slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] }
  let theme = window.DZZTheme?.get() || { g1: '#1f4fd6', g2: '#5f9bff', bg: '#07080f', dark: true }
  let act = 0, actT = 0, flash = 0, mx = .5, my = .3, smx = .5, smy = .3
  window.DZZBG = { activity: (v) => (actT = Math.max(0, Math.min(1, v))), flash: () => (flash = 1) }
  addEventListener('dzz-theme', (e) => { theme = e.detail; if (!gl) fallback() })
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = 1 - e.clientY / innerHeight }, { passive: true })
  function fallback() { cv.style.background = theme.dark ? `radial-gradient(120% 90% at 50% 120%, ${theme.g2}55, transparent 60%), ${theme.bg}` : `radial-gradient(120% 90% at 50% 120%, ${theme.g2}, transparent 60%), ${theme.bg}` }
  if (!gl) return fallback()

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
  const FS = `precision highp float;
uniform vec2 uRes;uniform float uTime,uAct,uDark,uFlash,uScale;uniform vec3 uG1,uG2,uBg;uniform vec2 uMouse;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
vec4 light(vec2 uv){
  float x=uv.x,y=uv.y;
  float v=pow(abs(x-.5)*2.,1.35);
  float h=.06+v*.42+.08*fbm(vec2(x*3.1,uTime*.06))+uAct*.10+uFlash*.10;
  float body=smoothstep(h+.16,h-.24,y);
  float rim=exp(-pow(max(y-h,0.)*5.,2.))*.22;
  float drift=fbm(vec2(x*2.2+uTime*.025,y*1.6-uTime*.045));
  float m=exp(-dot((uv-uMouse)*vec2(1.6,1.),(uv-uMouse)*vec2(1.6,1.))*7.);
  vec3 c=mix(uG1,uG2,clamp(drift*1.25-y*.35+.25+m*.4,0.,1.));
  float I=(body*.85+rim)*(.65+.55*drift)+m*.07+uAct*.10*body*(.6+.4*sin(uTime*5.));
  return vec4(c,I);
}
void main(){
  vec2 f=gl_FragCoord.xy,uv=f/uRes;
  float W=56.*uScale;
  float col=floor(f.x/W),fx=fract(f.x/W),b=fx-.5;
  float lens=b*(.6+.25*sin(col*1.7+.5));
  vec2 suv=vec2((col+.5+lens)*W/uRes.x,uv.y+.018*sin(col*2.3+uTime*.18));
  vec4 L=light(suv);
  float shade=.5+.5*cos(b*3.14159);
  float spec=smoothstep(.07,0.,abs(fx-.2))*.55+smoothstep(.05,0.,abs(fx-.8))*.15;
  float seam=smoothstep(0.,.03,fx)*smoothstep(1.,.97,fx);
  float I=L.a*shade*seam;
  vec3 c;
  if(uDark>.5){
    c=uBg+L.rgb*I*.62+L.rgb*spec*L.a*.22;
    float vg=length((uv-vec2(.5,.45))*vec2(1.,1.2));
    c*=1.-.55*smoothstep(.35,1.05,vg);
    c=mix(c,uBg,smoothstep(.45,.95,uv.y)*.7);
    c=mix(c,uBg,exp(-(pow(uv.x-.5,2.)*5.+pow(uv.y-.62,2.)*5.))*.55);   // a calm, darker field behind the content
  }else{
    c=mix(uBg,mix(uBg,L.rgb,.85),clamp(I*.55,0.,1.))+spec*L.a*.06;
    c-=(1.-seam)*.025;
  }
  c+=(hash(f+fract(uTime*7.)*100.)-.5)*(uDark>.5?.045:.03);
  gl_FragColor=vec4(c,1.);
}`
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o)); return o }
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr)
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return fallback()
  gl.useProgram(pr)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const ap = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0)
  const U = {}; for (const n of ['uRes', 'uTime', 'uAct', 'uDark', 'uFlash', 'uScale', 'uG1', 'uG2', 'uBg', 'uMouse']) U[n] = gl.getUniformLocation(pr, n)
  const SCALE = Math.min(1, 0.6 * (devicePixelRatio || 1))   // the glass is soft: fewer pixels look the same and cost far less
  const size = () => { cv.width = Math.round(innerWidth * SCALE); cv.height = Math.round(innerHeight * SCALE); gl.viewport(0, 0, cv.width, cv.height) }
  size(); addEventListener('resize', size)
  const t0 = performance.now(); let last = 0
  function frame(now) {
    requestAnimationFrame(frame)
    if (document.hidden || now - last < 1000 / 48) return
    last = now
    act += (actT - act) * 0.04; flash *= 0.94; smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05
    gl.uniform2f(U.uRes, cv.width, cv.height); gl.uniform1f(U.uTime, still ? 0 : (now - t0) / 1000); gl.uniform1f(U.uAct, act); gl.uniform1f(U.uFlash, flash)
    gl.uniform1f(U.uDark, theme.dark ? 1 : 0); gl.uniform1f(U.uScale, SCALE); gl.uniform2f(U.uMouse, smx, smy)
    gl.uniform3fv(U.uG1, hex(theme.g1)); gl.uniform3fv(U.uG2, hex(theme.g2)); gl.uniform3fv(U.uBg, hex(theme.bg))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  requestAnimationFrame(frame)
})()
