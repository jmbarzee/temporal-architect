# frozen_string_literal: true

require 'minitest/autorun'
require 'securerandom'
require 'temporalio/testing'
require 'temporalio/worker'
require_relative 'arrivals_fixtures'

module Messages
  class ArrivalsTest < Minitest::Test
    TASK_QUEUE = 'arrivals'

    # Runs a fixture, sending X "1" after a minute and X "2" after two; returns its result after
    # yielding its handle while the test server still runs.
    def run_fixture(workflow, *args)
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping do |env|
        worker = Temporalio::Worker.new(client: env.client, task_queue: TASK_QUEUE, workflows: ArrivalsFixtures::ALL)
        worker.run do
          h = env.client.start_workflow(workflow, *args, id: "arrivals-#{SecureRandom.uuid}", task_queue: TASK_QUEUE)
          env.sleep(60)
          h.signal(workflow.x, '1')
          env.sleep(60)
          begin
            h.signal(workflow.x, '2')
          rescue Temporalio::Error::RPCError
            nil # A workflow that needed only one X has completed by now.
          end
          result = h.result
          yield h if block_given?
          result
        end
      end
    end

    def test_arrivals_go_to_waiters_in_the_order_they_began
      assert_equal({ 'began first' => '1', 'created first' => '2' }, run_fixture(ArrivalsFixtures::TwoWaiters))
    end

    def test_a_promise_begins_waiting_at_its_binding
      assert_equal({ 'promise' => '1', 'await' => '2' }, run_fixture(ArrivalsFixtures::PromiseThenAwait))
    end

    def test_a_naive_future_promise_begins_waiting_late
      # A Future's block first runs after the binding fiber yields, so the await registers its waiter first.
      assert_equal({ 'promise' => '2', 'await' => '1' }, run_fixture(ArrivalsFixtures::NaivePromiseThenAwait))
    end

    def event_types(handle)
      handle.fetch_history_events.map(&:event_type)
    end

    def test_await_one_the_case_wins_and_takes
      got = run_fixture(ArrivalsFixtures::AwaitOne, 3600) do |h|
        assert_includes event_types(h), :EVENT_TYPE_TIMER_CANCELED, 'the losing timer was not cancelled'
      end
      assert_equal ['case 1', 'then 2'], got
    end

    def test_await_one_the_timer_wins_and_the_case_takes_nothing
      got = run_fixture(ArrivalsFixtures::AwaitOne, 10) do |h|
        refute_includes event_types(h), :EVENT_TYPE_TIMER_CANCELED
      end
      assert_equal ['timer', 'then 1'], got
    end

    def test_a_cancelled_waiter_leaves_the_queue
      assert_equal '1', run_fixture(ArrivalsFixtures::CancelledWaiter)
    end

    def test_naive_wait_condition_per_waiter_keeps_each_arrival
      # The scheduler resumes one satisfied wait_condition per pass, in the order they began, so the
      # naive queue does not hand one arrival to two waiters.
      assert_equal %w[1 2], run_fixture(ArrivalsFixtures::NaiveTwoWaiters)
    end

    def test_future_any_of_over_takes_is_not_await_one
      # Y and X arrive in the first workflow task; both takes claim before any_of returns the
      # first listed done future, so X's arrival is consumed by a case that lost.
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping do |env|
        h = env.client.start_workflow(ArrivalsFixtures::RaceTakes, id: "race-#{SecureRandom.uuid}",
                                                                  task_queue: TASK_QUEUE)
        h.signal(ArrivalsFixtures::RaceTakes.y)
        h.signal(ArrivalsFixtures::RaceTakes.x)
        worker = Temporalio::Worker.new(client: env.client, task_queue: TASK_QUEUE, workflows: ArrivalsFixtures::ALL)
        assert_equal ['Y', 'X lost'], worker.run { h.result }
      end
    end
  end
end
