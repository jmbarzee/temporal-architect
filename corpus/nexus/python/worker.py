"""The callerTypes and greeterTypes workers, shared by the worker processes and the tests."""

import asyncio
import sys
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from temporalio.client import Client
from temporalio.envconfig import ClientConfig
from temporalio.worker import Worker

from activities import compose
from api import GREETER_TASK_QUEUE
from caller_workflows import Caller
from greeter_workflows import Greet
from service import GreeterServiceHandler


def caller_types(client: Client) -> Worker:
    """The callerTypes worker: its task queue and registrations."""
    return Worker(client, task_queue="caller", workflows=[Caller])


def greeter_types(client: Client, activities: list[Callable[..., Any]] | None = None) -> Worker:
    """The greeterTypes worker. Tests may pass stand-in activities with the same names."""
    return Worker(
        client,
        task_queue=GREETER_TASK_QUEUE,
        workflows=[Greet],
        activities=activities or [compose],
        activity_executor=ThreadPoolExecutor(),  # compose is a sync activity
        nexus_service_handlers=[GreeterServiceHandler()],
    )


async def main(which: str) -> None:
    client = await Client.connect(**ClientConfig.load_client_connect_config())
    await {"callerTypes": caller_types, "greeterTypes": greeter_types}[which](client).run()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
