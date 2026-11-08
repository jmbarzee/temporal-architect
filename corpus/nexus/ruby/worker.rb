# frozen_string_literal: true

require 'temporalio/client'
require 'temporalio/env_config'
require 'temporalio/worker'
require_relative 'caller_workflows'

module Nexus
  # The callerTypes worker: its task queue and registrations, shared by the
  # worker process and the tests.
  def self.caller_types(client)
    Temporalio::Worker.new(client:, task_queue: 'caller', workflows: [Caller])
  end
end

if __FILE__ == $PROGRAM_NAME
  args, kwargs = Temporalio::EnvConfig::ClientConfig.load_client_connect_options
  Nexus.caller_types(Temporalio::Client.connect(*args, **kwargs)).run(shutdown_signals: ['SIGINT'])
end
