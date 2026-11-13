// One job through jmbarzee/temporal-spot-training (twf/training/v1/training.twf,
// twf/deploy/v1/deploy.twf): host A trains three chunks and is interrupted in
// the fourth; host B is lost without notice and its chunk times out on its
// heartbeat; Batch gives up, a new job brings host C, which finishes. Written
// by hand from the design; its hand drawing is docs/workflows.svg there.

import type { Execution, Step } from '../execution'

const HOSTS = 'training-{jobId}'
const chunk = (id: string, label: string, after?: string): Step =>
  ({ id, lane: 'training', kind: 'activity', label, queue: HOSTS, ...(after && { after: [after] }) })

export const spotTraining: Execution = {
  title: 'One job',
  lanes: [
    { id: 'training', kind: 'workflow', name: 'Training', title: 'TRAINING', tag: { key: 'task_queue', value: 'training' } },
    { id: 'host-a', kind: 'host', name: 'host A', title: 'SPOT HOSTS', tag: { key: 'task_queue', value: HOSTS }, startedBy: 'b-launch-a', endedAt: 'b-reclaimed' },
    { id: 'host-b', kind: 'host', name: 'host B', title: 'SPOT HOSTS', startedBy: 'b-launch-b', endedAt: 'b-lost' },
    { id: 'host-c', kind: 'host', name: 'host C', title: 'SPOT HOSTS', startedBy: 'b-launch-c', endedAt: 'b-terminate' },
    { id: 'batch', kind: 'external', name: 'AWS Batch', title: 'AWS BATCH', tag: { key: 'batch job', value: 'one per job' } },
  ],
  steps: [
    { id: 't-submit1', lane: 'training', kind: 'activity', label: 'SubmitBatchJob' },
    chunk('t-c0', 'RunTrainingChunk(0) → 1000', 'b-launch-a'),
    chunk('t-c1000', 'RunTrainingChunk(1000) → 2000'),
    chunk('t-c2000', 'RunTrainingChunk(2000) → 3000'),
    chunk('t-c3000', 'RunTrainingChunk(3000) → 3400'),
    { ...chunk('t-q1', 'RunTrainingChunk(3400)', 'b-reclaimed'), state: 'queued' },
    { id: 't-timer1', lane: 'training', kind: 'timer', label: 'timer(30m)' },
    { id: 't-check1', lane: 'training', kind: 'activity', label: 'CheckBatchJob' },
    { id: 't-wait', lane: 'training', kind: 'note', label: 'Batch job still there: wait' },
    chunk('t-c3400b', 'RunTrainingChunk(3400)', 'b-launch-b'),
    { id: 't-fail', lane: 'training', kind: 'event', label: '✕ no heartbeat for 2m: timed out', state: 'failed' },
    { ...chunk('t-q2', 'RunTrainingChunk(3400)'), state: 'queued', attempt: 2 },
    { id: 't-timer2', lane: 'training', kind: 'timer', label: 'timer(30m)' },
    { id: 't-check2', lane: 'training', kind: 'activity', label: 'CheckBatchJob' },
    { id: 't-submit2', lane: 'training', kind: 'activity', label: 'SubmitBatchJob' },
    chunk('t-c3400c', 'RunTrainingChunk(3400) → 4400', 'b-launch-c'),
    chunk('t-c4400', 'RunTrainingChunk(4400) → last'),
    { id: 't-terminate', lane: 'training', kind: 'activity', label: 'TerminateBatchJob' },
    { id: 't-close', lane: 'training', kind: 'close', label: 'complete' },

    { id: 'b-submit1', lane: 'batch', kind: 'event', label: 'SubmitJob' },
    { id: 'b-launch-a', lane: 'batch', kind: 'event', label: 'launch instance' },
    { id: 'b-notice', lane: 'batch', kind: 'event', label: 'spot interruption notice', after: ['t-c2000'] },
    { id: 'b-reclaimed', lane: 'batch', kind: 'event', label: 'instance reclaimed: retry' },
    { id: 'b-runnable', lane: 'batch', kind: 'event', label: 'RUNNABLE: awaiting instance' },
    { id: 'b-describe1', lane: 'batch', kind: 'event', label: 'DescribeJobs: RUNNABLE' },
    { id: 'b-launch-b', lane: 'batch', kind: 'event', label: 'launch instance', after: ['t-wait'] },
    { id: 'b-lost', lane: 'batch', kind: 'event', label: 'host lost without notice', state: 'failed' },
    { id: 'b-failed', lane: 'batch', kind: 'event', label: 'attempts spent: FAILED', state: 'failed' },
    { id: 'b-describe2', lane: 'batch', kind: 'event', label: 'DescribeJobs: FAILED' },
    { id: 'b-submit2', lane: 'batch', kind: 'event', label: 'SubmitJob' },
    { id: 'b-launch-c', lane: 'batch', kind: 'event', label: 'launch instance' },
    { id: 'b-terminate', lane: 'batch', kind: 'event', label: 'TerminateJob' },
  ],
  messages: [
    { from: 't-submit1', to: 'b-submit1' },
    { from: 't-check1', to: 'b-describe1' },
    { from: 't-check2', to: 'b-describe2' },
    { from: 't-submit2', to: 'b-submit2' },
    { from: 't-terminate', to: 'b-terminate' },
  ],
  spans: [],
}
