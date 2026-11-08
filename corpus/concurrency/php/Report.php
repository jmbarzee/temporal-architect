<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

final class Report
{
    public function __construct(
        public int $count,
        public bool $audited,
        public string $status,
    ) {}
}
