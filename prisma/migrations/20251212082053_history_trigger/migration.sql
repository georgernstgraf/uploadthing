-- CreateTrigger
CREATE TRIGGER IF NOT EXISTS user_history_log
AFTER INSERT ON "user"
FOR EACH ROW
BEGIN
    INSERT INTO "history" (ip, email, at)
    VALUES (NEW.ip, NEW.email, strftime('%Y-%m-%dT%H:%M:%f000Z', 'now'));
END;