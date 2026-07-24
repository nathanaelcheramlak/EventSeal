create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_audit_logs_result on audit_logs(result);
