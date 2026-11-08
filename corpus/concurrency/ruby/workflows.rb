# frozen_string_literal: true

require 'json'
require 'temporalio/cancellation'
require 'temporalio/workflow'
require_relative 'activities'

module Concurrency
  # The default JSON converter writes a Data with to_s, so Report writes its
  # fields as a JSON object and a receiver rebuilds it with from_h.
  Report = Data.define(:count, :audited, :status) do
    def to_json(*args) = to_h.to_json(*args)
    def self.from_h(hash) = new(**hash.transform_keys(&:to_sym))
  end

  class Batch < Temporalio::Workflow::Definition
    def initialize
      # Handlers can run before execute, so state lives in initialize.
      @status = 'unacknowledged'
      @acks = 0 # pending arrivals of Ack
    end

    workflow_signal name: 'Ack'
    def ack
      @status = 'acknowledged'
      @acks += 1
    end

    def execute(items)
      count = Temporalio::Workflow::Future.new do
        Temporalio::Workflow.execute_activity(Count, items, start_to_close_timeout: 60)
      end
      audited = Temporalio::Workflow::Future.new { Temporalio::Workflow.execute_child_workflow(Audit, items) }
      Temporalio::Workflow::Future.all_of(count, audited).wait

      # detach: abandon the child, never request its cancellation, and wait only for its start.
      Temporalio::Workflow.start_child_workflow(
        Archive, items,
        parent_close_policy: Temporalio::Workflow::ParentClosePolicy::ABANDON,
        cancellation_type: Temporalio::Workflow::ChildWorkflowCancellationType::ABANDON
      )

      # await one: one condition over every case, then the first listed that is ready wins,
      # so Ack wins a tie with the timer. The inline timer that loses is cancelled.
      timer_cancellation, cancel_timer = Temporalio::Cancellation.new(Temporalio::Workflow.cancellation)
      timer = Temporalio::Workflow::Future.new do
        Temporalio::Workflow.sleep(3600, cancellation: timer_cancellation)
      end
      Temporalio::Workflow.wait_condition { @acks.positive? || timer.done? }
      if @acks.positive?
        @acks -= 1
        cancel_timer.call
      end

      Report.new(count: count.result, audited: audited.result, status: @status)
    end
  end

  class Audit < Temporalio::Workflow::Definition
    def execute(items)
      !items.empty?
    end
  end

  class Archive < Temporalio::Workflow::Definition
    def execute(items)
      Temporalio::Workflow.execute_activity(Store, items, start_to_close_timeout: 60)
      nil
    end
  end
end
