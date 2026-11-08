# frozen_string_literal: true

require 'json'
require 'temporalio/workflow'
require_relative 'arrivals'

module Messages
  # The default JSON converter writes a Data with to_s, so Decision writes its
  # fields as a JSON object and a receiver rebuilds it with from_h.
  Decision = Data.define(:request, :approver, :note, :status) do
    def to_json(*args) = to_h.to_json(*args)
    def self.from_h(hash) = new(**hash.transform_keys(&:to_sym))
  end

  class Approval < Temporalio::Workflow::Definition
    def initialize
      # Handlers can run before execute, so state lives in initialize.
      @status = 'submitted'
      @opens = Arrivals.new
      @approves = Arrivals.new
      @reviews = Arrivals.new
    end

    workflow_signal name: 'Open'
    def open
      @status = 'open'
      @opens.add(nil)
    end

    workflow_signal name: 'Approve'
    def approve(approver)
      @status = 'approved'
      @approves.add(approver)
    end

    workflow_update name: 'Review'
    def review(note)
      @status = 'reviewed'
      @reviews.add(note)
      @status
    end

    workflow_query name: 'Status'
    def status
      @status
    end

    def execute(request)
      @opens.take_now
      approval = @approves.take # begins waiting here, at its binding
      note = @reviews.take_now
      approver = approval.wait
      Decision.new(request:, approver:, note:, status: @status)
    end
  end
end
