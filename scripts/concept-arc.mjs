// Drag-free arc check for a ranged concept-bot output. Inches, seconds and degrees; z up; plan angles are
// counterclockwise from +x. No drag, spin or contact: a piece is a sphere of pieceRadiusIn that flies a parabola.
// The whole model is one self-contained factory, so the Field Lab can inline createArcModel.toString().
// Keep every constant and helper inside it; it may reference only JavaScript built-ins.
export function createArcModel() {
  const GRAVITY_IN_S2 = 386.09;
  // Elevation is scanned at this step; speed is solved exactly at each elevation. At 300 in a 0.05° step moves the
  // launch direction about 0.26 in, and the crossing point at most about 1 in for elevations up to 60°.
  const ELEVATION_STEP_DEG = 0.05;
  const STAND_OFF_MAX_IN = 600;
  const TOLERANCE_IN = 1e-6;
  const g = GRAVITY_IN_S2, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

  const finite = Number.isFinite;
  const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(finite);
  const range = r => r && typeof r === 'object' && finite(r.min) && finite(r.max) && r.min <= r.max;

  function checkEntry(e, pieceRadiusIn) {
    const window = e?.kind === 'window' && finite(e.widthIn) && e.widthIn > 0 && finite(e.heightIn) && e.heightIn > 0 && finite(e.facingDeg);
    const ring = e?.kind === 'ring' && finite(e.radiusIn) && e.radiusIn > 0;
    if (!vector(e?.centerIn, 3) || !(window || ring) || !finite(pieceRadiusIn) || pieceRadiusIn < 0) {
      throw Error('Supply a target entry: kind "window" with centerIn [x, y, z], widthIn, heightIn and facingDeg, ' +
        'or kind "ring" with centerIn and radiusIn, plus a nonnegative pieceRadiusIn.');
    }
  }

  function checkPort(port) {
    const speed = port?.launchSpeedInS, elevation = port?.elevationDeg;
    if (!range(speed) || speed.min < 0 || speed.max <= 0 || !range(elevation) || elevation.min <= -90 || elevation.max >= 90 ||
        (port.azimuthDeg !== undefined && !finite(port.azimuthDeg))) {
      throw Error('Supply port launchSpeedInS {min, max} with 0 <= min <= max and max > 0, elevationDeg {min, max} ' +
        'inside (-90, 90) with min <= max, and an optional finite azimuthDeg.');
    }
  }

  // Everything the search needs about one release, one entry and one robot velocity.
  function geometry(position, entry, pieceRadiusIn, azimuthDeg, robotVelocity) {
    const [px, py, pz] = position, [cx, cy, cz] = entry.centerIn, dx = px - cx, dy = py - cy;
    const a = rad(azimuthDeg ?? (Math.hypot(dx, dy) > 1e-9 ? deg(Math.atan2(-dy, -dx)) : entry.kind === 'window' ? entry.facingDeg + 180 : 0));
    const ctx = {kind:entry.kind, px, py, pz, cx, cy, cz, dx, dy, ax:Math.cos(a), ay:Math.sin(a), vx:robotVelocity[0], vy:robotVelocity[1]};
    if (entry.kind === 'window') {
      const f = rad(entry.facingDeg), nx = Math.cos(f), ny = Math.sin(f);
      Object.assign(ctx, {nx, ny, mx:-ny, my:nx, g0:dx * nx + dy * ny, w0:dx * -ny + dy * nx,
        halfW:entry.widthIn / 2 - pieceRadiusIn, halfH:entry.heightIn / 2 - pieceRadiusIn});
      ctx.lowest = cz - ctx.halfH;
    } else Object.assign(ctx, {rho:entry.radiusIn - pieceRadiusIn, drop:pz - cz, lowest:cz});
    return ctx;
  }

  // Polynomials are coefficient arrays, constant term first.
  const add = (a, b) => Array.from({length:Math.max(a.length, b.length)}, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
  const mul = (a, b) => { const out = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
  function at(p, x) { let sum = 0; for (let i = p.length - 1; i >= 0; i--) sum = sum * x + p[i]; return sum; }
  const derivative = p => p.slice(1).map((c, i) => c * (i + 1));
  function trim(p) {
    const scale = Math.max(...p.map(Math.abs));
    let n = p.length;
    while (n > 1 && Math.abs(p[n - 1]) <= 1e-13 * scale) n--;
    return p.slice(0, n);
  }
  // The roots and turning points of p inside [lo, hi]: every place a constraint can change or the objective turn.
  function breakpoints(poly, lo, hi) {
    const p = trim(poly), out = [];
    if (p.length < 2) return out;
    if (p.length === 2) out.push(-p[0] / p[1]);
    else if (p.length === 3) {
      const [c, b, a] = p, disc = b * b - 4 * a * c;
      out.push(-b / (2 * a));
      if (disc >= 0) { const q = -(b + Math.sign(b || 1) * Math.sqrt(disc)) / 2; out.push(q / a); if (q !== 0) out.push(c / q); }
    } else {
      const turns = breakpoints(derivative(p), lo, hi), points = [lo, ...turns, hi];
      out.push(...turns);
      for (let i = 1; i < points.length; i++) {
        let a = points[i - 1], b = points[i], fa = at(p, a);
        if (Math.sign(fa) === Math.sign(at(p, b))) continue;
        for (let k = 0; k < 50 && b - a > 1e-12 * Math.max(1, Math.abs(b)); k++) {
          const mid = (a + b) / 2, fm = at(p, mid);
          if (Math.sign(fm) === Math.sign(fa)) { a = mid; fa = fm; } else b = mid;
        }
        out.push((a + b) / 2);
      }
    }
    return out.filter(x => finite(x) && x >= lo && x <= hi);
  }

  // Fly one launch and measure where it meets the entry. Null when it never reaches the entry plane the right way.
  function fly(ctx, e, s) {
    const c = Math.cos(e), hx = s * c * ctx.ax + ctx.vx, hy = s * c * ctx.ay + ctx.vy, vz = s * Math.sin(e);
    let T;
    if (ctx.kind === 'window') {
      const closing = -(hx * ctx.nx + hy * ctx.ny); // toward the opening from the side it faces
      if (!(closing > 0)) return null;
      T = ctx.g0 / closing;
      const w = ctx.w0 + (hx * ctx.mx + hy * ctx.my) * T, dz = ctx.pz + vz * T - g * T * T / 2 - ctx.cz;
      return {s, T, miss:Math.hypot(w, dz), ok:Math.abs(w) <= ctx.halfW + TOLERANCE_IN && Math.abs(dz) <= ctx.halfH + TOLERANCE_IN};
    }
    const disc = vz * vz + 2 * g * ctx.drop; // descending crossing of the ring plane
    if (!(disc > 0)) return null;
    T = (vz + Math.sqrt(disc)) / g;
    if (!(T > 0)) return null;
    const miss = Math.hypot(ctx.dx + hx * T, ctx.dy + hy * T);
    return {s, T, miss, ok:miss <= ctx.rho + TOLERANCE_IN};
  }

  // Candidate launch speeds at one elevation, so that feasibility is exact in speed.
  // Window: the speed limits, every boundary of the opening and the centre-line and centre-height crossings.
  // Ring: the speed limits and every turning point of the squared miss distance, which hold its minimum.
  function speedsAt(ctx, e, smin, smax) {
    const c = Math.cos(e), sn = Math.sin(e), speeds = [smin, smax];
    // A family parameterised by flight time T, with s(T) monotonic; or by speed when T is fixed.
    const byTime = (lo, hi, polys, speedOf) => {
      if (!(hi >= lo)) return;
      for (const p of polys) for (const T of [lo, hi, ...breakpoints(p, lo, hi)]) if (T > 0) speeds.push(speedOf(T));
    };
    const bySpeed = polys => { for (const p of polys) speeds.push(...breakpoints(p, smin, smax)); };
    if (ctx.kind === 'window') {
      const alpha = -c * (ctx.ax * ctx.nx + ctx.ay * ctx.ny), beta = -(ctx.vx * ctx.nx + ctx.vy * ctx.ny);
      const am = ctx.ax * ctx.mx + ctx.ay * ctx.my, vm = ctx.vx * ctx.mx + ctx.vy * ctx.my;
      const sides = w => [add(w, [-ctx.halfW]), add(w, [ctx.halfW])];
      const heights = z => [add(z, [-ctx.cz - ctx.halfH]), add(z, [-ctx.cz + ctx.halfH]), add(z, [-ctx.cz])];
      if (Math.abs(alpha) > 1e-12) {
        // T = g0 / (s·alpha + beta), so s·T = (g0 - beta·T) / alpha.
        const time = s => { const closing = s * alpha + beta; return closing > 0 ? ctx.g0 / closing : Infinity; };
        const cap = (smax + Math.sqrt(smax * smax + 2 * g * Math.max(0, ctx.pz - ctx.lowest))) / g + 1e-9;
        const [lo, hi] = [time(smin), time(smax)].sort((x, y) => x - y).map(T => Math.min(T, cap));
        const w = [ctx.w0 + c * am * ctx.g0 / alpha, vm - c * am * beta / alpha];
        const z = [ctx.pz + sn * ctx.g0 / alpha, -sn * beta / alpha, -g / 2];
        byTime(lo, hi, [...sides(w), ...heights(z), w], T => (ctx.g0 / T - beta) / alpha);
      } else if (beta > 0) {
        const T = ctx.g0 / beta, w = [ctx.w0 + vm * T, c * am * T], z = [ctx.pz - g * T * T / 2, sn * T];
        bySpeed([...sides(w), ...heights(z), w]);
      }
    } else if (Math.abs(sn) > 1e-12) {
      const drop = ctx.drop;
      if (drop <= 0 && sn < 0) return [];
      const least = drop > 0 ? 0 : Math.sqrt(-2 * g * drop) / sn;
      const lowest = Math.max(smin, least * (1 + 1e-12) + 1e-12);
      if (lowest > smax) return [];
      const time = s => { const vz = s * sn; return (vz + Math.sqrt(vz * vz + 2 * g * drop)) / g; };
      const [lo, hi] = [time(lowest), time(smax)].sort((x, y) => x - y);
      // s·T = (g·T²/2 - drop) / sin e; the miss vector is quadratic in T.
      const q = c / sn, mx = [ctx.dx - q * drop * ctx.ax, ctx.vx, q * g / 2 * ctx.ax], my = [ctx.dy - q * drop * ctx.ay, ctx.vy, q * g / 2 * ctx.ay];
      const miss = add(mul(mx, mx), mul(my, my));
      speeds.push(lowest);
      byTime(lo, hi, [derivative(miss)], T => (g * T * T / 2 - drop) / (sn * T));
    } else if (ctx.drop > 0) {
      // A level launch falls to the ring plane in a fixed time; the miss vector is linear in speed.
      const fall = Math.sqrt(2 * ctx.drop / g), mx = [ctx.dx + ctx.vx * fall, c * fall * ctx.ax], my = [ctx.dy + ctx.vy * fall, c * fall * ctx.ay];
      const miss = add(mul(mx, mx), mul(my, my));
      bySpeed([derivative(miss)]);
    }
    return speeds.map(s => Math.min(smax, Math.max(smin, s)));
  }

  // More centred to 0.01 in, then slower. Equal arcs keep the earlier (lower) elevation.
  function better(a, b) {
    const centred = Math.round(a.miss * 100) - Math.round(b.miss * 100);
    return centred < 0 || centred === 0 && a.s < b.s - 1e-9;
  }
  function bestAt(ctx, e, smin, smax, first) {
    let best = null;
    for (const s of speedsAt(ctx, e, smin, smax)) {
      const shot = fly(ctx, e, s);
      if (shot?.ok && (!best || better(shot, best))) best = shot;
      if (best && first) break;
    }
    return best;
  }

  // Scan elevation; keep the most centred arc (to 0.01 in), then the slowest launch, then the lowest elevation.
  function search(ctx, emin, emax, smin, smax, first, step = ELEVATION_STEP_DEG) {
    const steps = emax > emin ? Math.ceil((emax - emin) / step) : 0;
    let best = null;
    for (let i = 0; i <= steps; i++) {
      const elevationDeg = steps ? emin + (emax - emin) * i / steps : emin, shot = bestAt(ctx, rad(elevationDeg), smin, smax, first);
      if (!shot) continue;
      if (first) return {...shot, elevationDeg};
      if (!best || better(shot, best)) best = {...shot, elevationDeg};
    }
    return best;
  }

  // Causes that need no search, in the order a student would fix them.
  function blocked(ctx, speed, elevation) {
    if (ctx.kind === 'window' && !(ctx.g0 > 0)) return 'the release point is not in front of the window, which faces ' + ctx.facingDeg + '°';
    if (ctx.kind === 'window' ? ctx.halfW <= 0 || ctx.halfH <= 0 : ctx.rho <= 0) return 'the piece leaves no clearance in the ' + ctx.kind;
    const apex = ctx.pz + (speed.max * Math.sin(rad(Math.max(0, elevation.max)))) ** 2 / (2 * g);
    if (ctx.kind === 'window' ? apex < ctx.lowest : apex <= ctx.lowest) {
      return 'the entry needs the piece at ' + ctx.lowest.toFixed(1) + ' in, above the reachable apex of ' + apex.toFixed(1) +
        ' in (' + speed.max + ' in/s at ' + Math.max(0, elevation.max) + '°)';
    }
    return null;
  }

  // The explanation of a failed search, from coarser scans that widen one range at a time.
  function diagnose(ctx, speed, elevation) {
    const wide = [-89.9, 89.9], fast = [0, 100 * speed.max], coarse = 0.5;
    const elevationOnly = search(ctx, ...wide, speed.min, speed.max, true, coarse);
    if (elevationOnly) return 'outside elevation range: an arc through the ' + ctx.kind + ' needs about ' +
      elevationOnly.elevationDeg.toFixed(1) + '°, outside ' +
      (elevation.min === elevation.max ? 'the fixed ' + elevation.min + '°' : elevation.min + '–' + elevation.max + '°');
    if (search(ctx, elevation.min, elevation.max, ...fast, true, coarse)) return 'outside launch speed range ' + speed.min + '–' + speed.max + ' in/s';
    if (search(ctx, ...wide, ...fast, true, coarse)) return 'outside elevation range and launch speed range';
    return 'no launch along azimuth ' + (deg(Math.atan2(ctx.ay, ctx.ax))).toFixed(1) + '° with this robot velocity reaches the ' + ctx.kind;
  }

  /**
   * Whether some elevation and speed in the port's ranges puts the piece through the entry.
   * release {positionIn:[x,y,z]}; target: a station entry plus pieceRadiusIn; port {launchSpeedInS:{min,max},
   * elevationDeg:{min,max}, azimuthDeg?} (default azimuth: straight at the entry centre); robotVelocity [vx,vy] in/s,
   * added to the launch velocity. A window passes when the piece centre crosses its plane from the side it faces,
   * inside the opening shrunk by the piece radius; a ring when it descends through the ring plane within
   * radiusIn - pieceRadiusIn of the centre. Returns {feasible:true, elevationDeg, speedInS, flightS} for the most
   * centred arc, or {feasible:false, reason}.
   */
  function arcCheck(release, target, port, robotVelocity = [0, 0]) {
    if (!vector(release?.positionIn, 3)) throw Error('Supply a release positionIn [x, y, z] in inches.');
    checkEntry(target, target?.pieceRadiusIn);
    checkPort(port);
    if (!vector(robotVelocity, 2)) throw Error('Supply robotVelocity as [vx, vy] in inches per second.');
    const ctx = {...geometry(release.positionIn, target, target.pieceRadiusIn, port.azimuthDeg, robotVelocity), facingDeg:target.facingDeg};
    const speed = port.launchSpeedInS, elevation = port.elevationDeg, cause = blocked(ctx, speed, elevation);
    if (cause) return {feasible:false, reason:cause};
    const shot = search(ctx, elevation.min, elevation.max, speed.min, speed.max, false);
    if (!shot) return {feasible:false, reason:diagnose(ctx, speed, elevation)};
    if (![shot.elevationDeg, shot.s, shot.T].every(finite)) throw Error('Arc calculation overflowed.');
    return {feasible:true, elevationDeg:shot.elevationDeg, speedInS:shot.s, flightS:shot.T};
  }

  /**
   * The stationary stand-off distances, 0–600 in at 1 in steps along the approach, from which some elevation and
   * speed in range pass, aiming straight at the entry centre (the port's azimuthDeg is ignored). The approach
   * defaults to opposite a window's facing; a ring is symmetric in plan, so its default (+x) holds for every direction.
   * Returns {bands:[{minIn, maxIn}], feasibleAny}.
   */
  function standOffBand(entry, pieceRadiusIn, port, releaseHeightIn, approachDeg) {
    checkEntry(entry, pieceRadiusIn);
    checkPort(port);
    if (!finite(releaseHeightIn) || releaseHeightIn < 0 || (approachDeg !== undefined && !finite(approachDeg))) {
      throw Error('Supply a nonnegative releaseHeightIn and an optional finite approachDeg.');
    }
    const approach = rad(approachDeg ?? (entry.kind === 'window' ? entry.facingDeg + 180 : 0));
    const speed = port.launchSpeedInS, elevation = port.elevationDeg, [cx, cy] = entry.centerIn, bands = [];
    for (let d = 0; d <= STAND_OFF_MAX_IN; d++) {
      const ctx = {...geometry([cx - d * Math.cos(approach), cy - d * Math.sin(approach), releaseHeightIn], entry, pieceRadiusIn, undefined, [0, 0]), facingDeg:entry.facingDeg};
      // The highest any launch at speed.max reaches over the horizontal run to the nearest admissible point.
      const run = Math.max(0, ctx.kind === 'window' ? d : d - ctx.rho);
      const envelope = ctx.pz + speed.max ** 2 / (2 * g) - g * run * run / (2 * speed.max ** 2);
      const ok = !blocked(ctx, speed, elevation) && envelope >= ctx.lowest &&
        search(ctx, elevation.min, elevation.max, speed.min, speed.max, true) !== null;
      if (!ok) continue;
      const last = bands.at(-1);
      if (last && last.maxIn === d - 1) last.maxIn = d; else bands.push({minIn:d, maxIn:d});
    }
    return {bands, feasibleAny:bands.length > 0};
  }

  // The one piece-radius rule, shared by the rehearsal and concept:check: the radiusIn of the first retrieval
  // station of that piece type with a finite, positive floor or service radius. Otherwise the piece is a point (0).
  function pieceRadiusFor(stations, pieceType) {
    for (const s of stations ?? []) {
      const radius = s?.kind === 'retrieval' && s.piece === pieceType ? (s.floor ?? s.service)?.radiusIn : undefined;
      if (finite(radius) && radius > 0) return radius;
    }
    return 0;
  }

  return {arcCheck, standOffBand, pieceRadiusFor, GRAVITY_IN_S2, ELEVATION_STEP_DEG};
}

const model = createArcModel();
export const GRAVITY_IN_S2 = model.GRAVITY_IN_S2;
export const ELEVATION_STEP_DEG = model.ELEVATION_STEP_DEG;
export function arcCheck(release, target, port, robotVelocity) { return model.arcCheck(release, target, port, robotVelocity); }
export function pieceRadiusFor(stations, pieceType) { return model.pieceRadiusFor(stations, pieceType); }
export function standOffBand(entry, pieceRadiusIn, port, releaseHeightIn, approachDeg) {
  return model.standOffBand(entry, pieceRadiusIn, port, releaseHeightIn, approachDeg);
}
