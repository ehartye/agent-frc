"""Offline four-station maneuver with an independently integrated free piece and two grip pads."""
import argparse
import csv
import json
import math

STATIONS = ((0.2, 0.18), (0.2, -0.18), (-0.2, 0.18), (-0.2, -0.18))
MASS = 0.5
SEAT_X = 0.15


def turn(x, y, heading):
    c, s = math.cos(heading), math.sin(heading)
    return c*x - s*y, s*x + c*y


def wheel_step(wheels, request, dt):
    """First-order roll and steer response. Recover body twist from four attained wheel vectors."""
    vx, vy, yaw = request
    ux, uy, moment = 0.0, 0.0, 0.0
    for i, (x, y) in enumerate(STATIONS):
        speed, angle = wheels[i]
        dx, dy = vx-yaw*y, vy+yaw*x
        target = math.hypot(dx, dy)
        error = math.remainder(math.atan2(dy, dx)-angle, math.tau) if target else 0.0
        angle += max(-6*dt, min(6*dt, error))
        speed += (target-speed)*dt/0.08
        wheels[i] = speed, angle
        a, b = turn(speed, 0, angle)
        ux += a
        uy += b
        moment += -y*a + x*b
    return ux/4, uy/4, moment/sum(x*x+y*y for x, y in STATIONS)


def simulate(pad_loads, dt=0.002):
    wheels = [(0., 0.) for _ in STATIONS]
    x = y = yaw = lift = lift_speed = 0.0
    piece = [SEAT_X+0.03, 0., 0.]
    velocity = [0., 0., 0.]
    rows = []
    for i in range(round(2.8/dt)):
        start = i*dt
        carry = 1.1 <= start < 2.4
        request = (.085 if start < .35 else 0., .5 if carry else 0., .65 if carry else 0.)
        lift_request = .18 if carry else 0.
        vx, vy, yaw_rate = wheel_step(wheels, request, dt)
        wx, wy = turn(vx, vy, yaw)
        lift_speed += (lift_request-lift_speed)*dt/.09
        arm_x, arm_y = turn(SEAT_X, 0, yaw)
        seat = (x+arm_x, y+arm_y, lift)
        seat_velocity = (wx-yaw_rate*arm_y, wy+yaw_rate*arm_x, lift_speed)
        gap = [a-b for a, b in zip(seat, piece)]
        dv = [a-b for a, b in zip(seat_velocity, velocity)]
        # Finite contact window. Each pad can exert tangential traction up to mu*N.
        engaged = start >= .55 and math.hypot(*gap) < .045
        demand = [1100*g + 26*v for g, v in zip(gap, dv)]
        normal, tangent = turn(*demand[:2], -yaw)
        # Opposed compliant pads act along body X. Friction acts only in their Y/Z planes.
        left = max(0., pad_loads[0]+normal/2) if engaged else 0.
        right = max(0., pad_loads[1]-normal/2) if engaged else 0.
        capacity = .65*(left+right)
        scale = min(1., capacity/max(1e-12, math.hypot(tangent, demand[2])))
        fx, fy = turn(left-right, scale*tangent, yaw)
        force = (fx, fy, scale*demand[2])
        for axis in range(3):
            accel = force[axis]/MASS - (9.81 if axis == 2 else 0.)
            velocity[axis] += accel*dt
            piece[axis] += velocity[axis]*dt
        if piece[2] < 0:
            piece[2] = 0.
            velocity[2] = max(0., velocity[2])
        x += wx*dt
        y += wy*dt
        yaw += yaw_rate*dt
        lift += lift_speed*dt
        arm_x, arm_y = turn(SEAT_X, 0, yaw)
        seat = (x+arm_x, y+arm_y, lift)
        seat_velocity = (wx-yaw_rate*arm_y, wy+yaw_rate*arm_x, lift_speed)
        row = dict(timeS=(i+1)*dt, requestForwardMS=request[0], requestStrafeMS=request[1],
                   requestYawRadS=request[2], requestLiftMS=lift_request, chassisXM=x, chassisYM=y,
                   yawRad=yaw, strafeMS=vy, yawRadS=yaw_rate, liftM=lift, liftMS=lift_speed,
                   pieceXM=piece[0], pieceYM=piece[1], pieceZM=piece[2],
                   pieceVxMS=velocity[0], pieceVyMS=velocity[1], pieceVzMS=velocity[2],
                   seatDistanceM=math.dist(piece, seat), relativeSpeedMS=math.dist(velocity, seat_velocity),
                   leftN=left, rightN=right)
        for j, (speed, angle) in enumerate(wheels):
            row[f"wheel{j}RollMS"] = speed
            row[f"wheel{j}SteerRad"] = angle
        rows.append(row)
    return rows


def review(rows):
    last = dwell = simultaneous = with_piece = 0.
    acquired = None
    lost = None
    for row in rows:
        dt = row["timeS"]-last
        last = row["timeS"]
        seen = (row["leftN"] >= 2 and row["rightN"] >= 2 and row["seatDistanceM"] <= .012
                and row["relativeSpeedMS"] <= .045)
        dwell = dwell+dt if seen else 0.
        held = dwell >= .10
        if held and acquired is None:
            acquired = last
        if row["leftN"] == row["rightN"] == 0 and acquired is not None and lost is None:
            lost = last
        moving = abs(row["strafeMS"]) > .20 and abs(row["yawRadS"]) > .25 and row["liftMS"] > .07
        if moving:
            simultaneous += dt
            if held and row["pieceZM"] > .02:
                with_piece += dt
    return dict(firstDwellS=acquired, firstClearOfPadsS=lost, attainedOverlapS=simultaneous,
                loadedOverlapS=with_piece, finalHeld=held, finalPieceHeightM=rows[-1]["pieceZM"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", metavar="PATH", help="write both complete traces to a new CSV")
    args = parser.parse_args()
    cases = {"firm": simulate((12., 12.)), "weak": simulate((3., 3.))}
    if args.csv:
        with open(args.csv, "x", newline="", encoding="utf-8") as out:
            writer = csv.DictWriter(out, fieldnames=["trial", *cases["firm"][0]])
            writer.writeheader()
            for name, rows in cases.items():
                for row in rows:
                    writer.writerow({"trial": name, **row})
    print(json.dumps({key: review(rows) for key, rows in cases.items()}, indent=2))
