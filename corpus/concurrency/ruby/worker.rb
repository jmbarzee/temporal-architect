# frozen_string_literal: true

require 'temporalio/client'
require 'temporalio/env_config'
require 'temporalio/worker'
require_relative 'workflows'

module Concurrency
  BATCHES_TASK_QUEUE = 'batches'

  # The batchTypes worker: its task queue and registrations, shared by the
  # worker process and the tests.
  def self.batch_types(client, activities: [Count, Store])
    Temporalio::Worker.new(client:, task_queue: BATCHES_TASK_QUEUE, workflows: [Batch, Audit, Archive], activities:)
  end
end

if __FILE__ == $PROGRAM_NAME
  args, kwargs = Temporalio::EnvConfig::ClientConfig.load_client_connect_options
  Concurrency.batch_types(Temporalio::Client.connect(*args, **kwargs)).run(shutdown_signals: ['SIGINT'])
end
