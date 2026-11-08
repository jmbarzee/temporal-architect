# frozen_string_literal: true

require 'temporalio/client'
require 'temporalio/env_config'
require 'temporalio/worker'
require_relative 'workflows'

module ContinueAsNew
  COUNTERS_TASK_QUEUE = 'counters'

  # The counterTypes worker: its task queue and registrations, shared by the
  # worker process and the tests.
  def self.counter_types(client)
    Temporalio::Worker.new(client:, task_queue: COUNTERS_TASK_QUEUE, workflows: [Counter], activities: [Increment])
  end
end

if __FILE__ == $PROGRAM_NAME
  args, kwargs = Temporalio::EnvConfig::ClientConfig.load_client_connect_options
  ContinueAsNew.counter_types(Temporalio::Client.connect(*args, **kwargs)).run(shutdown_signals: ['SIGINT'])
end
