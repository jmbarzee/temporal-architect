from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities import increment


@workflow.defn
class Counter:
    @workflow.run
    async def run(self, count: int, limit: int) -> int:
        await workflow.sleep(timedelta(minutes=1))
        next = await workflow.execute_activity(increment, count, start_to_close_timeout=timedelta(minutes=1))
        if next >= limit:
            return next
        workflow.continue_as_new(args=[next, limit])
