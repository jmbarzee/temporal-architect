# frozen_string_literal: true

require 'temporalio/workflow'
require_relative 'activities'

module Failure
  class Job < Temporalio::Workflow::Definition
    # The update can run before execute, so item arrives here too.
    workflow_init
    def initialize(item)
      @item = item
      @proceeding = false
    end

    workflow_signal name: 'Proceed'
    def proceed
      @proceeding = true
    end

    workflow_update name: 'Attempt'
    def attempt
      reject_and_process
    end

    def execute(_item)
      Temporalio::Workflow.wait_condition { @proceeding }
      reject_and_process
    end

    private

    # await all: all_of fails at Reject's failure, and Process keeps running. Left unrescued,
    # the failure fails the run from execute and only the update from attempt.
    def reject_and_process
      reject = Temporalio::Workflow::Future.new do
        Temporalio::Workflow.execute_activity(Reject, @item, **Reject::DEFAULTS)
      end
      process = Temporalio::Workflow::Future.new do
        Temporalio::Workflow.execute_activity(Process, @item, start_to_close_timeout: 60)
      end
      Temporalio::Workflow::Future.all_of(reject, process).wait
    end
  end
end
