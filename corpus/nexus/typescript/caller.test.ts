import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { GreeterEndpoint, greeterTaskQueue } from './api';
import { Caller } from './caller-workflows';
import { Greet } from './greeter-workflows';
import { callerTypes, greeterTypes } from './worker';

let env: TestWorkflowEnvironment;

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
  await env.createNexusEndpoint(GreeterEndpoint, greeterTaskQueue);
});

after(async () => {
  await env?.teardown();
});

test('Caller: sync and async operations, and a detached Greet it never waits for', async () => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const caller = await Worker.create({ connection: env.nativeConnection, taskQueue: 'caller', ...callerTypes() });
  const greeter = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: greeterTaskQueue,
    ...greeterTypes(),
    activities: {
      // Grace's greeting is held until after Caller returns.
      Compose: async (name: string) => {
        if (name === 'Grace') await held;
        return 'Greetings, ' + name;
      },
    },
  });

  const got = await greeter.runUntil(
    caller.runUntil(async () => {
      const r = await env.client.workflow.execute(Caller, { taskQueue: 'caller', workflowId: 'caller-1', args: ['Ada', 'Grace'] });
      const grace = env.client.workflow.getHandle('greet-Grace');
      assert.equal((await grace.describe()).status.name, 'RUNNING', 'Caller awaited its detached Greet');
      release();
      assert.equal(await grace.result(), 'Greetings, Grace');
      return r;
    }),
  );
  assert.deepEqual(got, { hello: 'Hello, Ada', greeting: 'Greetings, Ada' });
});

test('Greet', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: greeterTaskQueue, ...greeterTypes() });
  const got = await worker.runUntil(
    env.client.workflow.execute(Greet, { taskQueue: greeterTaskQueue, workflowId: 'greet-1', args: ['Ada'] }),
  );
  assert.equal(got, 'Greetings, Ada');
});
