import { defineQuery, defineSignal, defineUpdate, setHandler } from '@temporalio/workflow';
import { Arrivals } from './arrivals';

export const Open = defineSignal('Open');
export const Approve = defineSignal<[approver: string]>('Approve');
export const Review = defineUpdate<string, [note: string]>('Review');
export const Status = defineQuery<string>('Status');

export interface Decision {
  request: string;
  approver: string;
  note: string;
  status: string;
}

export async function Approval(request: string): Promise<Decision> {
  let status = 'submitted';
  const opens = new Arrivals<void>();
  const approves = new Arrivals<string>();
  const reviews = new Arrivals<string>();

  setHandler(Open, () => {
    status = 'open';
    opens.add();
  });
  setHandler(Approve, (approver) => {
    status = 'approved';
    approves.add(approver);
  });
  setHandler(Review, (note) => {
    status = 'reviewed';
    reviews.add(note);
    return status;
  });
  setHandler(Status, () => status);

  await opens.take();
  const approval = approves.take(); // begins waiting here, at its binding
  const note = await reviews.take();
  const approver = await approval;
  return { request, approver, note, status };
}
