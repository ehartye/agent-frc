# Rotating observations and fault-transition momentum

Two pure virtual-model helpers in scripts/planar-observation.mjs harvest a simulator review lesson. They are not a robot controller, yaw-steering implementation or full physics engine.

## Coordinate convention and derivative

Use metres, seconds, radians, world XY and positive counterclockwise heading. Body X is forward and Y is left. Relative position is q = R(-heading)(targetPosition - robotPosition). Its derivative is qdot = R(-heading)(targetVelocity - robotVelocity) - yawRate * J * q, where J(x,y)=(-y,x). Merely rotating relative world velocity omits the changing basis.

relativeBodyObservation returns both vectors without mutating its input. Tests compare the derivative to independent central finite differences at nonzero yaw, check common rigid rotation, reverse yaw sign, and retain an omitted-transport negative control. Straight-only tests cannot expose a term multiplied by zero yaw rate.

## Fault is a command change, not a plant reset

At an instantaneous control-fault transition, preserve plant position and momentum unless the model explicitly applies a physical impulse. Braking or coasting changes subsequent forces and integration; neither means set velocity to zero. A stale observation is not permission to rewrite the physical state. Fault latching and recovery remain controller-specific, with sensor freshness and domain checks separate from plant dynamics.

checkFaultMomentumTransition checks unchanged-mass planar linear and angular momentum against explicitly supplied impulses and residual tolerances. Inputs are kg, kg m2, m/s, rad/s, N s and N m s. It is for paired snapshots at the same instantaneous transition, not finite-duration braking steps, changing mass/inertia, impacts without a resolved impulse, or full 3D bodies. Supplying a plausible impulse does not prove that impulse model is correct. It does not certify position continuity or contact behavior.
