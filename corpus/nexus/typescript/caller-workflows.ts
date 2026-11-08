import { NexusOperationCancellationType, createNexusServiceClient } from '@temporalio/workflow';
import { GreeterEndpoint, GreeterService } from './api';

export interface Greetings {
  hello: string;
  greeting: string;
}

export async function Caller(name: string, friend: string): Promise<Greetings> {
  const greeter = createNexusServiceClient({ endpoint: GreeterEndpoint, service: GreeterService });
  const hello = await greeter.executeOperation('Hello', name);
  const greeting = await greeter.executeOperation('Greet', name);
  // detach: wait for the start, never the result, and never propagate cancellation.
  await greeter.startOperation('Greet', friend, { cancellationType: NexusOperationCancellationType.ABANDON });
  return { hello, greeting };
}
