from datetime import timedelta

from temporalio import activity, workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError


@activity.defn(name="Reject")
async def reject(item: str) -> None:
    raise ApplicationError(f"rejected {item}")


reject_defaults: workflow.ActivityConfig = {
    "start_to_close_timeout": timedelta(minutes=1),
    "retry_policy": RetryPolicy(maximum_attempts=1),
}


@activity.defn(name="Process")
async def process(item: str) -> None:
    pass
