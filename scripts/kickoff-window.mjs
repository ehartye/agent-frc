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
  if (s.delivery==='loaded-batch') {
    if (!whole(s.carryCapacity) || !s.carryCapacity) throw Error('Enter a positive whole-piece carrying capacity for the one loaded trip.');
    const slots=s.cap ?? s.stock;
    function departure(time,offered) {
      const load=Math.min(offered,s.carryCapacity);
      const ready=time+s.travel+s.setup;
      const usable=Math.max(0,s.window-ready);
      const available=Math.min(load,slots);
      return {time,load,ready,usable,available,delivered:Math.min(available,Math.floor(usable/s.cycle+1e-10))};
    }
    const early=departure(0,s.opening);
    const late=departure(s.arrival,s.opening+s.incoming);
    // Leaving early forfeits the later load. Keep the two one-trip alternatives mutually exclusive.
    const best=early.delivered>=late.delivered ? early : late;
    const target=early.available>=s.goal ? early : late;
    return {ready:target.ready,usable:target.usable,available:late.available,
      rate:target.available>=s.goal && target.usable>0 ? s.goal/target.usable : Infinity,
      delivered:best.delivered,attainable:best.delivered>=s.goal,points:best.delivered*s.points,
      early,late,bestDepartureS:best.time,targetDepartureS:target.available>=s.goal?target.time:null};
  }
  if (s.delivery==='shuttle') {
    const returning=s.returnTravel ?? s.travel;
    if(!finite(returning)) throw Error('Return transit must be finite and nonnegative.');
    const available=Math.min(s.opening+s.incoming,s.cap ?? s.stock);
    // First pickup is at A. Every scored piece travels A→B. Only intervening trips return B→A.
    const transit=n=>n*s.travel+Math.max(0,n-1)*returning;
    const serviceBudget=(n,start)=>s.window-start-transit(n);
    const maxCycle=n=>{
      if(n===0) return Infinity;
      const late=Math.max(0,n-s.opening);
      const full=serviceBudget(n,s.setup)/n;
      return late?Math.min(full,serviceBudget(late,Math.max(s.setup,s.arrival))/late):full;
    };
    let lo=0,hi=available;
    while(lo<hi){
      const count=lo+Math.ceil((hi-lo)/2);
      if(maxCycle(count)>=s.cycle-Number.EPSILON*s.cycle*4) lo=count; else hi=count-1;
    }
    const allowance=maxCycle(s.goal);
    return {ready:s.setup,usable:Math.max(0,serviceBudget(s.goal,s.setup)),
      afterArrival:Math.max(0,s.window-Math.max(s.setup,s.arrival)),rate:allowance>0?1/allowance:Infinity,
      available,delivered:lo,attainable:lo>=s.goal,points:lo*s.points,goalTransit:transit(s.goal),
      outboundLegs:s.goal,returnLegs:s.goal-1};
  }
  if(s.delivery && s.delivery!=='staged') throw Error('Unknown delivery mode.');
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
