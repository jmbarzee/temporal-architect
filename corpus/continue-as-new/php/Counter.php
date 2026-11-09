<?php

declare(strict_types=1);

namespace Corpus\ContinueAsNew;

use Temporal\Activity\ActivityOptions;
use Temporal\Workflow;
use Temporal\Workflow\ReturnType;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** The workflow type is the class's short name. */
#[WorkflowInterface]
final class Counter
{
    #[WorkflowMethod]
    #[ReturnType('int')]
    public function run(int $count, int $limit): \Generator
    {
        yield Workflow::timer(60);
        $next = yield Workflow::newActivityStub(
            CounterActivities::class,
            ActivityOptions::new()->withStartToCloseTimeout(60),
        )->increment($count);
        if ($next >= $limit) {
            return $next;
        }
        // Ends this run and starts the next with these arguments.
        return yield Workflow::newContinueAsNewStub(self::class)->run($next, $limit);
    }
}
