# frozen_string_literal: true

require 'minitest/autorun'
require 'temporalio/testing'
require_relative 'worker'

module Nexus
  class CallerTest < Minitest::Test
    WS = Temporalio::Api::WorkflowService::V1
    NX = Temporalio::Api::Nexus::V1

    # A stand-in for GreeterService on the greeter task queue, answering through the raw Nexus task
    # API: Ruby has no Nexus handler. Hello and Greet(Ada) complete synchronously; Greet(Grace)
    # starts asynchronously and never completes, so only a detached call lets Caller return.
    def serve_greeter(env, tasks)
      conv = env.client.data_converter.payload_converter
      seen = []
      tasks.times do
        task = env.client.workflow_service.poll_nexus_task_queue(
          WS::PollNexusTaskQueueRequest.new(namespace: env.client.namespace, identity: 'stand-in',
                                            task_queue: Temporalio::Api::TaskQueue::V1::TaskQueue.new(name: 'greeter'))
        )
        start = task.request.start_operation
        arg = conv.from_payload(start.payload)
        seen << [start.service, start.operation, arg]
        response =
          if start.operation == 'Greet' && arg == 'Grace'
            NX::StartOperationResponse.new(async_success: NX::StartOperationResponse::Async.new(operation_token: 'held'))
          else
            prefix = start.operation == 'Hello' ? 'Hello, ' : 'Greetings, '
            NX::StartOperationResponse.new(
              sync_success: NX::StartOperationResponse::Sync.new(payload: conv.to_payload(prefix + arg))
            )
          end
        env.client.workflow_service.respond_nexus_task_completed(
          WS::RespondNexusTaskCompletedRequest.new(namespace: env.client.namespace, identity: 'stand-in',
                                                   task_token: task.task_token,
                                                   response: NX::Response.new(start_operation: response))
        )
      end
      seen
    end

    def test_caller
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping do |env|
        env.create_nexus_endpoint(name: 'GreeterEndpoint', task_queue: 'greeter')
        greeter = Thread.new { serve_greeter(env, 3) }
        Nexus.caller_types(env.client).run do
          h = env.client.start_workflow(Caller, 'Ada', 'Grace', id: 'caller-1', task_queue: 'caller')
          got = Greetings.from_h(h.result)
          assert_equal Greetings.new(hello: 'Hello, Ada', greeting: 'Greetings, Ada'), got
          assert_equal [%w[GreeterService Hello Ada], %w[GreeterService Greet Ada], %w[GreeterService Greet Grace]],
                       greeter.value

          events = h.fetch_history_events.to_a
          scheduled = events.filter_map(&:nexus_operation_scheduled_event_attributes)
          assert_equal %w[GreeterEndpoint] * 3, scheduled.map(&:endpoint)
          assert_equal %w[Hello Greet Greet], scheduled.map(&:operation)
          # The detached Greet(Grace) started and Caller completed without its result.
          assert_equal 1, events.count(&:nexus_operation_started_event_attributes)
          assert_equal 2, events.count(&:nexus_operation_completed_event_attributes)
          assert_equal :EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED, events.last.event_type
        end
      end
    end
  end
end
