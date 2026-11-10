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
        self::assertSame('Ack', $this->tie(['Ack', 'timer'], 'await one'));
        self::assertSame('timer', $this->tie(['timer', 'Ack'], 'await one'));
    }

    public function testTheTemptingFormsAreNotListedOrder(): void
    {
        // Each picks by settle order, so at a tie one listing order loses its first-listed case.
        foreach (['any', 'awaitWithTimeout'] as $form) {
            $winners = [];
            foreach ([['Ack', 'timer'], ['timer', 'Ack']] as $order) {
                $winners[] = $this->tie($order, $form);
            }
            self::assertSame($winners[0], $winners[1], $form . ' picked by listing order');
        }
    }

    private const TIE_ATTEMPTS = 3;

    /**
     * Runs AwaitOneTie until its timer fired and Ack arrived in one workflow task, then returns the
     * winner. A setup that misses the tie is retried, at most TIE_ATTEMPTS times, and never fails
     * the test: after the last miss the test is skipped.
     *
     * @param list<string> $order
     */
    private function tie(array $order, string $form): string
    {
        $misses = [];
        for ($attempt = 1; $attempt <= self::TIE_ATTEMPTS; ++$attempt) {
            $got = $this->tieOnce($order, $form, $misses);
            if ($got !== null) {
                return $got;
            }
        }
        self::markTestSkipped('no tie landed: ' . \implode('; ', $misses));
    }

    /**
     * Holds a workflow task (Hold blocks the single PHP workflow process for 5s) across the timer's
     * due time and Ack's arrival, so both reach the next workflow task. The timer (3s) runs in
     * real time under the test case's time lock. Returns null, recording the history between the
     * two in $misses, when they did not share one task; any other failure throws.
     *
     * @param list<string> $order
     * @param list<string> $misses
     */
    private function tieOnce(array $order, string $form, array &$misses): ?string
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
        self::assertIsInt($fired, 'the timer never fired');
        self::assertCount(2, $signals, 'Hold and Ack were not both signaled');
        $ack = $signals[1];
        $between = \array_slice($types, \min($fired, $ack), \abs($ack - $fired));
        if (!\in_array(EventType::EVENT_TYPE_WORKFLOW_TASK_STARTED, $between, true)) {
            return $got;
        }
        $misses[] = $wf->getExecution()->getID() . ': ' . \implode(',', \array_map(EventType::name(...), $between));
        return null;
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
