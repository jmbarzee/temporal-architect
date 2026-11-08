import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { Approval, Approve, Open, Review, Status } from './workflows';
import { approvalTypes } from './worker';

let env: TestWorkflowEnvironment;
const taskQueue = 'approvals';

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

after(async () => {
  await env?.teardown();
});

test('Approval', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...approvalTypes() });
  const got = await worker.runUntil(async () => {
    const h = await env.client.workflow.start(Approval, { taskQueue, workflowId: 'approval-1', args: ['access'] });
    // Approve arrives before anything waits for it, and stays pending.
    await env.sleep('30s');
    await h.signal(Approve, 'Grace');
    await env.sleep('30s');
    await h.signal(Open);
    await env.sleep('1 minute');
    assert.equal(await h.query(Status), 'open');
    assert.equal(await h.executeUpdate(Review, { args: ['LGTM'] }), 'reviewed');
    return h.result();
  });
  assert.deepEqual(got, { request: 'access', approver: 'Grace', note: 'LGTM', status: 'reviewed' });
});

test("Review's caller gets its result before any waiter takes it", async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...approvalTypes() });
  const got = await worker.runUntil(async () => {
    const h = await env.client.workflow.start(Approval, { taskQueue, workflowId: 'approval-2', args: ['access'] });
    // Review arrives while Approval still awaits Open, before anything waits for Review.
    await env.sleep('30s');
    assert.equal(await h.executeUpdate(Review, { args: ['LGTM'] }), 'reviewed');
    await h.signal(Open);
    await env.sleep('1 minute');
    await h.signal(Approve, 'Grace');
    return h.result();
  });
  assert.deepEqual(got, { request: 'access', approver: 'Grace', note: 'LGTM', status: 'approved' });
});
