import sys, re, json, requests, concurrent.futures as cf, pyarrow.parquet as pq, fsspec, shapely.wkb
BASE="https://overturemaps-us-west-2.s3.amazonaws.com/"
REL=sys.argv[1]; THEME=sys.argv[2]; TYPE=sys.argv[3]; OUT=sys.argv[4]
W,S,E,N=map(float,sys.argv[5].split(','))
lst=requests.get(BASE+f"?list-type=2&prefix=release/{REL}/theme={THEME}/type={TYPE}/").text
keys=re.findall(r"<Key>([^<]+\.parquet)</Key>",lst)
print(len(keys),"files",file=sys.stderr)
fs=fsspec.filesystem("http", client_kwargs={"trust_env":True})
def scan(k):
    try:
        f=fs.open(BASE+k,"rb",block_size=1<<20)
        pf=pq.ParquetFile(f)
        md=pf.metadata; sch=pf.schema_arrow
        names=[md.schema.column(i).path for i in range(md.num_columns)]
        ix={n:i for i,n in enumerate(names)}
        hits=[]
        for rg in range(md.num_row_groups):
            r=md.row_group(rg)
            st=lambda n: r.column(ix[n]).statistics
            xmin=st("bbox.xmin"); ymin=st("bbox.ymin"); xmax=st("bbox.xmax"); ymax=st("bbox.ymax")
            if xmin.min> E or xmax.max< W or ymin.min> N or ymax.max< S: continue
            hits.append(rg)
        out=[]
        if hits:
            cols=[c for c in ["id","geometry","bbox","height","num_floors","class","subtype","names","is_underground","min_height","roof_shape","roof_height","facade_color","roof_color","sources"] if c in sch.names]
            t=pf.read_row_groups(hits,columns=cols).to_pylist()
            for row in t:
                b=row["bbox"]
                if b["xmin"]>E or b["xmax"]<W or b["ymin"]>N or b["ymax"]<S: continue
                g=shapely.wkb.loads(row["geometry"])
                row["geometry"]=g.__geo_interface__
                row.pop("bbox",None)
                if row.get("names"): row["names"]={"primary":row["names"].get("primary")}
                if row.get("sources"): row["sources"]=[s.get("dataset") for s in row["sources"]]
                out.append(row)
        return k,len(hits),out
    except Exception as e:
        return k,-1,str(e)
feats=[]
with cf.ThreadPoolExecutor(24) as ex:
    for i,(k,n,o) in enumerate(ex.map(scan,keys)):
        if n==-1: print("ERR",k,o,file=sys.stderr); continue
        if n: print(k[-40:],n,len(o),file=sys.stderr); feats+=o
json.dump({"type":"FeatureCollection","features":[{"type":"Feature","geometry":r.pop("geometry"),"properties":r} for r in feats]},open(OUT,"w"))
print("done",len(feats),file=sys.stderr)
