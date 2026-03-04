# DigitalOcean Admin Operations Runbook (Technical Owner)

<div class="manual-callout warning">
<strong>Audience:</strong> This chapter is for technical owners and deployment operators responsible for infrastructure-level reliability.
</div>

This runbook defines how LessonFlow is maintained in a DigitalOcean-hosted environment. It should be used during planned deployments, post-change verification, incident response, and credential rotation windows. The objective is controlled change with predictable rollback paths.

A safe deployment sequence includes code update, dependency installation, migration execution, application build, service restart, and explicit post-deploy verification. Skipping verification is not acceptable; successful restart alone does not prove workflow correctness.

Post-deploy validation should include admin login, booking console load, invoice console load, and student portal route availability. If any critical route fails, halt further changes and investigate before normal operations resume.

Scheduled job reliability must be monitored continuously. Reminder jobs and other timed tasks should be checked for execution success and error patterns. Re-running failed jobs without diagnosis can duplicate side effects, so root-cause confirmation should happen before rerun.

Rollback readiness is part of every deployment plan. Maintain access to a known-good release state and confirm schema compatibility assumptions before applying rollback in production.

Operational safety rules are strict: never run destructive data operations without backup confidence, never point seed/test tooling at production data, and always rotate sensitive secrets after exposure or incident suspicion.
