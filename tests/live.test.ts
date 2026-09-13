import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeLive } from '../web/src/lib/live.ts';

test('live client: fragmented events, heartbeat, reconnect and cleanup', async () => {
  const originalFetch = globalThis.fetch;
  let connections = 0, updates = 0;
  let latestSignal: AbortSignal;
  let resolveReady: () => void;
  const ready = new Promise<void>(resolve => {resolveReady = resolve;});
  globalThis.fetch = async (_url, options) => {
    connections++;
    latestSignal = options!.signal!;
    return new Response(new ReadableStream({start(controller) {
      const encoder = new TextEncoder();
      for (const part of [': heartbeat\n\n', 'data: cha', 'nged\n', '\ndata: changed\n\n']) controller.enqueue(encoder.encode(part));
      if (connections === 1) controller.close();
      else latestSignal.addEventListener('abort', () => controller.error(new Error('aborted')), {once: true});
    }}));
  };
  const unsubscribe = subscribeLive(() => {if (++updates === 4) resolveReady();});
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([ready, new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error('Reconnect timeout')), 5000);})]);
    assert.equal(connections, 2);
    assert.equal(updates, 4);
    unsubscribe();
    assert.equal(latestSignal!.aborted, true);
  } finally {unsubscribe(); clearTimeout(timeout!); globalThis.fetch = originalFetch;}
});
