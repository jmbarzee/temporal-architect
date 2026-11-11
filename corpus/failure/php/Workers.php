<?php

declare(strict_types=1);

namespace Corpus\Failure;

use Temporal\Worker\WorkerFactoryInterface;

/** Each .twf worker's registrations, shared by the corpus worker process. */
final class Workers
{
    public const JOBS_TASK_QUEUE = 'jobs';

    /** @param class-string<JobActivities> $activities */
    public static function registerJobTypes(
        WorkerFactoryInterface $factory,
        string $activities = JobActivities::class,
    ): void {
        $factory->newWorker(self::JOBS_TASK_QUEUE)
            ->registerWorkflowTypes(Job::class)
            ->registerActivity($activities);
    }
}
