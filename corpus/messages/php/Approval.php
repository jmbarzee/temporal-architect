<?php

declare(strict_types=1);

namespace Corpus\Messages;

use Temporal\Workflow\QueryMethod;
use Temporal\Workflow\ReturnType;
use Temporal\Workflow\SignalMethod;
use Temporal\Workflow\UpdateMethod;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** The workflow type is the class's short name; handler names default to the method name, so each sets the .twf name. */
#[WorkflowInterface]
final class Approval
{
    private string $status = 'submitted';

    /** @var Arrivals<true> */
    private Arrivals $opens;

    /** @var Arrivals<string> */
    private Arrivals $approves;

    /** @var Arrivals<string> */
    private Arrivals $reviews;

    public function __construct()
    {
        $this->opens = new Arrivals();
        $this->approves = new Arrivals();
        $this->reviews = new Arrivals();
    }

    #[SignalMethod(name: 'Open')]
    public function open(): void
    {
        $this->status = 'open';
        $this->opens->add(true);
    }

    #[SignalMethod(name: 'Approve')]
    public function approve(string $approver): void
    {
        $this->status = 'approved';
        $this->approves->add($approver);
    }

    #[UpdateMethod(name: 'Review')]
    public function review(string $note): string
    {
        $this->status = 'reviewed';
        $this->reviews->add($note);
        return $this->status;
    }

    #[QueryMethod(name: 'Status')]
    public function status(): string
    {
        return $this->status;
    }

    #[WorkflowMethod]
    #[ReturnType(Decision::class)]
    public function run(string $request): \Generator
    {
        yield $this->opens->take();
        $approval = $this->approves->take(); // begins waiting here, at its binding
        $note = yield $this->reviews->take();
        $approver = yield $approval;
        return new Decision($request, $approver, $note, $this->status);
    }
}
