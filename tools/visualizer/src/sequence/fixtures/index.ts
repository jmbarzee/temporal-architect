import type { Model } from '../model'
import { agentSandbox } from './agent-sandbox'
import { rules } from './rules'
import { draw } from './sample'
import { spotTraining } from './spot-training'

export { rules }
export const samples: Record<string, Model> = { 'agent-sandbox': draw(agentSandbox), 'spot-training': draw(spotTraining) }
export const fixtures: Record<string, Model> = { ...samples, ...rules }
