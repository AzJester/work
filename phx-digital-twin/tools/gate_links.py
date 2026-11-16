import json, math, sys, collections
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree
from pyproj import Transformer
P='../data/airport.json'; D='build/'
ap=json.load(open(P)); G=ap['graph']; V=G['v']; E=G['e']
tr=Transformer.from_crs("EPSG:4326","+proj=tmerc +lat_0=33.434277778 +lon_0=-112.011583333 +k=1 +x_0=0 +y_0=0 +datum=WGS84",always_xy=True)
bl=[]
for f in json.load(open(D+'buildings.geojson'))['features']:
    g=f['geometry']
    if g['type']!='Polygon': continue
    c=g['coordinates'][0]; lon,lat=c[0]
    x,y=tr.transform(lon,lat)
    if not(-2700<x<2700 and -1600<y<1500): continue
    poly=Polygon([tr.transform(a,b) for a,b in c])
    if poly.area>250 and poly.is_valid: bl.append(poly.buffer(4))
B=unary_union(bl); print('blocking polys',len(bl),file=sys.stderr)
adj=collections.defaultdict(list)
for a,b,L,k,z in E: adj[a].append(b); adj[b].append(a)
# main component = all graph (already single comp)
# stub components: original airport lines type 1/51 near gates not in graph -> use lines directly
lines=[list(zip(l['pts'][0::2],l['pts'][1::2])) for l in ap['lines'] if l['t'] in (1,51)]
vt=STRtree([Point(c) for c in V])
# exclude runway vertices from link targets
rwv=set()
for a,b,L,k,z in E:
    if z>=0: rwv.add(a); rwv.add(b)
newV=list(V); newE=list(E)
def addv(p): newV.append([round(p[0],1),round(p[1],1)]); return len(newV)-1
ok=0
for g in ap['gates']:
    S=g['p']; h=math.radians(g['h']); d=(math.sin(h),math.cos(h))
    if g.get('vd',99)<=25:
        g['q']=g['v']; q=V[g['v']]
        # alley dir: from q towards neighbor farther from stand
        nb=max(adj[g['v']],key=lambda j:math.dist(V[j],S)) if adj[g['v']] else None
        m=((V[nb][0]-q[0]),(V[nb][1]-q[1])) if nb is not None else (-d[0],-d[1])
        Lm=math.hypot(*m) or 1; g['m']=[round(m[0]/Lm,3),round(m[1]/Lm,3)]; ok+=1; continue
    # stub line: a type-1 line with an endpoint within 20 m of stand
    best=None
    for ln in lines:
        for end,other in ((ln[0],ln[-1]),(ln[-1],ln[0])):
            dd=math.dist(end,S)
            if dd<20 and (best is None or dd<best[0]): best=(dd,ln if end==ln[0] else ln[::-1])
    if best and math.dist(best[1][-1],S)>15:
        Q=best[1][-1]
    else:
        Q=(S[0]-d[0]*45,S[1]-d[1]*45)
    # find link target with clear line of sight
    cands=sorted([int(j) for j in vt.query(Point(Q).buffer(600)) if int(j) not in rwv],key=lambda j:math.dist(V[j],Q))
    tgt=None
    for j in cands[:800]:
        seg=LineString([Q,V[j]])
        if seg.length<1 or not seg.intersects(B): tgt=j; break
    if tgt is None: print('no link',g['name'],file=sys.stderr); continue
    qi=addv(Q); tgt=int(tgt); newE.append([qi,tgt,round(math.dist(Q,V[tgt]),1),-1,-1])
    g['q']=qi
    m=(V[tgt][0]-Q[0],V[tgt][1]-Q[1]); Lm=math.hypot(*m) or 1
    g['m']=[round(m[0]/Lm,3),round(m[1]/Lm,3)]; ok+=1
print('gates linked',ok,'of',len(ap['gates']),file=sys.stderr)
G['v']=newV; G['e']=newE
# arrival exits & departure entries per runway end
rws=[]
for ri,r in enumerate(ap['runways']):
    a,b=r['ends']; L=math.dist(a['p'],b['p']); ux,uy=(b['p'][0]-a['p'][0])/L,(b['p'][1]-a['p'][1])/L
    on=[]  # vertices on centerline
    for i,p in enumerate(newV):
        dx,dy=p[0]-a['p'][0],p[1]-a['p'][1]; al=dx*ux+dy*uy; lat=-dx*uy+dy*ux
        if -5<=al<=L+5 and abs(lat)<6: on.append((al,i))
    on.sort()
    adjn=collections.defaultdict(list)
    for x,y,Ld,k,z in newE: adjn[x].append((y,k)); adjn[y].append((x,k))
    exits=[(round(al,1),i) for al,i in on if any(k!=ri for _,k in adjn[i])]
    for e,(sgn) in ((a,1),(b,-1)):
        e['exits']=[[ (al if sgn==1 else round(L-al,1)), i] for al,i in exits]
        e['exits'].sort()
        e['entry']=e['exits'][0][1] if e['exits'] else None
    print(r['ends'][0]['id'],len(on),'cl verts',[x[0] for x in exits],file=sys.stderr)
json.dump(ap,open(P,'w'),separators=(',',':'))
