import asyncio
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from temporalio import activity
from temporalio.api.enums.v1 import EventType
from temporalio.client import WorkflowExecutionStatus, WorkflowFailureError, WorkflowHandle, WorkflowUpdateFailedError
from temporalio.exceptions import ActivityError, ApplicationError
from temporalio.testing import WorkflowEnvironment

from activities import reject
from worker import job_types
from workflows import Job

TASK_QUEUE = "jobs"
ITEM = "job-1"


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


def assert_rejected(err: BaseException | None) -> None:
    assert isinstance(err, ActivityError) and err.activity_type == "Reject", err
    assert isinstance(err.cause, ApplicationError) and err.cause.message == f"rejected {ITEM}"


async def assert_process_left_running(h: WorkflowHandle[Job, None]) -> None:
    kinds = [e.event_type for e in (await h.fetch_history()).events]
    assert kinds.count(EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED) == 2, "a branch was never scheduled"
    assert EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED not in kinds, "the slow branch completed"
    assert EventType.EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED not in kinds, "the slow branch was cancelled"


async def test_the_run_fails_at_the_first_branch_failure(env: WorkflowEnvironment) -> None:
    released = asyncio.Event()

    # Process is held until the run has failed, so it cannot complete first.
    @activity.defn(name="Process")
    async def process(item: str) -> None:
        await released.wait()

    async with job_types(env.client, [reject, process]):
        h = await env.client.start_workflow(Job.run, ITEM, id="job-run", task_queue=TASK_QUEUE)
        await h.signal(Job.proceed)
        with pytest.raises(WorkflowFailureError) as failed:
            await h.result()
        assert_rejected(failed.value.cause)
        await assert_process_left_running(h)
        released.set()


async def test_the_update_fails_while_the_run_continues(env: WorkflowEnvironment) -> None:
    released = asyncio.Event()

    @activity.defn(name="Process")
    async def process(item: str) -> None:
        await released.wait()

    async with job_types(env.client, [reject, process]):
        h = await env.client.start_workflow(Job.run, ITEM, id="job-update", task_queue=TASK_QUEUE)
        with pytest.raises(WorkflowUpdateFailedError) as failed:
            # update(name=…) types an async handler's result as its coroutine, hence the `_ =`.
            _ = await h.execute_update(Job.attempt)
        assert_rejected(failed.value.cause)
        assert (await h.describe()).status == WorkflowExecutionStatus.RUNNING
        await assert_process_left_running(h)
        released.set()
