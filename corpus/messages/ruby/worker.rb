# frozen_string_literal: true

require 'temporalio/client'
require 'temporalio/env_config'
require 'temporalio/worker'
require_relative 'workflows'

module Messages
  # The approvalTypes worker: its task queue and registrations, shared by the
  # worker process and the tests.
  def self.approval_types(client)
    Temporalio::Worker.new(client:, task_queue: 'approvals', workflows: [Approval])
  end
end

if __FILE__ == $PROGRAM_NAME
  args, kwargs = Temporalio::EnvConfig::ClientConfig.load_client_connect_options
  Messages.approval_types(Temporalio::Client.connect(*args, **kwargs)).run(shutdown_signals: ['SIGINT'])
end
