
## Reduced force-coupled sensitivity experiment

The separate `segmented-force-model.py` experiment integrates piece translation and
one equivalent roller surface-speed coordinate. Motor effort affects roller speed;
Coulomb-limited contact impulse transfers momentum to the piece. Geometry is
recomputed at the resulting position. This is not the prescribed replay and is
not integrated with the WPILib controller.

It deliberately starts at rest at the central, preloaded pose. It does not prove
capture from outside, beam passage, retention or a complete intake cycle. The
existing controller rejects an initially blocked beam (CORAL and FUEL here), so
silently connecting this initial state to that controller would be invalid.

Run `python -B scripts/test-segmented-force.py`, then
`python -B scripts/segmented-force-model.py --output <new-json-path>`.
The committed `case-studies/segmented-force-sensitivity.json` retains 27 runs,
full tick traces, geometry evidence hashes and normalized source hashes.

### Explicit hypotheses, not component or material measurements

All three seasons use the same hypothetical 0.5 kg piece mass, 0.25 kg equivalent
roller inertia expressed as translational mass, 10 N **aggregate** imposed normal
load, coefficient 0.5, 0.2 m/s target, 5 N maximum drive and 10 Ns/m proportional
gain. A second mass run uses 1 kg. These are controlled sensitivity inputs, not
estimates of any season's actual piece or motor. The 5 mm wheel lowering remains
an imposed geometric hypothesis. No stiffness is inferred from overlap, and no
old sleeve stiffness is multiplied by the number of wheels.

Normal load is enabled only by confirmed overlap of the ideal segmented wheel
envelopes. Unknown geometry terminates the run rather than being treated as zero
load. There is no wheel-by-wheel load allocation or normal-direction mechanics.
Both modeled velocities are feed-axis scalars; projecting real contact tangents,
normal forces, vertical support, rotation and work by those constraints remains
unresolved. This is a reduced tangential sensitivity model, not a complete
mechanical contact simulation. Its energy identity is restricted to these two
coordinates.

At each step a limited ideal drive impulse changes the roller velocity. Its
kinetic-energy change is recorded as external motor work. The friction impulse
is the smaller of the sticking impulse and `mu * aggregateNormal * dt`, with
relative-slip sign. It conserves pair momentum, cannot reverse slip and cannot
increase the pair's kinetic energy. The piece then advances using its new
velocity. The motor is not an electrical/DC model; battery, heat and regeneration
are absent. Numerical sticking loss depends on the split-step size, so the exact
accounting identity is not a claim of accurate physical dissipation.

### Executed results and negative controls

At 0.5 s, baseline modeled travel is 86.014 mm for NOTE/CORAL and 84.326 mm for
FUEL. Equality of NOTE/CORAL follows the same imposed loads/inertias and continuous
contact gate, not equivalent real mechanisms. FUEL loses the geometry gate and
coasts without external drag. Zero friction, zero normal load, nominal separated
geometry and zero drive each produce exactly zero piece travel, unlike the
previous prescribed IO replay. Reversing drive reverses travel. Lower friction
(0.02) reduces travel to 50.252/50.252/48.600 mm; doubling piece mass reduces it to
76.405/76.405/73.573 mm. Halving dt from 5 to 2.5 ms shifts travel by about 0.5 mm;
this is a sensitivity observation, not demonstrated convergence or a tolerance.

The reduced force model is useful for testing causality and bookkeeping only.
Engineering acceptance and calibration remain blocked. Required next evidence:
actual component inertia and drive topology, piece properties, force/deflection
and friction measurements, load distribution, constrained-pose reaction model,
entry/exit geometry (especially CORAL ends), and a compatible feeding/beam startup
state. No procurement, physical deployment or hardware testing is authorized by
this artifact.
