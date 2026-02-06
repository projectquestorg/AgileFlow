/**
 * Claude CLI Bridge
 *
 * Spawns Claude Code CLI as a subprocess and bridges communication
 * between the dashboard and Claude.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

/**
 * Creates a Claude CLI bridge for a session
 */
function createClaudeBridge(options = {}) {
  const {
    cwd = process.cwd(),
    onText,
    onToolStart,
    onToolResult,
    onError,
    onComplete,
    onInit,
  } = options;

  let claudeProcess = null;
  let isRunning = false;

  /**
   * Send a message to Claude and stream the response
   */
  async function sendMessage(content) {
    if (isRunning) {
      throw new Error('Claude is already processing a message');
    }

    isRunning = true;

    return new Promise((resolve, reject) => {
      // Spawn claude with streaming JSON output
      claudeProcess = spawn(
        'claude',
        ['--print', '--output-format', 'stream-json', '--permission-mode', 'default', content],
        {
          cwd,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      // Parse NDJSON output line by line
      const rl = readline.createInterface({
        input: claudeProcess.stdout,
        crlfDelay: Infinity,
      });

      let fullResponse = '';
      let toolUseBuffer = new Map();
      let hadAssistantText = false;

      rl.on('line', line => {
        try {
          const event = JSON.parse(line);
          const result = processEvent(event, {
            onText,
            onToolStart,
            onToolResult,
            onInit,
            toolUseBuffer,
            hadAssistantText,
          });

          // Track if we've sent assistant text
          if (result?.sentText) {
            hadAssistantText = true;
          }

          // Accumulate text response
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                fullResponse += block.text;
              }
            }
          }
          // Also accumulate from result (for slash commands)
          if (event.type === 'result' && event.result) {
            fullResponse = event.result;
          }
        } catch (err) {
          // Skip non-JSON lines
        }
      });

      claudeProcess.stderr.on('data', data => {
        const errorText = data.toString();
        if (onError) onError(errorText);
      });

      claudeProcess.on('close', code => {
        isRunning = false;
        claudeProcess = null;

        if (code === 0) {
          if (onComplete) onComplete(fullResponse);
          resolve(fullResponse);
        } else {
          const error = new Error(`Claude exited with code ${code}`);
          if (onError) onError(error.message);
          reject(error);
        }
      });

      claudeProcess.on('error', err => {
        isRunning = false;
        claudeProcess = null;
        if (onError) onError(err.message);
        reject(err);
      });
    });
  }

  /**
   * Cancel the current Claude operation
   */
  function cancel() {
    if (claudeProcess) {
      claudeProcess.kill('SIGINT');
      isRunning = false;
      claudeProcess = null;
    }
  }

  /**
   * Check if Claude is currently processing
   */
  function isBusy() {
    return isRunning;
  }

  return {
    sendMessage,
    cancel,
    isBusy,
  };
}

/**
 * Process a stream-json event from Claude CLI
 * @returns {{ sentText: boolean }} - Whether text was sent
 */
function processEvent(event, handlers) {
  const { onText, onToolStart, onToolResult, onInit, toolUseBuffer, hadAssistantText } = handlers;
  let sentText = false;

  switch (event.type) {
    case 'system':
      if (event.subtype === 'init' && onInit) {
        onInit({
          sessionId: event.session_id,
          model: event.model,
          tools: event.tools,
        });
      }
      break;

    case 'assistant':
      if (event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text' && onText) {
            // Stream text
            onText(block.text, false);
            sentText = true;
          } else if (block.type === 'tool_use' && onToolStart) {
            // Tool call started
            toolUseBuffer.set(block.id, block);
            onToolStart(block.id, block.name, block.input);
          }
        }
      }
      break;

    case 'user':
      // This is a tool result coming back
      if (event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_result' && onToolResult) {
            const toolUse = toolUseBuffer.get(block.tool_use_id);
            onToolResult(block.tool_use_id, block.content, block.is_error, toolUse?.name);
          }
        }
      }
      break;

    case 'result':
      if (event.subtype === 'success') {
        // For slash commands (no assistant text), send the result text
        if (event.result && onText && !hadAssistantText) {
          onText(event.result, false);
          sentText = true;
        }
        // Signal completion
        if (onText) {
          onText('', true);
        }
      }
      break;
  }

  return { sentText };
}

module.exports = {
  createClaudeBridge,
};
