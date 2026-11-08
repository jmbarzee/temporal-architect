import asyncio
from collections.abc import AsyncIterator

import pytest_asyncio
from temporalio import activity
from temporalio.client import WorkflowExecutionStatus
from temporalio.testing import WorkflowEnvironment

from api import GREETER_ENDPOINT, GREETER_TASK_QUEUE
from caller_workflows import Caller, Greetings
from greeter_workflows import Greet
from worker import caller_types, greeter_types


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        await env.create_nexus_endpoint(GREETER_ENDPOINT, GREETER_TASK_QUEUE)
        yield env


async def test_caller_sync_async_and_a_detached_greet_it_never_waits_for(env: WorkflowEnvironment) -> None:
    held = asyncio.Event()

    # Grace's greeting is held until after Caller returns.
    @activity.defn(name="Compose")
    async def compose(name: str) -> str:
        if name == "Grace":
            await held.wait()
        return "Greetings, " + name

    async with caller_types(env.client), greeter_types(env.client, [compose]):
        got = await env.client.execute_workflow(Caller.run, args=["Ada", "Grace"], id="caller-1", task_queue="caller")
        grace = env.client.get_workflow_handle("greet-Grace", result_type=str)
        assert (await grace.describe()).status == WorkflowExecutionStatus.RUNNING, "Caller awaited its detached Greet"
        held.set()
        assert await grace.result() == "Greetings, Grace"
    assert got == Greetings(hello="Hello, Ada", greeting="Greetings, Ada")


async def test_greet(env: WorkflowEnvironment) -> None:
    async with greeter_types(env.client):
        got = await env.client.execute_workflow(Greet.run, "Ada", id="greet-1", task_queue=GREETER_TASK_QUEUE)
    assert got == "Greetings, Ada"
