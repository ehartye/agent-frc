// One scoring window, one robot, one piece type and one non-recycled supply pool.
export function analyzeWindow(s) {
  const whole = n => Number.isSafeInteger(n) && n >= 0;
  const finite = n => Number.isFinite(n) && n >= 0;
  if (![s.stock,s.opening,s.incoming,s.goal].every(whole) || !s.goal ||
      ![s.window,s.cycle].every(n=>finite(n) && n>0) ||
      ![s.arrival,s.setup,s.travel,s.points].every(finite) || s.arrival>s.window) {
    throw Error('Enter whole piece counts, positive window and cycle times, and an arrival inside the window.');
  }
  if (s.opening+s.incoming>s.stock) throw Error('Allocated pieces exceed the distinct match inventory.');
  if (s.cap !== null && !whole(s.cap)) throw Error('Target capacity must be a whole count.');
  const ready=s.setup+s.travel;
  const usable=Math.max(0,s.window-ready);
  const afterArrival=Math.max(0,s.window-Math.max(ready,s.arrival));
  const lateNeeded=Math.max(0,s.goal-s.opening);
  const required=(count,time)=>count===0?0:time>0?count/time:Infinity;
  const rate=Math.max(required(s.goal,usable),required(lateNeeded,afterArrival));
  const supply=s.opening+s.incoming;
  const available=Math.min(supply,s.cap ?? supply);
  // A serial cycle may start only after its piece arrives. Both constraints must hold.
  const cycles=t=>Math.floor(t/s.cycle+1e-10);
  const delivered=Math.min(available,cycles(usable),s.opening+cycles(afterArrival));
  return {ready,usable,afterArrival,rate,available,delivered,
    attainable:delivered>=s.goal,points:delivered*s.points};
}
