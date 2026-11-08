<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Activity\ActivityOptions;
use Temporal\Workflow;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

#[WorkflowInterface]
final class Archive
{
    /** @param list<string> $items */
    #[WorkflowMethod]
    public function run(array $items): \Generator
    {
        $activities = Workflow::newActivityStub(
            BatchActivities::class,
            ActivityOptions::new()->withStartToCloseTimeout(60),
        );
        // An activity stub's call returns a promise, whatever the method declares.
        yield $activities->store($items); // @phpstan-ignore method.void
    }
}
