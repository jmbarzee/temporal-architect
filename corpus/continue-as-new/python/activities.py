from temporalio import activity


@activity.defn(name="Increment")
async def increment(count: int) -> int:
    return count + 1
