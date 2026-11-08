<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Activity\ActivityOptions;
use Temporal\Promise;
use Temporal\Workflow;
use Temporal\Workflow\ChildWorkflowOptions;
use Temporal\Workflow\ParentClosePolicy;
use Temporal\Workflow\ReturnType;
use Temporal\Workflow\SignalMethod;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

#[WorkflowInterface]
final class Batch
{
    private string $status = 'unacknowledged';

    /** @var Arrivals<true> */
    private Arrivals $acks;

    public function __construct()
    {
        $this->acks = new Arrivals();
    }

    #[SignalMethod(name: 'Ack')]
    public function ack(): void
    {
        $this->status = 'acknowledged';
        $this->acks->add(true);
    }

    /** @param list<string> $items */
    #[WorkflowMethod]
    #[ReturnType(Report::class)]
    public function run(array $items): \Generator
    {
        $activities = Workflow::newActivityStub(
            BatchActivities::class,
            ActivityOptions::new()->withStartToCloseTimeout(60),
        );
        $audit = Workflow::newChildWorkflowStub(Audit::class);

        // await all
        [$count, $audited] = yield Promise::all([$activities->count($items), $audit->run($items)]);

        // detach: abandon the child on parent close, and wait only for its start. ABANDON on
        // cancellation is FeatureFlags::$cancelAbandonedChildWorkflows = false (worker.php);
        // ChildWorkflowCancellationType::Abandon is rejected by the options marshaller.
        $archive = Workflow::newUntypedChildWorkflowStub(
            'Archive',
            ChildWorkflowOptions::new()->withParentClosePolicy(ParentClosePolicy::Abandon),
        );
        yield $archive->start($items);

        // await one: one await over every case, then the first listed that is ready wins, so Ack
        // wins a tie with the timer. The inline timer runs in its own scope, to be cancelled when
        // it loses (spec 06). The Ack case waits without taking, and claims only if it wins.
        $ticket = $this->acks->begin();
        $fired = false;
        $timer = Workflow::async(static function () use (&$fired): \Generator {
            // The flag is set as the timer's result is applied, not when this scope next runs.
            yield Workflow::timer(3600)->then(static function () use (&$fired): void {
                $fired = true;
            });
        });
        yield Workflow::await(function () use ($ticket, &$fired): bool { return $this->acks->ready($ticket) || $fired; });
        if ($this->acks->ready($ticket)) {
            $this->acks->claim();
            $timer->cancel();
        } else {
            $this->acks->leave($ticket);
        }

        return new Report($count, $audited, $this->status);
    }
}
