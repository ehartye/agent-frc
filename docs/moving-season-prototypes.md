# Coupled moving seasonal prototypes

This executes the actual drive and seasonal mechanism controllers in one constrained longitudinal model. Six scalar velocities are chassis/piece translation and four shaft rotations, NOT a six-DOF rigid-body simulation. It is not a complete robot, reliable capture, scoring or physical safe-stop validation. All five-domain engineering acceptance remains blocked.

## Actual coupling and provenance

Each 2024/2025/2026 run first executes the original native sleeve/actual IO baseline, then consumes its exact STEP/property/config bytes. Both controllers read actual WPILib Encoder/DigitalInput/gyro interfaces; the plant consumes their PWM outputs. No plant truth is passed to controllers. Independent physical sensor scaling remains separate from controller conversion. Moving mechanism IO uses encoder4/5 and6/7, beam8, PWM3/4. Drive PWM0/1 share the same bus; its unused auxiliary PWM2 must remain zero or the model rejects an unmodeled load. Stationary default IO mappings are unchanged.

A single ideal algebraic shared supply has four aggregate branches: two NEOs per drive side, one per sleeve. Signed armature currents and duty-weighted battery demand share one voltage solve each substep, not hidden independent12V sources. Controller updates are20ms; model steps1ms and refinement0.5ms. Last-substep electrical samples and end-substep mechanical samples are staggered, not claimed simultaneous.

The45kg translating assembly is assumed to INCLUDE sleeves and other robot components, EXCLUDING the piece. Native sleeve inertia is separately rotational, not double-counted translating mass. This is not CAD-derived robot mass/CoM. Drive-side inertia0.02kgm2, tire radius0.0762m, gear10.71 and friction0.8 are hypotheses. Static drive normal loads sum to assumed body weight. Piece height/orientation are externally constrained; support equilibrium and weight transfer are absent. No real six-wheel load, pitch or tipping conclusion follows.

## Frames and impulses

World+X and body-local+X are assumed aligned with zero mechanism mount offset, not certified CAD-to-field registration. Piece position/velocity are global. Beam and engagement use pieceX-bodyX. Native Y shaft axes translate with the chassis; rotation, mount flexibility and structural moments are unsupported.

For generalized velocity q, drive slips are rD*omegaD-Vbody. Mechanism slips are Vbody+sigma*rM*omegaM-Vpiece with sigma=(-1,+1). Diagonal mass matrix M and slip Jacobian J give A=J*M^-1*transpose(J), and velocity update -M^-1*transpose(J)*p. Ground impulses accelerate the body; mechanism impulses accelerate the piece and react on body and sleeves. The negative drive/mechanism cross term is retained. The four-contact active-set solver checks bounds/KKT and mechanical-only loss p.dot(s)-0.5*p.dot(A*p). Explicit torque work uses mean shaft velocity. Projection loss is numerical, not measured heating. Empirical NEO Kt/Ke mismatch still prevents global electromechanical conservation claims.

Contact windows/forces remain prescribed, not collision-detected. First departure from either body-relative window boundary latches release, with no recapture. Outside contact, constrained translation is lossless, not calibrated flight. Initial world body/piece speeds both0.5m/s and drive shaft speeds matching wheel motion are explicit moving initial conditions, not startup validation.

## Real task completion and unsupported behavior

MovingPrototypeController implements a bounded concurrent drive/transfer command. It evaluates mechanism IO-derived done/fault first, then removes drive demand at a terminal state. Disable/fault inhibits both subsystems. Zero duty is ideal short-circuit braking, not coast/holding or a certified safe stop. Beam completion is never a game score.

The diagnostic continue-driving scenario remains an expected rejection. Uncoordinated NOTE driving after transfer completion reaches unsupported regeneration around0.72s, when drive PWM voltage falls slightly below back-EMF. No negative-current clamp, tolerance relaxation or charging model was added. The supervisor changes actual task completion, not the claimed domain of indefinite drive. General regeneration, controller current limits/losses, battery chemistry and thermal dynamics remain unsupported.

## Reproduction and checks

Run `python scripts/run-moving-season.py --output NEW_DIRECTORY --java-home EXISTING_JDK17 --gradle-home EXISTING_OFFLINE_CACHE`. Baseline and moving reports, source/input/runtime/controller-class pins and failures are retained. Ordinary unit tests do not imply this opt-in native pipeline ran. Exact hashes are provenance, not physical authentication.

Checks cover independent hand-calculated coupled impulses, linear momentum with zero ground friction, shared-load sag/current summation, relative/global beam negative control, one-way release, actual fault inhibition, disable and expected unsupported continuous-drive behavior. Refinement compares all aligned body/piece positions/velocities, four shafts, voltage and current. Development bounds0.05m,0.05m/s,5rad/s,0.2V,10A are not calibrated safety thresholds. Capture, field collision/events, thermal behavior, weight distribution and calibration remain missing. This is not an accepted physics-gate adapter.
