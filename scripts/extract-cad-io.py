"""Read-only native STEP properties for a deliberately nonphysical rotating-sideplate IO fixture."""
import sys, json, hashlib, pathlib, importlib.metadata
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box

def extract(source, density):
    raw=pathlib.Path(source).read_bytes()
    sha=hashlib.sha256(raw).hexdigest()
    if sha!='867f68b8ada523487db3cb5289418a1498cd8239f580828783ace7575c18d283': raise ValueError('Only independently reviewed original STEP snapshot supported')
    if not 100<=density<=20000: raise ValueError('Explicit finite assumed density required')
    reader=STEPControl_Reader()
    if reader.ReadFile(str(source))!=IFSelect_RetDone or reader.TransferRoots()!=1: raise ValueError('STEP transfer failed')
    exp=TopExp_Explorer(reader.OneShape(),TopAbs_SOLID); bodies=[]
    while exp.More():
        shape=exp.Current();box=Bnd_Box();BRepBndLib.AddOptimal_s(shape,box,False,False)
        lo,hi=box.CornerMin(),box.CornerMax();bounds=[lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z()];bodies.append((shape,bounds));exp.Next()
    if len(bodies)!=2: raise ValueError('Expected exactly two original solids')
    chosen=[x for x in bodies if all(abs(a-b)<1e-6 for a,b in zip(x[1],[0,0,0,480,260,7]))]
    if len(chosen)!=1: raise ValueError('Unique reviewed low-Z solid missing')
    props=GProp_GProps();BRepGProp.VolumeProperties_s(chosen[0][0],props)
    volume=props.Mass();center=props.CentreOfMass();matrix=props.MatrixOfInertia()
    if abs(volume-872016.6373025907)>1e-3: raise ValueError('Independent native volume cross-check failed')
    inertia=[[matrix.Value(i,j)*density*1e-15 for j in range(1,4)] for i in range(1,4)]
    return {'schema':'frc-cad-io-fixture/v1','sourceSha256':sha,'sourceBytes':len(raw),'bodyCount':len(bodies),'selectedBoundsMm':chosen[0][1],'volumeMm3':volume,'centroidMm':[center.X(),center.Y(),center.Z()],'inertiaTensorKgM2':inertia,'massKg':volume*density*1e-9,'inertiaZKgM2':inertia[2][2],'densityKgPerM3':density,'densityBasis':'explicit-unvalidated-uniform-assumption','lengthUnit':'mm','unitBasis':'reviewed exact STEP context plus independent native dimensions','inertiaFrame':'centroidal axes parallel file XYZ','numericTolerancePurpose':'body selection and native numerical cross-check only, not manufacturing uncertainty','axis':'centroidal-Z-parallel-file-Z','fixtureRole':'deliberately-nonphysical-rotating-sideplate-integration-fixture','ocpVersion':importlib.metadata.version('cadquery-ocp'),'extractorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'engineeringAcceptance':'blocked'}

if __name__=='__main__':
    if len(sys.argv)!=4: raise SystemExit('Usage: extract-cad-io.py original.step assumedDensityKgM3 outputDirectory')
    out=pathlib.Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
    if (out/'cad-properties.json').exists() or (out/'cad.properties').exists(): raise ValueError('Refuse overwrite of extraction evidence')
    result=extract(sys.argv[1],float(sys.argv[2]));(out/'cad-properties.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    keys=['schema','sourceSha256','inertiaZKgM2','massKg','densityKgPerM3','densityBasis','fixtureRole','engineeringAcceptance']
    (out/'cad.properties').write_text('\n'.join(k+'='+str(result[k]) for k in keys)+'\n',encoding='utf-8')
    print(json.dumps(result))

