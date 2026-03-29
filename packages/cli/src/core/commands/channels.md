---
description: Manage external event channels (CI alerts, Telegram, Discord, webhooks)
argument-hint: "[ACTION=add|list|remove|set] [SOURCE=ci|telegram|discord|webhook|file-watcher] [--trust=observe|suggest|react]"
---

# /channels - External Event Channel Management

Manage Claude Code Channels for receiving external events in your warm session.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| ACTION | Yes | `add`, `list`, `remove`, or `set` |
| SOURCE | For add/remove | Channel source type |
| --trust | No | Trust level: `observe` (default), `suggest`, or `react` |
| --name | No | Custom channel name (defaults to source type) |

## Actions

### `add` - Add a new channel

```
/channels add ci              → Auto-detect CI and generate integration snippet
/channels add telegram        → Guided Telegram BotFather setup
/channels add webhook         → Generate localhost webhook endpoint
/channels add file-watcher    → Watch a directory for changes
```

### `list` - Show active channels

Shows all registered channels with status, trust level, and recent event counts.

### `remove` - Remove a channel

```
/channels remove ci           → Removes CI channel and cleans up config
```

### `set` - Change channel settings

```
/channels set ci --trust=react   → Upgrade CI channel to auto-react mode
/channels set ci --trust=observe → Downgrade to observe-only
```

## Trust Levels (Progressive)

| Level | Behavior | Risk |
|-------|----------|------|
| **observe** (default) | Claude sees events, mentions them, but takes no action unless asked | Zero |
| **suggest** | Claude proposes fixes and asks for confirmation | Low |
| **react** | Claude auto-fixes and pushes (damage control still active) | Medium |

## Workflow

When the user runs `/channels`, execute these steps:

### Step 1: Parse Action

Read the ACTION argument. If missing, default to `list`.

### Step 2: Execute Action

**For `add`:**
1. Load channel modules:
   ```javascript
   const channelAdapter = require('.agileflow/scripts/lib/channel-adapter');
   const ciChannel = require('.agileflow/scripts/lib/ci-channel');
   const credentialStore = require('.agileflow/lib/credential-store');
   ```

2. If SOURCE is `ci`:
   - Call `ciChannel.detectCIProvider(rootDir)` to auto-detect
   - Call `ciChannel.setupCIChannel(rootDir, { trustLevel })` to register
   - Display the generated YAML snippet with copy-paste instructions
   - Show trust level and how to upgrade later

3. If SOURCE is `telegram`:
   - Guide user through BotFather setup:
     a. "Open Telegram, search for @BotFather, send /newbot"
     b. "Paste your bot token below"
   - Store token via `credentialStore.setCredential('telegram', 'bot-token', token)`
   - Register channel via `channelAdapter.registerChannel(rootDir, 'telegram', { source: 'telegram' })`
   - Remind: "Run `/telegram access-policy allow-list` to lock down access"

4. If SOURCE is `webhook`:
   - Register channel with generated signing secret
   - Display the localhost URL and signing secret
   - Store signing secret in credential store

5. If SOURCE is `file-watcher`:
   - Ask which directory to watch
   - Register channel with directory path

**For `list`:**
1. Call `channelAdapter.getChannelStatus(rootDir)`
2. Display table with: Name, Source, Trust Level, Status, Registered Date
3. If no channels: suggest `/channels add ci` to get started

**For `remove`:**
1. Call `channelAdapter.removeChannel(rootDir, name)`
2. Clean up credentials: `credentialStore.deleteCredential(name, 'bot-token')`
3. Confirm removal

**For `set`:**
1. Read current channel config
2. Update trust level or other settings
3. Save updated config

### Step 3: Confirm

Display success message with next steps.

## Examples

```
/channels                     → Lists all channels (same as /channels list)
/channels add ci              → Auto-detect GitHub Actions, generate snippet
/channels add ci --trust=react → CI channel with auto-fix enabled
/channels list                → Show all channels with status
/channels remove telegram     → Remove Telegram channel
/channels set ci --trust=suggest → Change CI trust level
```
