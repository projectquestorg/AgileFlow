# Test Patterns Reference

**Load this when:** choosing test structure for a specific layer, deciding on mocking strategies, picking framework-specific patterns, or structuring a new test file from scratch.

---

## Test layer patterns

### Unit tests

Unit tests verify a single function, class, or module in complete isolation. All dependencies are replaced with fakes, mocks, or stubs.

**When to write unit tests:**

- Pure functions with deterministic input/output
- Business logic / domain rules
- Utility functions
- State machines and reducers
- Data transformation / mapping functions

**Unit test structure (Vitest / Jest):**

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PricingEngine } from "./pricing-engine";

describe("PricingEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new PricingEngine({ taxRate: 0.1 });
  });

  describe("calculateTotal", () => {
    it("applies tax to the base price", () => {
      const result = engine.calculateTotal({ basePrice: 100 });
      expect(result.total).toBe(110);
    });

    it("applies a percentage discount before tax", () => {
      const result = engine.calculateTotal({ basePrice: 100, discountPct: 20 });
      expect(result.total).toBe(88); // (100 * 0.8) * 1.1
    });

    it("throws when basePrice is negative", () => {
      expect(() => engine.calculateTotal({ basePrice: -1 })).toThrow(
        "basePrice must be non-negative",
      );
    });

    it("returns zero tax when basePrice is zero", () => {
      const result = engine.calculateTotal({ basePrice: 0 });
      expect(result.tax).toBe(0);
    });
  });
});
```

**Unit test structure (pytest):**

```python
import pytest
from pricing_engine import PricingEngine

@pytest.fixture
def engine():
    return PricingEngine(tax_rate=0.1)

class TestCalculateTotal:
    def test_applies_tax_to_base_price(self, engine):
        result = engine.calculate_total(base_price=100)
        assert result.total == pytest.approx(110.0)

    def test_applies_discount_before_tax(self, engine):
        result = engine.calculate_total(base_price=100, discount_pct=20)
        assert result.total == pytest.approx(88.0)

    def test_raises_on_negative_price(self, engine):
        with pytest.raises(ValueError, match="non-negative"):
            engine.calculate_total(base_price=-1)

    @pytest.mark.parametrize("base_price", [0, 0.01, 1, 999999])
    def test_does_not_raise_on_valid_prices(self, engine, base_price):
        engine.calculate_total(base_price=base_price)  # should not raise
```

**Unit test structure (Go):**

```go
func TestCalculateTotal(t *testing.T) {
    engine := NewPricingEngine(0.1)

    tests := []struct {
        name      string
        basePrice float64
        discount  float64
        want      float64
        wantErr   bool
    }{
        {"applies tax to base price", 100, 0, 110.0, false},
        {"applies discount before tax", 100, 20, 88.0, false},
        {"rejects negative price", -1, 0, 0, true},
        {"handles zero price", 0, 0, 0.0, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := engine.CalculateTotal(tt.basePrice, tt.discount)
            if (err != nil) != tt.wantErr {
                t.Fatalf("wantErr=%v, got err=%v", tt.wantErr, err)
            }
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

---

### Integration tests

Integration tests verify that two or more real components work together correctly. Use a real database (test instance or in-memory), real module dependencies, but no external network calls.

**When to write integration tests:**

- Repository / data access layer (real DB queries)
- Service + repository wired together
- API route + business logic
- Module A calling Module B with real data

**Integration test structure (Vitest + real SQLite):**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { UserRepository } from "./user-repository";
import { createTestDatabase, seedUsers, clearUsers } from "../test-helpers/db";

describe("UserRepository", () => {
  let db;
  let repo;

  beforeAll(async () => {
    db = await createTestDatabase(); // in-memory SQLite
    repo = new UserRepository(db);
  });

  afterAll(() => db.close());
  beforeEach(() => clearUsers(db));

  it("creates a user and retrieves it by id", async () => {
    const created = await repo.create({
      email: "alice@example.com",
      name: "Alice",
    });
    const found = await repo.findById(created.id);
    expect(found.email).toBe("alice@example.com");
  });

  it("returns null when user does not exist", async () => {
    const found = await repo.findById("non-existent-id");
    expect(found).toBeNull();
  });

  it("lists all users ordered by created_at desc", async () => {
    await seedUsers(db, [
      { email: "a@example.com" },
      { email: "b@example.com" },
    ]);
    const users = await repo.findAll();
    expect(users).toHaveLength(2);
    expect(users[0].created_at >= users[1].created_at).toBe(true);
  });
});
```

**Integration test structure (pytest + SQLAlchemy):**

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, User
from repositories import UserRepository

@pytest.fixture(scope="function")
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)

@pytest.fixture
def user_repo(db_session):
    return UserRepository(db_session)

def test_create_and_retrieve_user(user_repo):
    created = user_repo.create(email="alice@example.com", name="Alice")
    found = user_repo.find_by_id(created.id)
    assert found.email == "alice@example.com"
```

---

### API / HTTP integration tests

Test HTTP endpoints with a real application instance (no real external dependencies).

**Express + Supertest (Jest/Vitest):**

```js
import request from "supertest";
import { app } from "../app";
import { createTestDatabase } from "../test-helpers/db";

describe("POST /api/users", () => {
  it("creates a user and returns 201", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ email: "new@example.com", name: "New User" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe("new@example.com");
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "No Email" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("email is required");
  });

  it("returns 409 when email already exists", async () => {
    await request(app)
      .post("/api/users")
      .send({ email: "dup@example.com", name: "A" });
    const res = await request(app)
      .post("/api/users")
      .send({ email: "dup@example.com", name: "B" });
    expect(res.status).toBe(409);
  });
});
```

---

## Mocking patterns

### Mock at the boundary — not inside the unit

```
Your module → [MOCK HERE] → External dependency (DB, HTTP, FS, Time)
```

Do NOT mock:

- The module under test
- Helper utilities that are pure functions
- The production database schema (use test DB instead)

### Vitest / Jest mock patterns

**Mock a module import:**

```js
vi.mock("./email-service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
}));
```

**Mock with implementation factory:**

```js
const mockSend = vi.fn();
vi.mock("./email-service", () => ({ sendEmail: mockSend }));

it("sends a welcome email on registration", async () => {
  mockSend.mockResolvedValueOnce({ messageId: "abc" });
  await registerUser({ email: "x@example.com" });
  expect(mockSend).toHaveBeenCalledWith({
    to: "x@example.com",
    template: "welcome",
  });
});
```

**Spy on real module (partial mock):**

```js
import * as emailService from "./email-service";
const spy = vi
  .spyOn(emailService, "sendEmail")
  .mockResolvedValue({ messageId: "spy-id" });
```

**Mock Date.now for time-sensitive tests:**

```js
vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
// ... test ...
vi.useRealTimers();
```

### pytest mock patterns

```python
from unittest.mock import patch, MagicMock

def test_sends_welcome_email(mocker):
    mock_send = mocker.patch('services.email_service.send_email')
    mock_send.return_value = {'message_id': 'abc'}

    register_user(email='x@example.com')

    mock_send.assert_called_once_with(
        to='x@example.com',
        template='welcome'
    )
```

### Fake in-memory implementations

Prefer fakes over mocks for stable interfaces:

```js
// Fake in-memory user repository (stable interface, no brittle call assertions)
class InMemoryUserRepository {
  constructor() {
    this.users = new Map();
  }
  async findById(id) {
    return this.users.get(id) ?? null;
  }
  async create(data) {
    const user = { id: crypto.randomUUID(), ...data };
    this.users.set(user.id, user);
    return user;
  }
  async delete(id) {
    this.users.delete(id);
  }
}
```

---

## Async test patterns

**Always await async operations — never fire-and-forget in tests:**

```js
// Bad — test may pass before rejection
it("resolves correctly", () => {
  fetchUser(1).then((u) => expect(u.id).toBe(1));
});

// Good
it("resolves correctly", async () => {
  const user = await fetchUser(1);
  expect(user.id).toBe(1);
});

// Good — testing rejection
it("rejects when user not found", async () => {
  await expect(fetchUser(999)).rejects.toThrow("User not found");
});
```

---

## Test data patterns

### Factory functions (preferred over hard-coded objects)

```js
function createUser(overrides = {}) {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    role: "member",
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// Usage — only specify what matters for the test
const admin = createUser({ role: "admin" });
const unverified = createUser({ emailVerified: false });
```

### Fixtures vs factories

| Pattern              | When to use                                                  |
| -------------------- | ------------------------------------------------------------ |
| **Factory function** | Test data that varies per test; prefer this by default       |
| **Fixture file**     | Large, complex, stable data (e.g., a full JSON API response) |
| **Seeding helper**   | Integration tests that need data in a real DB                |
| **Inline object**    | Simple tests with one or two fields — factory is overkill    |

---

## Common anti-patterns to avoid

| Anti-pattern                                               | Problem                                         | Fix                                                         |
| ---------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `expect(result).toBeTruthy()`                              | Passes on `1`, `"false"`, `{}` — proves nothing | Use `toBe(true)`, `toEqual(expected)`, or specific matchers |
| `expect(mockFn).toHaveBeenCalled()` without argument check | Doesn't verify correct arguments were passed    | Use `toHaveBeenCalledWith(...)`                             |
| Tests that depend on execution order                       | Brittle — fails when test runner parallelises   | Use `beforeEach` to reset state; never share mutable state  |
| `setTimeout(fn, 100)` in tests                             | Flaky — timing-dependent                        | Use `vi.useFakeTimers()` / `jest.useFakeTimers()`           |
| Asserting on full response body                            | Brittle to schema changes                       | Assert on specific fields that matter for the test          |
| Empty `catch` blocks                                       | Hides failures                                  | Always `throw` or `fail()` in error branches                |
| Test file with 0 `expect` calls                            | Doesn't assert anything                         | Vitest/Jest won't catch this — audit tests manually         |
