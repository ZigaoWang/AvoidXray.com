-- Bumped on a password change or reset to sign out every existing session.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
