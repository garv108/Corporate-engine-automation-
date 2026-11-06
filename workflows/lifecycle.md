# Workflow Lifecycle

requested -> clarifying -> specified -> designed -> generated -> validated -> sandbox_testing -> review_required -> approved -> deployed -> monitored -> improvement_proposed.

Failure states: blocked, validation_failed, sandbox_failed, rejected, deployment_failed, cancelled.

Every transition records actor, timestamp, artifact version, reason and correlation ID.
