import math, io, os, sys, numpy as np, requests, concurrent.futures as cf
from PIL import Image
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin, from_bounds
LAT0,LON0=33.434277778,-112.011583333
crs=f"+proj=tmerc +lat_0={LAT0} +lon_0={LON0} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
Z=12
def tile(lat,lon):
    n=2**Z; x=(lon+180)/360*n; y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n; return x,y
x0,y0=tile(LAT0+0.55,LON0-0.66); x1,y1=tile(LAT0-0.55,LON0+0.66)
xs=range(int(x0),int(x1)+1); ys=range(int(y0),int(y1)+1)
def get(xy):
    x,y=xy
    for i in range(4):
        try:
            r=requests.get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png",timeout=30); r.raise_for_status()
            a=np.asarray(Image.open(io.BytesIO(r.content)).convert('RGB')).astype(np.float64)
            return xy,a[...,0]*256+a[...,1]+a[...,2]/256-32768
        except Exception as e: err=e
    raise err
W=len(xs)*256; H=len(ys)*256; mos=np.zeros((H,W),np.float32)
with cf.ThreadPoolExecutor(16) as ex:
    for (x,y),a in ex.map(get,[(x,y) for x in xs for y in ys]):
        mos[(y-ys[0])*256:(y-ys[0]+1)*256,(x-xs[0])*256:(x-xs[0]+1)*256]=a
print("mosaic",mos.shape,mos.min(),mos.max(),file=sys.stderr)
R=6378137.0; 
def merc(tx,ty): n=2**Z; return tx/n*2*math.pi*R-math.pi*R, math.pi*R-ty/n*2*math.pi*R
L,T=merc(xs[0],ys[0]); Rr,B=merc(xs[-1]+1,ys[-1]+1)
src_tr=from_bounds(L,B,Rr,T,W,H)
def out(half,n):
    dst=np.zeros((n,n),np.float32); res=2*half/(n-1)
    tr=from_origin(-half-res/2,half+res/2,res,res)
    reproject(mos,dst,src_transform=src_tr,src_crs="EPSG:3857",dst_transform=tr,dst_crs=crs,resampling=Resampling.bilinear)
    return dst
np.save("dem_inner.npy",out(15360,513)); np.save("dem_outer.npy",out(60000,301))
d=np.load("dem_inner.npy"); print("inner",d.min(),d.max(),d[256,256],file=sys.stderr)
