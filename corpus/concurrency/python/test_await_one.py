import asyncio
import itertools
import time
from collections.abc import AsyncIterator, Callable
from datetime import timedelta
from typing import Any

import pytest
import pytest_asyncio
import temporalio.worker._workflow as _wf
import temporalio.worker._workflow_instance as _wi
from temporalio.api.history.v1 import HistoryEvent
from temporalio.client import WorkflowHandle
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from await_one_fixtures import AwaitOne

TASK_QUEUE = "await-one"
_ids = itertools.count()


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


async def events(h: WorkflowHandle[Any, Any]) -> list[HistoryEvent]:
    return list((await h.fetch_history()).events)


async def until(h: WorkflowHandle[Any, Any], has: Callable[[HistoryEvent], bool]) -> None:
    """Waits up to 10s of real time for an event that has; raises rather than hang."""
    deadline = time.monotonic() + 10
    while not any(has(e) for e in await events(h)):
        if time.monotonic() > deadline:
            raise TimeoutError(f"{h.id}: the awaited event never reached history")
        await asyncio.sleep(0.02)


async def tie(env: WorkflowEnvironment, order: list[str]) -> str:
    """Runs AwaitOne with the timer fired and Ack sent while no worker runs, so both reach one workflow task."""

    # No cache, so no sticky queue: the next workflow task goes to the normal queue, not a stopped worker.
    def worker() -> Worker:
        return Worker(env.client, task_queue=TASK_QUEUE, workflows=[AwaitOne], max_cached_workflows=0)

    h = await env.client.start_workflow(AwaitOne.run, order, id=f"tie-{next(_ids)}", task_queue=TASK_QUEUE)
    async with worker():
        await until(h, lambda e: e.HasField("timer_started_event_attributes"))
    # Skip time past the timer; with no worker to take its workflow task, nothing runs.
    skip = asyncio.create_task(env.sleep(timedelta(hours=2)))
    await until(h, lambda e: e.HasField("timer_fired_event_attributes"))
    await h.signal(AwaitOne.ack)
    async with worker():
        got = await h.result()
    skip.cancel()

    # Both ready on one resume: no workflow task started between the timer firing and Ack arriving.
    evs = await events(h)
    fired = next(i for i, e in enumerate(evs) if e.HasField("timer_fired_event_attributes"))
    signaled = next(i for i, e in enumerate(evs) if e.HasField("workflow_execution_signaled_event_attributes"))
    between = evs[min(fired, signaled) : max(fired, signaled)]
    assert not any(e.HasField("workflow_task_started_event_attributes") for e in between)
    return got


SINGLE_BATCH = _wi._WorkflowLogicFlag.PROCESS_WORKFLOW_ACTIVATION_JOBS_AS_SINGLE_BATCH


@pytest.fixture(params=["default", "single-batch"])
def activation(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> str:
    """1.35.0 applies an activation's signals and runs the workflow before it resolves timers
    (flag 2 is off by default); "single-batch" turns the SDK's own flag 2 on, as a later SDK will."""
    if request.param == "single-batch":
        # _workflow imports the default by name, so patch it there.
        monkeypatch.setattr(_wf, "_DEFAULT_ENABLED_WORKFLOW_LOGIC_FLAGS", frozenset({SINGLE_BATCH}))
    return str(request.param)


async def test_await_one_ack_listed_first_wins_a_tie(env: WorkflowEnvironment, activation: str) -> None:
    assert await tie(env, ["Ack", "timer"]) == "Ack"


async def test_await_one_timer_listed_first_wins_a_tie(env: WorkflowEnvironment, activation: str) -> None:
    # (#474) Under 1.35.0's default ordering Ack is already ready when the
    # workflow runs and the timer is not, so Ack wins; flag 2 gives first-listed.
    want = "timer" if activation == "single-batch" else "Ack"
    assert await tie(env, ["timer", "Ack"]) == want
