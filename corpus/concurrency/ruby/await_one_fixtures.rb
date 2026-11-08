# frozen_string_literal: true

require 'temporalio/workflow'

# Test workflows for await one; registered only by await_one_test.rb.
module Concurrency
  module AwaitOneFixtures
    # Batch's await one over Ack and timer(1h), the cases listed in order; returns the winner.
    class AwaitOne < Temporalio::Workflow::Definition
      def initialize
        @acks = 0
      end

      workflow_signal name: 'Ack'
      def ack
        @acks += 1
      end

      def execute(order)
        timer = Temporalio::Workflow::Future.new { Temporalio::Workflow.sleep(3600) }
        ready = { 'Ack' => -> { @acks.positive? }, 'timer' => -> { timer.done? } }
        Temporalio::Workflow.wait_condition { order.any? { |c| ready[c].call } }
        order.find { |c| ready[c].call }
      end
    end

    # The tempting form: Workflow.timeout around a wait_condition. Its timer fiber resumes as the
    # activation applies the timer's job and raises into the waiter before any signal handler runs.
    class TimeoutWait < Temporalio::Workflow::Definition
      def initialize
        @acks = 0
      end

      workflow_signal name: 'Ack'
      def ack
        @acks += 1
      end

      def execute(_order)
        Temporalio::Workflow.timeout(3600) { Temporalio::Workflow.wait_condition { @acks.positive? } }
        'Ack'
      rescue Timeout::Error
        'timer'
      end
    end

    ALL = [AwaitOne, TimeoutWait].freeze
  end
end
