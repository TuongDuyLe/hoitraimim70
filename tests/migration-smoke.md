Run the PostgreSQL migration smoke from the repository root with Node.js. PGlite stays in a scratch directory and is not a production dependency:

```powershell
npm install --prefix ../migration-smoke --no-save --ignore-scripts --no-audit --no-fund @electric-sql/pglite
node tests/migration-smoke.mjs --deps=../migration-smoke
```

The script creates two isolated in-memory PostgreSQL databases through PGlite: one with the original schema fixture and one with the current schema. Each database receives representative users, sessions, products and historical orders, then runs `schema.sql`, `upgrade-v2.sql` and `payments-v2.sql` twice. Assertions cover preserved password hashes and working passwords, order money and dates, inventory, audit records, payment requests and receipts, department and stall metadata, task progress, constraints and indexes. A nullable mixed-stall order is also migrated on the second pass.

This checks PostgreSQL syntax and persisted state using an embedded engine. It does not connect to the configured event database or verify concurrent requests on a hosted PostgreSQL server.
