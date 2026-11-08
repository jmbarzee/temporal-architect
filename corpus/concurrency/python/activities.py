from temporalio import activity


@activity.defn(name="Count")
async def count(items: list[str]) -> int:
    return len(items)


@activity.defn(name="Store")
async def store(items: list[str]) -> None:
    pass
