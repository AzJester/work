/* The picture. One source, compiled once per renderer with MODE defined, so each program holds only what it draws:
   1 planet from orbit, 2 cloud deck, 3 terrain and ocean at dusk, 4 underwater and seabed, 5 lunar surface,
   6 hardware on a bench, 7 night rain, 8 the six domains stacked, 9 spacecraft being built, 10 planes of glass.
   A transition is two programs drawn one over the other. */
const ASTRION_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes; uniform float uT;
uniform float uObj;
uniform vec4 uA, uB, uC;
uniform vec4 uD, uE;   // the scene's object and its clock: see each renderer
uniform vec4 uFx;     // fade, flash, grain, exposure
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float h13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x), mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x), mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a*vn(p); p = M2*p + vec2(3.1,1.7); a *= .5; } return s; }
float fbm2(vec2 p){ return .62*vn(p) + .38*vn(M2*p + vec2(3.1,1.7)); }
float fbm3(vec3 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a*vn3(p); p = p*2.03 + vec3(1.3,7.1,4.2); a *= .5; } return s; }
float fbm3lo(vec3 p){ float a = .5, s = 0.; for(int i = 0; i < 3; i++){ s += a*vn3(p); p = p*2.03 + vec3(1.3,7.1,4.2); a *= .5; } return s; }

vec3 stars(vec2 q){
  vec3 col = vec3(0.);
  float k = max(uRes.y/1080., .5);
  for(int L = 0; L < 2; L++){
    float fl = float(L), sc = 26.*pow(2.2, fl);
    vec2 g = q*sc + fl*17.3, id = floor(g), f = fract(g) - .5;
    if(h12(id + fl*71.3) > .71 + .07*fl){
      vec2 r = h22(id*1.31 + fl*11.7), pos = (r - .5)*.66;
      float m = pow(h12(id*2.17 + 5.3 + fl), 7. - 1.5*fl);
      float sig = mix(.9, 2.6 - .6*fl, m)*k/(uRes.y/sc), d = length(f - pos);
      float tw = .85 + .15*sin(uT*(1. + 2.4*r.x) + r.y*50.);
      vec3 tint = mix(vec3(1.), mix(vec3(1.,.86,.72), vec3(.78,.88,1.), r.y), .6);
      col += tint*exp(-d*d/(sig*sig))*(.10 + 1.7*m)*tw*(1. - .25*fl);
    }
  }
  return col;
}

/* ---------- 1: the planet from orbit. P: centre x, y, radius, rotation. Sn: sun x, y, intensity, limb arc. Lg: light xyz, star gain ---------- */
vec3 planet(vec2 p, vec4 P, vec4 Sn, vec4 Lg){
  float px = 1./uRes.y;
  vec3 L = normalize(Lg.xyz);
  vec3 col = stars(p + vec2(uT*.0015, 0.))*Lg.w;
  vec2 c = P.xy; float R = P.z;
  vec2 d = p - c; float rr = length(d)/R;
  vec2 ld = d/max(length(d), 1e-5), sdir = normalize(Sn.xy - c);
  float dl = acos(clamp(dot(ld, sdir), -1., 1.))*R;
  float arc = exp(-dl*dl/(Sn.w*Sn.w))*Sn.z;
  float limbLit = clamp(max(clamp(dot(vec3(ld, 0.), L)*2.2 + .07, 0., 1.), arc), 0., 1.6);
  float sunVis = smoothstep(-.004, .022, length(Sn.xy - c) - R);
  vec2 s = p - Sn.xy; float ds = length(s);
  float bloom = exp(-ds*ds/.0004)*7. + .0012/(ds*ds + .00014) + exp(-abs(s.y)*64.)*.42/(1. + abs(s.x)*4.5) + exp(-abs(s.x)*150.)*.06/(1. + abs(s.y)*12.);
  col += vec3(1.,.93,.82)*bloom*Sn.z*sunVis;
  float h = max(rr - 1., 0.)*R;
  vec3 atm = vec3(.30,.60,1.)*exp(-h/.0085) + vec3(.10,.24,.95)*exp(-h/.03)*.38;
  atm += vec3(1.,.50,.20)*exp(-h/.006)*arc*arc*.9;
  col += atm*limbLit*step(1., rr)*1.15;
  if(rr < 1. + px/R){
    vec3 n = vec3(d/R, sqrt(max(1. - rr*rr, 0.)));
    float a = P.w, ca = cos(a), sa = sin(a);
    vec3 sn = vec3(ca*n.x + sa*n.z, n.y, -sa*n.x + ca*n.z);
    sn = vec3(sn.x, .94*sn.y - .34*sn.z, .34*sn.y + .94*sn.z);
    float coast = smoothstep(.50, .545, fbm3(sn*2.4 + 11.));
    float hills = fbm3lo(sn*9.);
    vec3 ocean = mix(vec3(.008,.03,.095), vec3(.02,.085,.19), fbm3lo(sn*5.));
    vec3 ground = mix(vec3(.09,.125,.05), vec3(.33,.26,.16), hills);
    ground = mix(ground, vec3(.9), smoothstep(.78,.92, abs(sn.y) + .1*hills));
    vec3 albedo = mix(ocean, ground, coast);
    float clouds = smoothstep(.50, .76, fbm3(sn*4.2 + vec3(uT*.006, 0., 0.) + 2.6*vec3(fbm3lo(sn*2. + 5.))));
    albedo = mix(albedo, vec3(.93,.95,1.), clouds*.88);
    float ndl = dot(n, L), term = smoothstep(-.10, .22, ndl);
    vec3 lit = albedo*max(ndl, 0.)*1.3*vec3(1.,.97,.92);
    lit += vec3(1.,.9,.75)*pow(max(dot(n, normalize(L + vec3(0.,0.,1.))), 0.), 70.)*(1.-coast)*(1.-clouds)*.9*step(0., ndl);
    lit += albedo*vec3(1.,.42,.18)*smoothstep(0.,.10,ndl)*smoothstep(.34,.06,ndl)*.35;
    float blob = smoothstep(.47,.62, fbm3lo(sn*13. + 2.))*coast*(1. - clouds*.85);
    float pts = smoothstep(.74,.92, vn3(sn*190.*R)) + .7*smoothstep(.80,.95, vn3(sn*520.*R));
    vec3 surf = lit + (vec3(1.,.70,.36)*blob*pts*1.5 + albedo*vec3(.018,.028,.06))*(1. - term);
    float hin = (1. - rr)*R;
    surf += (vec3(.26,.56,1.)*exp(-hin/.013) + vec3(.10,.26,.9)*exp(-hin/.05)*.4)*(.05 + 1.1*limbLit);
    surf += vec3(1.,.5,.2)*exp(-hin/.008)*arc*arc*.8;
    col = mix(col, surf, smoothstep(1. + px/R, 1. - px/R, rr));
  }
  return col;
}

/* ---------- dusk: sky, heightfields, water ---------- */
vec3 skyBase(vec3 rd, vec3 sd){     // blue hour: cream on the horizon, blue above it, a warm bloom toward the sun
  float mu = max(dot(rd, sd), 0.), k = pow(clamp(rd.y, 0., 1.), .55);
  vec3 col = mix(mix(vec3(.250,.195,.160), vec3(.030,.058,.120), smoothstep(0., .30, k)), vec3(.0055,.015,.052), smoothstep(.24, 1., k));
  col += vec3(.90,.42,.16)*exp(-max(rd.y, 0.)*9.)*pow(mu, 10.)*.40;
  col += vec3(1.,.62,.34)*pow(mu, 70.)*.38;
  return col;
}
vec3 skyCol(vec3 rd, vec3 sd){ return skyBase(rd, sd) + vec3(1.,.82,.62)*smoothstep(.99962, .99990, dot(rd, sd))*4.; }
vec3 camRay(vec2 p, float pitch, float yaw){
  vec3 rd = normalize(vec3(p.x, p.y, 1.55));
  float cp = cos(pitch), sp = sin(pitch); rd = vec3(rd.x, rd.y*cp + rd.z*sp, -rd.y*sp + rd.z*cp);
  float cy = cos(yaw), sy = sin(yaw); return vec3(rd.x*cy + rd.z*sy, rd.y, -rd.x*sy + rd.z*cy);
}
float ridged(vec2 x, int oct){
  float a = .5, s = 0., w = 0.;
  for(int i = 0; i < oct; i++){ float n = 1. - abs(2.*vn(x) - 1.); s += a*n*n; w += a; x = M2*x*1.02 + vec2(3.7, 1.9); a *= .5; }
  return s/w;
}
// T: amplitude, seed, coast offset. Land rises to the right, open water to the left.
float terrainH(vec2 x, vec3 T, int oct){
  float m = smoothstep(-7., 9., x.x + T.z);
  return T.x*((m - .52)*1.5 + ridged(x*.20 + T.y, oct)*2.6*smoothstep(.30, 1., m));
}
float cloudH(vec2 x){ float b = fbm(x*.13 + vec2(0., uT*.012)); return b*b*4.6 - 1.8 + .34*fbm(x*.62 + 4.) + .12*fbm2(x*2.4); }
float lunarH(vec2 x, int oct){
  float h = 0.;
  for(int s = 0; s < (oct > 3 ? 2 : 1); s++){       // small craters only shape the light, not the silhouette
    float sc = s == 0 ? .085 : .31, amp = s == 0 ? 2.4 : .55;
    vec2 y = x*sc + float(s)*17., i = floor(y), f = fract(y);
    for(int a = -1; a <= 1; a++) for(int b = -1; b <= 1; b++){
      vec2 g = vec2(float(a), float(b)), o = h22(i + g);
      float r = .20 + .26*h12(i + g + 3.3), d = length(g + o - f)/r;
      if(d < 1.7) h += amp*r*((d < 1. ? (d*d - 1.)*.55 : 0.) + exp(-(d - 1.)*(d - 1.)*14.)*.22);
    }
  }
  h += (fbm2(x*.45) - .5)*.55;
  if(oct > 3) h += (fbm(x*3.3) - .5)*.045;
  return h;
}
float fieldH(vec2 x, vec3 T, int kind, int oct){ return kind == 0 ? terrainH(x, T, oct) : kind == 1 ? cloudH(x) : lunarH(x, oct); }
float marchH(vec3 ro, vec3 rd, vec3 T, float tmax, int kind, int steps){
  float t = .03;
  for(int i = 0; i < steps; i++){
    vec3 pos = ro + rd*t;
    float h = pos.y - fieldH(pos.xz, T, kind, 3);
    if(h < .0016*t) return t;
    t += max(h*.48, .0045*t);
    if(t > tmax) break;
  }
  return -1.;
}
vec3 fieldN(vec2 x, vec3 T, int kind, float e){
  float h = fieldH(x, T, kind, 6);
  return normalize(vec3(h - fieldH(x + vec2(e, 0.), T, kind, 6), e, h - fieldH(x + vec2(0., e), T, kind, 6)));
}
vec3 terrainShade(vec3 pos, vec3 rd, float t, vec3 T, vec3 sd, vec3 fogc, float fog){
  vec3 n = fieldN(pos.xz, T, 0, .010 + .004*t);
  float dif = max(dot(n, sd), 0.), amb = .5 + .5*n.y, rock = fbm(pos.xz*2.3 + 5.);
  vec3 alb = mix(vec3(.034,.035,.038), vec3(.092,.086,.080), rock)*mix(.62, 1., smoothstep(.5, .9, n.y));
  alb = mix(alb, vec3(.024,.028,.024), smoothstep(.86, .97, n.y)*smoothstep(1.3, .15, pos.y)*.65);
  vec3 col = alb*(vec3(1.,.62,.36)*dif*2.5 + vec3(.13,.21,.40)*amb*1.0);
  col += vec3(1.,.5,.2)*pow(1. - max(dot(n, -rd), 0.), 3.)*.012;
  return mix(col, fogc, 1. - exp(-t*fog));
}
/* ---------- solid objects: signed distance fields, traced and lit inside each scene ---------- */
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0., 1.)) - r; }
float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float segRay(vec3 ro, vec3 rd, vec3 c0, vec3 c1, out float tt){     // distance from a ray to a segment, and where along the ray
  vec3 u = c1 - c0, w = c0 - ro; float a = dot(u, u), b = dot(u, rd), s = clamp((b*dot(rd, w) - dot(u, w))/max(a - b*b, 1e-5), 0., 1.);
  tt = dot(rd, w) + s*b; return length(w + s*u - tt*rd);
}
vec3 lampAt(vec3 ro, vec3 rd, float ts, vec3 P, vec3 c, float size){
  float tb = dot(P - ro, rd); if(tb < 0. || tb > ts + .3) return vec3(0.);
  float d = length(P - ro - rd*tb); return c*(exp(-d*d/(size*size)) + .22*exp(-d*d/(size*size*36.)));
}
// materials: 1 foil, 2 solar cells, 3 white, 4 dark steel, 5 grey paint, 9 array face
vec3 matCol(float m, vec3 q){
  if(m < 1.5) return vec3(.62,.44,.16)*(.70 + .6*vn(q.xy*38. + q.z*17.));
  if(m < 2.5){ vec2 g = abs(fract(q.xy*vec2(9., 6.)) - .5); return vec3(.012,.030,.085)*(1. - .7*smoothstep(.44, .5, max(g.x, g.y))); }
  if(m < 3.5) return vec3(.46,.46,.44);
  if(m < 4.5) return vec3(.030,.034,.040);
  if(m < 5.5) return vec3(.115,.120,.125);
  return vec3(.070,.080,.090)*(.8 + .4*step(.5, fract(q.y*14.)));
}
vec3 lit(float m, vec3 q, vec3 n, vec3 rd, vec3 L, vec3 Lc, vec3 amb){
  vec3 alb = matCol(m, q);
  float spec = pow(max(dot(reflect(rd, n), L), 0.), m < 2.5 ? 40. : 16.)*(m < 1.5 ? .9 : m < 2.5 ? 1.4 : .22);
  return alb*(Lc*max(dot(n, L), 0.) + amb*(.55 + .45*n.y)) + Lc*spec*.35;
}
vec2 mapSat(vec3 q){
  vec2 d = vec2(sdBox(q, vec3(.40,.50,.40)) - .02, 1.);
  vec3 a = vec3(abs(q.x), q.yz);
  d = opU(d, vec2(sdBox(a - vec3(1.22, 0., 0.), vec3(.64,.30,.012)), 2.));
  d = opU(d, vec2(sdCap(a, vec3(.42,0.,0.), vec3(.58,0.,0.), .025), 5.));
  vec3 t = q - vec3(0., .80, 0.); t.yz = rot(.5)*t.yz;
  d = opU(d, vec2(sdCyl(t, .30, .022), 3.));
  d = opU(d, vec2(sdCap(q, vec3(0.,.52,0.), vec3(0.,.76,0.), .02), 5.));
  return opU(d, vec2(sdCap(q, vec3(0.,-.52,0.), vec3(0.,-.88,0.), .014), 5.));
}
vec2 mapShip(vec3 q){       // x forward, half length 1.6, waterline at y = 0
  float w = .19*(1. - .86*smoothstep(.55, 1.62, q.x))*(1. - .22*smoothstep(-1.2, -1.62, q.x));
  vec3 h = q - vec3(0., .06, 0.);
  vec2 d = vec2(sdBox(vec3(h.x, h.y, h.z*(.19/max(w, .02))), vec3(1.6, .13, .19))*(w/.19)*.9, 4.);
  d = opU(d, vec2(sdBox(q - vec3(-.25,.30,0.), vec3(.42,.11,.115)), 5.));
  d = opU(d, vec2(sdBox(q - vec3(-.05,.47,0.), vec3(.17,.07,.10)), 5.));
  d = opU(d, vec2(sdBox(q - vec3(-.56,.47,0.), vec3(.10,.09,.065)), 4.));
  d = opU(d, vec2(sdCap(q, vec3(-.12,.54,0.), vec3(-.12,.96,0.), .014), 5.));
  d = opU(d, vec2(sdCap(q, vec3(-.12,.82,-.13), vec3(-.12,.82,.13), .008), 5.));
  d = opU(d, vec2(sdBox(q - vec3(.80,.235,0.), vec3(.09,.045,.075)), 5.));
  d = opU(d, vec2(sdCap(q, vec3(.86,.25,0.), vec3(1.12,.285,0.), .012), 4.));
  return opU(d, vec2(length(q - vec3(-.33,.47,0.)) - .075, 3.));
}
vec2 mapLander(vec3 q){
  vec2 d = vec2(sdCyl(q - vec3(0., .36, 0.), .21, .10) - .02, 1.);
  d = opU(d, vec2(sdCyl(q - vec3(0., .58, 0.), .13, .10) - .015, 5.));
  d = opU(d, vec2(sdCyl(q - vec3(0., .20, 0.), .07, .06), 4.));
  vec3 a = vec3(abs(q.x), q.y, abs(q.z));
  d = opU(d, vec2(sdCap(a, vec3(.15,.32,.15), vec3(.34,.03,.34), .014), 5.));
  d = opU(d, vec2(sdCyl(a - vec3(.34,.015,.34), .05, .012), 5.));
  return opU(d, vec2(sdCap(q, vec3(.05,.68,0.), vec3(.05,.92,0.), .006), 5.));
}
// What stands in a dusk scene. v: 1 three uncrewed vessels, 2 radar site, 3 ship, 4 forward position
vec2 mapDusk(vec3 p, float v, vec4 D){
  if(v < .5) return vec2(1e5, 0.);
  if(v < 1.5){
    vec2 d = vec2(1e5, 0.);
    for(int i = 0; i < 3; i++){ float fi = float(i); vec3 q = p - vec3(D.x + fi*1.9 - 1.6, .012*sin(uT*1.3 + fi*2.), D.z + 1.3*sin(fi*2.3) + fi*.9); q.xz = rot(D.w + .3*sin(fi*1.7))*q.xz; vec2 s = mapShip(q/.55); d = opU(d, vec2(s.x*.55, s.y)); }
    return d;
  }
  if(v < 2.5){
    vec3 q = p - D.xyz; q.xz = rot(D.w)*q.xz;
    vec2 d = vec2(sdCyl(q - vec3(0., -.42, 0.), .58, .45), 5.);
    d = opU(d, vec2(sdBox(q - vec3(0., .17, 0.), vec3(.10,.14,.10)), 5.));
    vec3 a = q - vec3(0., .56, 0.); a.xy = rot(-.30)*a.xy;
    d = opU(d, vec2(sdBox(a, vec3(.035,.27,.33)) - .006, 9.));
    d = opU(d, vec2(length(q - vec3(.06,.19,.38)) - .15, 3.));
    return opU(d, vec2(sdBox(q - vec3(-.26,.11,-.30), vec3(.17,.08,.12)), 4.));
  }
  if(v < 3.5){ vec3 q = p - vec3(D.x, .015*sin(uT*.9), D.z); q.xz = rot(D.w)*q.xz; vec2 s = mapShip(q/1.15); return vec2(s.x*1.15, s.y); }
  vec3 q = p - D.xyz; q.xz = rot(D.w)*q.xz;
  vec2 d = vec2(sdCap(q, vec3(0.), vec3(0., 1.15, 0.), .013), 5.);
  d = opU(d, vec2(sdCap(q, vec3(-.10,.95,0.), vec3(.10,.95,0.), .008), 5.));
  d = opU(d, vec2(sdCap(q, vec3(-.07,.78,0.), vec3(.07,.78,0.), .008), 5.));
  d = opU(d, vec2(sdBox(q - vec3(.34,.09,.05), vec3(.20,.09,.13)) - .01, 4.));
  return opU(d, vec2(sdBox(q - vec3(-.30,.05,.12), vec3(.09,.05,.07)), 5.));
}
// Light sweeping outward across water and ground: the layers of a defence, or a signal leaving a mast.
vec3 ringLight(vec2 x, float v, vec4 D, float b){
  if(v < .5 || (v > 1.5 && v < 3.5)) return vec3(0.);
  vec2 c = v < 1.5 ? D.xz + vec2(.3, .6) : D.xz; float r = length(x - c), R = v < 1.5 ? 9. : 6., s = 0.;
  for(int i = 0; i < 3; i++){ float k = fract(b*.16 + float(i)/3.); s += exp(-pow((r - k*R)/(.035 + .05*k), 2.))*(1. - k)*(1. - k); }
  return vec3(.14,.80,.94)*s*.55;
}
// Interceptors: a motor, the smoke it leaves in the last light, and what happens where it arrives.
vec3 trails(vec3 ro, vec3 rd, float ts, float b, float v, vec4 D, vec3 sd){
  vec3 acc = vec3(0.);
  for(int k = 0; k < 3; k++){
    float fk = float(k), t0 = (v < 1.5 ? 3.4 : 4.4) + fk*2., age = b - t0, u = clamp(age/1.6, 0., 1.);
    vec3 A = v < 1.5 ? vec3(D.x + fk*1.9 - 1.6, .16, D.z + 1.3*sin(fk*2.3) + fk*.9) : D.xyz + vec3(1.0 + fk*.5, .15, .9 + fk*.5);
    vec3 B = v < 1.5 ? A + vec3(-1.6 + fk*1.3, 3.0 + fk*.5, 5.5 + fk) : D.xyz + vec3(-2.4 + fk*2.4, 3.6 + fk*.5, 5.0 + fk*.6);
    vec3 C = A + vec3(0., (B.y - A.y)*.92, (B.z - A.z)*.18), I = B + vec3(.9, 1.7, 2.6)*(1. - clamp((b - t0 + 1.4)/3.0, 0., 1.))*2.4;
    float ti; float di = segRay(ro, rd, I, I + vec3(.14, .26, .40), ti);
    if(b < t0 + 1.6 && b > t0 - 1.4 && ti > 0. && ti < ts) acc += vec3(1.,.80,.74)*exp(-di*di/.0012)*.9;       // what is coming in
    if(age < 0.) continue;
    float fade = 1. - smoothstep(3.0, 6.5, age); vec3 prev = A;
    for(int i = 1; i <= 9; i++){
      float s = u*float(i)/9., w = 1. - s; vec3 c = w*w*A + 2.*w*s*C + s*s*B;
      float tt; float d = segRay(ro, rd, prev, c, tt); prev = c;
      if(tt < 0. || tt > ts) continue;
      float wd = .034 + .07*(u - s)*age + .0035*tt + .016*vn(c.xy*9. + fk);
      acc += (vec3(.22,.23,.28) + vec3(.62,.36,.20)*.6)*exp(-d*d/(wd*wd))*.30*fade*(.55 + .45*s);
    }
    if(u < 1.){ float w = 1. - u; vec3 hd = w*w*A + 2.*w*u*C + u*u*B; acc += lampAt(ro, rd, ts, hd, vec3(1.,.74,.44)*3.2, .05 + .006*length(hd - ro)); }
    else { float k2 = age - 1.6, tb = dot(B - ro, rd), d = length(B - ro - rd*tb); if(tb > 0. && tb < ts) acc += vec3(1.,.88,.70)*(exp(-d*d/(.012 + k2*.30))*2.6*exp(-k2*2.4) + exp(-pow((d - k2*.55)/.035, 2.))*.45*exp(-k2*1.6)); }
  }
  return acc;
}
/* 3: A cam x, y, z, pitch. B yaw, amplitude, seed, coast offset. C fog density, cloud whiteout, sun azimuth.
      D the object's x, y, z and heading. E scene beat, which object */
vec3 dusk(vec2 p, vec4 A, vec4 B, vec4 C, vec4 D, vec4 E, float obj){
  vec3 ro = A.xyz, rd = camRay(p, A.w, B.x), T = B.yzw;
  vec3 sd = normalize(vec3(.78 + C.z, .056, 1.)), sunC = vec3(1.,.62,.36)*2.5, ambC = vec3(.13,.21,.40);
  float v = obj*E.y, b = E.x;
  vec4 Dw = D; if((v > 1.5 && v < 2.5) || v > 3.5) Dw.y = terrainH(D.xz, T, 6) + (v > 3.5 ? 0. : .03);
  vec3 col = skyCol(rd, sd);
  if(rd.y > 0.){
    vec2 cu = rd.xz/(rd.y + .14)*.9 + vec2(uT*.004, 0.);
    float cl = smoothstep(.50, .86, fbm(cu*1.3));
    col = mix(col, col*1.15 + vec3(.22,.10,.045)*pow(max(dot(rd, sd), 0.), 2.) + .010, cl*.6*smoothstep(0., .14, rd.y));
  }
  vec3 fogc = skyBase(normalize(vec3(rd.x, .025, rd.z)), sd);
  float tw = rd.y < -.0005 ? -ro.y/rd.y : 1e5;
  float t = marchH(ro, rd, T, min(tw, 80.), 0, 84), ts = 1e5;
  if(t > 0.){
    vec3 pos = ro + rd*t; ts = t;
    col = terrainShade(pos, rd, t, T, sd, fogc, C.x);
    col += ringLight(pos.xz, v, Dw, b)*exp(-t*C.x)*.5;
    if(v > 3.5){ vec2 dl = pos.xz - Dw.xz - vec2(.3, 0.); col += vec3(1.,.62,.30)*exp(-dot(dl, dl)*2.2)*.035; }
  } else if(tw < 400.){
    vec3 pos = ro + rd*tw; ts = tw;
    vec2 wv = pos.xz*1.9; float tt = uT*.55, e = .06;
    float w0 = fbm2(wv + vec2(tt, tt*.4)) + .45*fbm2(wv*2.7 - vec2(tt*.7, tt));
    vec2 g = vec2(fbm2(wv + vec2(tt + e, tt*.4)) + .45*fbm2(wv*2.7 + vec2(e*2.7, 0.) - vec2(tt*.7, tt)), fbm2(wv + vec2(tt, tt*.4 + e)) + .45*fbm2(wv*2.7 + vec2(0., e*2.7) - vec2(tt*.7, tt))) - w0;
    vec3 n = normalize(vec3(-g.x*2.2, 1. + tw*.06, -g.y*2.2));
    vec3 rf = reflect(rd, n); rf.y = abs(rf.y) + .002; rf = normalize(rf);
    float fr = .025 + .975*pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 refl = skyCol(rf, sd);
    float tr = marchH(pos + vec3(0., .02, 0.), rf, T, 26., 0, 40);
    if(tr > 0.) refl = mix(vec3(.010,.010,.011), skyBase(normalize(vec3(rf.x, .025, rf.z)), sd), 1. - exp(-tr*C.x*2.));
    float foam = 0.;
    if(v > .5 && abs(v - 2.) > .5 && v < 3.5){        // hulls on the water: their reflection and their wake
      float t2 = 0.; vec2 h2 = vec2(1.);
      for(int i = 0; i < 22; i++){ h2 = mapDusk(pos + rf*t2, v, Dw); if(h2.x < .004 || t2 > 5.) break; t2 += h2.x; }
      if(h2.x < .008){ refl = vec3(.010,.011,.014); tr = 1.; }
      for(int i = 0; i < 3; i++){
        float fi = float(i), sc = v < 1.5 ? .55 : 1.15; if(v > 1.5 && i > 0) break;
        vec2 c = v < 1.5 ? vec2(D.x + fi*1.9 - 1.6, D.z + 1.3*sin(fi*2.3) + fi*.9) : D.xz;
        vec2 l = rot(D.w + (v < 1.5 ? .3*sin(fi*1.7) : 0.))*(pos.xz - c)/sc;
        float back = -l.x - 1.5;
        foam += exp(-pow(l.y/(.17 + .085*max(back, 0.)), 2.))*smoothstep(0., .5, back)*exp(-max(back, 0.)*.12)*(.45 + .55*fbm2(pos.xz*11. + uT*.6));
        foam += exp(-pow((abs(l.y) - .10 - .30*max(1.6 - l.x, 0.))/.05, 2.))*smoothstep(1.7, 1.2, l.x)*smoothstep(-2.5, .5, l.x)*.35;
      }
    }
    col = mix(vec3(.0040,.014,.030), refl, fr);
    col += vec3(1.,.62,.32)*pow(max(dot(rf, sd), 0.), 260.)*3.2*step(tr, 0.);
    col = mix(col, vec3(.16,.19,.23) + vec3(.30,.20,.12)*max(dot(sd, vec3(0., 0., 1.)), 0.)*.5, clamp(foam, 0., 1.)*.75);
    col += ringLight(pos.xz, v, Dw, b)*.6;
    col = mix(col, fogc, 1. - exp(-tw*C.x*.75));
  }
  if(v > .5){
    float to = 0.; vec2 h = vec2(1.); float tmax = min(ts, 45.);
    for(int i = 0; i < 64; i++){ h = mapDusk(ro + rd*to, v, Dw); if(h.x < .0012*max(to, 1.) || to > tmax) break; to += h.x*.9; }
    if(h.x < .003*max(to, 1.) && to < tmax){
      vec3 q = ro + rd*to; vec2 e = vec2(.002*max(to, 1.), 0.);
      vec3 n = normalize(vec3(mapDusk(q + e.xyy, v, Dw).x - mapDusk(q - e.xyy, v, Dw).x, mapDusk(q + e.yxy, v, Dw).x - mapDusk(q - e.yxy, v, Dw).x, mapDusk(q + e.yyx, v, Dw).x - mapDusk(q - e.yyx, v, Dw).x));
      vec3 c = lit(h.y, q*3., n, rd, sd, sunC, ambC);
      c += fogc*.35*pow(1. - max(dot(n, -rd), 0.), 3.);
      col = mix(c, fogc, 1. - exp(-to*C.x)); ts = to;
    }
    float bl = .5 + .5*sin(uT*4.2);
    if(v < 1.5){ for(int i = 0; i < 3; i++){ float fi = float(i); col += lampAt(ro, rd, ts, vec3(D.x + fi*1.9 - 1.6, .56, D.z + 1.3*sin(fi*2.3) + fi*.9), vec3(.14,.80,.94)*1.4, .022); } }
    else if(v < 2.5) col += lampAt(ro, rd, ts, Dw.xyz + vec3(0., .90, 0.), vec3(1.,.16,.10)*2.2*bl, .020);
    else if(v < 3.5){ vec2 f2 = rot(-D.w)*vec2(-.14, 0.); col += lampAt(ro, rd, ts, vec3(D.x + f2.x, 1.13, D.z + f2.y), vec3(1.,.90,.72)*1.8, .020); vec2 f3 = rot(-D.w)*vec2(-1.75, 0.); col += lampAt(ro, rd, ts, vec3(D.x + f3.x, .30, D.z + f3.y), vec3(1.,.20,.12)*1.4, .016); }
    else { col += lampAt(ro, rd, ts, Dw.xyz + vec3(0., 1.18, 0.), vec3(1.,.16,.10)*2.4*bl, .018); vec2 f4 = rot(-D.w)*vec2(.34, -.09); col += lampAt(ro, rd, ts, Dw.xyz + vec3(f4.x, .10, f4.y), vec3(1.,.70,.36)*1.6, .030); }
    if(v < 2.5) col += trails(ro, rd, ts, b, v, Dw, sd);
  }
  return mix(col, vec3(.150,.155,.170), C.y);
}
/* 2: above a cloud deck. A cam x, height, z, pitch. B yaw. C fog density, whiteout, sun azimuth, spare */
vec3 deck(vec2 p, vec4 A, vec4 B, vec4 C){
  vec3 ro = A.xyz, rd = camRay(p, A.w, B.x), sd = normalize(vec3(.78 + C.z, .056, 1.));
  vec3 col = skyCol(rd, sd);
  if(rd.y > .0) col += stars(p*1.3 + 3.)*smoothstep(.10, .7, rd.y)*.35;
  vec3 fogc = skyBase(normalize(vec3(rd.x, .03, rd.z)), sd);
  float t = marchH(ro, rd, vec3(0.), 90., 1, 84);
  if(t > 0.){
    vec3 pos = ro + rd*t, n = fieldN(pos.xz, vec3(0.), 1, .22 + .01*t);
    float dif = clamp(dot(n, sd)*.80 + .22, 0., 1.), det = fbm(pos.xz*1.7 + 2.);
    vec3 c = vec3(.050,.076,.135)*(.55 + .75*n.y)*(.75 + .5*det) + vec3(.62,.47,.36)*pow(dif, 2.2)*(.5 + .7*det);
    c += vec3(.9,.45,.2)*pow(max(dot(rd, sd), 0.), 8.)*.08;
    col = mix(c, fogc, 1. - exp(-t*C.x));
  }
  return mix(col, vec3(.150,.145,.150), C.y);
}

/* ---------- 4: underwater. A depth, pitch, seabed depth, cable glow. B vehicle x, y, z (camera relative), visible. C surface light ---------- */
float caust(vec2 x, float t){
  float r1 = 1. - abs(2.*vn(x*1.9 + vec2(t*.21, t*.13)) - 1.), r2 = 1. - abs(2.*vn(x*2.7 - vec2(t*.17, t*.09) + 3.) - 1.);
  return pow(r1*r2, 3.)*7.;
}
float sdVehicle(vec3 q){
  float d = length(vec3(max(abs(q.x) - .62, 0.), q.y, q.z)) - .13;
  vec3 f = q - vec3(.72, 0., 0.);
  d = min(d, max(max(abs(f.x) - .09, abs(f.y) - .27), abs(f.z) - .012));
  d = min(d, max(max(abs(f.x) - .09, abs(f.z) - .27), abs(f.y) - .012));
  return min(d, length(q - vec3(.90, 0., 0.)) - .05);
}
vec3 sea(vec2 p, vec4 A, vec4 B, vec4 C){
  vec3 rd = camRay(p, A.y, 0.);
  float dep = A.x, bed = A.z;
  vec3 wc = mix(vec3(.016,.085,.105), vec3(.0010,.0050,.0090), smoothstep(0., 9.5, dep));
  vec3 col = wc*(.50 + 1.4*smoothstep(-.35, 1., rd.y));
  if(rd.y > .02){
    float ts = dep/rd.y; vec2 sp = rd.xz*ts;
    col += vec3(.10,.27,.29)*(.35 + caust(sp*.55, uT*.9)*.45)*exp(-ts*.20)*(.30 + 1.6*smoothstep(.45, .95, rd.y))*C.x;
  }
  vec2 ro2 = p - vec2(.16, .95 + A.y*1.6); float ang = atan(ro2.x, -ro2.y), rl = length(ro2);
  float sh = smoothstep(.34, .95, vn(vec2(ang*24., uT*.14)))*.62 + smoothstep(.40, .92, vn(vec2(ang*53. + 3., uT*.21)))*.38;
  col += vec3(.085,.26,.29)*sh*(1. - .85*smoothstep(3., 8., dep))*exp(-rl*1.15)*exp(-dep*.26)*1.5*C.x + vec3(.05,.17,.19)*exp(-rl*1.7)*exp(-dep*.22)*C.x;
  float far = 1e5;
  if(rd.y < -.01){
    float tb = (bed - dep)/(-rd.y); vec3 pos = rd*tb; far = tb;
    float rip = .5 + .5*sin(pos.x*7. + fbm(pos.xz*.8)*6.);
    vec3 sand = vec3(.090,.084,.066)*(.50 + .50*fbm(pos.xz*2.1))*(.82 + .18*rip);
    float lb = exp(-bed*.15);
    vec3 lit = sand*vec3(.34,.80,.86)*lb*(.55 + caust(pos.xz*.9, uT*.7)*.9)*2.2;
    float cx = .95 + .55*sin(pos.z*.33) + .2*sin(pos.z*.9 + 1.), zj = 7.2, xj = .95 + .55*sin(zj*.33) + .2*sin(zj*.9 + 1.);
    float dc = abs(pos.x - cx);
    if(pos.z > zj){ dc = min(dc, abs(pos.x - xj - (pos.z - zj)*.55)*.88); dc = min(dc, abs(pos.x - xj + (pos.z - zj)*.75)*.80); }
    float tube = smoothstep(.080, .058, dc);
    vec2 jb = abs(pos.xz - vec2(xj, zj)) - vec2(.34, .22); float jd = max(jb.x, jb.y);
    lit = mix(lit, vec3(.006,.007,.008) + vec3(.05,.07,.08)*smoothstep(.06, 0., dc)*lb*2.5, tube);
    lit *= 1. - .45*smoothstep(.30, .08, dc)*(1. - tube);
    float pulse = pow(.5 + .5*sin(pos.z*1.5 - uT*5.), 14.);
    lit += vec3(.14,.80,.94)*A.w*(exp(-dc*dc*34.)*(.10 + 1.6*pulse) + tube*(.12 + .5*pulse));
    lit = mix(lit, vec3(.012,.014,.016) + vec3(.05,.07,.08)*lb*2.*smoothstep(-.02, -.20, jd), smoothstep(.012, -.012, jd));
    lit += vec3(.14,.80,.94)*A.w*(exp(-pow(jd/.03, 2.))*.9 + smoothstep(.0, -.03, jd)*step(.5, fract(pos.x*9.))*.25*(.6 + .4*sin(uT*3. + pos.x*20.)));
    col = mix(lit, col, 1. - exp(-tb*.19));
  }
  if(B.w > .01){
    float t = 0.; bool hit = false;
    for(int i = 0; i < 40; i++){ float d = sdVehicle(rd*t - B.xyz); if(d < .003){ hit = true; break; } t += d; if(t > min(far, 14.)) break; }
    if(hit){
      vec3 q = rd*t - B.xyz; vec2 e = vec2(.004, 0.);
      vec3 n = normalize(vec3(sdVehicle(q + e.xyy) - sdVehicle(q - e.xyy), sdVehicle(q + e.yxy) - sdVehicle(q - e.yxy), sdVehicle(q + e.yyx) - sdVehicle(q - e.yyx)));
      float top = clamp(n.y*.6 + .4, 0., 1.);
      vec3 c = vec3(.030,.036,.040)*(.25 + top*1.6)*exp(-dep*.10) + vec3(.10,.30,.34)*pow(max(n.y, 0.), 8.)*.25*exp(-dep*.2);
      c += wc*.8*pow(1. - max(dot(n, -rd), 0.), 2.);
      vec3 nq = q - vec3(-.74, 0., 0.);
      c += vec3(.14,.80,.94)*exp(-dot(nq, nq)*160.)*1.0;
      c += vec3(.012,.016,.018)*step(abs(abs(q.x) - .30), .012);
      col = mix(col, mix(c, col, 1. - exp(-t*.16)), B.w);
    }
    vec3 np = B.xyz + vec3(-.76, 0., 0.); float nb = dot(np, rd), nd = length(np - rd*nb);
    col += vec3(.14,.80,.94)*exp(-nd*nd*420.)*.30*B.w*step(0., nb);
  }
  for(int i = 0; i < 3; i++){
    float fl = float(i);
    vec2 g = (p + vec2(uT*.006*(1. + fl), uT*.014*(1. + fl)))*(16. + 13.*fl), id = floor(g), f = fract(g) - .5, r = h22(id + fl*5.) - .5;
    col += vec3(.20,.34,.36)*smoothstep(.07, 0., length(f - r*.7))*step(.74, h12(id + 3.1 + fl))*(.30 - .07*fl)*exp(-dep*.07);
  }
  return col;
}

/* ---------- 5: the lunar surface. A cam x, height, z, pitch. B yaw, earth x, earth y, earth radius. D lander x, altitude, z, 1 if present ---------- */
vec3 lunar(vec2 p, vec4 A, vec4 B, vec4 D){
  vec3 ro = A.xyz, rd = camRay(p, A.w, B.x), sd = normalize(vec3(.72, .20, .52));
  vec3 col = stars(p + 7.)*.9;
  vec2 e = p - B.yz; float er = B.w, ed = length(e)/er;
  if(ed < 3.){
    vec3 Le = normalize(vec3(.62, .30, .55)), n = vec3(e/er, sqrt(max(1. - ed*ed, 0.)));
    float l = clamp(dot(n, Le), 0., 1.);
    vec3 ec = mix(vec3(.012,.045,.11), vec3(.42,.46,.50), smoothstep(.46, .66, fbm(e/er*2.6 + 3.)));
    col = mix(col, ec*l*1.5, smoothstep(1.02, .97, ed));
    col += vec3(.035,.085,.16)*exp(-max(ed - 1., 0.)/.10)*step(1., ed)*clamp(dot(normalize(e), Le.xy) + .5, 0., 1.);
  }
  ro.y += lunarH(ro.xz, 3);
  vec3 S = vec3(D.x, lunarH(D.xz, 6) + D.y, D.z);
  float t = marchH(ro, rd, vec3(0.), 140., 2, 84), ts = t > 0. ? t : 1e5;
  if(t > 0.){
    vec3 pos = ro + rd*t, n = fieldN(pos.xz, vec3(0.), 2, .012 + .003*t);
    float shd = 1., tq = .08;
    for(int i = 0; i < 22; i++){ vec3 q = pos + sd*tq; float hh = q.y - lunarH(q.xz, 3); shd = min(shd, 9.*hh/tq); tq += max(hh, .08); if(shd < .01) break; }
    shd = clamp(shd, 0., 1.);
    if(D.w > .5 && length(pos.xz - S.xz - sd.xz*1.5) < 4.){        // the lander's own shadow, long in the low sun
      float tl = .02;
      for(int i = 0; i < 20; i++){ float d = mapLander(pos + sd*tl - S).x; if(d < .004){ shd = 0.; break; } tl += d; if(tl > 6.) break; }
    }
    float alb = .095 + .055*fbm(pos.xz*.8 + 2.) + .025*vn(pos.xz*9.);
    float rs = length(pos.xz - S.xz), near = D.w*smoothstep(1.6, 0., D.y);
    alb += .05*near*exp(-rs*rs*1.4)*(.6 + .4*vn(vec2(atan(pos.z - S.z, pos.x - S.x)*9., rs*3. - uT*4.)));
    col = vec3(1.,.985,.96)*alb*(max(dot(n, sd), 0.)*shd*2.9 + .010 + .012*n.y);
    col += vec3(1.,.72,.46)*D.w*smoothstep(1.4, .1, D.y)*step(.03, D.y)*exp(-rs*rs*3.)*.10;
  }
  if(D.w > .5){
    float to = 0.; vec2 h = vec2(1.);
    for(int i = 0; i < 60; i++){ h = mapLander(ro + rd*to - S); if(h.x < .001*max(to, 1.) || to > min(ts, 40.)) break; to += h.x*.9; }
    if(h.x < .003*max(to, 1.) && to < ts){
      vec3 q = ro + rd*to - S; vec2 e2 = vec2(.003, 0.);
      vec3 n = normalize(vec3(mapLander(q + e2.xyy).x - mapLander(q - e2.xyy).x, mapLander(q + e2.yxy).x - mapLander(q - e2.yxy).x, mapLander(q + e2.yyx).x - mapLander(q - e2.yyx).x));
      col = lit(h.y, q*3., n, rd, sd, vec3(1.,.98,.95)*2.6, vec3(.012,.012,.014)); ts = to;
    }
    if(D.y > .03){            // the descent engine
      float tt; float d = segRay(ro, rd, S + vec3(0., .14, 0.), S - vec3(0., min(D.y, .9) + .05, 0.), tt);
      if(tt > 0. && tt < ts + .4) col += vec3(1.,.80,.58)*(exp(-d*d/.0012)*1.3 + exp(-d*d/.02)*.08);
      col += lampAt(ro, rd, ts + .4, S + vec3(0., .13, 0.), vec3(1.,.92,.80)*1.6, .028);
    }
  }
  return col;
}

vec3 studioBg(vec2 p){
  vec3 c = vec3(.0030,.0036,.0046);
  float r = length((p - vec2(.38, .02))*vec2(1., 1.25));
  c += vec3(.0080,.0098,.0122)*exp(-r*r*3.2);
  c += vec3(.0030,.0036,.0046)*exp(-abs(p.y + .23)*16.)*smoothstep(-.6, .5, p.x) + vec3(.0022,.0027,.0034)*smoothstep(-.20, -.5, p.y);
  return c;
}
vec2 mapRack(vec3 q, float pull){
  vec2 d = vec2(max(sdBox(q, vec3(1.22,.52,.62)) - .012, -sdBox(q - vec3(0., 0., -.52), vec3(1.15,.46,.42))), 4.);
  for(int i = 0; i < 6; i++){ float fi = float(i); float b = sdBox(q - vec3(-.965 + fi*.386, 0., -.34 - (i == 3 ? pull : 0.)), vec3(.172,.44,.30)) - .008; if(b < d.x) d = vec2(b, 10. + fi); }
  return opU(d, vec2(q.y + .545, 20.));
}
vec3 rackShade(vec3 q, vec3 n, vec3 rd, float m, float pull, float fresh, float fault){
  vec3 L1 = normalize(vec3(-.55, .80, -.50)), L2 = normalize(vec3(.75, .25, .60));
  float sh = 1., tq = .03;
  for(int i = 0; i < 18; i++){ float d = mapRack(q + L1*tq, pull).x; sh = min(sh, 10.*d/tq); tq += max(d, .04); if(sh < .02 || tq > 4.) break; }
  sh = clamp(sh, 0., 1.);
  vec3 alb = m > 19.5 ? vec3(.020,.022,.026) : m > 9.5 ? vec3(.20,.21,.22)*(.85 + .3*vn(q.xy*vec2(6., 140.))) : vec3(.040,.044,.050);
  vec3 em = vec3(0.);
  if(m > 9.5 && m < 19.5){
    float fi = m - 10.; vec3 lq = q - vec3(-.965 + fi*.386, 0., -.34 - (fi == 3. ? pull : 0.));
    if(n.z < -.5){
      if(abs(lq.x) < .115 && lq.y > -.34 && lq.y < .02) alb *= mix(.12, 1., step(.45, fract(lq.y*24.)));
      if(abs(lq.y - .31) < .014 && abs(lq.x) < .09) alb = vec3(.42,.43,.44);
      float ld = length(lq.xy - vec2(0., .17));
      vec3 lc = fi == 1. && fault > .02 ? vec3(1.,.22,.12)*(.5 + .5*sin(uT*20.))*2.2 : vec3(.14,.80,.94)*1.5;
      em += lc*smoothstep(.022, .012, ld) + lc*exp(-ld*ld*260.)*.25;
      if(fi == 1.) alb = mix(alb, vec3(.30,.07,.04), fault*.45*step(.5, fract(lq.y*9. + floor(uT*12.)*.37)));
    }
    if(fi == 3.) em += vec3(.14,.80,.94)*(.10*step(.02, pull) + .28*fresh*(1. - smoothstep(9.5, 11., uE.x)))*(.4 + .6*abs(n.x));
  }
  vec3 c = alb*(vec3(1.,.97,.92)*max(dot(n, L1), 0.)*sh*1.25 + vec3(.14,.50,.60)*max(dot(n, L2), 0.)*.55 + vec3(.05,.06,.08));
  c += vec3(1.,.97,.92)*pow(max(dot(reflect(rd, n), L1), 0.), 30.)*.18*sh;
  return c + em;
}
vec3 rackScene(vec2 p, vec4 E){
  float b = E.x, pull = .95*smoothstep(2., 3.6, b)*(1. - smoothstep(6.2, 7.8, b)), fresh = smoothstep(6.2, 7.8, b), fault = smoothstep(4.8, 5.1, b)*(1. - smoothstep(8., 9.2, b));
  vec2 pp = p - vec2(.37, -.03);
  vec3 ro = vec3(-2.5 + .25*sin(uT*.13), 1.35, -4.6), ww = normalize(vec3(.2, -.05, -.2) - ro), uu = normalize(cross(vec3(0., 1., 0.), ww)), vv = cross(ww, uu);
  vec3 rd = normalize(pp.x*uu + pp.y*vv + 1.95*ww), col = studioBg(p);
  float t = 0.; vec2 h = vec2(1.);
  for(int i = 0; i < 80; i++){ h = mapRack(ro + rd*t, pull); if(h.x < .0015 || t > 14.) break; t += h.x*.9; }
  if(h.x < .004){
    vec3 q = ro + rd*t; vec2 e = vec2(.0025, 0.);
    vec3 n = normalize(vec3(mapRack(q + e.xyy, pull).x - mapRack(q - e.xyy, pull).x, mapRack(q + e.yxy, pull).x - mapRack(q - e.yxy, pull).x, mapRack(q + e.yyx, pull).x - mapRack(q - e.yyx, pull).x));
    vec3 c = rackShade(q, n, rd, h.y, pull, fresh, fault);
    if(h.y > 19.5){               // the bench: a soft reflection of what stands on it
      vec3 rr = reflect(rd, n); float t2 = .02; vec2 h2 = vec2(1.);
      for(int i = 0; i < 40; i++){ h2 = mapRack(q + rr*t2, pull); if(h2.x < .003 || t2 > 5.) break; t2 += h2.x; }
      if(h2.x < .006 && h2.y < 19.5){ vec3 q2 = q + rr*t2; c += rackShade(q2, normalize(q2 - vec3(q2.x, 0., q2.z*.2)), rr, h2.y, pull, fresh, fault)*.20*exp(-t2*.9); }
      c *= smoothstep(9., 2., length(q.xz));
    }
    col = mix(c, col, smoothstep(6., 13., t));
  }
  return col;
}
// From digital model to working system: the same spacecraft, a scan plane passing across it.
vec3 techScene(vec2 p, vec4 E){
  float b = E.x; vec2 pp = p - vec2(.40, .02); vec3 col = studioBg(p);
  float sx = mix(-.80, .92, smoothstep(1., 6.6, b));
  vec3 ro = vec3(pp/.42, -5.), rd = vec3(0., 0., 1.);
  float yaw = -.62 + uT*.20, cy = cos(yaw), sy = sin(yaw), cp = cos(.36), sp = sin(.36);
  mat3 R = mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy)*mat3(1., 0., 0., 0., cp, sp, 0., -sp, cp);
  vec3 o = R*ro, d = R*rd; float t = 0.; vec2 h = vec2(1.);
  col += vec3(.010,.030,.036)*exp(-pow(length(vec2(pp.x, (pp.y + .40)*3.2))/.42, 2.));
  if(length(ro.xy) < 2.4){
    for(int i = 0; i < 60; i++){ h = mapSat(o + d*t); if(h.x < .002 || t > 9.) break; t += h.x*.9; }
    if(h.x < .004){
      vec3 q = o + d*t; vec2 e = vec2(.004, 0.);
      vec3 n = normalize(vec3(mapSat(q + e.xyy).x - mapSat(q - e.xyy).x, mapSat(q + e.yxy).x - mapSat(q - e.yxy).x, mapSat(q + e.yyx).x - mapSat(q - e.yyx).x));
      vec3 solid = lit(h.y, q, n, d, R*normalize(vec3(-.5, .65, -.58)), vec3(1.,.97,.92)*1.5, vec3(.05,.07,.10)) + vec3(.14,.50,.60)*max(dot(n, R*normalize(vec3(.8, .1, .5))), 0.)*.10;
      float fr = pow(1. - abs(dot(n, d)), 2.2), g = max(smoothstep(.94, 1., abs(sin(q.x*26.))), max(smoothstep(.94, 1., abs(sin(q.y*26.))), smoothstep(.94, 1., abs(sin(q.z*26.)))));
      vec3 holo = vec3(.14,.80,.94)*(fr*.9 + g*.55 + .05)*(.75 + .25*sin(pp.y*380. + uT*6.));
      col = mix(solid, mix(col, holo, .9), smoothstep(-.012, .012, pp.x - sx));
    }
  }
  float sa = smoothstep(.6, 1.2, b)*(1. - smoothstep(6.6, 7.4, b)), dx = pp.x - sx;
  col += vec3(.14,.80,.94)*sa*(exp(-dx*dx/.000012)*1.1 + exp(-dx*dx/.0012)*.16)*smoothstep(.62, .30, abs(pp.y));
  return col;
}
// Context, Reasoning, Action: three planes of glass. D: centre x, centre y, spacing, half width, in stage units.
vec2 boxHit(vec3 ro, vec3 rd, vec3 c, vec3 b){ vec3 m = 1./rd, n = m*(ro - c), k = abs(m)*b, t1 = -n - k, t2 = -n + k; float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z); return (tN > tF || tF < 0.) ? vec2(-1.) : vec2(tN, tF); }
vec3 glassScene(vec2 p, vec4 D, vec4 E){
  float b = E.x, pit = -.50, cp = cos(pit), sp = sin(pit), sep = smoothstep(6.4, 7.8, b), out_ = 1. - smoothstep(14.7, 15.4, b);
  vec3 col = studioBg(p), Cp = vec3(0., 3., -5.2), rd = camRay(p, pit, 0.);
  int actv = b < 7. ? -1 : b < 9. ? 0 : b < 11. ? 1 : 2;
  vec3 cs[3]; float hw = 0.;
  for(int i = 0; i < 3; i++){
    float py = D.y + (float(i) - 1.)*D.z*mix(.16, 1., sep), wy = 5.2*(1.55*sp + py*cp)/(1.55*cp - py*sp), zc = wy*sp + 5.2*cp;
    cs[i] = Cp + vec3(D.x*zc/1.55, wy, 5.2); hw = D.w*zc/1.55;
  }
  for(int i = 0; i < 3; i++){
    vec3 bb = vec3(hw, .030, hw*.60); vec2 th = boxHit(Cp, rd, cs[i], bb);
    if(th.x < 0.) continue;
    vec3 q = Cp + rd*th.x - cs[i];
    float lit_ = float(i) <= float(actv) ? 1. : 0., hot = i == actv ? 1. : 0.;
    float edge = 1. - smoothstep(0., .035, min(bb.x - abs(q.x), bb.z - abs(q.z)));
    float top = step(bb.y - .004, q.y), fr = pow(1. - abs(rd.y), 3.);
    vec2 gq = abs(fract(q.xz/(hw*.25)) - .5); float grid = smoothstep(.47, .5, max(gq.x, gq.y))*top;
    vec3 n1 = vec3(-.38*hw, 0., -.06*hw), n2 = vec3(.34*hw, 0., .12*hw);
    float nodes = exp(-dot(q.xz - n1.xz, q.xz - n1.xz)*90./(hw*hw)*4.) + exp(-dot(q.xz - n2.xz, q.xz - n2.xz)*90./(hw*hw)*4.);
    vec3 tint = mix(vec3(.80,.82,.80), vec3(.14,.80,.94), hot);
    vec3 c = vec3(.006,.010,.014) + vec3(.020,.030,.040)*fr + tint*(edge*(.10 + .55*lit_) + grid*(.02 + .08*lit_) + nodes*top*lit_*.9);
    c += vec3(.14,.80,.94)*hot*.035*top;
    col = mix(col, c + col*.35*(1. - edge), (.62 + .3*edge)*out_*smoothstep(0., .6, b));
  }
  for(int i = 0; i < 2; i++){                 // what rises from one plane to the next
    float a = float(i + 1) <= float(actv) ? out_ : 0.; if(a < .01) continue;
    for(int k = 0; k < 3; k++){
      vec3 o = vec3((float(k) - 1.)*.44*hw, 0., 0.), c0 = cs[i] + o + vec3(0., .03, 0.), c1 = cs[i + 1] + o - vec3(0., .03, 0.);
      float tt; float d = segRay(Cp, rd, c0, c1, tt);
      col += vec3(.14,.80,.94)*exp(-d*d/.00035)*.55*a;
      col += lampAt(Cp, rd, 1e5, mix(c0, c1, fract(uT*.9 + float(k)*.31 + float(i)*.5)), vec3(.89,.99,1.)*a, .030);
    }
  }
  return col;
}
vec3 studio(vec2 p, vec4 D, vec4 E){
#if MODE == 6
  return rackScene(p, E);
#elif MODE == 9
  return techScene(p, E);
#else
  return glassScene(p, D, E);
#endif
}

float seg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0., 1.)); }
float towerD(vec2 q){          // a lattice tower, base at the origin, one unit tall
  float w0 = .15, w1 = .032, d = min(seg2(q, vec2(-w0, 0.), vec2(-w1, 1.)), seg2(q, vec2(w0, 0.), vec2(w1, 1.)));
  for(int i = 0; i < 5; i++){ float y0 = float(i)*.2, y1 = y0 + .2, a0 = mix(w0, w1, y0), a1 = mix(w0, w1, y1); d = min(d, min(seg2(q, vec2(-a0, y0), vec2(a1, y1)), seg2(q, vec2(a0, y0), vec2(-a1, y1)))); }
  return min(d, min(seg2(q, vec2(-.34, .90), vec2(.34, .90)), seg2(q, vec2(-.28, .68), vec2(.28, .68))));
}
float steel(vec2 p, float gy){ // towers and the lines between them, as coverage
  float c = 0.; vec3 X = vec3(.20, .50, .80), Hh = vec3(.27, .31, .27);
  for(int i = 0; i < 3; i++){ c = max(c, 1. - smoothstep(.0016, .0034, towerD((p - vec2(X[i], gy))/Hh[i])*Hh[i])); }
  for(int i = 0; i < 2; i++) for(int l = 0; l < 2; l++) for(int sgn = -1; sgn <= 1; sgn += 2){
    float fl = float(l), k0 = fl > .5 ? .68 : .90, a0 = (fl > .5 ? .28 : .34)*float(sgn);
    vec2 a = vec2(X[i] + a0*Hh[i], gy + k0*Hh[i]), bq = vec2(X[i + 1] + a0*Hh[i + 1], gy + k0*Hh[i + 1]);
    float u = clamp((p.x - a.x)/(bq.x - a.x), 0., 1.), y = mix(a.y, bq.y, u) - .030*4.*u*(1. - u);
    c = max(c, (1. - smoothstep(.0007, .0018, abs(p.y - y)))*step(a.x, p.x)*step(p.x, bq.x));
  }
  return c;
}
vec3 night(vec2 p, vec4 E){
  float gy = -.18, b = E.x, flash = b > 4. ? exp(-(b - 4.)*5.)*(.6 + .4*sin(uT*90.)) : 0.;
  vec3 c = mix(vec3(.0016,.0024,.0040), vec3(.0085,.0105,.0140), exp(-abs(p.y - gy)*4.5));
  c += vec3(.026,.019,.014)*fbm(vec2(p.x*1.5, p.y*3.) + uT*.01)*smoothstep(.55, -.1, p.y)*.45;
  for(int i = 0; i < 10; i++){
    float fi = float(i), lx = -.30 + fi*.125 + .05*sin(fi*7.3), ly = gy + .010 + .034*h12(vec2(fi, 1.)), I = .45 + .55*h12(vec2(fi, 4.));
    if(fi > 4.5) I *= 1. - smoothstep(4., 4.08, b)*(1. - smoothstep(6. + (fi - 5.)*.55, 6.25 + (fi - 5.)*.55, b));   // the right half goes dark, then returns
    vec3 lc = mod(fi, 3.) < 1. ? vec3(1.,.60,.28) : vec3(.72,.84,1.);
    vec2 d = p - vec2(lx, ly);
    c += lc*I*(.000085/(dot(d, d) + .000018) + exp(-dot(d, d)*900.)*.22)*.5;
    if(p.y < gy){
      float dy = gy - p.y, dx = p.x - lx + sin(p.y*260. + uT*3. + fi)*.004*(1. + dy*8.);
      c += lc*I*exp(-dx*dx*2600./(1. + dy*30.))*exp(-dy*5.5)*.20*(.55 + .45*vn(vec2(p.x*90., p.y*30. + uT*2.)));
    }
  }
  vec2 fp = vec2(.65, gy + .245), fd = p - fp;
  c += vec3(.70,.84,1.)*flash*(exp(-dot(fd, fd)*900.)*3. + exp(-dot(fd, fd)*14.)*.10 + .012);
  float st = steel(p, gy);
  if(p.y < gy){
    c *= mix(.62, 1., exp(-(gy - p.y)*6.));
    float dy = gy - p.y; vec2 rp = vec2(p.x + sin(p.y*240. + uT*3.)*.003*(1. + dy*10.), 2.*gy - p.y);
    c = mix(c, c*.25, steel(rp, gy)*exp(-dy*5.)*.75);
  }
  c = mix(c, vec3(.0010,.0012,.0016) + vec3(.020,.016,.012)*smoothstep(.2, -.2, p.y - gy)*.4, st);
  for(int i = 0; i < 3; i++){ vec2 tp = vec2(.20 + float(i)*.30, gy + (i == 1 ? .31 : .27) + .006), d = p - tp; c += vec3(1.,.12,.08)*(.5 + .5*sin(uT*3.2 + float(i)*2.))*(exp(-dot(d, d)*40000.)*1.6 + exp(-dot(d, d)*2500.)*.18); }
  for(int L = 0; L < 2; L++){
    float fl = float(L), sc = 1. + fl*.8;
    vec2 q = vec2((p.x + p.y*.10)*(70.*sc), p.y*(2.6*sc) + uT*(2.4 + fl*.9)), id = floor(q), f = fract(q);
    c += vec3(.16,.19,.22)*smoothstep(.10, 0., abs(f.x - .5))*smoothstep(0., .08, f.y)*smoothstep(.55, .25, f.y)*step(.62, h12(id + fl*19.))*(.10 - .035*fl)*(1. + 4.*flash);
  }
  return c;
}

vec3 satOver(vec3 col, vec2 p, vec4 D, vec4 E){     // D: x, y, scale, yaw. E.z pitch, E.w visibility
  vec3 ro = vec3((p - D.xy)/D.z, -4.), rd = vec3(0., 0., 1.);
  if(E.w < .01 || length(ro.xy) > 2.3) return col;
  float cy = cos(D.w), sy = sin(D.w), cp = cos(E.z), sp = sin(E.z);
  mat3 R = mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy)*mat3(1., 0., 0., 0., cp, sp, 0., -sp, cp);
  vec3 o = R*ro, d = R*rd; float t = 0.; vec2 h = vec2(1.);
  for(int i = 0; i < 60; i++){ h = mapSat(o + d*t); if(h.x < .002 || t > 8.) break; t += h.x*.9; }
  if(h.x < .004){
    vec3 q = o + d*t; vec2 e = vec2(.004, 0.);
    vec3 n = normalize(vec3(mapSat(q + e.xyy).x - mapSat(q - e.xyy).x, mapSat(q + e.yxy).x - mapSat(q - e.yxy).x, mapSat(q + e.yyx).x - mapSat(q - e.yyx).x));
    vec3 c = lit(h.y, q, n, d, R*normalize(vec3(.55, .45, -.60)), vec3(1.,.96,.90)*1.5, vec3(.03,.05,.10));
    c += vec3(.10,.22,.50)*max(-dot(n, R*vec3(0., 1., 0.)), 0.)*.6*matCol(h.y, q);
    col = mix(col, c, E.w);
  }
  return col;
}
vec3 render(vec2 p, vec4 A, vec4 B, vec4 C, vec4 D, vec4 E, float obj){
#if MODE == 1
  vec3 c = planet(p, A, B, C); return obj > .5 ? satOver(c, p, D, E) : c;
#elif MODE == 2
  return deck(p, A, B, C);
#elif MODE == 3
  return dusk(p, A, B, C, D, E, obj);
#elif MODE == 4
  return sea(p, A, B, C);
#elif MODE == 5
  return lunar(p, A, B, obj > .5 ? D : vec4(0.));
#elif MODE == 6 || MODE == 9 || MODE == 10
  return studio(p, D, E);
#elif MODE == 7
  return night(p, E);
#else
  return vec3(.00010,.00013,.00016);
#endif
}
#if MODE == 8
// The close: the six domains as six strips, falling into one seam. A: convergence, seam y, time, fade. B.x: how far to dim under the labels
vec3 stack(vec2 p, vec4 A, vec4 B){
  float c = A.x, u = (p.y - A.y)/max(1. - c, .004) + A.y, f = (.42 - u)/.14, k = floor(f);
  if(k < 0. || k > 5.) return vec3(.00010,.00013,.00016);
  float v = f - k - .5, ly = -v*.28;
  vec2 q = vec2(p.x, ly); vec4 Z = vec4(0.); vec3 col;
  if(k < .5) col = planet(q + vec2(0., -.25), vec4(0., -2.95, 2.7, .5 + A.z*.012), vec4(.50, -.280, 1., .5), vec4(.06, .08, -1., 1.));
  else if(k < 1.5) col = deck(q + vec2(0., .10), vec4(0., 3.4, A.z*.8, -.30), Z, vec4(.035, 0., 0., 0.));
  else if(k < 2.5) col = dusk(q + vec2(0., .10), vec4(3.5, 3.0, 8. + A.z*.2, -.24), vec4(.12, 1., 2.4, 0.), vec4(.028, 0., -.25, 0.), Z, Z, 0.);
  else if(k < 3.5) col = dusk(q + vec2(0., -.02), vec4(-4.5, .5, A.z*.2, -.03), vec4(.12, 1., 2.4, 0.), vec4(.028, 0., -.25, 0.), Z, Z, 0.);
  else if(k < 4.5) col = sea(q + vec2(0., .10), vec4(1.2, .18, 10., 0.), Z, vec4(1., 0., 0., 0.));
  else col = sea(q + vec2(0., -.05), vec4(8.9, -.30, 10., 1.), Z, vec4(1., 0., 0., 0.));
  col = mix(col, mix(min(col, vec3(.010)), col, smoothstep(.15, .40, abs(p.x))), B.x);
  float edge = (.5 - abs(v))*.14*(1. - c);
  col = col*A.w*(1. + 2.2*c*c) + vec3(.14,.80,.94)*exp(-pow(edge/.0016, 2.))*(.55 + .45*c)*A.w;
  return col;
}
#endif

void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
#if MODE == 8
  vec3 col = stack(p, uA, uB);
#else
  vec3 col = render(p, uA, uB, uC, uD, uE, uObj);
#endif
  col *= uFx.w;
  col = 1. - exp(-col*1.7);
  col = pow(col, vec3(1./2.2));
  col = mix(col, col*vec3(.96,1.,1.05), .5*(1. - col.g));
  col *= mix(.66, 1., smoothstep(1.25, .30, length(p*vec2(.62, 1.2))));
  col += uFx.y*vec3(.89,.99,1.);
  col *= uFx.x;
  col += (h12(gl_FragCoord.xy + fract(uT*7.13)*311.7) - .5)*uFx.z;
  outColor = vec4(clamp(col, 0., 1.), 1.);
}`;
