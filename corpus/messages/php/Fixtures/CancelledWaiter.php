<?php

declare(strict_types=1);

namespace Corpus\Messages\Fixtures;

use Temporal\Workflow;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** Starts a waiter of X and cancels it, then takes X. */
#[WorkflowInterface]
final class CancelledWaiter
{
    use OfX;

    #[WorkflowMethod]
    public function run(): \Generator
    {
        $waiter = $this->xs()->take();
        yield Workflow::timer(1);
        $waiter->cancel();
        return yield $this->xs()->take();
    }
}
