<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Activity\ActivityInterface;
use Temporal\Activity\ActivityMethod;

/** Activity types are the interface prefix ('') plus the method name, so each sets the .twf name. */
#[ActivityInterface]
final class BatchActivities
{
    /** @param list<string> $items */
    #[ActivityMethod(name: 'Count')]
    public function count(array $items): int
    {
        return \count($items);
    }

    /** @param list<string> $items */
    #[ActivityMethod(name: 'Store')]
    public function store(array $items): void {}
}
