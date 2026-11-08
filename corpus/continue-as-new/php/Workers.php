<?php

declare(strict_types=1);

namespace Corpus\ContinueAsNew;

use Temporal\Worker\WorkerFactoryInterface;

/** Each .twf worker's registrations, shared by the corpus worker process. */
final class Workers
{
    public const COUNTERS_TASK_QUEUE = 'counters';

    public static function registerCounterTypes(WorkerFactoryInterface $factory): void
    {
        $factory->newWorker(self::COUNTERS_TASK_QUEUE)
            ->registerWorkflowTypes(Counter::class)
            ->registerActivity(CounterActivities::class);
    }
}
