from dataclasses import dataclass

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from arrivals import Arrivals


@dataclass
class Decision:
    request: str
    approver: str
    note: str
    status: str


@workflow.defn
class Approval:
    def __init__(self) -> None:
        # Handlers can run before run(), so state lives in __init__.
        self.status = "submitted"
        self.opens: Arrivals[None] = Arrivals()
        self.approves: Arrivals[str] = Arrivals()
        self.reviews: Arrivals[str] = Arrivals()

    @workflow.signal(name="Open")
    def open(self) -> None:
        self.status = "open"
        self.opens.add(None)

    @workflow.signal(name="Approve")
    def approve(self, approver: str) -> None:
        self.status = "approved"
        self.approves.add(approver)

    @workflow.update(name="Review")
    def review(self, note: str) -> str:
        self.status = "reviewed"
        self.reviews.add(note)
        return self.status

    @workflow.query(name="Status")
    def status_query(self) -> str:
        return self.status

    @workflow.run
    async def run(self, request: str) -> Decision:
        await self.opens.take()
        approval = self.approves.take()  # begins waiting here, at its binding
        note = await self.reviews.take()
        approver = await approval
        return Decision(request=request, approver=approver, note=note, status=self.status)
