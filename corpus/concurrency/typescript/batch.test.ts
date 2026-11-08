import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { Ack, Archive, Audit, Batch } from './workflows';
import { batchTypes } from './worker';

let env: TestWorkflowEnvironment;
const taskQueue = 'batches';
const items = ['a', 'b'];

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

after(async () => {
  await env?.teardown();
});

test('Batch: acknowledged, without waiting for its detached Archive', async () => {
  // Archive's Store is held until Batch returns. A held activity stops time
  // skipping, so Ack is sent at once, and the test has a server of its own: on
  // a shared one the later tests' timers never fired.
  const own = await TestWorkflowEnvironment.createTimeSkipping();
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  try {
    const worker = await Worker.create({
      connection: own.nativeConnection,
      taskQueue,
      ...batchTypes(),
      activities: { ...batchTypes().activities, Store: () => held },
    });
    const got = await worker.runUntil(async () => {
      try {
        const h = await own.client.workflow.start(Batch, { taskQueue, workflowId: 'batch-ack', args: [items] });
        await h.signal(Ack);
        const r = await h.result();
        const archiveId = (await h.fetchHistory()).events?.find(
          (e) => e.childWorkflowExecutionStartedEventAttributes?.workflowType?.name === 'Archive',
        )?.childWorkflowExecutionStartedEventAttributes?.workflowExecution?.workflowId;
        assert.ok(archiveId, 'Batch started no Archive');
        const archive = own.client.workflow.getHandle(archiveId);
        assert.equal((await archive.describe()).status.name, 'RUNNING', 'Batch awaited its detached Archive');
        release();
        await archive.result();
        return r;
      } finally {
        release();
      }
    });
    assert.deepEqual(got, { count: 2, audited: true, status: 'acknowledged' });
  } finally {
    await own.teardown();
  }
});

test('Batch: the timer wins', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...batchTypes() });
  const got = await worker.runUntil(
    env.client.workflow.execute(Batch, { taskQueue, workflowId: 'batch-timer', args: [items] }),
  );
  assert.deepEqual(got, { count: 2, audited: true, status: 'unacknowledged' });
});

test('Audit', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...batchTypes() });
  const got = await worker.runUntil(env.client.workflow.execute(Audit, { taskQueue, workflowId: 'audit', args: [['a']] }));
  assert.equal(got, true);
});

test('Archive', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...batchTypes() });
  await worker.runUntil(env.client.workflow.execute(Archive, { taskQueue, workflowId: 'archive', args: [['a']] }));
});
