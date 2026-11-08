"""A signal's or update's pending arrivals and the waiters for them (spec 06)."""

import asyncio
from collections import deque
from typing import Generic, TypeVar

from temporalio import workflow

T = TypeVar("T")


class Arrivals(Generic[T]):
    """Pending arrivals and waiters, each oldest first.

    A handler adds an arrival when it returns, and the waiter that began
    waiting first takes the oldest.
    """

    def __init__(self) -> None:
        self._pending: deque[T] = deque()
        self._waiters: deque[int] = deque()  # tickets, in the order their waiters began
        self._next = 0

    def add(self, v: T) -> None:
        self._pending.append(v)

    def take(self) -> "asyncio.Task[T]":
        """Waits for the oldest arrival.

        Not a coroutine: the ticket is taken at the call, so a promise
        (``p = xs.take()``) begins waiting at its binding.
        """
        return asyncio.create_task(self.take_at(self.wait()))

    async def take_at(self, ticket: int) -> T:
        """take for a waiter that began earlier with wait."""
        try:
            await workflow.wait_condition(lambda: self.ready(ticket))
            return self.claim()
        finally:
            self.leave(ticket)

    def wait(self) -> int:
        """Begins a waiter.

        An await one case waits, checks ready without taking, and claims
        only if it wins; win or lose, it leaves.
        """
        ticket = self._next
        self._next += 1
        self._waiters.append(ticket)
        return ticket

    def ready(self, ticket: int) -> bool:
        """Whether an arrival is pending and ticket is the earliest waiter."""
        return bool(self._pending) and self._waiters[0] == ticket

    def claim(self) -> T:
        """Gives the oldest arrival to the earliest waiter, which must be ready."""
        self._waiters.popleft()
        return self._pending.popleft()

    def leave(self, ticket: int) -> None:
        """Ends a waiter that did not claim; after a claim it does nothing."""
        if ticket in self._waiters:
            self._waiters.remove(ticket)
