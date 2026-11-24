// What an invented release needs to meet every effective-readiness criterion, for tests that mark one effective.
// Synthetic teaching fixtures: an invented interaction and trial with no relation to any game.
import {cycleStages} from '../../scripts/effective-readiness.mjs';

/** One deciding interaction with a current, passing planar trial, as the layout judgement reports it. */
export const readyInteraction = () => ({id: 'invented pull-in', piece: 'sample', plane: {normal: 'y', atMm: 0}, verdict: 'planar is enough', reasons: ['Invented'],
  decides: 'Invented: whether the rollers pull the sample in',
  trial: {name: 'invented pull-in', engine: 'planar', result: 'passed', state: 'current', findings: [], adjustments: [], changes: [], sensitivity: []}});

/** The cycle: the operating motion under transfer, park and service with their own motions, and every other phase not applicable. */
export const readyCycle = (operating, {park, service} = {}) => cycleStages.map(phase => {
  const motion = {transfer: operating, park, service}[phase];
  return motion ? {phase, motions: [motion]} : {phase, notApplicable: 'Invented: no ' + phase + ' motion in this layout'};
});

/** A risk with neither a closing design change nor a bench test: it leaves the risk criterion, and only it, unmet. */
export const openRisk = {id: 'invented-belt-slip', risk: 'Invented: the belt may slip when the sample is wet'};
