# Observability & Optimization
Trace user request -> agent task -> research job -> workflow project -> n8n execution using correlation IDs.

Metrics: task completion, latency, model tokens/cost, tool errors, research freshness, duplicate rate, evidence coverage, queue age, workflow success, retries, duration, cost/run, manual intervention and rollback.

Business metrics require baselines: process time, volume, errors, labor effort and SLA. Distinguish estimated from measured impact.

Optimization loop: observe -> detect -> diagnose -> propose -> estimate impact/risk -> sandbox experiment -> approval -> deploy -> compare baseline. No silent production modifications.
