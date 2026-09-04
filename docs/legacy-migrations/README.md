# Legacy migrations

Historical record. **Not run by anything.** Superseded by
`prisma/migrations/0_baseline`, which was generated from the production database
and reproduces the full schema on its own.

These twelve files were applied to production by hand, one `psql -f` at a time,
because the deploy script did not run migrations. They are kept because they are
the only record of what was applied and in what order — the Prisma migration
history of the same period is not: it was authored against SQLite (`DATETIME`,
`TEXT NOT NULL PRIMARY KEY`) and never replayed against the PostgreSQL database
it was recorded as having produced.

Do not add to this directory. New schema changes go through
`prisma migrate dev`, and `deploy` applies them with `prisma migrate deploy`.
