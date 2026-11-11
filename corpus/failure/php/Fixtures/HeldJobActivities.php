<?php

declare(strict_types=1);

namespace Corpus\Failure\Fixtures;

use Corpus\Failure\JobActivities;

/** Process, the slow branch, runs until JobTest releases its item, or for 30s at most. */
final class HeldJobActivities extends JobActivities
{
    public static function releaseFile(string $item): string
    {
        return \sys_get_temp_dir() . '/corpus-failure-release-' . $item;
    }

    public function process(string $item): void
    {
        $release = self::releaseFile($item);
        $deadline = \microtime(true) + 30;
        while (!\file_exists($release) && \microtime(true) < $deadline) {
            \usleep(50_000);
        }
        @\unlink($release);
    }
}
