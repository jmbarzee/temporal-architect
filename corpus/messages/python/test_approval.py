from collections.abc import AsyncIterator
from datetime import timedelta

import pytest_asyncio
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment

from worker import approval_types
from workflows import Approval, Decision


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


async def test_approval(env: WorkflowEnvironment) -> None:
    client: Client = env.client
    async with approval_types(client):
        h = await client.start_workflow(Approval.run, "access", id="approval-1", task_queue="approvals")
        # Approve arrives before anything waits for it, and stays pending.
        await env.sleep(timedelta(seconds=30))
        await h.signal(Approval.approve, "Grace")
        await env.sleep(timedelta(seconds=30))
        await h.signal(Approval.open)
        await env.sleep(timedelta(minutes=1))
        assert await h.query(Approval.status_query) == "open"
        assert await h.execute_update(Approval.review, "LGTM") == "reviewed"
        got = await h.result()
    assert got == Decision(request="access", approver="Grace", note="LGTM", status="reviewed")


async def test_review_answered_before_a_waiter_takes_it(env: WorkflowEnvironment) -> None:
    client = env.client
    async with approval_types(client):
        h = await client.start_workflow(Approval.run, "access", id="approval-2", task_queue="approvals")
        # Review arrives while Approval still awaits Open, before anything waits for Review.
        await env.sleep(timedelta(seconds=30))
        assert await h.execute_update(Approval.review, "LGTM") == "reviewed"
        await h.signal(Approval.open)
        await env.sleep(timedelta(minutes=1))
        await h.signal(Approval.approve, "Grace")
        got = await h.result()
    assert got == Decision(request="access", approver="Grace", note="LGTM", status="approved")
