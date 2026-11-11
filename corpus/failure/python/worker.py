"""The jobTypes worker, shared by the worker process and the tests."""

import asyncio
from collections.abc import Callable
from typing import Any

from temporalio.client import Client
from temporalio.envconfig import ClientConfig
from temporalio.worker import Worker

from activities import process, reject
from workflows import Job


def job_types(client: Client, activities: list[Callable[..., Any]] | None = None) -> Worker:
    """The jobTypes worker. Tests may pass stand-in activities with the same names."""
    return Worker(client, task_queue="jobs", workflows=[Job], activities=activities or [reject, process])


async def main() -> None:
    client = await Client.connect(**ClientConfig.load_client_connect_config())
    await job_types(client).run()


if __name__ == "__main__":
    asyncio.run(main())
