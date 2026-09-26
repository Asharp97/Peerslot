ALTER TABLE "user" ADD COLUMN "offers_appointments" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "setup_completed" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "user" SET "offers_appointments" = true
WHERE EXISTS (SELECT 1 FROM "provider_profiles" WHERE "user_id" = "user"."id");
--> statement-breakpoint
CREATE FUNCTION guard_appointment_offering() RETURNS trigger AS $$
BEGIN
  IF OLD.offers_appointments AND NOT NEW.offers_appointments AND EXISTS (
    SELECT 1 FROM appointments a JOIN availability_slots s ON s.id = a.slot_id
    WHERE s.teacher_id = NEW.id AND a.status = 'pending' AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Review pending requests before pausing appointment offering'
      USING ERRCODE = 'P0001', CONSTRAINT = 'offering_pending_requests';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER guard_appointment_offering BEFORE UPDATE OF offers_appointments ON "user"
FOR EACH ROW EXECUTE FUNCTION guard_appointment_offering();
--> statement-breakpoint
CREATE FUNCTION guard_new_appointment_request() RETURNS trigger AS $$
DECLARE offering boolean;
BEGIN
  IF NEW.status = 'pending' AND NEW.deleted_at IS NULL THEN
    -- Serialize new requests with the account switch, including stale browser tabs.
    SELECT offers_appointments INTO offering FROM "user"
    WHERE id = (SELECT teacher_id FROM availability_slots WHERE id = NEW.slot_id) FOR UPDATE;
    IF offering IS NOT TRUE THEN
      RAISE EXCEPTION 'This professional is not accepting appointment requests'
        USING ERRCODE = 'P0001', CONSTRAINT = 'appointment_offering_paused';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER guard_new_appointment_request BEFORE INSERT OR UPDATE OF status, slot_id, deleted_at ON appointments
FOR EACH ROW EXECUTE FUNCTION guard_new_appointment_request();
