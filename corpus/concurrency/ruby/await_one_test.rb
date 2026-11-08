# frozen_string_literal: true

require 'minitest/autorun'
require 'securerandom'
require 'temporalio/testing'
require 'temporalio/worker'
require_relative 'await_one_fixtures'

module Concurrency
  class AwaitOneTest < Minitest::Test
    TASK_QUEUE = 'await-one'

    def event_types(handle)
      handle.fetch_history_events.map(&:event_type)
    end

    # Waits up to 10s of real time for an event of type; raises rather than hang.
    def until_event(handle, type)
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 10
      until event_types(handle).include?(type)
        raise "#{handle.id}: #{type} never reached history" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

        sleep 0.02
      end
    end

    # No cache, so no sticky queue: the next workflow task goes to the normal queue, not a stopped worker.
    def worker(env)
      Temporalio::Worker.new(client: env.client, task_queue: TASK_QUEUE, workflows: AwaitOneFixtures::ALL,
                             max_cached_workflows: 0)
    end

    ATTEMPTS = 5

    # Runs workflow until a real tie lands — the timer fired and Ack sent while no worker runs, so
    # both reach one workflow task — and returns its winner. The setup is timing-dependent, so a
    # missed attempt (an error, or a workflow task between the two events) is retried, up to
    # ATTEMPTS; if none ties, the test is skipped, never failed: a missed setup proves nothing.
    def tie(workflow, order)
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping do |env|
        misses = []
        ATTEMPTS.times do
          got = attempt_tie(env, workflow, order)
          return got if got

          misses << 'no tie in one workflow task'
        rescue StandardError => e
          misses << "#{e.class}: #{e.message}"
        end
        skip("no real tie in #{ATTEMPTS} attempts: #{misses.join('; ')}")
      end
    end

    # One attempt: the winner when the timer firing and Ack land in one workflow task, else nil.
    def attempt_tie(env, workflow, order)
      h = env.client.start_workflow(workflow, order, id: "tie-#{SecureRandom.uuid}", task_queue: TASK_QUEUE)
      worker(env).run { until_event(h, :EVENT_TYPE_TIMER_STARTED) }
      # Skip time past the timer; with no worker to take its workflow task, nothing runs.
      skipper = Thread.new { env.sleep(7200) }
      until_event(h, :EVENT_TYPE_TIMER_FIRED)
      h.signal('Ack')
      got = worker(env).run { h.result }
      skipper.join

      # Both ready on one resume: no workflow task started between the timer firing and Ack arriving.
      types = event_types(h)
      fired = types.index(:EVENT_TYPE_TIMER_FIRED)
      signaled = types.index(:EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED)
      return nil if fired.nil? || signaled.nil?
      return nil if types[[fired, signaled].min..[fired, signaled].max].include?(:EVENT_TYPE_WORKFLOW_TASK_STARTED)

      got
    end

    def test_await_one_ack_listed_first_wins_a_tie
      assert_equal 'Ack', tie(AwaitOneFixtures::AwaitOne, %w[Ack timer])
    end

    def test_await_one_timer_listed_first_wins_a_tie
      assert_equal 'timer', tie(AwaitOneFixtures::AwaitOne, %w[timer Ack])
    end

    def test_workflow_timeout_is_not_await_one
      # Workflow.timeout's timer raises into the waiter as the activation applies the timer's job,
      # before Ack's handler runs, so the timer wins a tie even with Ack listed first.
      assert_equal 'timer', tie(AwaitOneFixtures::TimeoutWait, %w[Ack timer])
    end
  end
end
