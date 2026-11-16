"""Golden pose formula vectors, generated from the independently reviewed Python contract."""
import importlib.util,pathlib,csv,io
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('contract',ROOT/'scripts/pose-clearance-contract.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def content():
 out=io.StringIO(newline='');w=csv.writer(out,lineterminator='\n');w.writerow(['year','age','q','lateral','yaw','pitch','xError','yError','angleError','angularRate','lateralSpeed','vLower','acceleration','rear','side','permission'])
 for y in m.GEOMETRY:
  for age in [0,.02]:
   for q,lat,yaw,pitch,xe,ye,ae,ar,ls,v,a in [(0,0,0,0,1,1,0,0,0,0,0),(-17.9,0,3,0,0,0,0,0,0,0,0),(0,0,0,10,1,1,2,5,10,980,104000),(0,0,0,0,0,0,0,0,0,-500,0),(0,5,0,0,1,1,0,0,0,0,0)]:
    c=m.certificate(y,q,lat,yaw,pitch,xe,ye,ae,ar,ls,v,a,age+.02);w.writerow([y,age,q,lat,yaw,pitch,xe,ye,ae,ar,ls,v,a,c['rearGateClearanceLowerBoundMm'],c['sideGuideClearanceLowerBoundMm'],int(c['gateAndGuidePermission'])])
 return out.getvalue()
if __name__=='__main__':
 import sys
 p=ROOT/'examples/java-2026-sim/src/test/resources/supervisor-clearance-golden.csv'
 if '--check' in sys.argv:assert p.read_text()==content()
 else:p.write_text(content(),newline='\n')
