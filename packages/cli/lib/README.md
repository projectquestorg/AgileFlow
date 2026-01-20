# AgileFlow CLI Library

Core utility modules for AgileFlow CLI operations.

## Result Schema (`result-schema.js`)

Provides a unified `Result<T>` type for consistent success/failure handling across the codebase.

### Quick Start

```javascript
const { success, failure, isSuccess, unwrapOr } = require('./result-schema');

// Success case
function loadConfig() {
  const config = readConfigFile();
  return success(config);
}

// Failure case with error code
function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return failure('ENOENT', 'Config file not found');
  }
  return success(config);
}

// Using results
const result = loadConfig();
if (isSuccess(result)) {
  console.log(result.data);
} else {
  console.error(result.error);
  console.error('Fix:', result.suggestedFix);
}
```

### Result Structure

**Success:**
```javascript
{
  ok: true,
  data: <T>            // The success data
}
```

**Failure:**
```javascript
{
  ok: false,
  error: string,       // Human-readable message
  errorCode: string,   // Machine-readable code (ENOENT, ECONFIG, etc.)
  severity: string,    // critical | high | medium | low
  category: string,    // filesystem | permission | configuration | network | validation | state | dependency
  recoverable: boolean,
  suggestedFix: string,
  autoFix: string|null,
  context?: object,    // Additional context
  cause?: Error        // Original error
}
```

### API Reference

#### Constructors

| Function | Description |
|----------|-------------|
| `success(data, meta?)` | Create success result |
| `failure(errorCode, message?, options?)` | Create failure result with error code |
| `failureFromError(error, defaultCode?)` | Create failure from Error object |

#### From Helpers

| Function | Description |
|----------|-------------|
| `fromCondition(condition, data, errorCode, message?)` | Create from boolean |
| `fromPromise(promise, defaultCode?)` | Wrap Promise in Result |
| `fromTry(fn, defaultCode?)` | Wrap sync function in Result |

#### Type Guards

| Function | Description |
|----------|-------------|
| `isSuccess(result)` | Check if result is success |
| `isFailure(result)` | Check if result is failure |

#### Extractors

| Function | Description |
|----------|-------------|
| `unwrap(result, context?)` | Get data or throw |
| `unwrapOr(result, defaultValue)` | Get data or default |

#### Transformers

| Function | Description |
|----------|-------------|
| `map(result, fn)` | Transform success data |
| `flatMap(result, fn)` | Chain result-returning operations |

#### Combinators

| Function | Description |
|----------|-------------|
| `all(results)` | Combine array of results |
| `any(results)` | Get first success or last failure |

### Error Codes

Available error codes from `error-codes.js`:

| Code | Category | Description |
|------|----------|-------------|
| `ENOENT` | filesystem | File or directory not found |
| `ENODIR` | filesystem | Directory does not exist |
| `EEXIST` | filesystem | Already exists |
| `EACCES` | permission | Permission denied |
| `EPERM` | permission | Operation not permitted |
| `ECONFIG` | configuration | Invalid/missing configuration |
| `EPARSE` | configuration | Parse error (JSON/YAML) |
| `ESCHEMA` | configuration | Schema validation failed |
| `ENETWORK` | network | Network error |
| `ETIMEOUT` | network | Operation timed out |
| `EINVAL` | validation | Invalid argument |
| `EMISSING` | validation | Required value missing |
| `ESTATE` | state | Invalid application state |
| `ECONFLICT` | state | State conflict |
| `ELOCK` | state | Resource locked |
| `EDEP` | dependency | Missing dependency |
| `EUNKNOWN` | state | Unknown error |

### Migration Guide

**Before (inconsistent):**
```javascript
// Different modules return different shapes
return { ok: true, data };
return { success: true, result };
return { error: 'message' };
```

**After (unified):**
```javascript
const { success, failure } = require('../lib/result-schema');

// Always use Result type
return success(data);
return failure('ENOENT', 'File not found');
```

## Error Codes (`error-codes.js`)

Centralized error codes with metadata for auto-recovery.

### Key Functions

| Function | Description |
|----------|-------------|
| `createErrorResult(code, message?, options?)` | Create failure Result |
| `createSuccessResult(data, meta?)` | Create success Result |
| `getErrorCode(code)` | Get error code metadata |
| `isRecoverable(error)` | Check if error is recoverable |
| `getSuggestedFix(error)` | Get fix suggestion |

## Safe Wrappers (`errors.js`)

File/command wrappers that return Result objects:

| Function | Description |
|----------|-------------|
| `safeReadJSON(path, options?)` | Read and parse JSON |
| `safeWriteJSON(path, data, options?)` | Write JSON to file |
| `safeReadFile(path, options?)` | Read text file |
| `safeWriteFile(path, content, options?)` | Write text file |
| `safeExec(command, options?)` | Execute shell command |
| `safeParseJSON(content, options?)` | Parse JSON with validation |
