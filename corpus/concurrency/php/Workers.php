<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Worker\WorkerFactoryInterface;

/** Each .twf worker's registrations, shared by the corpus worker process. */
final class Workers
{
    public const BATCHES_TASK_QUEUE = 'batches';

    public static function registerBatchTypes(WorkerFactoryInterface $factory): void
    {
        $factory->newWorker(self::BATCHES_TASK_QUEUE)
            ->registerWorkflowTypes(Batch::class, Audit::class, Archive::class)
            ->registerActivity(BatchActivities::class);
    }
}
