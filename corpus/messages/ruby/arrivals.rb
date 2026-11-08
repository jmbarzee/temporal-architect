# frozen_string_literal: true

require 'temporalio/workflow'

module Messages
  # A signal's or update's pending arrivals and the waiters for them (spec 06),
  # each oldest first. A handler adds an arrival when it returns, and the waiter
  # that began waiting first takes the oldest.
  class Arrivals
    def initialize
      @pending = []
      @waiters = [] # tickets, in the order their waiters began
      @next = 0
    end

    def add(value)
      @pending << value
    end

    # Waits for the oldest arrival in the calling fiber (await signal X).
    def take_now
      take_at(wait)
    end

    # A Future for the oldest arrival (promise p <- signal X). The ticket is
    # taken at the call, so the promise begins waiting at its binding; a
    # Future's block runs only after the calling fiber yields.
    def take
      ticket = wait
      Temporalio::Workflow::Future.new { take_at(ticket) }
    end

    # take for a waiter that began earlier with wait.
    def take_at(ticket, cancellation: Temporalio::Workflow.cancellation)
      Temporalio::Workflow.wait_condition(cancellation:) { ready?(ticket) }
      claim
    ensure
      leave(ticket)
    end

    # Begins a waiter. An await one case waits, checks ready? without taking,
    # and claims only if it wins; win or lose, it leaves.
    def wait
      ticket = @next
      @next += 1
      @waiters << ticket
      ticket
    end

    # Whether an arrival is pending and ticket is the earliest waiter.
    def ready?(ticket)
      !@pending.empty? && @waiters.first == ticket
    end

    # Gives the oldest arrival to the earliest waiter, which must be ready.
    def claim
      @waiters.shift
      @pending.shift
    end

    # Ends a waiter that did not claim; after a claim it does nothing.
    def leave(ticket)
      @waiters.delete(ticket)
    end
  end
end
