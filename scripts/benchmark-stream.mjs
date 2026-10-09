import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { build } from 'esbuild';

// Deterministic processing benchmark, separate from app/animation frame timing.
const compiled = await build({
  entryPoints: [resolve('src/renderer/context/conversationStream.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { ConversationStream } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const makeEvent = seq => ({ type: 'log', level: 'info', text: `Event ${seq}`, seq, runId: 'benchmark', dotId: 'fixture', ts: seq });
const history = Array.from({ length: 20_000 }, (_, index) => makeEvent(index + 1));
const incoming = Array.from({ length: 2_000 }, (_, index) => makeEvent(history.length + index + 1));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const oldTimes = [], newTimes = [];

for (let trial = 0; trial < 7; trial++) {
  let previous = history;
  let start = performance.now();
  for (const event of incoming) {
    if (!previous.some(item => item.seq === event.seq)) previous = [...previous, event];
  }
  const oldMs = performance.now() - start;
  assert.equal(previous.length, history.length + incoming.length);

  const stream = new ConversationStream();
  stream.selectRun('benchmark'); stream.mergeSnapshot('benchmark', history);
  let published = 0;
  stream.subscribeEvents(() => published++);
  start = performance.now();
  for (const event of incoming) stream.receive(event);
  stream.flush();
  const newMs = performance.now() - start;
  assert.deepEqual(stream.getEvents(), previous);
  assert.equal(published, 1);
  stream.dispose();
  if (trial) { oldTimes.push(oldMs); newTimes.push(newMs); }
}

const oldMs = median(oldTimes), newMs = median(newTimes);
console.log(JSON.stringify({
  scenario: 'Append a burst of 2,000 durable events to a 20,000-event conversation',
  trials: oldTimes.length, existingEvents: history.length, incomingEvents: incoming.length,
  beforeMedianMs: Number(oldMs.toFixed(2)), afterMedianMs: Number(newMs.toFixed(2)),
  processingSpeedup: Number((oldMs / newMs).toFixed(1)),
  beforeSnapshotPublications: incoming.length, afterSnapshotPublications: 1,
  note: 'Synthetic event-processing timing; not a claim about whole-app frame rate.',
}, null, 2));
