"""Read-only native STEP properties for a nominal authentic bare-wheel rotating-load development fixture."""
import sys, json, hashlib, pathlib, importlib.metadata
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box

def shaft_inertia_kgm2(tensor_mm5, volume_mm3, centroid_mm, density):
    # Reviewed bore is the file Z axis. Displacement along that axis contributes zero.
    return (tensor_mm5[2][2]+volume_mm3*(centroid_mm[0]**2+centroid_mm[1]**2))*density*1e-15

def extract(source, density):
    raw=pathlib.Path(source).read_bytes()
    sha=hashlib.sha256(raw).hexdigest()
    if sha!='e5323f8dff336e35b6abcfa970df5be5230fce20badb60c2701b83e9b8bc587d': raise ValueError('Only independently reviewed original STEP snapshot supported')
    if not 100<=density<=20000: raise ValueError('Explicit finite assumed density required')
    reader=STEPControl_Reader()
    if reader.ReadFile(str(source))!=IFSelect_RetDone or reader.TransferRoots()!=1: raise ValueError('STEP transfer failed')
    exp=TopExp_Explorer(reader.OneShape(),TopAbs_SOLID); bodies=[]
    while exp.More():
        shape=exp.Current();box=Bnd_Box();BRepBndLib.AddOptimal_s(shape,box,False,False)
        lo,hi=box.CornerMin(),box.CornerMax();bounds=[lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z()];bodies.append((shape,bounds));exp.Next()
    if len(bodies)!=1: raise ValueError('Expected exactly one reviewed wheel solid')
    chosen=[x for x in bodies if all(abs(a-b)<1e-6 for a,b in zip(x[1],[-46.99,-46.99,0,46.99,46.99,31.75]))]
    if len(chosen)!=1: raise ValueError('Reviewed nominal wheel bounds missing')
    props=GProp_GProps();BRepGProp.VolumeProperties_s(chosen[0][0],props)
    volume=props.Mass();center=props.CentreOfMass();matrix=props.MatrixOfInertia()
    if abs(volume-59886.1232054525)>1e-3: raise ValueError('Independent source-review volume cross-check failed')
    inertia=[[matrix.Value(i,j)*density*1e-15 for j in range(1,4)] for i in range(1,4)]
    shaft_inertia=shaft_inertia_kgm2([[matrix.Value(i,j) for j in range(1,4)] for i in range(1,4)],volume,[center.X(),center.Y(),center.Z()],density)
    if not 0<shaft_inertia<=volume*density*1e-9*(.046991**2): raise ValueError('Shaft inertia outside geometric radial bound')
    return {'schema':'frc-wheel-io-fixture/v1','sourceSha256':sha,'sourceBytes':len(raw),'bodyCount':len(bodies),'selectedBoundsMm':chosen[0][1],'volumeMm3':volume,'centroidMm':[center.X(),center.Y(),center.Z()],'inertiaTensorKgM2':inertia,'massKg':volume*density*1e-9,'inertiaZKgM2':shaft_inertia,'densityKgPerM3':density,'densityBasis':'explicit-unvalidated-uniform-assumption','lengthUnit':'mm','unitBasis':'exact reviewed STEP inch conversion plus independently checked drawing and OCP bounds','inertiaFrame':'centroidal axes parallel file XYZ','numericTolerancePurpose':'body selection and independent numerical source cross-check only, not manufacturing uncertainty','axis':'bore-axis-origin-[0,0,0]mm-direction-[0,0,1]','fixtureRole':'nominal-bare-wheel-rotating-component-development-fixture','ocpVersion':importlib.metadata.version('cadquery-ocp'),'extractorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'engineeringAcceptance':'blocked','component':'AndyMark am-3608 bare Performance Wheel','cadRevision':'SolidWorks2021 AP203 export 2022-01-19T20:23:27','drawingRevision':'Rev4 2022-01-19','materialIdentity':'drawing specifies6061-T6 aluminum; numeric density remains assumed','sourceMismatch':'CAD bore .500in; drawing .501-.506in; nominal CAD is not machining acceptance','omissions':['tread','shaft','hub','fasteners','motor rotor','transmission','bearing losses'],'assemblyInertiaComplete':False,'shaftAxisOriginMm':[0,0,0],'shaftAxisDirection':[0,0,1],'centroidalGeometricTensorMm5':[[matrix.Value(i,j) for j in range(1,4)] for i in range(1,4)]}

if __name__=='__main__':
    if len(sys.argv)!=4: raise SystemExit('Usage: extract-wheel-io.py original.step assumedDensityKgM3 outputDirectory')
    out=pathlib.Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
    if (out/'cad-properties.json').exists() or (out/'cad.properties').exists(): raise ValueError('Refuse overwrite of extraction evidence')
    result=extract(sys.argv[1],float(sys.argv[2]));(out/'cad-properties.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    keys=['schema','sourceSha256','inertiaZKgM2','massKg','densityKgPerM3','densityBasis','fixtureRole','engineeringAcceptance']
    (out/'cad.properties').write_text('\n'.join(k+'='+str(result[k]) for k in keys)+'\n',encoding='utf-8')
    print(json.dumps(result))

