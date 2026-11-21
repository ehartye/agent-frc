import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import numpy as np
from mechanical_fixture import fixture, write
from collider_comparison import compare, review
from showcase_contacts import load_solids


def pose(x=0, y=0, z=0):
    a=np.eye(4)
    a[:3,3]=[x,y,z]
    return a.ravel().tolist()


class ColliderComparison(unittest.TestCase):
    def test_pinned_placed_box_and_missing_pose(self):
        with TemporaryDirectory() as target:
            root=Path(target)
            fixture(root)
            from mechanical_readiness import read, digest
            lineage=root/'test-lineage.json'
            line=read(lineage)
            ids={}
            load_solids(root/line['step']['file'],ids)
            common=dict(archiveSha256=line['archive']['sha256'],stepSha256=line['step']['sha256'],
                        configuration=line['configuration'],frame='bench',geom='contact')
            model=write(root,'model.json',{'synthetic':'unit test'})
            ref=dict(**common,lineage={'file':lineage.name,'sha256':digest(lineage)},sources=[model],
                     solid='block',identity=ids['block'],kind='box',savedMountToFrameMm=pose(15,5,5),
                     surfacePointsLocalMm={'end':[0,0,5],'side':[5,0,0]},
                     poses={'home':pose(15,5,5),'raised':pose(15,5,9)},
                     tolerance=dict(mountMm=.0001,extentMm=.0001,surfaceMm=.0001,axisLineDeg=.001))
            observed=dict(geom='contact',frame='bench',kind='box',halfSizesM=[.005]*3,
                          geomToFrameM=pose(.015,.005,.005))
            sim=dict(**common,model=model,sources=[model],poses={'home':observed,
                     'raised':dict(observed,geomToFrameM=pose(.015,.005,.009))})
            def run():
                study=dict(schema='agent-frc/collider-comparison@1',reference=write(root,'ref.json',ref),
                           simulation=write(root,'sim.json',sim))
                return review(root,study)
            self.assertEqual(run()['status'],'matched-samples')
            del sim['poses']['raised']
            self.assertEqual(run()['status'],'open')
            sim['poses']['home']=dict(observed,geomToFrameM=pose(.014,.005,.005))
            self.assertEqual(run()['poses']['home']['centerOffsetLocalMm'],[-1.,0.,0.])
            self.assertEqual(run()['status'],'mismatch')
            ref['surfacePointsLocalMm']['side']=[4,0,0]
            with self.assertRaisesRegex(ValueError,'off the trimmed'):
                run()

    def test_equal_outer_edge_masks_offset_and_radius(self):
        obs=dict(kind='cylinder',halfSizesM=[.009,.005],geomToFrameM=pose(.001,0,0))
        tol=dict(mountMm=.01,extentMm=.01,surfaceMm=.01,axisLineDeg=.1)
        out=compare(np.array([-10,-10,-5,10,10,5]),{'near':[10,0,0],'far':[-10,0,0]},
                    pose(),obs,tol)
        self.assertEqual(out['status'],'mismatch')
        self.assertAlmostEqual(out['signedSurfaceDistancesMm']['near'],0)
        self.assertAlmostEqual(out['signedSurfaceDistancesMm']['far'],2)


    def test_diagonal_mount_offset_exceeds_single_radial_limit(self):
        obs=dict(kind='box',halfSizesM=[.005]*3,geomToFrameM=pose(.00008,.00008,0))
        tol=dict(mountMm=.1,extentMm=1,surfaceMm=1,axisLineDeg=1)
        out=compare(np.array([-5,-5,-5,5,5,5]),{'end':[0,0,5]},pose(),obs,tol)
        self.assertEqual(out['status'],'mismatch')
        self.assertAlmostEqual(out['centerOffsetNormMm'],.08*2**.5)
        self.assertEqual(out['centerOffsetLocalMm'],[.08,.08,0])
