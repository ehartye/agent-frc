# Impact scenarios before structure acceptance

This original analytic screen advances the >100 lb opponent question into explicit load cases. It does **not** assert the POCs survive collisions. Their complete frame, bumper attachments and load paths are not yet assembled or qualified.

Run `python scripts/impact-load-envelope.py --output <new-report.json>` and `python scripts/test-impact-load-envelope.py`.

The 108 scenarios combine provisional own masses100/120 lb, opposing masses100/120/150 lb, closing speeds2/4/6 m/s, combined relative compression25/50/100 mm and load-path offsets0/250 mm. Masses are assumptions, not season legal limits or CAD mass properties. Closing speed is the difference in normal velocities, not each robot's speed. Compression is an assumed combined deformation, not bumper thickness or available stroke.

For freely translating central impacts, reduced mass is `mu=m1*m2/(m1+m2)`. Relative kinetic energy is `E=mu*v^2/2`; perfectly inelastic normal impulse is `J=mu*v`. Average compression force is `E/d`. Duration `2*d/v` applies only to the separate constant-force idealization. Peak force remains unknown. Offset moment `F*r` is a mounting-load scale, not an off-axis dynamic solution; body inertia, contact normal and rotation would change the collision's effective mass.

A100 lb model encountering a120 lb opponent at4 m/s closing speed has197.9 J relative energy and99.0 N s central inelastic impulse. An assumed50 mm total compression gives3.96 kN average force. At2/6 m/s, the corresponding average-force scales are0.99/8.91 kN. These are not hardware ratings or maximum loads. They show why speed, compliance and attachment geometry matter more than mass alone. Halving compression doubles the average-force scale; doubling speed quadruples energy.

## Design consequences and next work

- Establish a direct bumper-to-frame load path, separate from guide plates and exposed mechanism shafts.
- Put batteries and vulnerable mechanisms behind the protected structure; retain them against inertial loads.
- Use actual assembly mass/inertia and contact geometry before oblique collision simulation.
- Check frame bending, brackets, joints, fastener bearing/shear, retention, repeated impacts and travel stops against declared material/geometry evidence.
- Keep collision avoidance in an arena, bumper-rule compliance, structural survivability and physical validation as distinct questions.

The default report leaves `peakForceN` and `structuralPass` null. Momentum/energy, equal-mass arithmetic, scaling, a large opposing-mass limit, zero speed and invalid numeric inputs are tested independently. Numerical screening supports masses0.001..1e6 kg, speed0..100 m/s, compression1e-6..10 m and offset0..10 m; these bounds only prevent meaningless numerical inputs, not certify physical applicability.
