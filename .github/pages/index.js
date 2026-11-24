'use strict';

// One phase at a time. Without this script every phase is on the page, in order.
const phases=[...document.querySelectorAll('.phase')];
const links=[...document.querySelectorAll('[data-phase]')];
function show(id){
  for(const phase of phases) phase.hidden=phase.id!==id;
  for(const link of links) {
    if(link.dataset.phase===id) link.setAttribute('aria-current','step'); else link.removeAttribute('aria-current');
  }
}
function follow(){ show(phases.find(p=>p.id===location.hash.slice(1))?.id ?? phases[0].id); }
// The browser follows the link before the phase is shown, so the page moves there itself.
function turn(){ follow(); if(phases.some(p=>p.id===location.hash.slice(1))) document.getElementById('process').scrollIntoView(); }
turn();window.addEventListener('hashchange',turn);
