-- M1-B durable guided discovery sessions and append-only fact provenance.
CREATE TABLE process_discovery_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id UUID NOT NULL REFERENCES tenants(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ready_for_review','confirmed','abandoned')),
 initial_description TEXT NOT NULL CHECK (length(initial_description) BETWEEN 10 AND 10000),
 classification TEXT NOT NULL DEFAULT 'unknown' CHECK (classification IN ('unknown','public','internal','confidential','sensitive_workforce','restricted')),
 current_draft JSONB NOT NULL CHECK (jsonb_typeof(current_draft)='object'),
 completeness JSONB NOT NULL CHECK (jsonb_typeof(completeness)='object'),
 current_question_id TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
 confirmed_by TEXT,
 confirmed_at TIMESTAMPTZ,
 created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 CHECK (
   (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
   OR (status<>'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)
 )
);
CREATE INDEX process_discovery_sessions_tenant_created_idx
 ON process_discovery_sessions (tenant_id,created_at DESC,id DESC);
CREATE INDEX process_discovery_sessions_tenant_status_updated_idx
 ON process_discovery_sessions (tenant_id,status,updated_at DESC);

CREATE TABLE process_discovery_session_turns (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id UUID NOT NULL,
 session_id UUID NOT NULL,
 sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
 speaker TEXT NOT NULL CHECK (speaker IN ('user','assistant','system')),
 content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 10000),
 question_id TEXT,
 actor_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,session_id,id),
 UNIQUE (tenant_id,session_id,sequence_number),
 FOREIGN KEY (tenant_id,session_id)
   REFERENCES process_discovery_sessions (tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX process_discovery_session_turns_sequence_idx
 ON process_discovery_session_turns (tenant_id,session_id,sequence_number);

CREATE TABLE process_discovery_session_fact_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id UUID NOT NULL,
 session_id UUID NOT NULL,
 source_turn_id UUID NOT NULL,
 field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 256),
 value JSONB NOT NULL,
 provenance_kind TEXT NOT NULL CHECK (provenance_kind IN (
  'user_statement','direct_observation','approved_system_record','external_document',
  'ai_hypothesis','synthetic_fixture','derived_calculation'
 )),
 review_state TEXT NOT NULL DEFAULT 'unreviewed'
   CHECK (review_state IN ('unreviewed','user_confirmed','verified','disputed','rejected')),
 is_current BOOLEAN NOT NULL DEFAULT true,
 recorded_by TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reviewed_by TEXT,
 reviewed_at TIMESTAMPTZ,
 FOREIGN KEY (tenant_id,session_id,source_turn_id)
   REFERENCES process_discovery_session_turns (tenant_id,session_id,id) ON DELETE CASCADE,
 CHECK (
  (review_state = 'unreviewed' AND reviewed_by IS NULL AND reviewed_at IS NULL)
  OR (review_state IN ('user_confirmed','verified','disputed','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
 )
);
CREATE INDEX process_discovery_session_facts_field_idx
 ON process_discovery_session_fact_events (tenant_id,session_id,field_path,recorded_at DESC);
CREATE UNIQUE INDEX process_discovery_session_one_current_fact_idx
 ON process_discovery_session_fact_events (tenant_id,session_id,field_path)
 WHERE is_current=true;

CREATE OR REPLACE FUNCTION cias_guard_process_discovery_session_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('confirmed','abandoned') THEN
  RAISE EXCEPTION 'Closed discovery sessions are immutable' USING ERRCODE='55000';
 END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.initial_description,NEW.schema_version,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.initial_description,OLD.schema_version,OLD.created_by,OLD.created_at) THEN
  RAISE EXCEPTION 'Discovery session identity fields are immutable' USING ERRCODE='55000';
 END IF;
 IF OLD.status='active' AND NEW.status NOT IN ('active','ready_for_review','abandoned') THEN
  RAISE EXCEPTION 'Invalid discovery session state transition' USING ERRCODE='55000';
 END IF;
 IF OLD.status='ready_for_review' AND NEW.status NOT IN ('ready_for_review','active','confirmed','abandoned') THEN
  RAISE EXCEPTION 'Invalid discovery session state transition' USING ERRCODE='55000';
 END IF;
 IF NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'Discovery session revision must increase by exactly one' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER process_discovery_sessions_guard_update
 BEFORE UPDATE ON process_discovery_sessions
 FOR EACH ROW EXECUTE FUNCTION cias_guard_process_discovery_session_update();

CREATE OR REPLACE FUNCTION cias_guard_process_discovery_child_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status TEXT;
BEGIN
 SELECT status INTO current_status FROM process_discovery_sessions
 WHERE tenant_id=NEW.tenant_id AND id=NEW.session_id FOR KEY SHARE;
 IF current_status NOT IN ('active','ready_for_review') THEN
  RAISE EXCEPTION 'Discovery session no longer accepts new records' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER process_discovery_turns_guard_insert
 BEFORE INSERT ON process_discovery_session_turns
 FOR EACH ROW EXECUTE FUNCTION cias_guard_process_discovery_child_insert();
CREATE TRIGGER process_discovery_facts_guard_insert
 BEFORE INSERT ON process_discovery_session_fact_events
 FOR EACH ROW EXECUTE FUNCTION cias_guard_process_discovery_child_insert();

CREATE OR REPLACE FUNCTION cias_guard_process_discovery_fact_review()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status TEXT;
BEGIN
 IF ROW(NEW.id,NEW.tenant_id,NEW.session_id,NEW.source_turn_id,NEW.field_path,NEW.value,
        NEW.provenance_kind,NEW.recorded_by,NEW.recorded_at)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.session_id,OLD.source_turn_id,OLD.field_path,OLD.value,
        OLD.provenance_kind,OLD.recorded_by,OLD.recorded_at) THEN
  RAISE EXCEPTION 'Discovery fact content and provenance are immutable' USING ERRCODE='55000';
 END IF;

 SELECT status INTO current_status FROM process_discovery_sessions
 WHERE tenant_id=NEW.tenant_id AND id=NEW.session_id FOR KEY SHARE;
 IF current_status NOT IN ('active','ready_for_review') THEN
  RAISE EXCEPTION 'Confirmed discovery fact history is immutable' USING ERRCODE='55000';
 END IF;

 IF OLD.is_current = false THEN
  RAISE EXCEPTION 'Superseded discovery facts cannot be changed or restored' USING ERRCODE='55000';
 END IF;

 IF NEW.is_current = false THEN
  IF ROW(NEW.review_state,NEW.reviewed_by,NEW.reviewed_at)
     IS DISTINCT FROM
     ROW(OLD.review_state,OLD.reviewed_by,OLD.reviewed_at) THEN
   RAISE EXCEPTION 'A fact cannot be reviewed and superseded in the same update' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
 END IF;

 IF OLD.review_state <> 'unreviewed'
    OR NEW.review_state = 'unreviewed'
    OR NEW.reviewed_by IS NULL
    OR NEW.reviewed_at IS NULL THEN
  RAISE EXCEPTION 'A current discovery fact may only receive one explicit review decision' USING ERRCODE='55000';
 END IF;

 RETURN NEW;
END;
$$;
CREATE TRIGGER process_discovery_facts_guard_update
 BEFORE UPDATE ON process_discovery_session_fact_events
 FOR EACH ROW EXECUTE FUNCTION cias_guard_process_discovery_fact_review();

CREATE OR REPLACE FUNCTION cias_reject_process_discovery_turn_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Discovery turns are append-only' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER process_discovery_turns_append_only
 BEFORE UPDATE ON process_discovery_session_turns
 FOR EACH ROW EXECUTE FUNCTION cias_reject_process_discovery_turn_update();
