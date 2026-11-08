<?php

declare(strict_types=1);

namespace Corpus\Messages\Fixtures;

use Corpus\Messages\Arrivals;
use Temporal\Workflow\SignalMethod;

/** Signal X, queued in $xs. */
trait OfX
{
    /** @var Arrivals<string>|null */
    private ?Arrivals $xs = null;

    /** @return Arrivals<string> */
    private function xs(): Arrivals
    {
        return $this->xs ??= new Arrivals();
    }

    #[SignalMethod(name: 'X')]
    public function x(string $v): void
    {
        $this->xs()->add($v);
    }
}
