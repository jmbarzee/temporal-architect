"""The approvalTypes worker, shared by the worker process and the tests."""

import asyncio

from temporalio.client import Client
from temporalio.envconfig import ClientConfig
from temporalio.worker import Worker

from workflows import Approval


def approval_types(client: Client) -> Worker:
    """The approvalTypes worker: its task queue and registrations."""
    return Worker(client, task_queue="approvals", workflows=[Approval])


async def main() -> None:
    client = await Client.connect(**ClientConfig.load_client_connect_config())
    await approval_types(client).run()


if __name__ == "__main__":
    asyncio.run(main())
