/** Choose one distinct, reachable opening opportunity per robot before assigning anyone a second piece.
 * Callers supply legal candidates and estimated completion times from the project-owned field.
 * These are planning assignments. Taking custody still requires a live piece in physical reach.
 * The browser embeds this function directly.
 */
export function allocateOpeningTasks(rows) {
  const compare = (a,b) => a<b ? -1 : a>b ? 1 : 0;
  const label = value => typeof value === 'string' && Boolean(value.trim());
  if (!Array.isArray(rows)) throw Error('Supply opening opportunities by robot.');
  // In exact arrival-time ties, interleave numbered alliance slots before considering
  // a second teammate from either side. Other project actor names use stable lexical order.
  const slot = id => /^[BR][1-3]$/i.test(id) ? Number(id.slice(1)) : 4;
  const robots = [...rows].sort((a,b)=>slot(a?.robot)-slot(b?.robot) || compare(a?.robot,b?.robot));
  const sourceOf = new Map();
  const seen = new Set();
  const plans = new Map();
  for (const row of robots) {
    if (!row || !label(row.robot) || seen.has(row.robot) || !Array.isArray(row.candidates) || !label(row.fallback)) {
      throw Error('Each opening robot needs a unique identity, reachable candidates and a fallback.');
    }
    seen.add(row.robot);
    const best = new Map();
    for (const c of row.candidates) {
      if (!c || !label(c.piece) || !label(c.station) || !Number.isFinite(c.timeS) || c.timeS<0) {
        throw Error('An opening candidate needs a physical piece, a station and a finite completion time.');
      }
      if (sourceOf.has(c.piece) && sourceOf.get(c.piece)!==c.station) throw Error('Opening piece listed at two stations: '+c.piece);
      sourceOf.set(c.piece,c.station);
      if (!best.has(c.piece) || c.timeS<best.get(c.piece).timeS) best.set(c.piece,{piece:c.piece,station:c.station,timeS:c.timeS});
    }
    plans.set(row.robot,[...best.values()].sort((a,b)=>a.timeS-b.timeS || compare(a.piece,b.piece)));
  }

  // A residual edge permits an already assigned robot to switch to its second choice so a
  // constrained teammate can use the only piece it can reach. The graph augments until no
  // further robot can be served; shortest augmentations minimize total time at that coverage.
  const pieces=[...sourceOf.keys()].sort(compare);
  const sink=1+robots.length+pieces.length;
  const graph=Array.from({length:sink+1},()=>[]);
  const pieceNode=new Map(pieces.map((id,i)=>[id,1+robots.length+i]));
  function add(a,b,cost,task=null) {
    const forward={to:b,reverse:graph[b].length,cost,available:true,task};
    graph[b].push({to:a,reverse:graph[a].length,cost:-cost,available:false});
    graph[a].push(forward);
  }
  robots.forEach((row,i)=>{
    add(0,1+i,0);
    for(const c of plans.get(row.robot)) add(1+i,pieceNode.get(c.piece),c.timeS,c);
  });
  for(const idx of pieceNode.values()) add(idx,sink,0);
  for(let assigned=0;assigned<robots.length;assigned++){
    const previous=Array(graph.length);
    const distance=Array(graph.length).fill(Infinity);
    const queue=[0], queued=new Set(queue);
    distance[0]=0;
    for(let i=0;i<queue.length;i++){
      const node=queue[i];
      queued.delete(node);
      if(node===sink) continue;
      for(const edge of graph[node]){
        if(!edge.available || edge.to===0) continue;
        const next=distance[node]+edge.cost;
        if(next>=distance[edge.to]-1e-10) continue;
        distance[edge.to]=next;
        previous[edge.to]={node,edge};
        if(!queued.has(edge.to)) {queue.push(edge.to);queued.add(edge.to);}
      }
    }
    if(!previous[sink]) break;
    for(let n=sink;n!==0;){
      const {node,edge}=previous[n];
      edge.available=false;
      graph[n][edge.reverse].available=true;
      n=node;
    }
  }
  return Object.fromEntries(robots.map((row,i)=>{
    const selected=graph[i+1].find(edge=>edge.task && !edge.available);
    return [row.robot,selected?.task ?? {fallback:row.fallback}];
  }));
}
