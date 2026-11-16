import sys, json, math
from pyproj import Transformer
tr=Transformer.from_crs("EPSG:4326","+proj=tmerc +lat_0=33.434277778 +lon_0=-112.011583333 +k=1 +x_0=0 +y_0=0 +datum=WGS84",always_xy=True)
def P(lat,lon):
    x,y=tr.transform(float(lon),float(lat)); return (round(x,2),round(y,2))
L=[l.split() for l in open(sys.argv[1]) if l.strip()]
out={"runways":[],"pavements":[],"lines":[],"lights":[],"signs":[],"gates":[],"nodes":[],"edges":[],"windsocks":[],"papi":[],"boundary":[],"misc":{}}
def bez(p0,c0,c1,p1,n):
    pts=[]
    for i in range(1,n+1):
        t=i/n; u=1-t
        if c0 is None and c1 is None: pts.append(p1); break
        if c0 is not None and c1 is not None:
            x=u**3*p0[0]+3*u*u*t*c0[0]+3*u*t*t*c1[0]+t**3*p1[0]; y=u**3*p0[1]+3*u*u*t*c0[1]+3*u*t*t*c1[1]+t**3*p1[1]
        else:
            c=c0 if c0 is not None else c1
            x=u*u*p0[0]+2*u*t*c[0]+t*t*p1[0]; y=u*u*p0[1]+2*u*t*c[1]+t*t*p1[1]
        pts.append((round(x,2),round(y,2)))
    return pts
def read_path(i):
    """read node rows from i; return list of rings (each list of nodes) and next index"""
    rings=[]; cur=[]
    while i<len(L) and L[i][0] in ("111","112","113","114","115","116"):
        r=L[i]; c=r[0]
        p=P(r[1],r[2]); ctl=None; rest=r[3:]
        if c in ("112","114","116"): ctl=P(r[3],r[4]); rest=r[5:]
        codes=[int(v) for v in rest]
        cur.append({"p":p,"c":ctl,"codes":codes})
        if c in ("113","114"): rings.append(("closed",cur)); cur=[]
        if c in ("115","116"): rings.append(("open",cur)); cur=[]
        i+=1
    if cur: rings.append(("open",cur))
    return rings,i
def prev_start(s):
    return []
def segs(nodes,closed):
    """yield (pts, codes_of_start_node) per segment"""
    n=len(nodes); m=n if closed else n-1
    for k in range(m):
        a=nodes[k]; b=nodes[(k+1)%n]
        c0=a["c"]; c1=None
        if b["c"] is not None: c1=(2*b["p"][0]-b["c"][0],2*b["p"][1]-b["c"][1])
        d=math.dist(a["p"],b["p"])
        steps=1 if (c0 is None and c1 is None) else max(2,min(24,int(d/4)))
        yield [a["p"]]+bez(a["p"],c0,c1,b["p"],steps), a["codes"]
i=0
while i<len(L):
    r=L[i]; c=r[0]
    if c=="100":
        w=float(r[1]); e=[]
        for k in (8,17):
            e.append({"id":r[k],"p":P(r[k+1],r[k+2]),"disp":float(r[k+3]),"blast":float(r[k+4]),"mark":int(r[k+5]),"als":int(r[k+6]),"tdz":int(r[k+7]),"reil":int(r[k+8])})
        out["runways"].append({"w":w,"surf":int(r[2]),"shoulder":int(r[3]),"cl":int(r[6]),"edge":int(r[7]),"ends":e}); i+=1
    elif c in ("110","120","130"):
        name=" ".join(r[4:]) if c=="110" else " ".join(r[1:])
        rings,j=read_path(i+1)
        if c=="110":
            polys=[]
            for kind,nodes in rings:
                pts=[]
                for s,_ in segs(nodes,True): pts+=s[1:]
                polys.append([v for p in pts for v in p])
            out["pavements"].append({"surf":int(r[1]),"name":name,"rings":polys})
        if c=="130":
            for kind,nodes in rings:
                pts=[]
                for s,_ in segs(nodes,True): pts+=s[1:]
                out["boundary"].append([v for p in pts for v in p])
        if c in ("110","120"):
            # linear features + lights from node codes (also pavement edges may carry codes)
            for kind,nodes in rings:
                cl=None; curL=None; curLi=None
                for s,codes in segs(nodes,kind=="closed"):
                    lt=[v for v in codes if 0<v<100]; li=[v for v in codes if v>=100]
                    lt=lt[0] if lt else 0; li=li[0] if li else 0
                    start=None
                    for tgt,code,key in ((curL,lt,"lines"),(curLi,li,"lights")):
                        pass
                    # lines
                    if lt:
                        if curL and curL["t"]==lt and tuple(curL["pts"][-2:])==tuple(s[0]): curL["pts"]+= [v for p in s[1:] for v in p]
                        else:
                            curL={"t":lt,"pts":[v for v in prev_start(s)]+[v for p in s for v in p]}; out["lines"].append(curL)
                    else: curL=None
                    if li:
                        if curLi and curLi["t"]==li and tuple(curLi["pts"][-2:])==tuple(s[0]): curLi["pts"]+= [v for p in s[1:] for v in p]
                        else:
                            curLi={"t":li,"pts":[v for v in prev_start(s)]+[v for p in s for v in p]}; out["lights"].append(curLi)
                    else: curLi=None
                    prev_end=s[-1]
        i=j
        continue
    elif c=="20":
        out["signs"].append({"p":P(r[1],r[2]),"h":float(r[3]),"s":int(r[5]),"t":" ".join(r[6:])}); i+=1
    elif c=="19": out["windsocks"].append(P(r[1],r[2])); i+=1
    elif c=="21": out["papi"].append({"p":P(r[1],r[2]),"h":float(r[4]),"rw":r[6]}); i+=1
    elif c=="14": out["misc"]["tower_view"]={"p":P(r[1],r[2]),"hft":float(r[3])}; i+=1
    elif c=="18": out["misc"]["beacon"]=P(r[1],r[2]); i+=1
    elif c=="1300":
        g={"p":P(r[1],r[2]),"h":float(r[3]),"type":r[4],"cats":r[5],"name":" ".join(r[6:])}
        if i+1<len(L) and L[i+1][0]=="1301":
            q=L[i+1]; g["size"]=q[1]; g["op"]=q[2]; g["al"]=" ".join(q[3:])
        out["gates"].append(g); i+=1
    elif c=="1201":
        out["nodes"].append({"p":P(r[1],r[2]),"id":int(r[4]),"n":" ".join(r[5:])}); i+=1
    elif c=="1202":
        e={"a":int(r[1]),"b":int(r[2]),"dir":r[3],"cat":r[4] if len(r)>4 else "","n":" ".join(r[5:]) if len(r)>5 else "","z":[]}
        j=i+1
        while j<len(L) and L[j][0]=="1204": e["z"].append(L[j][1]+":"+L[j][2]); j+=1
        out["edges"].append(e); i=j; continue
    else: i+=1
json.dump(out,open(sys.argv[2],"w"),separators=(",",":"))
print({k:len(v) for k,v in out.items()})
import collections
print("lines",collections.Counter(l["t"] for l in out["lines"]))
print("lights",collections.Counter(l["t"] for l in out["lights"]))
print("surf",collections.Counter(p["surf"] for p in out["pavements"]))
print("edges cat",collections.Counter(e["cat"] for e in out["edges"]))
