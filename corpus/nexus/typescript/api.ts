import * as nexus from 'nexus-rpc';

export const GreeterEndpoint = 'GreeterEndpoint';
export const greeterTaskQueue = 'greeter';

// The property key is the operation's wire name unless `name` is set.
export const GreeterService = nexus.service('GreeterService', {
  Hello: nexus.operation<string, string>(),
  Greet: nexus.operation<string, string>(),
});

export const greetId = (name: string): string => `greet-${name}`;
