# frozen_string_literal: true

require 'temporalio/workflow'
require_relative 'activities'

module ContinueAsNew
  class Counter < Temporalio::Workflow::Definition
    def execute(count, limit)
      Temporalio::Workflow.sleep(60)
      nxt = Temporalio::Workflow.execute_activity(Increment, count, start_to_close_timeout: 60)
      return nxt if nxt >= limit

      # Raising ends this run and starts the next with these arguments.
      raise Temporalio::Workflow::ContinueAsNewError.new(nxt, limit)
    end
  end
end
