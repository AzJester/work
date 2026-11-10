/* The picture. One fragment shader with seven renderers, all computed per pixel:
   1 planet from orbit, 2 cloud deck at dusk, 3 terrain and ocean at dusk, 4 underwater and seabed,
   5 lunar surface, 6 studio, 7 night rain. Two renderers can be mixed for a transition. */
const ASTRION_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes; uniform float uT;
uniform float uMode, uMode2, uMix;
uniform vec4 uA, uB, uC, uA2, uB2, uC2;
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
  for(int s = 0; s < 2; s++){
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
float marchH(vec3 ro, vec3 rd, vec3 T, float tmax, int kind){
  float t = .03;
  for(int i = 0; i < 84; i++){
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
/* 3: A cam x, y, z, pitch. B yaw, amplitude, seed, coast offset. C fog density, cloud whiteout, sun azimuth, spare */
vec3 dusk(vec2 p, vec4 A, vec4 B, vec4 C){
  vec3 ro = A.xyz, rd = camRay(p, A.w, B.x), T = B.yzw;
  vec3 sd = normalize(vec3(.78 + C.z, .056, 1.));
  vec3 col = skyCol(rd, sd);
  if(rd.y > 0.){
    vec2 cu = rd.xz/(rd.y + .14)*.9 + vec2(uT*.004, 0.);
    float cl = smoothstep(.50, .86, fbm(cu*1.3));
    col = mix(col, col*1.15 + vec3(.22,.10,.045)*pow(max(dot(rd, sd), 0.), 2.) + .010, cl*.6*smoothstep(0., .14, rd.y));
  }
  vec3 fogc = skyBase(normalize(vec3(rd.x, .025, rd.z)), sd);
  float tw = rd.y < -.0005 ? -ro.y/rd.y : 1e5;
  float t = marchH(ro, rd, T, min(tw, 80.), 0);
  if(t > 0.) col = terrainShade(ro + rd*t, rd, t, T, sd, fogc, C.x);
  else if(tw < 400.){
    vec3 pos = ro + rd*tw;
    vec2 wv = pos.xz*1.9; float tt = uT*.55, e = .06;
    float w0 = fbm2(wv + vec2(tt, tt*.4)) + .45*fbm2(wv*2.7 - vec2(tt*.7, tt));
    vec2 g = vec2(fbm2(wv + vec2(tt + e, tt*.4)) + .45*fbm2(wv*2.7 + vec2(e*2.7, 0.) - vec2(tt*.7, tt)), fbm2(wv + vec2(tt, tt*.4 + e)) + .45*fbm2(wv*2.7 + vec2(0., e*2.7) - vec2(tt*.7, tt))) - w0;
    vec3 n = normalize(vec3(-g.x*2.2, 1. + tw*.06, -g.y*2.2));
    vec3 rf = reflect(rd, n); rf.y = abs(rf.y) + .002; rf = normalize(rf);
    float fr = .025 + .975*pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 refl = skyCol(rf, sd);
    float tr = marchH(pos + vec3(0., .02, 0.), rf, T, 26., 0);
    if(tr > 0.) refl = mix(vec3(.010,.010,.011), skyBase(normalize(vec3(rf.x, .025, rf.z)), sd), 1. - exp(-tr*C.x*2.));
    col = mix(vec3(.0040,.014,.030), refl, fr);
    col += vec3(1.,.62,.32)*pow(max(dot(rf, sd), 0.), 260.)*3.2*step(tr, 0.);
    col = mix(col, fogc, 1. - exp(-tw*C.x*.75));
  }
  return mix(col, vec3(.150,.155,.170), C.y);
}
/* 2: above a cloud deck. A cam x, height, z, pitch. B yaw. C fog density, whiteout, sun azimuth, spare */
vec3 deck(vec2 p, vec4 A, vec4 B, vec4 C){
  vec3 ro = A.xyz, rd = camRay(p, A.w, B.x), sd = normalize(vec3(.78 + C.z, .056, 1.));
  vec3 col = skyCol(rd, sd);
  if(rd.y > .0) col += stars(p*1.3 + 3.)*smoothstep(.10, .7, rd.y)*.35;
  vec3 fogc = skyBase(normalize(vec3(rd.x, .03, rd.z)), sd);
  float t = marchH(ro, rd, vec3(0.), 90., 1);
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
  col += vec3(.085,.26,.29)*sh*exp(-rl*1.15)*exp(-dep*.26)*1.5*C.x + vec3(.05,.17,.19)*exp(-rl*1.7)*exp(-dep*.22)*C.x;
  float far = 1e5;
  if(rd.y < -.01){
    float tb = (bed - dep)/(-rd.y); vec3 pos = rd*tb; far = tb;
    float rip = .5 + .5*sin(pos.x*7. + fbm(pos.xz*.8)*6.);
    vec3 sand = vec3(.090,.084,.066)*(.50 + .50*fbm(pos.xz*2.1))*(.82 + .18*rip);
    float lb = exp(-bed*.15);
    vec3 lit = sand*vec3(.34,.80,.86)*lb*(.55 + caust(pos.xz*.9, uT*.7)*.9)*2.2;
    float cx = .95 + .55*sin(pos.z*.33) + .2*sin(pos.z*.9 + 1.), dc = abs(pos.x - cx), tube = smoothstep(.080, .058, dc);
    lit = mix(lit, vec3(.006,.007,.008) + vec3(.05,.07,.08)*smoothstep(.06, 0., dc)*lb*2.5, tube);
    lit *= 1. - .45*smoothstep(.30, .08, dc)*(1. - tube);
    float pulse = pow(.5 + .5*sin(pos.z*1.5 - uT*5.), 14.);
    lit += vec3(.14,.80,.94)*A.w*(exp(-dc*dc*34.)*(.10 + 1.6*pulse) + tube*(.12 + .5*pulse));
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

/* ---------- 5: the lunar surface. A cam x, height, z, pitch. B yaw, earth x, earth y, earth radius ---------- */
vec3 lunar(vec2 p, vec4 A, vec4 B){
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
  float t = marchH(ro, rd, vec3(0.), 140., 2);
  if(t > 0.){
    vec3 pos = ro + rd*t, n = fieldN(pos.xz, vec3(0.), 2, .012 + .003*t);
    float shd = 1., ts = .08;
    for(int i = 0; i < 22; i++){ vec3 q = pos + sd*ts; float hh = q.y - lunarH(q.xz, 3); shd = min(shd, 9.*hh/ts); ts += max(hh, .08); if(shd < .01) break; }
    shd = clamp(shd, 0., 1.);
    float alb = .095 + .055*fbm(pos.xz*.8 + 2.) + .025*vn(pos.xz*9.);
    col = vec3(1.,.985,.96)*alb*(max(dot(n, sd), 0.)*shd*2.9 + .010 + .012*n.y);
  }
  return col;
}

vec3 studio(vec2 p){
  vec3 c = vec3(.0030,.0036,.0046);
  float r = length((p - vec2(.38, .02))*vec2(1., 1.25));
  c += vec3(.0080,.0098,.0122)*exp(-r*r*3.2);
  c += vec3(.0030,.0036,.0046)*exp(-abs(p.y + .23)*16.)*smoothstep(-.6, .5, p.x) + vec3(.0022,.0027,.0034)*smoothstep(-.20, -.5, p.y);
  return c;
}

vec3 night(vec2 p){
  float gy = -.18;
  vec3 c = mix(vec3(.0016,.0024,.0040), vec3(.0085,.0105,.0140), exp(-abs(p.y - gy)*4.5));
  c += vec3(.026,.019,.014)*fbm(vec2(p.x*1.5, p.y*3.) + uT*.01)*smoothstep(.55, -.1, p.y)*.45;
  for(int i = 0; i < 10; i++){
    float fi = float(i), lx = -.30 + fi*.125 + .05*sin(fi*7.3), ly = gy + .010 + .034*h12(vec2(fi, 1.)), I = .45 + .55*h12(vec2(fi, 4.));
    vec3 lc = mod(fi, 3.) < 1. ? vec3(1.,.60,.28) : vec3(.72,.84,1.);
    vec2 d = p - vec2(lx, ly);
    c += lc*I*(.000085/(dot(d, d) + .000018) + exp(-dot(d, d)*900.)*.22)*.5;
    if(p.y < gy){
      float dy = gy - p.y, dx = p.x - lx + sin(p.y*260. + uT*3. + fi)*.004*(1. + dy*8.);
      c += lc*I*exp(-dx*dx*2600./(1. + dy*30.))*exp(-dy*5.5)*.20*(.55 + .45*vn(vec2(p.x*90., p.y*30. + uT*2.)));
    }
  }
  if(p.y < gy) c *= mix(.62, 1., exp(-(gy - p.y)*6.));
  for(int L = 0; L < 2; L++){
    float fl = float(L), sc = 1. + fl*.8;
    vec2 q = vec2((p.x + p.y*.10)*(70.*sc), p.y*(2.6*sc) + uT*(2.4 + fl*.9)), id = floor(q), f = fract(q);
    c += vec3(.16,.19,.22)*smoothstep(.10, 0., abs(f.x - .5))*smoothstep(0., .08, f.y)*smoothstep(.55, .25, f.y)*step(.62, h12(id + fl*19.))*(.10 - .035*fl);
  }
  return c;
}

vec3 render(float m, vec2 p, vec4 A, vec4 B, vec4 C){
  if(m < .5) return vec3(.00010,.00013,.00016);
  if(m < 1.5) return planet(p, A, B, C);
  if(m < 2.5) return deck(p, A, B, C);
  if(m < 3.5) return dusk(p, A, B, C);
  if(m < 4.5) return sea(p, A, B, C);
  if(m < 5.5) return lunar(p, A, B);
  if(m < 6.5) return studio(p);
  return night(p);
}

void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = render(uMode, p, uA, uB, uC);
  if(uMix > .002) col = mix(col, render(uMode2, p, uA2, uB2, uC2), uMix);
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
