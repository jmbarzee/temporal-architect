# frozen_string_literal: true

require 'minitest/autorun'
require 'temporalio/testing'
require_relative 'worker'

module Failure
  class JobTest < Minitest::Test
    # Process, the slow branch, held until the test ends.
    class HeldProcess < Temporalio::Activity::Definition
      activity_name 'Process'

      def initialize(released)
        super()
        @released = released
      end

      def execute(_item)
        @released.pop
        nil
      end
    end

    # Runs the jobTypes worker with Process held, releasing it on the way out so shutdown never waits on it.
    def with_held_process
      released = Queue.new
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping do |env|
        Failure.job_types(env.client, activities: [Reject, HeldProcess.new(released)]).run do
          yield env
        ensure
          released.close
        end
      end
    end

    def event_types(handle)
      handle.fetch_history_events.map(&:event_type)
    end

    # Waits up to 10s of real time for an event of type; raises rather than hang on a branch that waits for Process.
    def until_event(handle, type)
      deadline = ::Process.clock_gettime(::Process::CLOCK_MONOTONIC) + 10
      until event_types(handle).include?(type)
        raise "#{handle.id}: #{type} never reached history" if ::Process.clock_gettime(::Process::CLOCK_MONOTONIC) > deadline

        sleep 0.02
      end
    end

    def test_a_branch_failure_fails_the_run_while_the_other_branch_runs
      with_held_process do |env|
        h = env.client.start_workflow(Job, 'a', id: 'job-1', task_queue: JOBS_TASK_QUEUE)
        h.signal(Job.proceed)
        until_event(h, :EVENT_TYPE_WORKFLOW_EXECUTION_FAILED)
        e = assert_raises(Temporalio::Error::WorkflowFailedError) { h.result }
        assert_rejected(e.cause)
        assert_process_still_running(h)
      end
    end

    def test_a_branch_failure_in_an_update_fails_only_that_update
      with_held_process do |env|
        h = env.client.start_workflow(Job, 'a', id: 'job-2', task_queue: JOBS_TASK_QUEUE)
        update = h.start_update(Job.attempt, wait_for_stage: Temporalio::Client::WorkflowUpdateWaitStage::ACCEPTED)
        until_event(h, :EVENT_TYPE_WORKFLOW_EXECUTION_UPDATE_COMPLETED)
        e = assert_raises(Temporalio::Error::WorkflowUpdateFailedError) { update.result }
        assert_rejected(e.cause)
        assert_equal Temporalio::Client::WorkflowExecutionStatus::RUNNING, h.describe.status
        assert_process_still_running(h)
      end
    end

    def assert_rejected(cause)
      assert_instance_of Temporalio::Error::ActivityError, cause
      assert_equal 'Reject', cause.activity_type
    end

    # Process was scheduled, and neither completed nor was asked to cancel.
    def assert_process_still_running(handle)
      events = handle.fetch_history_events.to_a
      scheduled = events.filter_map { |ev| ev.activity_task_scheduled_event_attributes&.activity_type&.name }
      assert_includes scheduled, 'Process', 'Process was not scheduled'
      types = events.map(&:event_type)
      refute_includes types, :EVENT_TYPE_ACTIVITY_TASK_COMPLETED, 'Process completed'
      refute_includes types, :EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED, 'Process was asked to cancel'
    end
  end
end
