import asyncio
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from temporalio import activity
from temporalio.api.enums.v1 import EventType
from temporalio.client import WorkflowExecutionStatus, WorkflowFailureError, WorkflowHandle, WorkflowUpdateFailedError
from temporalio.exceptions import ActivityError, ApplicationError
from temporalio.testing import WorkflowEnvironment

import activities
from worker import job_types
from workflows import Job

TASK_QUEUE = "jobs"
ITEM = "job-1"
WAIT = 30  # seconds; a run that waits for every branch times out instead of hanging


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


class StandIns:
    """Reject fails only once Process has started, and Process is held until released,
    so both branches run concurrently and Process cannot complete first."""

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.released = asyncio.Event()

        @activity.defn(name="Reject")
        async def reject(item: str) -> None:
            await self.started.wait()
            await activities.reject(item)

        @activity.defn(name="Process")
        async def process(item: str) -> None:
            self.started.set()
            await self.released.wait()

        self.activities = [reject, process]


def assert_rejected(err: BaseException | None) -> None:
    assert isinstance(err, ActivityError) and err.activity_type == "Reject", err
    assert isinstance(err.cause, ApplicationError) and err.cause.message == f"rejected {ITEM}"


async def assert_process_left_running(h: WorkflowHandle[Job, None]) -> None:
    events = (await h.fetch_history()).events
    scheduled = sorted(
        e.activity_task_scheduled_event_attributes.activity_type.name
        for e in events
        if e.event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED
    )
    assert scheduled == ["Process", "Reject"], scheduled
    kinds = {e.event_type for e in events}
    assert EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED not in kinds, "the slow branch completed"
    assert EventType.EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED not in kinds, "the slow branch was cancelled"


async def test_the_run_fails_at_the_first_branch_failure(env: WorkflowEnvironment) -> None:
    s = StandIns()
    async with job_types(env.client, s.activities):
        try:
            h = await env.client.start_workflow(Job.run, ITEM, id="job-run", task_queue=TASK_QUEUE)
            await h.signal(Job.proceed)
            with pytest.raises(WorkflowFailureError) as failed:
                await asyncio.wait_for(h.result(), WAIT)
            assert_rejected(failed.value.cause)
            await assert_process_left_running(h)
        finally:
            s.released.set()


async def test_the_update_fails_while_the_run_continues(env: WorkflowEnvironment) -> None:
    s = StandIns()
    async with job_types(env.client, s.activities):
        try:
            h = await env.client.start_workflow(Job.run, ITEM, id="job-update", task_queue=TASK_QUEUE)
            with pytest.raises(WorkflowUpdateFailedError) as failed:
                # update(name=…) types an async handler's result as its coroutine, hence the `_ =`.
                _ = await asyncio.wait_for(h.execute_update(Job.attempt), WAIT)
            assert_rejected(failed.value.cause)
            assert (await h.describe()).status == WorkflowExecutionStatus.RUNNING
            await assert_process_left_running(h)
        finally:
            s.released.set()
