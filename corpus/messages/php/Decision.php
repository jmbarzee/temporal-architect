<?php

declare(strict_types=1);

namespace Corpus\Messages;

final class Decision
{
    public function __construct(
        public string $request,
        public string $approver,
        public string $note,
        public string $status,
    ) {}
}
