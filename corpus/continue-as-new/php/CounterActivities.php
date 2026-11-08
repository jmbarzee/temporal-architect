<?php

declare(strict_types=1);

namespace Corpus\ContinueAsNew;

use Temporal\Activity\ActivityInterface;
use Temporal\Activity\ActivityMethod;

/** Activity types are the interface prefix ('') plus the method name, so each sets the .twf name. */
#[ActivityInterface]
final class CounterActivities
{
    #[ActivityMethod(name: 'Increment')]
    public function increment(int $count): int
    {
        return $count + 1;
    }
}
