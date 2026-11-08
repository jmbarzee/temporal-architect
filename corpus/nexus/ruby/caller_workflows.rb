# frozen_string_literal: true

require 'json'
require 'temporalio/workflow'

module Nexus
  # The default JSON converter writes a Data with to_s, so Greetings writes its
  # fields as a JSON object and a receiver rebuilds it with from_h.
  Greetings = Data.define(:hello, :greeting) do
    def to_json(*args) = to_h.to_json(*args)
    def self.from_h(hash) = new(**hash.transform_keys(&:to_sym))
  end

  # Ruby has a Nexus caller (experimental) and no Nexus handler: GreeterService,
  # and so the greeterTypes worker, are implemented in another SDK.
  class Caller < Temporalio::Workflow::Definition
    def execute(name, friend)
      greeter = Temporalio::Workflow.create_nexus_client(endpoint: 'GreeterEndpoint', service: 'GreeterService')
      hello = greeter.execute_operation('Hello', name)
      greeting = greeter.execute_operation('Greet', name)
      # detach: abandon on cancellation, wait only for the operation's start, never its result.
      greeter.start_operation('Greet', friend,
                              cancellation_type: Temporalio::Workflow::NexusOperationCancellationType::ABANDON)
      Greetings.new(hello:, greeting:)
    end
  end
end
