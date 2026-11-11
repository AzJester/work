import json, struct, math, numpy as np, collections, sys
from PIL import Image, ImageEnhance
from shapely.geometry import shape, Polygon, Point
from shapely.ops import transform as stransform
from pyproj import Transformer
D='build/'
O='../data/'
ELEV0=1131*0.3048
tr=Transformer.from_crs("EPSG:4326","+proj=tmerc +lat_0=33.434277778 +lon_0=-112.011583333 +k=1 +x_0=0 +y_0=0 +datum=WGS84",always_xy=True)
PL=(-2650,2650,-1550,1450)  # airport plane x0,x1,n0,n1
# ---------- imagery
a=np.load(D+'s2_10m.npy').astype(np.float32)  # 3,n,n
out=np.empty_like(a)
for b in range(3):
    lo,hi=np.percentile(a[b],[0.3,99.7]); out[b]=np.clip((a[b]-lo)/(hi-lo),0,1)
out=out**0.92
im=Image.fromarray((out.transpose(1,2,0)*255).astype(np.uint8))
im=ImageEnhance.Color(im).enhance(0.88)
im.save(O+'imagery.jpg',quality=84,optimize=True,progressive=False)
# ---------- terrain
def smooth(t): t=np.clip(t,0,1); return t*t*(3-2*t)
inn=np.load(D+'dem_inner.npy')-ELEV0; n=inn.shape[0]; half=15360
xs=np.linspace(-half,half,n); ns=np.linspace(half,-half,n)  # row 0 = north
X,N=np.meshgrid(xs,ns)
dx=np.maximum(np.maximum(PL[0]-X,X-PL[1]),0); dn=np.maximum(np.maximum(PL[2]-N,N-PL[3]),0)
dist=np.hypot(dx,dn); w=smooth(dist/500.0)
inn=(-0.8)*(1-w)+np.minimum(inn,inn)*w
inn[dist==0]=-0.8
out_=np.load(D+'dem_outer.npy')-ELEV0; m=out_.shape[0]; H2=60000
xo=np.linspace(-H2,H2,m); no=np.linspace(H2,-H2,m); XO,NO=np.meshgrid(xo,no)
inside=(np.abs(XO)<half-400)&(np.abs(NO)<half-400); out_[inside]-=60
with open(O+'terrain.bin','wb') as f:
    f.write(struct.pack('<4i',n,half,m,H2)); f.write(np.round(inn*10).astype('<i2').tobytes()); f.write(np.round(out_*10).astype('<i2').tobytes())
# ---------- airport
ap=json.load(open(D+'airport.json'))
def r1(v): return [round(x,1) for x in v]
for p in ap['pavements']: p['rings']=[r1(r) for r in p['rings']]
for l in ap['lines']+ap['lights']: l['pts']=r1(l['pts'])
ap['boundary']=[r1(b) for b in ap['boundary']]
ap['gates']=[g for g in ap['gates'] if not g['name'].startswith('Terminal 2') and g['name']!='Fuel Farm']
ap['meta']={"elev_ft":1131,"lat0":33.434277778,"lon0":-112.011583333,"plane":PL,"imagery_half":15360}
# sky train
t=json.load(open(D+'transport.geojson'))
st=[]
for f in t['features']:
    p=f['properties']
    if (p.get('names') or {}).get('primary')=='PHX Sky Train' and f['geometry']['type']=='LineString':
        st.append(r1([v for lon,lat in f['geometry']['coordinates'] for v in tr.transform(lon,lat)]))
ap['skytrain']=st
json.dump(ap,open(O+'airport.json','w'),separators=(',',':'))
# ---------- buildings
bd=json.load(open(D+'buildings.geojson'))
kept=[]; stats=collections.Counter()
def proj(g): return stransform(lambda x,y,z=None: tr.transform(x,y),g)
for f in bd['features']:
    g=f['geometry']
    if g['type']=='MultiPolygon': polys=[Polygon(c[0]) for c in g['coordinates']]
    elif g['type']=='Polygon': polys=[Polygon(g['coordinates'][0])]
    else: continue
    p=f['properties']; h=p.get('height'); fl=p.get('num_floors')
    if h is None: h=fl*3.5 if fl else None
    for poly in polys:
        q=proj(poly)
        c=q.centroid; x,y=c.x,c.y
        if abs(x)>half-200 or abs(y)>half-200: continue
        area=q.area
        inair=PL[0]<x<PL[1] and PL[2]<y<PL[3]
        hh=h if h is not None else (4.0 if area<300 else 7.0)
        if p.get('is_underground'): continue
        if inair and hh>60 and area<3000: stats['tower_skip']+=1; continue
        keep = inair or hh>=14 or area>=2500 or (hh>=9 and area>=900)
        if not keep: continue
        nm=(p.get('names') or {}).get('primary') or ''
        if nm=='Terminal 4' and hh<18: hh=18.0
        cls=(p.get('class') or '')+'|'+(p.get('subtype') or '')
        kind=0
        if 'parking' in cls: kind=1
        elif 'hangar' in cls or 'industrial' in cls or 'warehouse' in cls: kind=2
        elif inair and area>4000: kind=3
        elif hh>=40: kind=4
        elif any(k in cls for k in ('house','residential','apartments')): kind=5
        q=q.simplify(0.6,preserve_topology=True)
        if q.is_empty or q.geom_type!='Polygon': continue
        co=list(q.exterior.coords)[:-1]
        if len(co)<3 or len(co)>400: continue
        mh=p.get('min_height') or 0
        kept.append((co,hh,mh,kind)); stats['kind%d'%kind]+=1
print('buildings kept',len(kept),stats,file=sys.stderr)
with open(O+'buildings.bin','wb') as f:
    f.write(struct.pack('<I',len(kept)))
    for co,hh,mh,kind in kept:
        f.write(struct.pack('<HHHBB',len(co),min(65535,int(round(hh*10))),min(65535,int(round(mh*10))),kind,0))
        f.write(np.array([[round(x*2),round(y*2)] for x,y in co],dtype='<i2').tobytes())
import os
import base64
for stem in ('terrain','buildings'):
    open(O+stem+'.b64.txt','w').write(base64.b64encode(open(O+stem+'.bin','rb').read()).decode()); os.remove(O+stem+'.bin')
for fn in os.listdir(O): print(fn,os.path.getsize(O+fn),file=sys.stderr)
