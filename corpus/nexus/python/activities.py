from temporalio import activity


@activity.defn(name="Compose")
def compose(name: str) -> str:
    return "Greetings, " + name
