# Stock management

Stock changes pass through the `record_stock_movement` RPC. Each movement has an actor, timestamp, quantity, and reason. Product forms cannot overwrite stock balances.

## Rules

- Receipts and returns increase stock; withdrawals decrease it. Count adjustments record a difference, not a replacement balance.
- Negative balances are rejected. Product-row locks serialize competing movements.
- Reversals create a compensating movement and preserve the original. A movement can be reversed only once.
- Products are archived rather than deleted. Archived products are hidden from customers and must be restored before further movements.
- The migration preserves existing balances as `opening_stock`. Reconciliation uses `stoc_actual = opening_stock + SUM(stock_movements.quantity)`.
- A new product starts at zero. A positive initial quantity is recorded as a separate receipt. If the receipt fails, the product remains and the form does not create a duplicate.

History filters include product, actor, movement type, and local calendar dates. The ending date is inclusive. After a network failure, check history before retrying: the database may have committed even if the response was lost.

## Migration and tests

Apply account security before `202609230001_stock_management.sql`. Invalid legacy balances or thresholds abort the migration instead of silently altering data. Release the matching UI with the schema.

`npm test` checks stock validation, permissions, rollback, reversals, and archiving in PGlite. `npm run test:concurrency` checks lock behavior using separate connections to a disposable PostgreSQL instance.
