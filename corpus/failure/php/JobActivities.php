<?php

declare(strict_types=1);

namespace Corpus\Failure;

use Temporal\Activity\ActivityInterface;
use Temporal\Activity\ActivityMethod;
use Temporal\Activity\ActivityOptions;
use Temporal\Common\RetryOptions;

/**
 * Activity types are the interface prefix ('') plus the method name, so each sets the .twf name.
 * Not final: the tests' worker holds Process in a subclass (Fixtures\HeldJobActivities).
 */
#[ActivityInterface]
class JobActivities
{
    public static function rejectDefaults(): ActivityOptions
    {
        return ActivityOptions::new()
            ->withStartToCloseTimeout(60)
            ->withRetryOptions(RetryOptions::new()->withMaximumAttempts(1));
    }

    #[ActivityMethod(name: 'Reject')]
    public function reject(string $item): void
    {
        throw new \RuntimeException('rejected ' . $item);
    }

    #[ActivityMethod(name: 'Process')]
    public function process(string $item): void {}
}
