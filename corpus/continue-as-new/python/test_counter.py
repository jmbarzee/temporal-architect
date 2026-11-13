from collections.abc import AsyncIterator

import pytest_asyncio
from temporalio.client import WorkflowExecutionStatus
from temporalio.testing import WorkflowEnvironment

from worker import counter_types
from workflows import Counter


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


async def test_counter_completes_at_the_limit(env: WorkflowEnvironment) -> None:
    async with counter_types(env.client):
        got = await env.client.execute_workflow(Counter.run, args=[2, 3], id="counter-1", task_queue="counters")
    assert got == 3


async def test_counter_continues_as_new_below_it(env: WorkflowEnvironment) -> None:
    async with counter_types(env.client):
        h = await env.client.start_workflow(Counter.run, args=[0, 3], id="counter-2", task_queue="counters")
        got = await h.result()  # follows the chain of runs
        first = env.client.get_workflow_handle(h.id, run_id=h.first_execution_run_id)
        assert (await first.describe()).status == WorkflowExecutionStatus.CONTINUED_AS_NEW
    assert got == 3


async def test_counter_successor_is_a_linked_run_of_the_same_workflow(env: WorkflowEnvironment) -> None:
    async with counter_types(env.client):
        h = await env.client.start_workflow(Counter.run, args=[2, 4], id="counter-3", task_queue="counters")
        await h.result()
        first = env.client.get_workflow_handle(h.id, run_id=h.first_execution_run_id)
        second = env.client.get_workflow_handle(h.id)  # no run ID: the current run
        described = await second.describe()
        successor = described.run_id
    assert described.id == h.id
    assert successor != h.first_execution_run_id
    started = (await second.fetch_history()).events[0].workflow_execution_started_event_attributes
    assert started.continued_execution_run_id == h.first_execution_run_id
    closed = (await first.fetch_history()).events[-1].workflow_execution_continued_as_new_event_attributes
    assert closed.new_execution_run_id == successor
