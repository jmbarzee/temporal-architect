# frozen_string_literal: true

require 'minitest/autorun'
require 'temporalio/testing'
require_relative 'worker'

module Messages
  class ApprovalTest < Minitest::Test
    def with_env(&)
      Temporalio::Testing::WorkflowEnvironment.start_time_skipping(&)
    end

    def test_approval
      with_env do |env|
        Messages.approval_types(env.client).run do
          h = env.client.start_workflow(Approval, 'access', id: 'approval-1', task_queue: APPROVALS_TASK_QUEUE)
          # Approve arrives before anything waits for it, and stays pending.
          env.sleep(30)
          h.signal(Approval.approve, 'Grace')
          env.sleep(30)
          h.signal(Approval.open)
          env.sleep(60)
          assert_equal 'open', h.query(Approval.status)
          assert_equal 'reviewed', h.execute_update(Approval.review, 'LGTM')
          want = Decision.new(request: 'access', approver: 'Grace', note: 'LGTM', status: 'reviewed')
          assert_equal want, Decision.from_h(h.result)
        end
      end
    end

    def test_review_answered_before_a_waiter_takes_it
      with_env do |env|
        Messages.approval_types(env.client).run do
          h = env.client.start_workflow(Approval, 'access', id: 'approval-2', task_queue: APPROVALS_TASK_QUEUE)
          # Review arrives while Approval still awaits Open, before anything waits for Review.
          env.sleep(30)
          assert_equal 'reviewed', h.execute_update(Approval.review, 'LGTM')
          h.signal(Approval.open)
          env.sleep(60)
          h.signal(Approval.approve, 'Grace')
          want = Decision.new(request: 'access', approver: 'Grace', note: 'LGTM', status: 'approved')
          assert_equal want, Decision.from_h(h.result)
        end
      end
    end
  end
end
