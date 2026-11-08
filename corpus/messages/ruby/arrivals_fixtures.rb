# frozen_string_literal: true

require 'temporalio/cancellation'
require 'temporalio/workflow'
require_relative 'arrivals'

# Test workflows for Arrivals; registered only by arrivals_test.rb.
module Messages
  module ArrivalsFixtures
    # A workflow base with a signal X whose arrivals queue in @xs.
    class WithX < Temporalio::Workflow::Definition
      def initialize
        @xs = Arrivals.new
      end

      workflow_signal name: 'X'
      def x(value)
        @xs.add(value)
      end
    end

    # Two waiters of X; the one created first sleeps before it waits, so the other begins waiting first.
    class TwoWaiters < WithX
      def execute
        took = {}
        created_first = Temporalio::Workflow::Future.new do
          Temporalio::Workflow.sleep(1)
          took['created first'] = @xs.take_now
        end
        began_first = Temporalio::Workflow::Future.new { took['began first'] = @xs.take_now }
        Temporalio::Workflow::Future.all_of(created_first, began_first).wait
        took
      end
    end

    # Binds a promise on X, then awaits X.
    class PromiseThenAwait < WithX
      def execute
        promise = @xs.take
        awaited = @xs.take_now
        { 'promise' => promise.wait, 'await' => awaited }
      end
    end

    # The naive promise: a Future whose block takes X; its waiter begins only when the Future's fiber first runs.
    class NaivePromiseThenAwait < Temporalio::Workflow::Definition
      def initialize
        @pending = []
      end

      workflow_signal name: 'X'
      def x(value)
        @pending << value
      end

      def take_now
        Temporalio::Workflow.wait_condition { !@pending.empty? }
        @pending.shift
      end

      def execute
        promise = Temporalio::Workflow::Future.new { take_now }
        awaited = take_now
        { 'promise' => promise.wait, 'await' => awaited }
      end
    end

    # Starts a waiter of X and cancels it, then takes X.
    class CancelledWaiter < WithX
      def execute
        cancellation, cancel = Temporalio::Cancellation.new
        ticket = @xs.wait
        waiter = Temporalio::Workflow::Future.new { @xs.take_at(ticket, cancellation:) }
        Temporalio::Workflow.sleep(1)
        cancel.call
        waiter.wait_no_raise
        @xs.take_now
      end
    end

    # await one: a case for X raced against a timer (listed second), then takes X.
    class AwaitOne < WithX
      def execute(timeout)
        took = []
        ticket = @xs.wait
        timer_cancellation, cancel_timer = Temporalio::Cancellation.new(Temporalio::Workflow.cancellation)
        timer = Temporalio::Workflow::Future.new { Temporalio::Workflow.sleep(timeout, cancellation: timer_cancellation) }
        Temporalio::Workflow.wait_condition { @xs.ready?(ticket) || timer.done? }
        if @xs.ready?(ticket)
          took << "case #{@xs.claim}" # first listed wins
          cancel_timer.call # an inline timer that loses is cancelled
        else
          @xs.leave(ticket)
          took << 'timer'
        end
        took << "then #{@xs.take_now}"
        took
      end
    end

    # The naive mapping: two waiters on wait_condition { !pending.empty? }.
    class NaiveTwoWaiters < Temporalio::Workflow::Definition
      def initialize
        @pending = []
      end

      workflow_signal name: 'X'
      def x(value)
        @pending << value
      end

      def take_now
        Temporalio::Workflow.wait_condition { !@pending.empty? }
        @pending.shift
      end

      def execute
        a = Temporalio::Workflow::Future.new { take_now }
        b = Temporalio::Workflow::Future.new { take_now }
        Temporalio::Workflow::Future.all_of(a, b).wait
        [a.result, b.result]
      end
    end

    # Future.any_of over a take per case: every ready take claims before any_of returns.
    class RaceTakes < Temporalio::Workflow::Definition
      def initialize
        @xs = []
        @ys = []
      end

      workflow_signal name: 'X'
      def x
        @xs << 'X'
      end

      workflow_signal name: 'Y'
      def y
        @ys << 'Y'
      end

      def take(queue)
        Temporalio::Workflow.wait_condition { !queue.empty? }
        queue.shift
      end

      def execute
        y = Temporalio::Workflow::Future.new { take(@ys) } # listed first
        x = Temporalio::Workflow::Future.new { take(@xs) }
        won = Temporalio::Workflow::Future.any_of(y, x).wait
        lost = x.done? && won != x.result ? 'X lost' : 'X pending'
        [won, lost]
      end
    end

    ALL = [TwoWaiters, PromiseThenAwait, NaivePromiseThenAwait, CancelledWaiter, AwaitOne, NaiveTwoWaiters,
           RaceTakes].freeze
  end
end
