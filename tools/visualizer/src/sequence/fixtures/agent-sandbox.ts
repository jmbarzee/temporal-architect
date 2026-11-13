// One run through jmbarzee/temporal-agent-sandbox (twf/agent/v1/agent.twf,
// twf/sandbox/v1/sandbox.twf): two turns with a user prompt between. Written
// by hand from the design; its hand drawing is docs/workflows.svg there.

import type { Execution } from '../execution'

export const agentSandbox: Execution = {
  title: 'One run',
  lanes: [
    { id: 'agent', kind: 'workflow', name: 'Agent', title: 'AGENT', tag: { key: 'task_queue', value: 'agent' } },
    { id: 'orchestrator', kind: 'workflow', name: 'SandboxOrchestrator', title: 'SANDBOX DISTRIBUTOR', tag: { key: 'task_queue', value: 'sandboxes' } },
    { id: 'sandbox', kind: 'workflow', name: 'Sandbox', title: 'SANDBOX INSTANCE', tag: { key: 'task_queue', value: 'sandboxes' }, startedBy: 'o-detach' },
  ],
  steps: [
    { id: 'a-request', lane: 'agent', kind: 'send', label: 'SandboxOrchestrator.Request' },
    { id: 'a-assign', lane: 'agent', kind: 'await', label: 'SandboxAssign' },
    { id: 'a-lease1', lane: 'agent', kind: 'send', label: 'Sandbox.LeaseRequest' },
    { id: 'a-grant1', lane: 'agent', kind: 'await', label: 'SandboxLeaseGrant' },
    { id: 'a-model1', lane: 'agent', kind: 'activity', label: 'CallModel' },
    { id: 'a-tool1', lane: 'agent', kind: 'activity', label: 'RunTool', queue: 'sandbox-{id}' },
    { id: 'a-model2', lane: 'agent', kind: 'activity', label: 'CallModel' },
    { id: 'a-release1', lane: 'agent', kind: 'send', label: 'Sandbox.LeaseRelease' },
    // The user reads the answer before prompting again.
    { id: 'a-prompt', lane: 'agent', kind: 'await', label: 'UserPrompt', pause: 1 },
    { id: 'a-lease2', lane: 'agent', kind: 'send', label: 'Sandbox.LeaseRequest' },
    { id: 'a-grant2', lane: 'agent', kind: 'await', label: 'SandboxLeaseGrant' },
    { id: 'a-model3', lane: 'agent', kind: 'activity', label: 'CallModel' },
    { id: 'a-tool2', lane: 'agent', kind: 'activity', label: 'RunTool', queue: 'sandbox-{id}' },
    { id: 'a-model4', lane: 'agent', kind: 'activity', label: 'CallModel' },
    { id: 'a-release2', lane: 'agent', kind: 'send', label: 'Sandbox.LeaseRelease' },
    { id: 'a-close', lane: 'agent', kind: 'close', label: 'complete' },

    { id: 'o-request', lane: 'orchestrator', kind: 'handler', label: 'Request' },
    { id: 'o-detach', lane: 'orchestrator', kind: 'detach', label: 'Sandbox' },
    { id: 'o-assign', lane: 'orchestrator', kind: 'send', label: 'Agent.SandboxAssign' },
    { id: 'o-next', lane: 'orchestrator', kind: 'note', label: '↺ await next Request' },

    { id: 's-render', lane: 'sandbox', kind: 'activity', label: 'helm.RenderChart' },
    { id: 's-create', lane: 'sandbox', kind: 'activity', label: 'kube.Create' },
    { id: 's-ready', lane: 'sandbox', kind: 'activity', label: 'kube.Ready' },
    { id: 's-lease1', lane: 'sandbox', kind: 'await', label: 'LeaseRequest' },
    { id: 's-grant1', lane: 'sandbox', kind: 'send', label: 'SandboxLeaseGrant' },
    { id: 's-release1', lane: 'sandbox', kind: 'await', label: 'LeaseRelease' },
    // Armed by the loop's next pass, cancelled when the next LeaseRequest wins.
    { id: 's-timer1', lane: 'sandbox', kind: 'timer', label: 'timer(deadline - now)', state: 'cancelled' },
    { id: 's-lease2', lane: 'sandbox', kind: 'await', label: 'LeaseRequest' },
    { id: 's-grant2', lane: 'sandbox', kind: 'send', label: 'SandboxLeaseGrant' },
    { id: 's-release2', lane: 'sandbox', kind: 'await', label: 'LeaseRelease' },
    { id: 's-timer2', lane: 'sandbox', kind: 'timer', label: 'timer(deadline - now)' },
    { id: 's-delete', lane: 'sandbox', kind: 'activity', label: 'kube.Delete' },
    { id: 's-close', lane: 'sandbox', kind: 'close', label: 'complete' },
  ],
  messages: [
    { from: 'a-request', to: 'o-request' },
    { from: 'o-assign', to: 'a-assign' },
    { from: 'a-lease1', to: 's-lease1' },
    { from: 's-grant1', to: 'a-grant1' },
    { from: 'a-release1', to: 's-release1' },
    { from: { outside: 'user', note: '(theoretical)' }, to: 'a-prompt' },
    { from: 'a-lease2', to: 's-lease2' },
    { from: 's-grant2', to: 'a-grant2' },
    { from: 'a-release2', to: 's-release2' },
  ],
  spans: [
    { lane: 'agent', label: 'lease held', from: 'a-grant1', to: 'a-release1' },
    { lane: 'agent', label: 'lease held', from: 'a-grant2', to: 'a-release2' },
  ],
}
