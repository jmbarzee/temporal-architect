# frozen_string_literal: true

require 'minitest/autorun'
require 'temporalio/testing'
require_relative 'worker'

module Concurrency
  class BatchTest < Minitest::Test
    ITEMS = %w[a b].freeze

    # Archive's Store, held until the test releases it. A held activity stops time
    # skipping, so Ack is sent before the timer can fire.
    class HeldStore < Temporalio::Activity::Definition
      activity_name 'Store'
      RELEASE = Queue.new

      def execute(_items)
        RELEASE.pop
        nil
      end
    end

    # A promise bound once, timer(24h), raced against Ack every round; returns the Acks counted.
    class BoundDeadline < Temporalio::Workflow::Definition
      def initialize
        @acks = 0 # pending arrivals of Ack
      end

      workflow_signal name: 'Ack'
      def ack
        @acks += 1
      end

      def execute
        counted = 0
        # promise deadline <- timer(24h): bound before the rounds, so losing one never cancels it.
        deadline = Temporalio::Workflow::Future.new { Temporalio::Workflow.sleep(24 * 3600) }
        loop do
          Temporalio::Workflow.wait_condition { @acks.positive? || deadline.done? }
          return counted if @acks.zero?

          @acks -= 1
          counted += 1
        end
      end
    end

    def with_env(&)
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping(&)
    end

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

    def test_batch_acknowledged_without_waiting_for_its_detached_archive
      with_env do |env|
        Concurrency.batch_types(env.client, activities: [Count, HeldStore]).run do
          h = env.client.start_workflow(Batch, ITEMS, id: 'batch-ack', task_queue: BATCHES_TASK_QUEUE)
          until_event(h, :EVENT_TYPE_TIMER_STARTED)
          h.signal(Batch.ack)
          got = Report.from_h(h.result)
          archive_id = h.fetch_history_events.filter_map do |e|
            a = e.child_workflow_execution_started_event_attributes
            a.workflow_execution.workflow_id if a && a.workflow_type.name == 'Archive'
          end.first
          archive = env.client.workflow_handle(archive_id)
          assert_equal Temporalio::Client::WorkflowExecutionStatus::RUNNING, archive.describe.status,
                       'Batch awaited its detached Archive'
          HeldStore::RELEASE << :go
          archive.result
          assert_equal Report.new(count: 2, audited: true, status: 'acknowledged'), got
          types = event_types(h)
          assert_equal 1, types.count(:EVENT_TYPE_TIMER_STARTED)
          assert_includes types, :EVENT_TYPE_TIMER_CANCELED, 'the losing timer was not cancelled'
        end
      end
    end

    def test_batch_the_timer_wins
      with_env do |env|
        Concurrency.batch_types(env.client).run do
          h = env.client.start_workflow(Batch, ITEMS, id: 'batch-timer', task_queue: BATCHES_TASK_QUEUE)
          assert_equal Report.new(count: 2, audited: true, status: 'unacknowledged'), Report.from_h(h.result)
          refute_includes event_types(h), :EVENT_TYPE_TIMER_CANCELED
        end
      end
    end

    def test_a_bound_promise_survives_the_rounds_it_loses
      with_env do |env|
        Temporalio::Worker.new(client: env.client, task_queue: 'bound', workflows: [BoundDeadline]).run do
          h = env.client.start_workflow(BoundDeadline, id: 'bound', task_queue: 'bound')
          h.signal(BoundDeadline.ack)
          env.sleep(3600)
          h.signal(BoundDeadline.ack)
          assert_equal 2, h.result
          types = event_types(h)
          refute_includes types, :EVENT_TYPE_TIMER_CANCELED
          assert_includes types, :EVENT_TYPE_TIMER_FIRED, 'the deadline never fired'
        end
      end
    end

    def test_audit
      with_env do |env|
        Concurrency.batch_types(env.client).run do
          assert_equal true, env.client.execute_workflow(Audit, ['a'], id: 'audit', task_queue: BATCHES_TASK_QUEUE)
        end
      end
    end

    def test_archive
      with_env do |env|
        Concurrency.batch_types(env.client).run do
          assert_nil env.client.execute_workflow(Archive, ['a'], id: 'archive', task_queue: BATCHES_TASK_QUEUE)
        end
      end
    end
  end
end
