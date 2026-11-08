<?php

declare(strict_types=1);

namespace Corpus\Messages;

use Temporal\Worker\WorkerFactoryInterface;

/** Each .twf worker's registrations, shared by the corpus worker process. */
final class Workers
{
    public const APPROVALS_TASK_QUEUE = 'approvals';

    public static function registerApprovalTypes(WorkerFactoryInterface $factory): void
    {
        $factory->newWorker(self::APPROVALS_TASK_QUEUE)
            ->registerWorkflowTypes(Approval::class);
    }
}
