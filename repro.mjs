// Repro for @mastra/client-js 1.31.1:
// AgentControllerSession.subscribe() never reconnects after the SSE stream drops,
// a clean server close is completely silent (onError is not called), and there is
// no API to refresh the Authorization header for a long-lived session.
//
// Run: npm install && node repro.mjs
import { MastraClient } from '@mastra/client-js';
import { setTimeout as sleep } from 'node:timers/promises';
import { startMockServer } from './server.mjs';

const server = await startMockServer();
const results = [];
const check = (label, ok) => {
  results.push(ok);
  console.log(`  ${ok ? 'CONFIRMED' : 'NOT REPRODUCED'}: ${label}`);
};

async function subscribeAndCollect(mode) {
  const client = new MastraClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
    retries: 0,
    headers: { authorization: 'Bearer initial-token' },
  });
  // The resourceId selects the mock server's close behavior (clean vs destroy).
  const session = client.getAgentController('demo').session(`res-${mode}`);
  const events = [];
  const errors = [];
  const subscription = await session.subscribe({
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error),
  });
  return { events, errors, subscription };
}

// --- Case 1: server ends the response cleanly (e.g. LB idle timeout with proper close)
console.log('\nCase 1: server closes the SSE response cleanly after 3 events');
const clean = await subscribeAndCollect('clean');
await sleep(1000); // ample time for any reconnect attempt or error callback
const cleanRequests = server.requestLog.filter((r) => r.path.includes('res-clean'));
check('all 3 events arrived before the close', clean.events.length === 3);
check('after the close: no further events, and onError was NEVER called (silent death)', clean.errors.length === 0);
check('no reconnect request hit the server (1 request total)', cleanRequests.length === 1);

// --- Case 2: connection drops abruptly (network blip / proxy reset)
console.log('\nCase 2: socket destroyed mid-stream after 3 events');
const abrupt = await subscribeAndCollect('destroy');
await sleep(1000);
const abruptRequests = server.requestLog.filter((r) => r.path.includes('res-destroy'));
check('all 3 events arrived before the drop', abrupt.events.length === 3);
check('onError fired exactly once, then the subscription is permanently dead', abrupt.errors.length === 1);
check('no reconnect request hit the server (1 request total)', abruptRequests.length === 1);

// --- Case 3: the subscription handle offers no recovery or auth surface
console.log('\nCase 3: API surface of the subscription handle');
console.log(`  Object.keys(subscription) = ${JSON.stringify(Object.keys(clean.subscription))}`);
check(
  'the only method is unsubscribe() — no reconnect/resume, unlike ProcessAgentThreadStreamOptions.reconnect',
  Object.keys(clean.subscription).join(',') === 'unsubscribe',
);
console.log(
  '  Note: ClientOptions.headers is a static Record<string,string> captured at construction —\n' +
    '  there is no headers-provider callback, so a rotated JWT requires constructing a new\n' +
    '  MastraClient and hand-rolling re-subscription.',
);

server.close();
console.log(results.every(Boolean) ? '\nAll findings reproduced.' : '\nSome findings did NOT reproduce.');
process.exit(results.every(Boolean) ? 0 : 1);
