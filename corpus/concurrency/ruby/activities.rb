# frozen_string_literal: true

require 'temporalio/activity'

module Concurrency
  class Count < Temporalio::Activity::Definition
    def execute(items)
      items.length
    end
  end

  class Store < Temporalio::Activity::Definition
    def execute(items)
      Temporalio::Activity::Context.current.logger.info("storing #{items.length} items")
      nil
    end
  end
end
