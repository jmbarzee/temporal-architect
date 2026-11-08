import nexusrpc

GREETER_ENDPOINT = "GreeterEndpoint"
GREETER_TASK_QUEUE = "greeter"


@nexusrpc.service
class GreeterService:
    # The attribute is the operation's wire name unless Operation(name=...) is set.
    hello: nexusrpc.Operation[str, str] = nexusrpc.Operation(name="Hello")
    greet: nexusrpc.Operation[str, str] = nexusrpc.Operation(name="Greet")


def greet_id(name: str) -> str:
    return f"greet-{name}"
