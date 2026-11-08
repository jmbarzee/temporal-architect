import { condition } from '@temporalio/workflow';

/**
 * A signal's or update's pending arrivals and the waiters for them, each oldest
 * first: a handler adds an arrival when it returns, and the waiter that began
 * waiting first takes the oldest.
 */
export class Arrivals<T> {
  private pending: T[] = [];
  private waiters: number[] = []; // tickets, in the order their waiters began
  private next = 0;

  add(v: T): void {
    this.pending.push(v);
  }

  /** Waits for the oldest arrival; the ticket is taken now, so a promise begins waiting at its binding. */
  take(): Promise<T> {
    return this.takeAt(this.wait());
  }

  /** take for a waiter that began earlier with wait. */
  async takeAt(ticket: number): Promise<T> {
    try {
      await condition(() => this.ready(ticket));
      return this.claim();
    } finally {
      this.leave(ticket);
    }
  }

  /** Begins a waiter. An await one case waits, checks ready without taking, and claims only if it wins; win or lose, it leaves. */
  wait(): number {
    const ticket = this.next++;
    this.waiters.push(ticket);
    return ticket;
  }

  /** Whether an arrival is pending and ticket is the earliest waiter. */
  ready(ticket: number): boolean {
    return this.pending.length > 0 && this.waiters[0] === ticket;
  }

  /** Gives the oldest arrival to the earliest waiter, which must be ready. */
  claim(): T {
    this.waiters.shift();
    return this.pending.shift() as T;
  }

  /** Ends a waiter that did not claim; after a claim it does nothing. */
  leave(ticket: number): void {
    const i = this.waiters.indexOf(ticket);
    if (i >= 0) this.waiters.splice(i, 1);
  }
}
