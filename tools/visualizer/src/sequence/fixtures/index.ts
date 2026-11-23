import type { Execution } from '../execution'
import { agentSandbox } from './agent-sandbox'
import { rules } from './rules'
import { spotTraining } from './spot-training'

export { rules }
export const samples: Record<string, Execution> = { 'agent-sandbox': agentSandbox, 'spot-training': spotTraining }
export const fixtures: Record<string, Execution> = { ...samples, ...rules }
