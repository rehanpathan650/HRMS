-- Allow exactly one kind of UPDATE on AuditLog: the FK "ON DELETE SET NULL" that
-- detaches a deleted user (actorId -> NULL). Every other column must be unchanged,
-- and actorEmail still identifies who acted.
CREATE OR REPLACE FUNCTION attendly_audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('attendly.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL
     AND NEW."id" = OLD."id"
     AND NEW."actorEmail" IS NOT DISTINCT FROM OLD."actorEmail"
     AND NEW."action" = OLD."action"
     AND NEW."entityType" = OLD."entityType"
     AND NEW."entityId" IS NOT DISTINCT FROM OLD."entityId"
     AND NEW."metadata"::text IS NOT DISTINCT FROM OLD."metadata"::text
     AND NEW."ipAddress" IS NOT DISTINCT FROM OLD."ipAddress"
     AND NEW."userAgent" IS NOT DISTINCT FROM OLD."userAgent"
     AND NEW."createdAt" = OLD."createdAt" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
