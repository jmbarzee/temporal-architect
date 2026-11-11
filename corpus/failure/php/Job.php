<?php

declare(strict_types=1);

namespace Corpus\Failure;

use React\Promise\PromiseInterface;
use Temporal\Activity\ActivityOptions;
use Temporal\Promise;
use Temporal\Workflow;
use Temporal\Workflow\SignalMethod;
use Temporal\Workflow\UpdateMethod;
use Temporal\Workflow\WorkflowInit;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** The workflow type is the class's short name. */
#[WorkflowInterface]
final class Job
{
    private bool $proceeding = false;

    #[WorkflowInit]
    public function __construct(private readonly string $item) {}

    #[SignalMethod(name: 'Proceed')]
    public function proceed(): void
    {
        $this->proceeding = true;
    }

    #[UpdateMethod(name: 'Attempt')]
    public function attempt(): \Generator
    {
        yield $this->rejectAndProcess();
    }

    #[WorkflowMethod]
    public function run(string $item): \Generator
    {
        yield Workflow::await(fn(): bool => $this->proceeding);
        yield $this->rejectAndProcess();
    }

    // await all: Promise::all rejects at Reject's failure, and Process keeps running. Left uncaught,
    // the failure fails the run from run() and only the update from attempt().
    private function rejectAndProcess(): PromiseInterface
    {
        $rejects = Workflow::newActivityStub(JobActivities::class, JobActivities::rejectDefaults());
        $processes = Workflow::newActivityStub(JobActivities::class, ActivityOptions::new()->withStartToCloseTimeout(60));
        return Promise::all([
            $rejects->reject($this->item), // @phpstan-ignore method.void
            $processes->process($this->item), // @phpstan-ignore method.void
        ]);
    }
}
