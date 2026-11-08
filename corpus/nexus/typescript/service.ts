import * as nexus from 'nexus-rpc';
import { WorkflowRunOperationHandler, startWorkflow } from '@temporalio/nexus';
import { GreeterService, greetId } from './api';
import { Greet } from './greeter-workflows';

export const greeterServiceHandler = nexus.serviceHandler(GreeterService, {
  // sync: a plain async function is the operation's whole body.
  Hello: async (_ctx, name) => 'Hello, ' + name,
  // async Greet workflow Greet: a client start; the task queue defaults to the handler's.
  Greet: new WorkflowRunOperationHandler<string, string>((ctx, name) =>
    startWorkflow(ctx, Greet, { args: [name], workflowId: greetId(name) }),
  ),
});
