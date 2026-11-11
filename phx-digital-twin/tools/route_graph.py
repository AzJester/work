import json, math, sys, collections
import shapely
from shapely.geometry import LineString, Point, MultiLineString, Polygon
from shapely.ops import unary_union, linemerge
from shapely.strtree import STRtree
P='../data/airport.json'
ap=json.load(open(P))
segs=[]
for l in ap['lines']:
    if l['t'] in (1,51):
        pts=list(zip(l['pts'][0::2],l['pts'][1::2]))
        if len(pts)>=2: segs.append(LineString(pts))
N={n['id']:n['p'] for n in ap['nodes']}
for e in ap['edges']:
    if e['a'] in N and e['b'] in N: segs.append(LineString([N[e['a']],N[e['b']]]))
ml=MultiLineString(segs)
# snap endpoints onto nearby lines to create junctions
U=unary_union(ml)
tree=STRtree(segs)
extra=[]
for s in segs:
    for pt in (Point(s.coords[0]),Point(s.coords[-1])):
        idx=tree.query(pt.buffer(4.0))
        best=None
        for i in idx:
            o=segs[i]
            if o is s: continue
            d=o.distance(pt)
            if 0.01<d<4.0 and (best is None or d<best[0]): best=(d,o)
        if best:
            q=best[1].interpolate(best[1].project(pt)); extra.append(LineString([pt,q]))
U=unary_union(segs+extra)
lines=list(U.geoms) if hasattr(U,'geoms') else [U]
# build graph
key=lambda c:(round(c[0],1),round(c[1],1))
V={}; E=collections.defaultdict(dict)
def vid(c):
    k=key(c)
    if k not in V: V[k]=len(V)
    return V[k]
for ln in lines:
    cs=list(ln.coords)
    for a,b in zip(cs[:-1],cs[1:]):
        ia,ib=vid(a),vid(b)
        if ia!=ib:
            L=math.dist(a,b); E[ia][ib]=L; E[ib][ia]=L
coords=[None]*len(V)
for k,i in V.items(): coords[i]=k
# merge near-duplicate vertices (<0.6 m)
pts=[Point(c) for c in coords]; t2=STRtree(pts)
parent=list(range(len(coords)))
def f(i):
    while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
    return i
for i,p in enumerate(pts):
    for j in t2.query(p.buffer(0.6)):
        if j!=i: parent[f(j)]=f(i)
E2=collections.defaultdict(dict)
for a in E:
    for b,L in E[a].items():
        fa,fb=f(a),f(b)
        if fa!=fb: E2[fa][fb]=L; E2[fb][fa]=L
# largest component
seen=set(); comps=[]
for s in E2:
    if s in seen: continue
    st=[s]; seen.add(s); c=[]
    while st:
        u=st.pop(); c.append(u)
        for v in E2[u]:
            if v not in seen: seen.add(v); st.append(v)
    comps.append(c)
comps.sort(key=len,reverse=True)
print('components',[len(c) for c in comps[:8]],file=sys.stderr)
keep=set(comps[0])
# connect smaller comps (>=3 verts) to main if endpoint within 15 m
mainpts=[i for i in keep]; mt=STRtree([Point(coords[i]) for i in mainpts])
for c in comps[1:]:
    if len(c)<2: continue
    best=None
    for u in c:
        p=Point(coords[u])
        for j in mt.query(p.buffer(15)):
            d=p.distance(Point(coords[mainpts[j]]))
            if best is None or d<best[0]: best=(d,u,mainpts[j])
    if best:
        _,u,v=best; E2[u][v]=best[0]; E2[v][u]=best[0]; keep|=set(c)
ids={old:i for i,old in enumerate(sorted(keep))}
out_v=[[coords[o][0],coords[o][1]] for o in sorted(keep)]
# runway rects
rw=[]
for r in ap['runways']:
    a,b=r['ends']; (x0,y0),(x1,y1)=a['p'],b['p']; L=math.dist(a['p'],b['p']); ux,uy=(x1-x0)/L,(y1-y0)/L
    rw.append((x0,y0,ux,uy,L,r['w']/2))
def inr(x,y,margin=0):
    for k,(x0,y0,ux,uy,L,hw) in enumerate(rw):
        dx,dy=x-x0,y-y0; al=dx*ux+dy*uy; lat=-dx*uy+dy*ux
        if -margin<=al<=L+margin and abs(lat)<=hw+margin: return k,al,lat
    return -1,0,0
out_e=[]
for a in keep:
    for b,L in E2[a].items():
        if b in keep and ids[a]<ids[b]:
            mx=(coords[a][0]+coords[b][0])/2; my=(coords[a][1]+coords[b][1])/2
            k,_,_=inr(mx,my,1.0)
            par=-1
            if k>=0:
                x0,y0,ux,uy,LL,hw=rw[k]; dx=coords[b][0]-coords[a][0]; dy=coords[b][1]-coords[a][1]; ll=math.hypot(dx,dy) or 1
                if abs((dx*ux+dy*uy)/ll)>0.97: par=k
            out_e.append([ids[a],ids[b],round(L,1),par,k])
print('graph',len(out_v),len(out_e),file=sys.stderr)
# gates -> nearest vertex
vt=STRtree([Point(c) for c in out_v])
far=0
for g in ap['gates']:
    p=Point(g['p']); j=vt.nearest(p); d=p.distance(Point(out_v[j]))
    g['v']=int(j); g['vd']=round(d,1)
    if d>30: far+=1; print('gate far',g['name'],round(d),file=sys.stderr)
print('gates far',far,file=sys.stderr)
ap['graph']={'v':out_v,'e':out_e}
json.dump(ap,open(P,'w'),separators=(',',':'))
