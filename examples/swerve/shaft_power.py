"""Signed SI power for an invented two-motor module, with ground contact disabled."""
import json
import math


def dot(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True))


def gearing(joint_rates, shaft_torques, coupling=1.5, torque_coupling=None):
    """Rows of the speed map are drive and steer shafts; columns are roll and yaw."""
    roll, yaw = joint_rates
    drive, steer = shaft_torques
    shaft_rates = (4 * roll + coupling * yaw, 8 * yaw)
    carried = coupling if torque_coupling is None else torque_coupling
    joint_torques = (4 * drive, carried * drive + 8 * steer)
    shaft_w = dot(shaft_rates, shaft_torques)
    joint_w = dot(joint_rates, joint_torques)
    return dict(shaftRadS=shaft_rates, jointNm=joint_torques, shaftW=shaft_w,
                jointW=joint_w, residualW=shaft_w - joint_w)


def motor_port(terminal_v, current_a, shaft_rad_s, shaft_nm, resistance):
    """Signed measurements at the motor leads; positive shaft power leaves the motor."""
    terminal = terminal_v * current_a
    shaft = shaft_rad_s * shaft_nm
    copper = current_a**2 * resistance
    return dict(terminalW=terminal, shaftW=shaft, copperW=copper,
                otherLossW=terminal - shaft - copper)


def exercise():
    motion = []
    for rates in ((3, 0), (-3, 0), (0, 2), (0, -2), (3, -2), (-3, 2)):
        plant = gearing(rates, (0.8, -0.25))
        assert math.isclose(plant["residualW"], 0, abs_tol=1e-12)
        motion.append(dict(jointRadS=rates, **plant))
    wrong_torque = gearing((3, -2), (0.8, -0.25), torque_coupling=-1.5)
    consistent_reversal = gearing((0, 2), (0.8, -0.25), coupling=-1.5)
    # Independent fixture observation: with roll locked, +2 rad/s yaw gives +3 drive rad/s.
    assert abs(wrong_torque["residualW"]) > 1
    assert consistent_reversal["residualW"] == 0 and consistent_reversal["shaftRadS"][0] != 3
    # R = 0.2 ohm, Kt = Ke = 0.1 SI. Omega = 20 rad/s gives 2 V back EMF.
    traction = motor_port(3, 5, 20, 0.5, 0.2)
    short_brake = motor_port(0, -10, 20, -1, 0.2)
    returning = motor_port(1, -5, 20, -0.5, 0.2)
    # One impossible torque estimate is hidden when an unrelated port dissipates 4 W.
    impossible = motor_port(3, 5, 20, 0.65, 0.2)
    lossy = motor_port(3, 5, 20, 0.3, 0.2)
    assert impossible["otherLossW"] < 0 < impossible["otherLossW"] + lossy["otherLossW"]
    return dict(signedTrials=motion, reversedTorqueMap=wrong_torque,
                reversedBothMaps=consistent_reversal, motoring=traction,
                shortedBraking=short_brake, returningAtLeads=returning,
                hiddenSurplus=[impossible, lossy])


if __name__ == "__main__":
    print(json.dumps(exercise(), indent=2))
