'use strict';
// Harness driver — after boot, starts one mission through the real ask-bar
// code path so the Agent Stream renders live mission cards for QA screenshots.
setTimeout(() => {
  const ask = document.getElementById('askInput');
  ask.value = 'Refactor the orchestrator to run agents in parallel with tests';
  ask.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}, 700);
