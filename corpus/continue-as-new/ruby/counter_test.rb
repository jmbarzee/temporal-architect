# frozen_string_literal: true

require 'minitest/autorun'
require 'temporalio/testing'
require_relative 'worker'

module ContinueAsNew
  class CounterTest < Minitest::Test
    TASK_QUEUE = 'counters'

    def with_env(&)
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping(&)
    end

    def test_counter_completes_at_the_limit
      with_env do |env|
        ContinueAsNew.counter_types(env.client).run do
          assert_equal 3, env.client.execute_workflow(Counter, 2, 3, id: 'counter-1', task_queue: TASK_QUEUE)
        end
      end
    end

    def test_counter_continues_as_new_below_it
      with_env do |env|
        ContinueAsNew.counter_types(env.client).run do
          h = env.client.start_workflow(Counter, 0, 3, id: 'counter-2', task_queue: TASK_QUEUE)
          assert_equal 3, h.result # follows the chain of runs
          first = env.client.workflow_handle(h.id, run_id: h.first_execution_run_id)
          assert_equal Temporalio::Client::WorkflowExecutionStatus::CONTINUED_AS_NEW, first.describe.status
        end
      end
    end
  end
end
