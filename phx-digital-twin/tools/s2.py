import os, sys, numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image
os.environ["CURL_CA_BUNDLE"]="/root/.ccr/ca-bundle.crt"; os.environ["GDAL_DISABLE_READDIR_ON_OPEN"]="EMPTY_DIR"
LAT0,LON0=33.434277778,-112.011583333
crs=f"+proj=tmerc +lat_0={LAT0} +lon_0={LON0} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
RES=float(sys.argv[2]); HALF=float(sys.argv[3]); OUT=sys.argv[1]
n=int(2*HALF/RES)
dst=np.zeros((3,n,n),np.uint8); tr=from_origin(-HALF,HALF,RES,RES)
dates=sys.argv[4].split(",") if len(sys.argv)>4 else ["S2B_{t}_20250627_0_L2A"]
for date,(t,p) in [(d,tp) for d in dates for tp in [("12SUB","12/S/UB"),("12SVB","12/S/VB"),("12SUC","12/S/UC"),("12SVC","12/S/VC")]]:
    name=date.format(t=t)
    url=f"/vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/{p}/2025/{name.split('_')[2][4:6].lstrip('0')}/{name}/TCI.tif"
    print(url,file=sys.stderr)
    try:
      src=rasterio.open(url)
    except Exception as e:
      print('skip',e,file=sys.stderr); continue
    with src:
        tmp=np.zeros((3,n,n),np.uint8)
        for b in range(3):
            reproject(rasterio.band(src,b+1),tmp[b],dst_transform=tr,dst_crs=crs,resampling=Resampling.lanczos if RES<10 else Resampling.average,src_nodata=0,dst_nodata=0)
        m=(dst.sum(0)==0)&(tmp.sum(0)>0)
        dst[:,m]=tmp[:,m]
        print(t,"filled",m.sum(),file=sys.stderr)
print("empty px",(dst.sum(0)==0).sum(),file=sys.stderr)
np.save(OUT+".npy",dst)
Image.fromarray(dst.transpose(1,2,0)).save(OUT+".png")
