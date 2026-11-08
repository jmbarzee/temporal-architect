<?php

declare(strict_types=1);

namespace Corpus\Messages\Fixtures;

use Temporal\Workflow\ReturnType;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** Binds a promise on X, then awaits X. */
#[WorkflowInterface]
final class PromiseThenAwait
{
    use OfX;

    #[WorkflowMethod]
    #[ReturnType('array')]
    public function run(): \Generator
    {
        $p = $this->xs()->take();
        $awaited = yield $this->xs()->take();
        return ['await' => $awaited, 'promise' => yield $p];
    }
}
