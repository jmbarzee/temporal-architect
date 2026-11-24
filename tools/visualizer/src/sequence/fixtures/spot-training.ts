// One job through jmbarzee/temporal-spot-training (twf/training/v1/training.twf,
// twf/deploy/v1/deploy.twf): host A trains three chunks and is interrupted in
// the fourth; host B is lost without notice and its chunk times out on its
// heartbeat; Batch gives up, a new job brings host C, which finishes. Its hand
// drawing is docs/workflows.svg there. Only the events the drawing needs are
// written.

import { queuedId } from '../fromExecution'
import type { Sample } from './sample'
import { script } from './sample'

const TRAINING = 'workflow:github.com/jmbarzee/temporal-spot-training/twf/training/v1.Training'
const activity = (name: string, worker: string) => `activity:github.com/jmbarzee/temporal-spot-training/twf/training/v1.${name}/worker:${worker}/namespace:training`
const SUBMIT = activity('SubmitBatchJob', 'controller')
const CHECK = activity('CheckBatchJob', 'controller')
const CHUNK = activity('RunTrainingChunk', 'spot')

const s = script()
const t = s.lane({ id: TRAINING, node: `${TRAINING}/worker:controller/namespace:training` })
const host = (n: number) => s.lane({ id: `worker:spot @${n}`, node: 'worker:spot/namespace:training' }).lane
const [hostA, hostB, hostC] = [host(1), host(2), host(3)]
const batch = s.lane({ id: 'outside:AWS Batch' })

const LOOP = 'for (start < job.totalSteps)'
const RUN = `${LOOP} › promise chunk <- activity RunTrainingChunk(job, start)`
const CHECKED = `${LOOP} › for › await one › timer(checkEvery)`

const submit1 = t.call('if (batchJob == null) › activity SubmitBatchJob(job, "training-{job.id}") -> batchJob', SUBMIT, {}, 't-submit1')
batch.occur('SubmitJob', { from: submit1 }, 'b-submit1')
const launchA = batch.occur('launch instance', {}, 'b-launch-a')
const chunks = [
  t.call(RUN, CHUNK, { visit: [1], on: hostA.id, after: [launchA] }, 't-c0'),
  t.call(RUN, CHUNK, { visit: [2], on: hostA.id }, 't-c1000'),
  t.call(RUN, CHUNK, { visit: [3], on: hostA.id }, 't-c2000'),
]
batch.occur('spot interruption notice', { after: [chunks[2]] }, 'b-notice')
chunks.push(t.call(RUN, CHUNK, { visit: [4], on: hostA.id }, 't-c3000'))
const reclaimed = batch.occur('instance reclaimed: retry', {}, 'b-reclaimed')

// Chunk 3400 waits for a host: the first attempt runs on B, the retry on C.
t.reach(RUN, { visit: [5], after: [reclaimed], edge: { from: t.lane.node!, to: CHUNK, kind: 'activityCall' } })
batch.occur('RUNNABLE: awaiting instance', {}, 'b-runnable')
const timer1 = t.end(CHECKED, { visit: [5, 1] }, 't-timer1')
const check1 = t.call(`${CHECKED} › activity CheckBatchJob(batchJob) -> status`, CHECK, { visit: [5, 1] }, 't-check1')
batch.occur('DescribeJobs: RUNNABLE', { from: check1 }, 'b-describe1')
const wait = t.reach(`${CHECKED} › if (status.terminal)`, { visit: [5, 1] }, 't-wait')
const launchB = batch.occur('launch instance', { after: [wait] }, 'b-launch-b')
const onB = t.start(RUN, { visit: [5], on: hostB.id, after: [launchB] }, 't-c3400b')
const lostB = batch.occur('host lost without notice', { outcome: 'failed' }, 'b-lost')
batch.occur('attempts spent: FAILED', { outcome: 'failed' }, 'b-failed')
const lost = t.end(RUN, { visit: [5], attempt: 1, outcome: 'timedOut' }, 't-fail')
const timer2 = t.end(CHECKED, { visit: [5, 2] }, 't-timer2')
const check2 = t.call(`${CHECKED} › activity CheckBatchJob(batchJob) -> status`, CHECK, { visit: [5, 2] }, 't-check2')
batch.occur('DescribeJobs: FAILED', { from: check2 }, 'b-describe2')
const submit2 = t.call(`${CHECKED} › if (status.terminal) › activity SubmitBatchJob(job, "training-{job.id}") -> batchJob`, SUBMIT, { visit: [5, 2] }, 't-submit2')
batch.occur('SubmitJob', { from: submit2 }, 'b-submit2')
const launchC = batch.occur('launch instance', {}, 'b-launch-c')
const onC = t.start(RUN, { visit: [5], attempt: 2, on: hostC.id, after: [launchC] }, 't-c3400c')
const last = t.call(RUN, CHUNK, { visit: [6], on: hostC.id }, 't-c4400')
const terminate = t.call('activity TerminateBatchJob(batchJob)', activity('TerminateBatchJob', 'controller'), {}, 't-terminate')
const terminated = batch.occur('TerminateJob', { from: terminate }, 'b-terminate')
t.lane.endedBy = t.reach('close complete(Result{start})', {}, 't-close')
Object.assign(hostA, { startedBy: launchA, endedBy: reclaimed })
Object.assign(hostB, { startedBy: launchB, endedBy: lostB })
Object.assign(hostC, { startedBy: launchC, endedBy: terminated })
s.names[queuedId(onB)] = 't-q1'
s.names[queuedId(onC)] = 't-q2'

const SPOT_HOSTS = { title: 'SPOT HOSTS' }

export const spotTraining: Sample = {
  execution: s.execution,
  graph: {
    nodes: [
      { id: 'worker:controller/namespace:training', definition: 'worker:controller', name: 'controller', queue: 'training' },
      { id: 'worker:spot/namespace:training', definition: 'worker:spot', name: 'spot', queue: 'training-{jobId}' },
    ],
  },
  knobs: {
    title: 'One job',
    lanes: { [hostA.id]: SPOT_HOSTS, [hostB.id]: SPOT_HOSTS, [hostC.id]: SPOT_HOSTS, [batch.lane.id]: { tag: { key: 'batch job', value: 'one per job' } } },
    labels: {
      [s.key(chunks[0])]: 'RunTrainingChunk(0) → 1000',
      [s.key(chunks[1])]: 'RunTrainingChunk(1000) → 2000',
      [s.key(chunks[2])]: 'RunTrainingChunk(2000) → 3000',
      [s.key(chunks[3])]: 'RunTrainingChunk(3000) → 3400',
      [queuedId(s.key(onB))]: 'RunTrainingChunk(3400)',
      [s.key(onB)]: 'RunTrainingChunk(3400)',
      [s.key(lost)]: '✕ no heartbeat for 2m: timed out',
      [queuedId(s.key(onC))]: 'RunTrainingChunk(3400)',
      [s.key(onC)]: 'RunTrainingChunk(3400) → 4400',
      [s.key(last)]: 'RunTrainingChunk(4400) → last',
      [s.key(timer1)]: 'timer(30m)',
      [s.key(timer2)]: 'timer(30m)',
    },
    notes: { [s.key(wait)]: 'Batch job still there: wait' },
  },
  names: s.names,
}
