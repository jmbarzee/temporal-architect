"""The batchTypes worker, shared by the worker process and the tests."""

import asyncio
from collections.abc import Callable
from typing import Any

from temporalio.client import Client
from temporalio.envconfig import ClientConfig
from temporalio.worker import Worker

from activities import count, store
from workflows import Archive, Audit, Batch


def batch_types(client: Client, activities: list[Callable[..., Any]] | None = None) -> Worker:
    """The batchTypes worker. Tests may pass stand-in activities with the same names."""
    return Worker(
        client,
        task_queue="batches",
        workflows=[Batch, Audit, Archive],
        activities=activities or [count, store],
    )


async def main() -> None:
    client = await Client.connect(**ClientConfig.load_client_connect_config())
    await batch_types(client).run()


if __name__ == "__main__":
    asyncio.run(main())
