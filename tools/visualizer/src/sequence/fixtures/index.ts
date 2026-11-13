import type { Execution } from '../execution'
import { agentSandbox } from './agent-sandbox'
import { spotTraining } from './spot-training'

export const fixtures: Record<string, Execution> = { 'agent-sandbox': agentSandbox, 'spot-training': spotTraining }
