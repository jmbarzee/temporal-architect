import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { WorkflowFailedError, WorkflowUpdateFailedError } from '@temporalio/client';
import { ActivityFailure } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { Attempt, Job, Proceed } from './workflows';
import { jobTypes } from './worker';

let env: TestWorkflowEnvironment;
const taskQueue = 'jobs';

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

after(async () => {
  await env?.teardown();
});

/** The error's ActivityFailure cause names Reject. */
function rejectedByReject(err: unknown) {
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof ActivityFailure && cause.activityType === 'Reject';
}

/** Rejects if p has not settled within ms, so the held Process is released and the test fails rather than hangs. */
function within<T>(p: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    p,
    sleep(ms, undefined, { ref: false }).then(() => {
      throw new Error(`not settled within ${ms}ms`);
    }),
  ]);
}

test('Job: Reject fails the update, then the run, while Process is held and never cancelled', async () => {
  // Process is held until the run has failed, so it is still running when Reject fails.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    ...jobTypes(),
    activities: { ...jobTypes().activities, Process: () => held },
  });
  await worker.runUntil(async () => {
    try {
      const h = await env.client.workflow.start(Job, { taskQueue, workflowId: 'job', args: ['a'] });

      await assert.rejects(within(h.executeUpdate(Attempt)), (e) => e instanceof WorkflowUpdateFailedError && rejectedByReject(e));
      assert.equal((await h.describe()).status.name, 'RUNNING', 'the failed update failed the run');

      await h.signal(Proceed);
      await assert.rejects(within(h.result()), (e) => e instanceof WorkflowFailedError && rejectedByReject(e));

      const events = (await h.fetchHistory()).events ?? [];
      const processes = events.filter((e) => e.activityTaskScheduledEventAttributes?.activityType?.name === 'Process');
      assert.equal(processes.length, 2, 'Process did not start beside Reject in both await alls');
      assert.equal(events.filter((e) => e.activityTaskCompletedEventAttributes).length, 0, 'Process completed first');
      assert.equal(events.filter((e) => e.activityTaskCancelRequestedEventAttributes).length, 0, 'Process was cancelled');
    } finally {
      release();
    }
  });
});
