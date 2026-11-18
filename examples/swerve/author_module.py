"""Author an original swerve teaching module in Autodesk Fusion. Dimensions are millimetres.
Run as a Fusion script. An optional OUTPUT_FILE global exports to a new local F3D path.
"""
import math
from pathlib import Path
import adsk.core
import adsk.fusion


def run(context):
    app = adsk.core.Application.get()
    previous = app.activeDocument
    output = Path(OUTPUT_FILE) if 'OUTPUT_FILE' in globals() else None
    if output and (output.exists() or not output.parent.is_dir()):
        raise ValueError('Select a new .f3d file in an existing directory.')
    doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    doc.name = 'Swerve module - independent wheel and azimuth axes'
    try:
        design = adsk.fusion.Design.cast(app.activeProduct)
        design.designIntent = adsk.fusion.DesignIntentTypes.HybridDesignIntentType
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        root = design.rootComponent
        maker = adsk.fusion.TemporaryBRepManager.get()
        P, V = adsk.core.Point3D, adsk.core.Vector3D

        def point(values):
            return P.create(*(v / 10 for v in values))

        def cylinder(a, b, radius):
            return maker.createCylinderOrCone(point(a), radius / 10, point(b), radius / 10)

        def box(center, size):
            shape = adsk.core.OrientedBoundingBox3D.create(
                point(center), V.create(1, 0, 0), V.create(0, 1, 0), *(v/10 for v in size))
            return maker.createBox(shape)

        def subtract(body, cutter):
            if not maker.booleanOperation(body, cutter, adsk.fusion.BooleanTypes.DifferenceBooleanType):
                raise RuntimeError('Boolean cut failed')
            return body

        def sleeve(a, b, radius, bore):
            return subtract(cylinder(a,b,radius), cylinder(a,b,bore))

        def occurrence(name):
            occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
            occ.component.name = name
            return occ

        def solids(occ, shapes):
            comp = occ.component
            feature = comp.features.baseFeatures.add()
            feature.name = 'Original module geometry'
            feature.startEdit()
            try:
                for name, shape in shapes:
                    body = comp.bRepBodies.add(shape, feature)
                    body.name = name
            finally:
                feature.finishEdit()

        fixed = occurrence('Chassis mounting interface')
        fork = occurrence('Azimuth carrier and drive motor')
        wheel = occurrence('Driven wheel and pulley')
        plate = box((0, 0, 144), (136, 106, 6))
        subtract(plate, cylinder((0,0,139), (0,0,149), 13))
        subtract(plate, cylinder((51,0,139),(51,0,149),4))
        for x in (-58,58):
            for y in (-44,44):
                subtract(plate,cylinder((x,y,139),(x,y,149),3))
        solids(fixed, [
            ('Mounting plate with four chassis bores',plate),
            ('Steering bearing envelope',sleeve((0,0,141),(0,0,147),13,9)),
            ('Azimuth motor envelope',cylinder((51,0,147),(51,0,183),15)),
            ('Azimuth pinion pitch envelope',cylinder((51,0,130),(51,0,137),9)),
            ('Azimuth motor output shaft',cylinder((51,0,137),(51,0,147),3))
        ])
        cheeks=[]
        for side in (-1,1):
            y=side*28
            cheek=box((23,y,80),(86,5,76))
            subtract(cheek,cylinder((0,y-4,50),(0,y+4,50),5))
            subtract(cheek,cylinder((55,y-4,98),(55,y+4,98),5))
            cheeks.append(('Fork cheek '+('left' if side>0 else 'right'),cheek))
        # External tangents of the 18 and 9 mm pitch circles in the XZ plane.
        distance = math.hypot(55,48)
        ux, uz = 55/distance, 48/distance
        normal_projection = 9/distance
        for side in (-1,1):
            tangent_projection = side * math.sqrt(1-normal_projection**2)
            nx = ux*normal_projection - uz*tangent_projection
            nz = uz*normal_projection + ux*tangent_projection
            a = (18*nx, 35.5, 50+18*nz)
            b = (55+9*nx, 35.5, 98+9*nz)
            delta = V.create(b[0]-a[0],0,b[2]-a[2])
            length = delta.length
            delta.normalize()
            center = point([(first+last)/2 for first,last in zip(a,b)])
            obb = adsk.core.OrientedBoundingBox3D.create(center,delta,V.create(0,1,0),length/10,.65,.15)
            cheeks.append(('Drive belt span '+('A' if side>0 else 'B'),maker.createBox(obb)))
        solids(fork, cheeks+[
            ('Fork bridge',box((15,0,121),(78,61,6))),
            ('Azimuth spindle',cylinder((0,0,124),(0,0,147),9)),
            ('Steering gear pitch envelope',sleeve((0,0,130),(0,0,137),42,9)),
            ('Drive gearmotor envelope',cylinder((55,-22,98),(55,25.5,98),16)),
            ('Drive shaft to pulley',cylinder((55,25.5,98),(55,39,98),4)),
            ('Drive pulley pitch envelope',sleeve((55,32,98),(55,39,98),9,4))
        ])
        solids(wheel, [
            ('Tread annulus',sleeve((0,-18,50),(0,18,50),50,36)),
            ('Wheel hub',sleeve((0,-18,50),(0,18,50),36,5)),
            ('Axle',cylinder((0,-30.5,50),(0,40,50),5)),
            ('Wheel pulley pitch envelope',sleeve((0,32,50),(0,39,50),18,5))
        ])
        fixed.isGrounded = True
        def revolute(name, first, second, body_name, expected_radius):
            body = second.component.bRepBodies.itemByName(body_name)
            face = next(f for f in body.faces if
                        (c:=adsk.core.Cylinder.cast(f.geometry)) and abs(c.radius*10-expected_radius)<1e-5)
            geometry = adsk.fusion.JointGeometry.createByNonPlanarFace(
                face.createForAssemblyContext(second), adsk.fusion.JointKeyPointTypes.MiddleKeyPoint)
            joint_input = root.asBuiltJoints.createInput(first, second, geometry)
            joint_input.setAsRevoluteJointMotion(adsk.fusion.JointDirections.ZAxisJointDirection)
            joint = root.asBuiltJoints.add(joint_input)
            joint.name = name
        revolute('Azimuth about vertical spindle', fixed, fork, 'Azimuth spindle', 9)
        revolute('Wheel roll about transverse axle', fork, wheel, 'Axle', 5)
        design.computeAll()
        app.activeViewport.fit()
        if output:
            manager=design.exportManager
            if not manager.execute(manager.createFusionArchiveExportOptions(str(output))):
                raise RuntimeError('Native export failed.')
            print('Exported original teaching module.')
    finally:
        if output and previous and previous.isValid:
            previous.activate()
