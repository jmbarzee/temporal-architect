import asyncio
from collections.abc import AsyncIterator

import pytest_asyncio
from temporalio import activity
from temporalio.client import WorkflowExecutionStatus
from temporalio.testing import WorkflowEnvironment

from activities import count
from worker import batch_types
from workflows import Archive, Audit, Batch, Report

TASK_QUEUE = "batches"
ITEMS = ["a", "b"]


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


async def test_batch_acknowledged_without_waiting_for_its_detached_archive(env: WorkflowEnvironment) -> None:
    held = asyncio.Event()

    # Archive's Store is held until Batch returns. A held activity stops time
    # skipping, so Ack is sent before the timer can fire.
    @activity.defn(name="Store")
    async def store(items: list[str]) -> None:
        await held.wait()

    async with batch_types(env.client, [count, store]):
        h = await env.client.start_workflow(Batch.run, ITEMS, id="batch-ack", task_queue=TASK_QUEUE)
        await h.signal(Batch.ack)
        got = await h.result()
        archive_id = next(
            e.child_workflow_execution_started_event_attributes.workflow_execution.workflow_id
            for e in (await h.fetch_history()).events
            if e.child_workflow_execution_started_event_attributes.workflow_type.name == "Archive"
        )
        archive = env.client.get_workflow_handle(archive_id)
        assert (await archive.describe()).status == WorkflowExecutionStatus.RUNNING, "Batch awaited its detached Archive"
        held.set()
        await archive.result()
    assert got == Report(count=2, audited=True, status="acknowledged")


async def test_batch_the_timer_wins(env: WorkflowEnvironment) -> None:
    async with batch_types(env.client):
        got = await env.client.execute_workflow(Batch.run, ITEMS, id="batch-timer", task_queue=TASK_QUEUE)
    assert got == Report(count=2, audited=True, status="unacknowledged")


async def test_audit(env: WorkflowEnvironment) -> None:
    async with batch_types(env.client):
        assert await env.client.execute_workflow(Audit.run, ["a"], id="audit", task_queue=TASK_QUEUE) is True


async def test_archive(env: WorkflowEnvironment) -> None:
    async with batch_types(env.client):
        await env.client.execute_workflow(Archive.run, ["a"], id="archive", task_queue=TASK_QUEUE)
