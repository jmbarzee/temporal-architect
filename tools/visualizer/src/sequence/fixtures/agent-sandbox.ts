// One run through jmbarzee/temporal-agent-sandbox (twf/agent/v1/agent.twf,
// twf/sandbox/v1/sandbox.twf): two turns with a user prompt between. Its hand
// drawing is docs/workflows.svg there. agent.twf ends after one turn and holds
// no LeaseRelease send, no close complete(Result{context}) and one top-level
// for, so the Agent's statements are those it would hold with these, a prompt
// and a second turn appended, its two loops ranked for @1 and for @2. Only the
// events the drawing needs are written. The kube and helm activities run on
// worker sandboxes, in a package outside this tree.

import type { Sample } from './sample'
import { script } from './sample'

const PKG = 'github.com/jmbarzee/temporal-agent-sandbox/twf'
const AGENT = `workflow:${PKG}/agent/v1.Agent`
const ORCHESTRATOR = `workflow:${PKG}/sandbox/v1.SandboxOrchestrator`
const SANDBOX = `workflow:${PKG}/sandbox/v1.Sandbox`
const on = (worker: string) => `/worker:${worker}/namespace:agentsandbox`
const CALL_MODEL = `activity:${PKG}/agent/v1.CallModel${on('agent')}`
const RUN_TOOL = `activity:${PKG}/sandbox/v1.RunTool${on('sidecar')}`
const kube = (name: string) => `activity:github.com/metacensus/library-temporal-kube/twf/${name}${on('sandboxes')}`

const s = script()
const a = s.lane({ id: AGENT, node: AGENT + on('agent') })
const o = s.lane({ id: ORCHESTRATOR, node: ORCHESTRATOR + on('sandboxes') })
const x = s.lane({ id: SANDBOX, node: SANDBOX + on('sandboxes') })

const request = a.send('if (resume == null) › signal sandbox.SandboxOrchestrator.Request(workflow.id, task.relevantAssets)', o.lane.node!, {}, 'a-request')
o.arrive('signal Request', { visit: [1], from: request }, 'o-request')
x.lane.startedBy = o.detach('signal Request › detach workflow Sandbox(sandboxId, assets)', x.lane.node!, { visit: [1] }, 'o-detach')
const assign = o.send('signal Request › signal agent.Agent.SandboxAssign(sandboxId)', a.lane.node!, { visit: [1] }, 'o-assign')
o.end('for › await signal Request', { visit: [1], from: request })
const next = o.reach('for › await signal Request', { visit: [2] }, 'o-next')
a.arrive('signal SandboxAssign', { visit: [1], from: assign })
a.end('if (resume == null) › await one @1 › signal SandboxAssign', { from: assign }, 'a-assign')

x.call('activity helm.RenderChart("sandbox", "sandbox-{sandboxId}", pods.namespace, Values{sandboxId, assets, pods}) -> resources', kube('helm/v1.RenderChart'), {}, 's-render')
x.call('activity kube.Create(resources) -> ids', kube('kube/v1.Create'), {}, 's-create')
x.call('activity kube.Ready(ids)', kube('kube/v1.Ready'), {}, 's-ready')

const LEASE_REQUEST = 'for › await one › signal LeaseRequest -> requester'
const GRANT = `${LEASE_REQUEST} › if (lease == null or lease.owner == requester or workflow.now() >= lease.expiry) › signal agent.Agent.SandboxLeaseGrant(lease)`
const LEASE_RELEASE = 'for › await one › signal LeaseRelease'
const TIMER = 'for › await one › timer(deadline - workflow.now())'

/** A turn: leased, two model calls around a tool call, released. */
function turn(n: 1 | 2, lease: string, granted: string, pass: number) {
  const names = n === 1 ? ['a-lease1', 's-lease1', 's-grant1', 'a-grant1', 'a-model1', 'a-tool1', 'a-model2', 'a-release1', 's-release1']
    : ['a-lease2', 's-lease2', 's-grant2', 'a-grant2', 'a-model3', 'a-tool2', 'a-model4', 'a-release2', 's-release2']
  const requested = a.send(lease, x.lane.node!, {}, names[0])
  x.arrive('signal LeaseRequest', { visit: [n], from: requested })
  x.end(LEASE_REQUEST, { visit: [pass], from: requested }, names[1])
  const grant = x.send(GRANT, a.lane.node!, { visit: [pass] }, names[2])
  a.arrive('signal SandboxLeaseGrant', { visit: [n], from: grant })
  const held = a.end(granted, { from: grant }, names[3])
  a.call(`for @${n} › activity CallModel(context, tools) -> reply`, CALL_MODEL, { visit: [1] }, names[4])
  a.call(`for @${n} › for (call in reply.toolCalls) › activity sandbox.RunTool(call) -> output`, RUN_TOOL, { visit: [1, 1] }, names[5])
  a.call(`for @${n} › activity CallModel(context, tools) -> reply`, CALL_MODEL, { visit: [2] }, names[6])
  const release = a.send(`signal sandbox.Sandbox.LeaseRelease(workflow.id) @${n}`, x.lane.node!, {}, names[7])
  x.arrive('signal LeaseRelease', { visit: [n], from: release })
  x.end(LEASE_RELEASE, { visit: [pass + 1], from: release }, names[8])
  return { lane: AGENT, label: 'lease held', from: s.key(held), to: s.key(release) }
}

const first = turn(1, 'if (resume == null) › await one @1 › signal SandboxAssign › signal sandbox.Sandbox.LeaseRequest(workflow.id)', 'if (resume == null) › await one @2 › signal SandboxLeaseGrant', 1)
// Armed by the loop's next pass, cancelled when the next LeaseRequest wins.
x.end(TIMER, { visit: [3], outcome: 'cancelled' }, 's-timer1')
const prompt = a.end('await signal UserPrompt', {}, 'a-prompt')
const second = turn(2, 'signal sandbox.Sandbox.LeaseRequest(workflow.id)', 'await signal SandboxLeaseGrant', 3)
x.end(TIMER, { visit: [5] }, 's-timer2')
x.call('activity kube.Delete(ids)', kube('kube/v1.Delete'), {}, 's-delete')
x.lane.endedBy = x.reach('close complete', {}, 's-close')
a.lane.endedBy = a.reach('close complete(Result{context})', {}, 'a-close')

const worker = (name: string, queue: string) => ({ id: `worker:${name}/namespace:agentsandbox`, definition: `worker:${name}`, name, queue })

export const agentSandbox: Sample = {
  execution: s.execution,
  graph: { nodes: [worker('agent', 'agent'), worker('sandboxes', 'sandboxes'), worker('sidecar', 'sandbox-{sandboxId}')] },
  knobs: {
    title: 'One run',
    lanes: { [ORCHESTRATOR]: { title: 'SANDBOX DISTRIBUTOR' }, [SANDBOX]: { title: 'SANDBOX INSTANCE' } },
    // The user reads the answer before prompting again.
    pauses: { [s.key(prompt)]: 1 },
    notes: { [s.key(next)]: '↺ await next Request' },
    spans: [first, second],
    outside: { [s.key(prompt)]: { outside: 'user', note: '(theoretical)' } },
  },
  names: s.names,
}
