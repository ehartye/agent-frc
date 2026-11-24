// The static, offline page of a concept study: the ranking with cost signals and Pareto flags, a fragility banner,
// the margin in each match context and one margin curve per swept quantity with its competitive range and
// break-even values. It reads only the summary fields of agent-frc/concept-results@1, never comparison.cells.
import {writeFileSync} from 'node:fs';
import {inlineThemeFonts} from './theme-fonts.mjs';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number.isFinite(n)?String(Number(n.toFixed(3))):'—';
const yes=flag=>flag===true?'yes':flag===false?'no':'—';
const pct=n=>Number.isFinite(n)?Math.round(n*100)+'%':'—';

const STYLE=`:root{--ink:#182e49;--muted:#516677;--paper:#f7faf8;--card:#ffffff;--line:#b7c9d0;--accent:#194fb0;--band:#d9ecdf;
--good:#1f7a4d;--bad:#b4432a;--warn-bg:#fae3ce;--warn-edge:#b85a26;--head:#142f63;
--display:"Barlow Condensed","Franklin Gothic Medium","Arial Narrow",sans-serif;--body:"Source Sans 3","Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--ink:#e9edf2;--muted:#a3afbd;--paper:#11161c;--card:#1a222b;--line:#33404d;--accent:#8db7ff;
--band:#1f3a2c;--good:#6fd0a8;--bad:#ff9a86;--warn-bg:#3a2617;--warn-edge:#f0bd5e;--head:#c9d7ef}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 var(--body)}
main{max-width:72rem;margin:0 auto;padding:1.5rem clamp(14px,3vw,48px) 3rem}
h1,h2,h3{font-family:var(--display);color:var(--head);margin:1.4rem 0 .4rem;line-height:1.1}h1{font-size:2.2rem;margin-top:0}h2{font-size:1.5rem}h3{font-size:1.15rem;margin:0 0 .3rem;overflow-wrap:anywhere}
p{margin:.3rem 0}.muted,figcaption{color:var(--muted)}figcaption{font-size:.9rem}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:.95rem}
th,td{border-bottom:1px solid var(--line);padding:4px 10px 4px 0;text-align:left;vertical-align:top}th{font-weight:600}td.n{text-align:right}
#fragility{background:var(--warn-bg);border-left:5px solid var(--warn-edge);padding:10px 14px;margin:1rem 0}#fragility ul{margin:.3rem 0 0;padding-left:1.2rem}
.sweeps{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
svg{display:block;width:100%;height:auto}svg text{fill:var(--muted);font:11px var(--body)}
.axis{stroke:var(--line)}.curve{fill:none;stroke:var(--accent);stroke-width:2}.runner{stroke:var(--muted);stroke-dasharray:4 3}
.range{fill:var(--band)}.even{stroke:var(--bad);stroke-width:1.5;stroke-dasharray:2 2}.base{stroke:var(--ink);stroke-width:1}
.dot-in{fill:var(--good)}.dot-out{fill:var(--bad)}code{font-size:.9em}
.badge{display:inline-block;border-radius:4px;padding:0 6px;font-size:.85rem;white-space:nowrap}.badge.warn{background:var(--warn-bg);border:1px solid var(--warn-edge)}
#limits{border-left:5px solid var(--warn-edge);padding:6px 14px;margin:1rem 0}`;

// The robot-limit screen of one candidate (concept:check): a warning badge per exceedance, or "within".
const limitCell=limits=>!limits?'—':limits.exceeds.length?limits.exceeds.map(x=>
  `<span class="badge warn">exceeds ${esc(x.check)}: ${num(x.value)} ${esc(x.unit)} over ${num(x.limit)} ${esc(x.unit)}</span>`).join(' '):
  Object.values(limits.checks).includes('unresolved')?'within known limits':'within';

// One margin curve: mean margin against the swept value, the runner-up's mean, the competitive range and break-evens.
function curve(row) {
  const W=360,H=190,L=44,R=12,T=14,B=36, pts=row.margins??[];
  const xs=pts.map(p=>p.value), ys=[...pts.map(p=>p.meanMargin),row.runnerUpMeanMargin].filter(Number.isFinite);
  const [x0,x1]=xs.length?[Math.min(...xs),Math.max(...xs)]:[0,1], [y0,y1]=ys.length?[Math.min(...ys),Math.max(...ys)]:[0,1];
  const padY=(y1-y0)*0.12||1;
  const X=v=>x1===x0?L+(W-L-R)/2:L+(v-x0)/(x1-x0)*(W-L-R), Y=v=>T+(y1+padY-v)/((y1+padY)-(y0-padY))*(H-T-B);
  const parts=[`<line class="axis" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"/>`,`<line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"/>`];
  if(row.range){
    const a=X(row.range[0]),b=X(row.range[1]),w=Math.max(b-a,4);
    parts.push(`<rect class="range" x="${(b-a<4?a-2:a).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${H-T-B}"><title>Competitive range ${num(row.range[0])} to ${num(row.range[1])}</title></rect>`);
  }
  if(Number.isFinite(row.runnerUpMeanMargin))parts.push(`<line class="runner" x1="${L}" x2="${W-R}" y1="${Y(row.runnerUpMeanMargin).toFixed(1)}" y2="${Y(row.runnerUpMeanMargin).toFixed(1)}"><title>Runner-up ${esc(row.runnerUp)}: ${num(row.runnerUpMeanMargin)}</title></line>`);
  parts.push(`<line class="base" x1="${X(row.base).toFixed(1)}" x2="${X(row.base).toFixed(1)}" y1="${T}" y2="${H-B}"/>`);
  for(const [side,value] of Object.entries(row.breakEven??{}))if(value!==null){
    parts.push(`<line class="even" x1="${X(value).toFixed(1)}" x2="${X(value).toFixed(1)}" y1="${T}" y2="${H-B}"><title>Break-even ${side}: ${num(value)}</title></line>`,
      `<text x="${X(value).toFixed(1)}" y="${T+10}" text-anchor="${X(value)>W-R-60?'end':X(value)<L+60?'start':'middle'}">break-even ${num(value)}</text>`);
  }
  if(pts.length)parts.push(`<polyline class="curve" points="${pts.map(p=>X(p.value).toFixed(1)+','+Y(p.meanMargin).toFixed(1)).join(' ')}"/>`);
  for(const p of pts)parts.push(`<circle class="${p.competitive?'dot-in':'dot-out'}" cx="${X(p.value).toFixed(1)}" cy="${Y(p.meanMargin).toFixed(1)}" r="3.5"><title>${num(p.value)}: mean ${num(p.meanMargin)}</title></circle>`);
  parts.push(`<text x="${L}" y="${H-B+14}" text-anchor="middle">${num(x0)}</text>`,`<text x="${W-R}" y="${H-B+14}" text-anchor="end">${num(x1)}</text>`,
    `<text x="${(L+W-R)/2}" y="${H-6}" text-anchor="middle">swept value (base ${num(row.base)})</text>`,
    `<text x="${L-4}" y="${Y(y1).toFixed(1)}" text-anchor="end">${num(y1)}</text>`,`<text x="${L-4}" y="${Y(y0).toFixed(1)}" text-anchor="end">${num(y0)}</text>`);
  const summary=row.range?`competitive from ${num(row.range[0])} to ${num(row.range[1])}`:'not competitive at its base value';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mean margin of ${esc(row.role)} against ${esc(row.pointer)}: ${summary}">${parts.join('')}</svg>`;
}

function sweepCaption(row) {
  const be=row.breakEven??{}, side=(v,w)=>v===null||v===undefined?w+': none within the sweep':w+': '+num(v);
  const range=row.range?`Competitive range ${num(row.range[0])} to ${num(row.range[1])}. Break-even ${side(be.low,'below')}, ${side(be.high,'above')}.`:
    `Not competitive at base. ${[row.overtakes?.low,row.overtakes?.high].some(v=>v!==null&&v!==undefined)?
      `It would match or overtake ${esc(row.runnerUp)} at ${[row.overtakes.low,row.overtakes.high].filter(v=>v!==null&&v!==undefined).map(num).join(' or ')}.`:
      `No swept value matches or overtakes ${esc(row.runnerUp)}.`}`;
  return `${range} ${esc(row.statement??'Other swept quantities are held at their base values.')}`;
}

export function resultsPage(results) {
  const ranking=results.ranking??[], contexts=results.contexts??[], flips=results.fragility?.flips??[];
  const leader=ranking[0], second=ranking[1];
  const decided={meanMargin:'by mean margin',worstMargin:`on worst margin: ${esc(second?.id)} has the same mean`,id:`only by ID order: ${esc(second?.id)} has the same mean and worst margin`}[results.leaderDecidedBy]??'';
  const s=r=>r.costSignals??{};
  const rows=ranking.map(r=>`<tr><td class="n">${r.rank}</td><th scope="row">${esc(r.id)}</th><td>${esc(r.concept??'—')}</td>
<td class="n">${num(r.meanMargin)}</td><td class="n">${num(r.worstMargin)}</td><td class="n">${num(r.maximumRegret)}</td>
<td class="n">${num(s(r).massLbMax)}</td><td class="n">${num(s(r).inputPorts)}</td><td class="n">${num(s(r).outputPorts)}</td>
<td>${yes(s(r).ranged)}</td><td>${yes(s(r).turret)}</td><td>${yes(s(r).adjustableElevation)}</td><td>${yes(s(r).firesWhileMoving)}</td>
<td class="n">${pct(s(r).assumedShare)}</td><td class="n">${num(r.featureCount)}</td><td>${yes(r.pareto)}</td><td>${limitCell(r.limits)}</td></tr>`).join('\n');
  const over=ranking.filter(r=>r.limits?.exceeds?.length);
  const limitNote=over.length?`<p id="limits"><strong>Over a robot limit:</strong> ${over.map(r=>esc(r.id)).join(', ')}. The ranking and Pareto flags do not account for it; fix the concept or the limit before selecting it.</p>`:'';
  const banner=results.fragility?.fragile?`<section id="fragility" role="alert"><strong>Fragile: ${esc(leader?.id)} leads, but depends on these assumptions.</strong>
Each variant below changes one assumed quantity and, by mean margin, would put another candidate first.
<ul>${flips.map(f=>`<li><code>${esc(f.pointer)}</code> = ${num(f.value)} (${esc(f.variant.split('@')[0])}) puts <strong>${esc(f.newLeader)}</strong> first</li>`).join('')}</ul></section>`:'';
  const contextRows=contexts.map(c=>`<tr><th scope="row">${esc(c.id)}</th>${ranking.map(r=>`<td class="n">${num(r.margins?.[c.id])}</td>`).join('')}<td>${esc(c.basis??'')}</td></tr>`).join('\n');
  const figures=(results.competitiveRanges??[]).map(row=>`<figure><h3>${esc(row.role)} · <code>${esc(row.pointer)}</code></h3>
<p class="muted">${esc(row.label)} quantity · base ${num(row.base)}${row.betterDirection?' · '+esc(row.betterDirection)+' is better':''}</p>${curve(row)}<figcaption>${sweepCaption(row)}</figcaption></figure>`).join('\n');
  const invalid=(results.invalidVariants??[]).length?`<h2>Variants not played</h2><ul>${results.invalidVariants.map(v=>`<li><code>${esc(v.id)}</code>: ${esc(v.error)}</li>`).join('')}</ul>`:'';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Concept study results</title><style>${inlineThemeFonts()}${STYLE}</style></head>
<body><main>
<h1>Concept study results</h1>
<p>Study <code>${esc(results.study?.file??'')}</code> · ${results.plannedMatches??'—'} matches · focal side ${esc(results.side??'')}</p>
<p>First by the ranking: <strong>${esc(leader?.id??'—')}</strong>${decided?' — decided '+decided:''}. The ranking is a recommendation; the student selects the concept and records why.</p>
${banner}
${limitNote}
<h2>Ranking</h2>
<div class="scroll"><table id="ranking"><thead><tr><th>Rank</th><th>Candidate</th><th>Concept</th><th>Mean margin</th><th>Worst margin</th><th>Max regret</th>
<th>Mass max (lb)</th><th>Input ports</th><th>Output ports</th><th>Ranged</th><th>Turret</th><th>Adjustable elevation</th><th>Fires moving</th><th>Assumed</th><th>Features</th><th>Pareto</th><th>Limits</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="muted">Margins are alliance points minus opponent points in expected points, averaged over the contexts. Regret is against the best base candidate in each context. Pareto: no other candidate has an equal or higher mean margin with an equal or lower maximum mass and feature count and is better in one of them.</p>
<h2>Margin by context</h2>
<div class="scroll"><table id="contexts"><thead><tr><th>Context</th>${ranking.map(r=>`<th>${esc(r.id)}</th>`).join('')}<th>Basis</th></tr></thead>
<tbody>${contextRows}</tbody></table></div>
<h2>Swept assumptions</h2>
<p class="muted">Each curve changes one quantity of one candidate; every other quantity is held at base. The shaded band is the competitive range around the base value (vertical line), the dashed line the runner-up's mean margin and red dashed lines the break-even values.</p>
<div class="sweeps" id="sweeps">${figures}</div>
${invalid}
<h2>Scope</h2><p class="muted">${esc(results.scope??'')}</p>
</main></body></html>
`;
}

export async function writeResultsPage(results,file) {
  writeFileSync(file,resultsPage(results));
}
