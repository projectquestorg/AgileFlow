# API Documentation Template

**Load this when:** Writing or reviewing API reference documentation for REST endpoints, SDK methods, or CLI commands.

## REST Endpoint Template

````markdown
## [METHOD] /path/to/endpoint

[One sentence describing what this endpoint does.]

**Authentication:** Bearer token | API key | None  
**Rate limit:** N requests/minute per [user/org/IP]

### Path Parameters

| Parameter | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| `id`      | string | Yes      | Unique identifier of the resource |

### Query Parameters

| Parameter | Type    | Required | Default | Description                              |
| --------- | ------- | -------- | ------- | ---------------------------------------- |
| `limit`   | integer | No       | 20      | Max results to return (1–100)            |
| `cursor`  | string  | No       | —       | Pagination cursor from previous response |
| `filter`  | string  | No       | —       | Filter expression (see Filter Syntax)    |

### Request Body

Content-Type: `application/json`

| Field            | Type    | Required | Description                           |
| ---------------- | ------- | -------- | ------------------------------------- |
| `name`           | string  | Yes      | Display name (max 255 chars)          |
| `config`         | object  | No       | Optional configuration overrides      |
| `config.timeout` | integer | No       | Request timeout in ms (default: 5000) |

### Request Example

\```bash
curl -X POST https://api.example.com/v1/resources \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
"name": "my-resource",
"config": { "timeout": 3000 }
}'
\```

### Response

**200 OK**
\```json
{
"id": "res_abc123",
"name": "my-resource",
"status": "active",
"createdAt": "2025-01-15T10:30:00Z",
"config": {
"timeout": 3000
}
}
\```

### Response Fields

| Field       | Type     | Description                     |
| ----------- | -------- | ------------------------------- |
| `id`        | string   | Unique resource identifier      |
| `name`      | string   | Display name                    |
| `status`    | enum     | `active`, `inactive`, `pending` |
| `createdAt` | ISO 8601 | Creation timestamp              |

### Error Responses

| Status | Code              | Description                             |
| ------ | ----------------- | --------------------------------------- |
| 400    | `INVALID_REQUEST` | Missing required field or invalid value |
| 401    | `UNAUTHORIZED`    | Invalid or expired token                |
| 403    | `FORBIDDEN`       | Insufficient permissions                |
| 404    | `NOT_FOUND`       | Resource does not exist                 |
| 409    | `CONFLICT`        | Resource with this name already exists  |
| 429    | `RATE_LIMITED`    | Too many requests                       |
| 500    | `SERVER_ERROR`    | Unexpected server error                 |

**Error response format:**
\```json
{
"error": {
"code": "INVALID_REQUEST",
"message": "Field 'name' is required",
"field": "name"
}
}
\```
````

---

## SDK Method Template

````markdown
### `client.resources.create(options)`

Creates a new resource.

**Parameters:**

| Parameter        | Type             | Required | Description             |
| ---------------- | ---------------- | -------- | ----------------------- |
| `options.name`   | `string`         | Yes      | Display name            |
| `options.config` | `ResourceConfig` | No       | Configuration overrides |

**Returns:** `Promise<Resource>`

**Throws:**

- `ValidationError` — if required fields are missing
- `ConflictError` — if name already in use
- `ApiError` — on server-side errors

**Example:**
\```typescript
const resource = await client.resources.create({
name: "my-resource",
config: { timeout: 3000 }
});
console.log(resource.id); // "res_abc123"
\```
````

---

## Documentation Quality Checklist

- [ ] Every parameter documented with type, required flag, and description
- [ ] At least one working request example per endpoint
- [ ] All possible error responses listed
- [ ] Enums list all valid values
- [ ] Authentication requirements stated
- [ ] Rate limits specified
- [ ] Pagination explained (if applicable)
- [ ] Deprecated fields/methods marked with deprecation notice
- [ ] Version added / version removed noted on fields

---

## Deprecation Notice Format

```markdown
> **Deprecated:** The `oldField` parameter is deprecated as of v2.3 and will be
> removed in v3.0. Use `newField` instead. [Migration guide](#migration)
```

---

## Versioning in URLs vs Headers

| Strategy      | URL example            | Header example                               |
| ------------- | ---------------------- | -------------------------------------------- |
| URL path      | `/v1/resources`        | —                                            |
| Query param   | `/resources?version=1` | —                                            |
| Accept header | —                      | `Accept: application/vnd.api+json;version=1` |
| Custom header | —                      | `API-Version: 2025-01-01`                    |

Recommendation: URL path versioning for REST — most explicit, most cache-friendly.
