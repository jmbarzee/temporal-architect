<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

#[WorkflowInterface]
final class Audit
{
    /** @param list<string> $items */
    #[WorkflowMethod]
    public function run(array $items): bool
    {
        return $items !== [];
    }
}
