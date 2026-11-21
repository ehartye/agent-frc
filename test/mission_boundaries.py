"""Adverse and admissible controls for commissioned custody, onset and solid numerical consistency."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import write,pin
from transfer_mission import commissioned,verify_terminal


class MissionBoundaries(unittest.TestCase):
    def test_mission_recipient_and_dwell(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        article=BRepPrimAPI_MakeBox(1.,1.,1.).Shape()
        holder=BRepPrimAPI_MakeBox(gp_Pnt(-10,0,0),1.,1.,1.).Shape()
        mount=lambda k:dict(solid=k,body=k,occurrence=k+":1")
        donor=mount("carrier");recipient=mount("shelf")
        reg=dict(installedOccurrences=[dict(path=k+":1",solids=[k],nativeBodyNames={k:k}) for k in ("carrier","shelf")])
        sys=dict(archive={"sha256":"a"},step={"sha256":"b"})
        case=dict(id="carry",duty="delivery",windowS=[0,.3])
        task=dict(id="transport",piece=dict(id="piece",solid="all",file={"sha256":"p"}),traceToleranceMm=1e-6,cases=[case])
        req=dict(archiveSha256="a",stepSha256="b",article=dict(id="piece",solid="all",sha256="p"),donor=donor,recipient=recipient,
                 cases={"carry":dict(duty="delivery",windowS=[0,.3])},mode="handoff",regionFrame="saved-root",terminalBoundsMm=[4,0,0,6,1,1],
                 minRecipientWeightFraction=1.,donorClearanceMm=.5,positionToleranceMm=1e-6,dwellS=.1)
        intent={"transferCriteria":{"transport":req}}
        commissioned(intent,sys,task,reg)
        with self.assertRaisesRegex(ValueError,"name alone"):commissioned({},sys,task,reg)
        broken=deepcopy(intent);broken["transferCriteria"]["transport"]["recipient"]["occurrence"]="another"
        with self.assertRaisesRegex(ValueError,"native body"):commissioned(broken,sys,task,reg)
        frames=[dict(custody=c,timeS=t,offsetsMm={"piece":[x,0,0]}) for t,x,c in ((0,0,"held"),(.2,4,"received"),(.3,5,"received"))]
        obs=[dict(acceptedId="piece",contacts=[dict(body="shelf",forceOnPieceN=[0,0,1])]) for _ in frames]
        raw=dict(duty="delivery",receiver="shelf",holder="carrier",observations=obs,massKg=1)
        trace=dict(pieceId="piece",holder="carrier",frames=frames)
        def end(r=raw,shape=holder):
            verify_terminal(req,r,trace,{"gravityMmS2":1000},article,lambda *_:shape,None)
        end()
        with self.assertRaisesRegex(ValueError,"different recipient"):end(dict(raw,receiver="carrier"))
        weak=deepcopy(raw);weak["observations"][1]["contacts"][0]["forceOnPieceN"]=[0,0,.05]
        with self.assertRaisesRegex(ValueError,"share"):end(weak)
        frames[1]["offsetsMm"]["piece"]=[1,0,0]
        with self.assertRaisesRegex(ValueError,"region"):end()

    def test_independent_admission_clock_preserves_negative_and_missing_ticks(self):
        from transfer_mission import identity, terminal_observation
        raw = dict(case="deliver", pieceId="tile-A", windowS=[1, 1.02])
        mission = dict(recipient={"solid": "ledge"}, dwellS=.02, terminalObservations={
            "deliver": dict(channel="four switches engaged", originNs=0, periodNs=10_000_000)})
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            acquisition = write(root, "acquisition.json", {"switches": [True, True, True]})
            samples = [dict(tick=i, timeNs=i*10_000_000, acceptedId="tile-A") for i in (100, 101, 102)]
            record = dict(schema="agent-frc/terminal-observation@1", missionSha256=identity(mission),
                          executionSha256="bound execution", sourceSha256=acquisition["sha256"],
                          case="deliver", pieceId="tile-A", recipient=mission["recipient"],
                          channel="four switches engaged", samples=samples)
            def inspect(**change):
                ref = write(root, "observation.json", {**record, **change})
                return terminal_observation(root, mission, raw,
                    {"terminalObservation": {"source": acquisition, "record": ref}}, "bound execution")
            self.assertEqual(inspect()["status"], "pass")
            self.assertEqual(inspect(samples=samples[::2])["status"], "open")
            self.assertEqual(inspect(samples=[])["status"], "open")
            self.assertEqual(terminal_observation(root, mission, raw, {}, "bound execution")["status"], "open")
            self.assertIsNone(terminal_observation(root, {}, raw, {}, "bound execution"))
            for neg in (None, "tile-B"):
                self.assertEqual(inspect(samples=[samples[0], dict(samples[1], acceptedId=neg)])["status"], "fail")
            for wrong in (dict(pieceId="tile-B"), dict(channel="substitute"), dict(sourceSha256="other"),
                          dict(executionSha256="other"), dict(recipient={"solid":"other ledge"})):
                with self.assertRaisesRegex(ValueError, "differs"):
                    inspect(**wrong)
            with self.assertRaisesRegex(ValueError, "shifted"):
                inspect(samples=[dict(samples[0], timeNs=samples[0]["timeNs"]+1), *samples[1:]])
            mission["dwellS"] += .000000001
            self.assertEqual(inspect(missionSha256=identity(mission))["status"], "open")
            (root/"acquisition.json").write_text("[]", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "Changed evidence"):
                inspect()

    def test_conservative_material_and_separation(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        from interface_consistency import measure
        a=BRepPrimAPI_MakeBox(10.,10.,10.).Shape()
        b=BRepPrimAPI_MakeBox(gp_Pnt(9,0,0),2.,10.,10.).Shape()
        case=dict(pair=["stock","mate"],basis="Registered stud intersection",maxOverlapMm3=0,volumeToleranceMm3=1e-6,boundaryReserveMm=.001,
            interiorPointsMm=[[9.5,2,2],[9.5,2,2],[9.5,5,5]],partitions=[dict(subject="stock",frame="installed",direction=[0,0,1],
            originMm=[5,5,0],innerRadiusMm=1,outerRadiusMm=2,lengthMm=4)])
        result=measure({"stock":a,"mate":b},case)
        self.assertEqual(result["status"],"fail");self.assertEqual(len(result["disjointInteriorBalls"]),2)
        self.assertGreater(result["certifiedLowerBoundMm3"],1)
        far=BRepPrimAPI_MakeBox(gp_Pnt(12,0,0),2.,10.,10.).Shape()
        self.assertEqual(measure({"stock":a,"mate":far},case)["status"],"pass")

    def test_ambiguous_zero_needs_pair_evidence(self):
        from unittest.mock import patch
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        from interface_consistency import measure
        stock=BRepPrimAPI_MakeBox(10.,10.,10.).Solid()
        shapes={"stock":stock,"mate":BRepPrimAPI_MakeBox(gp_Pnt(9,0,0),2.,10.,10.).Solid()}
        case=dict(pair=["stock","mate"],basis="Synthetic near-interface discrepancy",maxOverlapMm3=0.,
                  volumeToleranceMm3=1e-5,boundaryReserveMm=.001,interiorPointsMm=[[5,5,5]],
                  partitions=[dict(subject="stock",frame="installed",originMm=[4,5,0],
                                   direction=[0,0,1],innerRadiusMm=1,outerRadiusMm=2,lengthMm=4)])
        with patch("component_shape.boolean_measure",return_value=(0.,True)):
            unbounded=measure(shapes,case)
            self.assertEqual(unbounded["status"],"open")
            self.assertEqual(unbounded["directCommonMm3"],0.)
            self.assertLess(unbounded["partitions"][0]["residualMm3"],1e-8)
            scope=dict(region=dict(startMm=[0,0,0],endMm=[0,0,10],pilotRadiusMm=1.,
                                   majorRadiusMm=2.,classificationSlackMm=.001),
                       forbiddenProbes=[dict(centerMm=[9.5,5.,5.],radiusMm=.2)])
            bounded=dict(case,maxOverlapMm3=250.,excludedPointsMm={"mate":[[10.5,5,5]]})
            allowed=measure(shapes,bounded)
            self.assertLess(allowed["commonUpperBoundMm3"],250.)
            self.assertEqual(allowed["status"],"pass")
            outside=measure(shapes,dict(bounded,forbiddenWitnesses=scope))
            self.assertEqual(outside["status"],"fail")
            self.assertTrue(outside["forbiddenWitnesses"][0]["sharedInterior"])
            bad=dict(scope,forbiddenProbes=[dict(centerMm=[1.5,0,5.],radiusMm=.1)])
            self.assertEqual(measure(shapes,dict(bounded,forbiddenWitnesses=bad))["status"],"open")
        touch=dict(shapes,mate=BRepPrimAPI_MakeBox(gp_Pnt(10,0,0),2.,10.,10.).Solid())
        self.assertEqual(measure(touch,case)["status"],"open")

    def test_excluded_witness_bounds_large_common(self):
        from unittest.mock import patch
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        from interface_consistency import measure
        stock=BRepPrimAPI_MakeBox(10.,10.,10.).Solid()
        mate=BRepPrimAPI_MakeBox(gp_Pnt(6,0,0),10.,10.,10.).Solid()
        shapes={"stock":stock,"mate":mate}
        case=dict(pair=["stock","mate"],basis="Registered offset blocks",maxOverlapMm3=1000.,
                  boundaryReserveMm=.001,volumeToleranceMm3=1e-5,interiorPointsMm=[[8,5,5]],
                  excludedPointsMm={"stock":[[3,5,5],[3,5,5]],"mate":[[13,5,5]]},
                  partitions=[dict(subject="stock",frame="installed",originMm=[4,5,0],
                                   direction=[0,0,1],innerRadiusMm=1,outerRadiusMm=2,lengthMm=4)])
        actual=measure(shapes,case)
        self.assertEqual(actual["status"],"pass")
        self.assertAlmostEqual(actual["directCommonMm3"],400.)
        self.assertAlmostEqual(actual["commonUpperBoundMm3"],1000.-4*3.141592653589793*2.999**3/3)
        self.assertEqual(len(actual["excludedMaterial"]["stock"]["disjointBalls"]),1)
        with patch("component_shape.boolean_measure",return_value=(999.,True)):
            suspect=measure(shapes,dict(case,pair=["mate","stock"]))
            self.assertEqual(suspect["status"],"open")
            self.assertFalse(suspect["numericallyConsistent"])
            self.assertEqual(suspect["directCommonMm3"],999.)
            self.assertEqual(measure(shapes,dict(case,maxOverlapMm3=0.))["status"],"fail")
        bad=measure(shapes,dict(case,excludedPointsMm={"stock":[[6,5,5],[8,5,5]]}))
        self.assertEqual(bad["status"],"open")
        self.assertEqual(bad["excludedMaterial"]["stock"]["disjointBalls"],[])

    def test_cosmetic_and_directional_chassis_paths(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        from structural_path import evaluate,route_exists
        route=dict(archiveSha256="a",stepSha256="s",members=["mount","rail"],loaded="mount",chassis="rail",
                   loadN=10.,case="vertical duty",direction=[0,0,-1],appliedForces=[dict(pointMm=[1,1,1],forceN=[0,0,-10])],gravityMmS2=[0,0,0],appliedMomentsNmm=[])
        self.assertEqual(route_exists(route,[("mount","skin"),("skin","rail")]),[])
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            shapes={"mount":BRepPrimAPI_MakeBox(gp_Pnt(0,0,1),2.,2.,1.).Shape(),"rail":BRepPrimAPI_MakeBox(2.,2.,1.).Shape()}
            capacity=dict(archiveSha256="a",stepSha256="s",case=route["case"],direction=route["direction"],kind="bearing-compression",
                          allowablePressureMPa=3.,basis="Synthetic material allowable",**{"from":"mount","to":"rail"})
            route["interfaces"]=[{"from":"mount","to":"rail","capacitySource":write(root,"capacity.json",capacity)}]
            edges={frozenset(shapes)}
            self.assertEqual(evaluate(root,route,shapes,edges,"rail","a","s")["status"],"pass")
            route["direction"]=capacity["direction"]=[0,0,1]
            route["appliedForces"][0]["forceN"]=[0,0,10]
            route["interfaces"][0]["capacitySource"]=write(root,"capacity.json",capacity)
            self.assertEqual(evaluate(root,route,shapes,edges,"rail","a","s")["status"],"fail")

    def test_matching_native_and_neutral_can_share_a_wrong_mount(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        from mount_datums import verify
        sites=[[0,0,0],[2,0,0],[0,2,0]]
        body={"nativeBodyNames":{"housing":"original body"}}
        row=dict(path="mount:1",name="original body",worldTransform=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
        plan=dict(mode="fixed",mountDatums=[dict(occurrence="mount:1",toleranceMm=.01,basis="Three drawing corners",
                features=[dict(solid="housing",body="original body",localMm=p,worldMm=p) for p in sites])])
        def check(x):
            row["worldTransform"][3]=x
            solid=BRepPrimAPI_MakeBox(gp_Pnt(x,0,0),2.,2.,2.).Shape()
            verify(plan,{"mount:1":body},[row],{"housing":solid})
        check(0)
        with self.assertRaisesRegex(ValueError,"misses"):check(2)
        with self.assertRaisesRegex(ValueError,"every fixed"):
            verify(dict(plan,mountDatums=[]),{"mount:1":body},[row],{})

    def test_zero_force_and_opening_are_distinct(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
        from release_onset import evaluate
        from showcase_contacts import load_solids
        with TemporaryDirectory() as tmp:
            root=Path(tmp);file=root/"stock.step"
            writer=STEPControl_Writer();writer.Transfer(BRepPrimAPI_MakeBox(2.,2.,2.).Shape(),STEPControl_AsIs);writer.Write(str(file))
            shape=next(iter(load_solids(file)[0]));ref=pin(root,file.name)
            article=dict(file=ref,id="inspection block",solid=shape)
            common=dict(article=article,step=ref,donor=shape,pivotsMm=[[0,0,0],[0,0,0]])
            def pose(x):return [1,0,0,x,0,1,0,0,0,0,1,0,0,0,0,1]
            for xs,result in (([1.9,2.1,2.3],"pass"),([1.9,2.1,1.95],"fail"),([1.9,2,2.3],"fail")):
                frames=[dict(timeS=i,articlePose=pose(x),donorPose=pose(0),donorReactionN=0) for i,x in enumerate(xs)]
                execution=write(root,"observed.json",dict(common,frames=frames,basis="Registered finite poses"))
                study=dict(common,schema="agent-frc/release-onset@1",basis="Measured separation",releaseTimeS=1,trajectoryErrorMm=0,execution=execution)
                self.assertEqual(evaluate(root,study)["status"],result)
