"""The counterTypes worker, shared by the worker process and the tests."""

import asyncio

from temporalio.client import Client
from temporalio.envconfig import ClientConfig
from temporalio.worker import Worker

from activities import increment
from workflows import Counter


def counter_types(client: Client) -> Worker:
    """The counterTypes worker: its task queue and registrations."""
    return Worker(client, task_queue="counters", workflows=[Counter], activities=[increment])


async def main() -> None:
    client = await Client.connect(**ClientConfig.load_client_connect_config())
    await counter_types(client).run()


if __name__ == "__main__":
    asyncio.run(main())
