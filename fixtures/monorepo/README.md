# monorepo

A pnpm workspace used by blast-radius eval scenarios. Nothing is installed;
the packages are read, not built.

| Package              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `packages/contracts` | Shared types: `User`, `Order`. Imported by `api` and `web`.          |
| `packages/api`       | User lookup, order writes (`orders.ts`), SQL migrations, and a one-off legacy order import script. |
| `packages/web`       | UI helpers that render users and orders.                            |

Orders are stored in the `orders` table (`packages/api/migrations/`).
Guest checkout creates orders without a customer.
