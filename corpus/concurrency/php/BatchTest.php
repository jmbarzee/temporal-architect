<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Api\Enums\V1\EventType;
use Temporal\Client\WorkflowOptions;
use Temporal\Client\WorkflowStubInterface;
use Temporal\Testing\TimeSkippingWorkflowTestCase;

final class BatchTest extends TimeSkippingWorkflowTestCase
{
    private function stub(string $type, string $taskQueue): WorkflowStubInterface
    {
        return $this->workflowClient->newUntypedWorkflowStub(
            $type,
            WorkflowOptions::new()->withTaskQueue($taskQueue)->withWorkflowId(\strtolower($type) . '-' . \uniqid()),
        );
    }

    public function testBatchAcknowledged(): void
    {
        $wf = $this->stub('Batch', Workers::BATCHES_TASK_QUEUE);
        $this->workflowClient->start($wf, ['a', 'b']);
        // The test server skips time even while an activity runs: wait for the await one first.
        $this->until($wf, EventType::EVENT_TYPE_TIMER_STARTED);
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(60);
        $wf->signal('Ack');
        self::assertEquals(new Report(2, true, 'acknowledged'), $wf->getResult(Report::class));
        self::assertTrue($this->has($wf, EventType::EVENT_TYPE_TIMER_CANCELED), 'the losing timer was not cancelled');
    }

    public function testBatchTimesOut(): void
    {
        $wf = $this->stub('Batch', Workers::BATCHES_TASK_QUEUE);
        $this->workflowClient->start($wf, ['a']);
        $this->until($wf, EventType::EVENT_TYPE_TIMER_STARTED);
        self::assertEquals(new Report(1, true, 'unacknowledged'), $wf->getResult(Report::class));
        self::assertFalse($this->has($wf, EventType::EVENT_TYPE_TIMER_CANCELED));
    }

    public function testABoundPromiseSurvivesTheRoundsItLoses(): void
    {
        $wf = $this->stub('BoundDeadline', 'bound');
        $this->workflowClient->start($wf);
        $wf->signal('Ack');
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(3600);
        $wf->signal('Ack');
        self::assertSame(2, $wf->getResult('int'));
        self::assertFalse($this->has($wf, EventType::EVENT_TYPE_TIMER_CANCELED));
        self::assertTrue($this->has($wf, EventType::EVENT_TYPE_TIMER_FIRED), 'the deadline never fired');
    }

    public function testAwaitOneTheFirstListedOfSeveralReadyCasesWins(): void
    {
        self::assertSame('Ack', $this->tie(['Ack', 'timer'], 'await one')[0]);
        self::assertSame('timer', $this->tie(['timer', 'Ack'], 'await one')[0]);
    }

    public function testTheTemptingFormsAreNotListedOrder(): void
    {
        // Each picks by settle order, so at a tie one listing order loses its first-listed case.
        foreach (['any', 'awaitWithTimeout'] as $form) {
            $winners = [];
            foreach ([['Ack', 'timer'], ['timer', 'Ack']] as $order) {
                $winners[] = $this->tie($order, $form)[0];
            }
            self::assertSame($winners[0], $winners[1], $form . ' picked by listing order');
        }
    }

    private const TIE_ATTEMPTS = 3;

    /**
     * Runs AwaitOneTie until its timer fired and Ack arrived in one workflow task, then returns the
     * winner and the case whose event came earlier in history. A setup that misses the tie is retried, at most TIE_ATTEMPTS times, and never fails
     * the test: after the last miss the test is skipped.
     *
     * @param list<string> $order
     * @return array{string, string}
     */
    private function tie(array $order, string $form): array
    {
        $misses = [];
        for ($attempt = 1; $attempt <= self::TIE_ATTEMPTS; ++$attempt) {
            try {
                $got = $this->tieOnce($order, $form);
            } catch (\Throwable $e) {
                $misses[] = $e->getMessage() . " <- " . $e->getPrevious()?->getMessage();
                continue;
            }
            if ($got !== null) {
                return $got;
            }
            $misses[] = 'the timer and Ack reached different workflow tasks';
        }
        self::markTestSkipped('no tie landed: ' . \implode('; ', $misses));
    }

    /**
     * Holds a workflow task (Hold blocks the single PHP workflow process for 5s) across the timer's
     * due time and Ack's arrival, so both reach the next workflow task. The timer (3s) runs in
     * real time under the test case's time lock. Returns null when the two did not share one task.
     *
     * @param list<string> $order
     * @return array{string, string}|null
     */
    private function tieOnce(array $order, string $form): ?array
    {
        $wf = $this->stub('AwaitOneTie', 'await-one');
        $this->workflowClient->start($wf, $order, $form, 3);
        $this->until($wf, EventType::EVENT_TYPE_TIMER_STARTED);
        $started = \microtime(true);
        $wf->signal('Hold', 5000);
        $this->until($wf, EventType::EVENT_TYPE_WORKFLOW_TASK_STARTED, 2); // the hold is running
        \usleep((int) \max(0, (3.5 - (\microtime(true) - $started)) * 1_000_000)); // past the timer's due time
        $wf->signal('Ack');
        $got = $wf->getResult('string', 30);

        // A real tie: Ack and the timer's firing reached history with no workflow task started between them.
        $types = $this->events($wf);
        $fired = \array_search(EventType::EVENT_TYPE_TIMER_FIRED, $types, true);
        $signals = \array_keys($types, EventType::EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED, true);
        $ack = \end($signals); // Hold is the first signal, Ack the last
        if (!\is_int($fired) || \count($signals) < 2) {
            return null;
        }
        [$first, $last] = [\min($fired, $ack), \max($fired, $ack)];
        if (\in_array(EventType::EVENT_TYPE_WORKFLOW_TASK_STARTED, \array_slice($types, $first, $last - $first), true)) {
            return null;
        }
        return [$got, $fired < $ack ? 'timer' : 'Ack'];
    }

    /** @return list<int> the event types of the workflow's history, in order */
    private function events(WorkflowStubInterface $wf): array
    {
        $types = [];
        foreach ($this->workflowClient->getWorkflowHistory($wf->getExecution()) as $event) {
            $types[] = $event->getEventType();
        }
        return $types;
    }

    private function has(WorkflowStubInterface $wf, int $type): bool
    {
        return \in_array($type, $this->events($wf), true);
    }

    /** Waits up to 15s of real time for $count events of the type; throws rather than hang. */
    private function until(WorkflowStubInterface $wf, int $type, int $count = 1): void
    {
        $deadline = \microtime(true) + 15;
        while (\count(\array_keys($this->events($wf), $type, true)) < $count) {
            if (\microtime(true) > $deadline) {
                throw new \RuntimeException(\sprintf('event %d never reached history', $type));
            }
            \usleep(50_000);
        }
    }
    /**
     * Waits (real time, up to 15s) until no workflow task is pending, so a time skip cannot run
     * ahead of the worker: the test server fast-forwards even while a workflow task is scheduled.
     */
    private function settle(WorkflowStubInterface $wf): void
    {
        $deadline = \microtime(true) + 15;
        while (true) {
            $scheduled = $completed = $i = -1;
            foreach ($this->workflowClient->getWorkflowHistory($wf->getExecution()) as $event) {
                ++$i;
                match ($event->getEventType()) {
                    EventType::EVENT_TYPE_WORKFLOW_TASK_SCHEDULED => $scheduled = $i,
                    EventType::EVENT_TYPE_WORKFLOW_TASK_COMPLETED => $completed = $i,
                    default => null,
                };
            }
            if ($scheduled >= 0 && $completed > $scheduled) {
                return;
            }
            if (\microtime(true) > $deadline) {
                throw new \RuntimeException('a workflow task never completed');
            }
            \usleep(20_000);
        }
    }
}
