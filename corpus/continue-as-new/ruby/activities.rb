# frozen_string_literal: true

require 'temporalio/activity'

module ContinueAsNew
  class Increment < Temporalio::Activity::Definition
    def execute(count)
      count + 1
    end
  end
end
