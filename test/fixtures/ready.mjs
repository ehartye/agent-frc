// What an invented release needs to meet every effective-readiness criterion, for tests that mark one effective.
// Synthetic teaching fixtures: an invented interaction and trial with no relation to any game.
import {cycleStages} from '../../scripts/effective-readiness.mjs';

/** One deciding interaction backing `cases`, with a current, passing planar trial, as the layout check records it. */
export const readyInteraction = cases => ({id: 'invented pull-in', piece: 'sample', verdict: 'planar is enough', reasons: ['Invented'],
  decides: 'Invented: whether the rollers pull the sample in', cases,
  trial: {name: 'invented pull-in', engine: 'planar', result: 'passed', state: 'current', findings: [], adjustments: [], changes: [], sensitivity: []}});

/** The cycle map: every operating stage played by `operating`, and park and service by their own cases or not applicable. */
export const readyCycle = (operating, {park, service} = {}) => Object.fromEntries(cycleStages.map(stage => [stage,
  stage === 'park' || stage === 'service' ? ({park, service}[stage] ? {cases: [{park, service}[stage]]} : {notApplicable: 'Invented: no ' + stage + ' case in this layout'})
    : {cases: [operating]}]));

/** missions.json: the mission cases, the cycle map and a risk register with nothing open. */
export const readyMissions = (missionCases, operating, more) => ({missionCases, cycle: readyCycle(operating, more), risks: []});

/** A risk with neither a closing design change nor a bench test: it leaves the risk criterion, and only it, unmet. */
export const openRisk = {id: 'invented-belt-slip', risk: 'Invented: the belt may slip when the sample is wet'};
