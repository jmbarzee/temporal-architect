<?php

declare(strict_types=1);

namespace Corpus\Messages\Fixtures;

use Temporal\Workflow;
use Temporal\Workflow\ReturnType;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** await one: a case for X raced against a timer (listed second), then takes X. */
#[WorkflowInterface]
final class AwaitOne
{
    use OfX;

    #[WorkflowMethod]
    #[ReturnType('array')]
    public function run(int $timeoutSeconds): \Generator
    {
        $took = [];
        $ticket = $this->xs()->begin();
        $fired = false;
        // The inline timer runs in its own scope, to be cancelled when it loses (spec 06).
        $timer = Workflow::async(function () use ($timeoutSeconds, &$fired): \Generator {
            // The flag is set as the timer's result is applied, not when this scope next runs.
            yield Workflow::timer($timeoutSeconds)->then(static function () use (&$fired): void {
                $fired = true;
            });
        });
        yield Workflow::await(function () use ($ticket, &$fired): bool { return $this->xs()->ready($ticket) || $fired; });
        if ($this->xs()->ready($ticket)) { // first listed wins
            $took[] = 'case ' . $this->xs()->claim();
            $timer->cancel();
        } else {
            $this->xs()->leave($ticket);
            $took[] = 'timer';
        }
        $took[] = 'then ' . (yield $this->xs()->take());
        return $took;
    }
}
