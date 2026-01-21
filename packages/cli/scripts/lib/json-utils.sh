#!/bin/bash
# AgileFlow JSON Utilities - Bash Edition
#
# Source this file: source "$(dirname "${BASH_SOURCE[0]}")/lib/json-utils.sh"
#
# Provides safe JSON parsing functions with error handling.

# ============================================================================
# Safe JSON Parsing
# ============================================================================

# safeJsonParse - Parse JSON file safely with validation
# Returns the extracted value or a default if parsing fails.
# Logs errors to stderr but doesn't crash the script.
#
# Usage:
#   value=$(safeJsonParse "/path/to/file.json" ".key.path" "default_value")
#   value=$(safeJsonParse "$FILE" ".archival.enabled" "true")
#
# Arguments:
#   $1 - File path to parse
#   $2 - jq query path (e.g., ".key.subkey")
#   $3 - Default value if parse fails (required for safety)
#
safeJsonParse() {
  local file="$1"
  local query="$2"
  local default="$3"

  # Validate arguments
  if [[ -z "$file" ]] || [[ -z "$query" ]]; then
    echo "$default"
    return 0
  fi

  # Check file exists
  if [[ ! -f "$file" ]]; then
    echo "$default"
    return 0
  fi

  # Check file is readable
  if [[ ! -r "$file" ]]; then
    echo -e "\033[0;31m[json-utils] Cannot read file: $file\033[0m" >&2
    echo "$default"
    return 0
  fi

  # Try jq first (preferred, more robust)
  if command -v jq &> /dev/null; then
    local result
    result=$(jq -r "$query // empty" "$file" 2>/dev/null)
    if [[ -n "$result" ]] && [[ "$result" != "null" ]]; then
      echo "$result"
      return 0
    fi
  fi

  # Fallback to Node.js if jq unavailable or failed
  if command -v node &> /dev/null; then
    local result
    # Security: Pass file path via environment variable
    result=$(JSON_FILE="$file" JSON_QUERY="$query" node -pe "
      try {
        const fs = require('fs');
        const content = fs.readFileSync(process.env.JSON_FILE, 'utf8');
        const data = JSON.parse(content);
        const keys = process.env.JSON_QUERY.replace(/^\\./, '').split('.');
        let result = data;
        for (const key of keys) {
          if (result && typeof result === 'object' && key in result) {
            result = result[key];
          } else {
            result = null;
            break;
          }
        }
        result !== null && result !== undefined ? String(result) : '';
      } catch (e) {
        '';
      }
    " 2>/dev/null)

    if [[ -n "$result" ]]; then
      echo "$result"
      return 0
    fi
  fi

  # If both methods fail, return default
  echo "$default"
  return 0
}

# safeJsonValidate - Check if file contains valid JSON
# Returns 0 if valid, 1 if invalid
#
# Usage:
#   if safeJsonValidate "/path/to/file.json"; then
#     echo "Valid JSON"
#   fi
#
safeJsonValidate() {
  local file="$1"

  if [[ ! -f "$file" ]] || [[ ! -r "$file" ]]; then
    return 1
  fi

  # Try jq first
  if command -v jq &> /dev/null; then
    jq empty "$file" 2>/dev/null
    return $?
  fi

  # Fallback to Node.js
  if command -v node &> /dev/null; then
    JSON_FILE="$file" node -e "
      try {
        const fs = require('fs');
        JSON.parse(fs.readFileSync(process.env.JSON_FILE, 'utf8'));
        process.exit(0);
      } catch {
        process.exit(1);
      }
    " 2>/dev/null
    return $?
  fi

  # If neither tool available, assume invalid
  return 1
}

# safeJsonRead - Read entire JSON file safely
# Returns the JSON content or empty object if read fails
#
# Usage:
#   content=$(safeJsonRead "/path/to/file.json")
#
safeJsonRead() {
  local file="$1"

  if [[ ! -f "$file" ]] || [[ ! -r "$file" ]]; then
    echo "{}"
    return 0
  fi

  # Validate JSON first
  if ! safeJsonValidate "$file"; then
    echo -e "\033[0;31m[json-utils] Invalid JSON in: $file\033[0m" >&2
    echo "{}"
    return 0
  fi

  cat "$file"
}
