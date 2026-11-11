import { ApplicationFailure } from '@temporalio/activity';

export async function Reject(item: string): Promise<void> {
  throw ApplicationFailure.create({ message: `rejected ${item}`, type: 'Rejected' });
}

export async function Process(_item: string): Promise<void> {}
