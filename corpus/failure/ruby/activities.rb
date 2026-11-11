# frozen_string_literal: true

require 'temporalio/activity'
require 'temporalio/error'
require 'temporalio/retry_policy'

module Failure
  class Reject < Temporalio::Activity::Definition
    DEFAULTS = {
      start_to_close_timeout: 60,
      retry_policy: Temporalio::RetryPolicy.new(max_attempts: 1)
    }.freeze

    def execute(item)
      raise Temporalio::Error::ApplicationError.new("rejected #{item}", type: 'Rejected')
    end
  end

  # Failure::Process, not Ruby's core Process module.
  class Process < Temporalio::Activity::Definition
    def execute(item)
      Temporalio::Activity::Context.current.logger.info("processing #{item}")
      nil
    end
  end
end
