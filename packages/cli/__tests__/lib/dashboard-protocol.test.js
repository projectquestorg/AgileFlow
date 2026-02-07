/**
 * Tests for dashboard-protocol.js - WebSocket Protocol for Dashboard Communication
 */

const {
  OutboundMessageType,
  InboundMessageType,
  createSessionState,
  createTextMessage,
  createTextDelta,
  createToolStart,
  createToolResult,
  createFileRead,
  createFileEdit,
  createBashOutput,
  createGitStatus,
  createGitDiff,
  createTerminalOutput,
  createTerminalExit,
  createTaskUpdate,
  createNotification,
  createError,
  createAutomationList,
  createAutomationStatus,
  createAutomationResult,
  createInboxList,
  createInboxItem,
  createAskUserQuestion,
  parseInboundMessage,
  validateUserMessage,
  serializeMessage,
} = require('../../lib/dashboard-protocol');

describe('dashboard-protocol.js', () => {
  // ============================================================================
  // OutboundMessageType Enum Tests
  // ============================================================================

  describe('OutboundMessageType enum', () => {
    it('has SESSION_STATE key with string value', () => {
      expect(OutboundMessageType.SESSION_STATE).toBe('session_state');
    });

    it('has SESSION_ERROR key', () => {
      expect(OutboundMessageType.SESSION_ERROR).toBe('session_error');
    });

    it('has TEXT key', () => {
      expect(OutboundMessageType.TEXT).toBe('text');
    });

    it('has TEXT_DELTA key', () => {
      expect(OutboundMessageType.TEXT_DELTA).toBe('text_delta');
    });

    it('has TOOL_START key', () => {
      expect(OutboundMessageType.TOOL_START).toBe('tool_start');
    });

    it('has TOOL_RESULT key', () => {
      expect(OutboundMessageType.TOOL_RESULT).toBe('tool_result');
    });

    it('has FILE_READ key', () => {
      expect(OutboundMessageType.FILE_READ).toBe('file_read');
    });

    it('has FILE_WRITE key', () => {
      expect(OutboundMessageType.FILE_WRITE).toBe('file_write');
    });

    it('has FILE_EDIT key', () => {
      expect(OutboundMessageType.FILE_EDIT).toBe('file_edit');
    });

    it('has BASH_START key', () => {
      expect(OutboundMessageType.BASH_START).toBe('bash_start');
    });

    it('has BASH_OUTPUT key', () => {
      expect(OutboundMessageType.BASH_OUTPUT).toBe('bash_output');
    });

    it('has BASH_END key', () => {
      expect(OutboundMessageType.BASH_END).toBe('bash_end');
    });

    it('has TASK_CREATED key', () => {
      expect(OutboundMessageType.TASK_CREATED).toBe('task_created');
    });

    it('has TASK_UPDATED key', () => {
      expect(OutboundMessageType.TASK_UPDATED).toBe('task_updated');
    });

    it('has TASK_LIST key', () => {
      expect(OutboundMessageType.TASK_LIST).toBe('task_list');
    });

    it('has GIT_STATUS key', () => {
      expect(OutboundMessageType.GIT_STATUS).toBe('git_status');
    });

    it('has GIT_DIFF key', () => {
      expect(OutboundMessageType.GIT_DIFF).toBe('git_diff');
    });

    it('has STATUS_UPDATE key', () => {
      expect(OutboundMessageType.STATUS_UPDATE).toBe('status_update');
    });

    it('has AGENT_SPAWN key', () => {
      expect(OutboundMessageType.AGENT_SPAWN).toBe('agent_spawn');
    });

    it('has AGENT_RESULT key', () => {
      expect(OutboundMessageType.AGENT_RESULT).toBe('agent_result');
    });

    it('has NOTIFICATION key', () => {
      expect(OutboundMessageType.NOTIFICATION).toBe('notification');
    });

    it('has TERMINAL_OUTPUT key', () => {
      expect(OutboundMessageType.TERMINAL_OUTPUT).toBe('terminal_output');
    });

    it('has TERMINAL_RESIZE key', () => {
      expect(OutboundMessageType.TERMINAL_RESIZE).toBe('terminal_resize');
    });

    it('has TERMINAL_EXIT key', () => {
      expect(OutboundMessageType.TERMINAL_EXIT).toBe('terminal_exit');
    });

    it('has AUTOMATION_LIST key', () => {
      expect(OutboundMessageType.AUTOMATION_LIST).toBe('automation_list');
    });

    it('has AUTOMATION_STATUS key', () => {
      expect(OutboundMessageType.AUTOMATION_STATUS).toBe('automation_status');
    });

    it('has AUTOMATION_RESULT key', () => {
      expect(OutboundMessageType.AUTOMATION_RESULT).toBe('automation_result');
    });

    it('has INBOX_LIST key', () => {
      expect(OutboundMessageType.INBOX_LIST).toBe('inbox_list');
    });

    it('has INBOX_ITEM key', () => {
      expect(OutboundMessageType.INBOX_ITEM).toBe('inbox_item');
    });

    it('has ASK_USER_QUESTION key', () => {
      expect(OutboundMessageType.ASK_USER_QUESTION).toBe('ask_user_question');
    });

    it('has ERROR key', () => {
      expect(OutboundMessageType.ERROR).toBe('error');
    });
  });

  // ============================================================================
  // InboundMessageType Enum Tests
  // ============================================================================

  describe('InboundMessageType enum', () => {
    it('has MESSAGE key with string value', () => {
      expect(InboundMessageType.MESSAGE).toBe('message');
    });

    it('has CANCEL key', () => {
      expect(InboundMessageType.CANCEL).toBe('cancel');
    });

    it('has SESSION_INIT key', () => {
      expect(InboundMessageType.SESSION_INIT).toBe('session_init');
    });

    it('has SESSION_CLOSE key', () => {
      expect(InboundMessageType.SESSION_CLOSE).toBe('session_close');
    });

    it('has REFRESH key', () => {
      expect(InboundMessageType.REFRESH).toBe('refresh');
    });

    it('has GIT_STAGE key', () => {
      expect(InboundMessageType.GIT_STAGE).toBe('git_stage');
    });

    it('has GIT_UNSTAGE key', () => {
      expect(InboundMessageType.GIT_UNSTAGE).toBe('git_unstage');
    });

    it('has GIT_REVERT key', () => {
      expect(InboundMessageType.GIT_REVERT).toBe('git_revert');
    });

    it('has GIT_COMMIT key', () => {
      expect(InboundMessageType.GIT_COMMIT).toBe('git_commit');
    });

    it('has GIT_PUSH key', () => {
      expect(InboundMessageType.GIT_PUSH).toBe('git_push');
    });

    it('has GIT_PR key', () => {
      expect(InboundMessageType.GIT_PR).toBe('git_pr');
    });

    it('has GIT_DIFF_REQUEST key', () => {
      expect(InboundMessageType.GIT_DIFF_REQUEST).toBe('git_diff_request');
    });

    it('has INLINE_COMMENT key', () => {
      expect(InboundMessageType.INLINE_COMMENT).toBe('inline_comment');
    });

    it('has TERMINAL_INPUT key', () => {
      expect(InboundMessageType.TERMINAL_INPUT).toBe('terminal_input');
    });

    it('has TERMINAL_RESIZE key', () => {
      expect(InboundMessageType.TERMINAL_RESIZE).toBe('terminal_resize');
    });

    it('has TERMINAL_SPAWN key', () => {
      expect(InboundMessageType.TERMINAL_SPAWN).toBe('terminal_spawn');
    });

    it('has TERMINAL_CLOSE key', () => {
      expect(InboundMessageType.TERMINAL_CLOSE).toBe('terminal_close');
    });

    it('has AUTOMATION_RUN key', () => {
      expect(InboundMessageType.AUTOMATION_RUN).toBe('automation_run');
    });

    it('has AUTOMATION_STOP key', () => {
      expect(InboundMessageType.AUTOMATION_STOP).toBe('automation_stop');
    });

    it('has AUTOMATION_LIST_REQUEST key', () => {
      expect(InboundMessageType.AUTOMATION_LIST_REQUEST).toBe('automation_list_request');
    });

    it('has INBOX_LIST_REQUEST key', () => {
      expect(InboundMessageType.INBOX_LIST_REQUEST).toBe('inbox_list_request');
    });

    it('has INBOX_ACTION key', () => {
      expect(InboundMessageType.INBOX_ACTION).toBe('inbox_action');
    });

    it('has USER_ANSWER key', () => {
      expect(InboundMessageType.USER_ANSWER).toBe('user_answer');
    });
  });

  // ============================================================================
  // Message Creator Tests
  // ============================================================================

  describe('createSessionState', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type SESSION_STATE', () => {
      const msg = createSessionState('sess-123', 'connected');
      expect(msg.type).toBe(OutboundMessageType.SESSION_STATE);
    });

    it('includes sessionId in message', () => {
      const msg = createSessionState('sess-abc', 'connected');
      expect(msg.sessionId).toBe('sess-abc');
    });

    it('includes state in message', () => {
      const msg = createSessionState('sess-123', 'thinking');
      expect(msg.state).toBe('thinking');
    });

    it('includes ISO timestamp', () => {
      const msg = createSessionState('sess-123', 'connected');
      expect(msg.timestamp).toBe(now.toISOString());
      expect(typeof msg.timestamp).toBe('string');
    });

    it('spreads additional metadata', () => {
      const meta = { userId: 'user-123', branch: 'main' };
      const msg = createSessionState('sess-123', 'connected', meta);
      expect(msg.userId).toBe('user-123');
      expect(msg.branch).toBe('main');
    });

    it('has type, sessionId, state, and timestamp properties', () => {
      const msg = createSessionState('sess-123', 'idle');
      expect(Object.keys(msg)).toContain('type');
      expect(Object.keys(msg)).toContain('sessionId');
      expect(Object.keys(msg)).toContain('state');
      expect(Object.keys(msg)).toContain('timestamp');
    });
  });

  describe('createTextMessage', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TEXT', () => {
      const msg = createTextMessage('Hello');
      expect(msg.type).toBe(OutboundMessageType.TEXT);
    });

    it('includes content in message', () => {
      const msg = createTextMessage('Test content');
      expect(msg.content).toBe('Test content');
    });

    it('has done=false by default', () => {
      const msg = createTextMessage('Hello');
      expect(msg.done).toBe(false);
    });

    it('sets done=true when specified', () => {
      const msg = createTextMessage('Final', true);
      expect(msg.done).toBe(true);
    });

    it('includes ISO timestamp', () => {
      const msg = createTextMessage('Hello');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createTextDelta', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TEXT_DELTA', () => {
      const msg = createTextDelta('chunk');
      expect(msg.type).toBe(OutboundMessageType.TEXT_DELTA);
    });

    it('includes delta in message', () => {
      const msg = createTextDelta('streaming chunk');
      expect(msg.delta).toBe('streaming chunk');
    });

    it('has done=false by default', () => {
      const msg = createTextDelta('chunk');
      expect(msg.done).toBe(false);
    });

    it('sets done=true when specified', () => {
      const msg = createTextDelta('final chunk', true);
      expect(msg.done).toBe(true);
    });

    it('includes ISO timestamp', () => {
      const msg = createTextDelta('chunk');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createToolStart', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TOOL_START', () => {
      const msg = createToolStart('tool-1', 'Read', {});
      expect(msg.type).toBe(OutboundMessageType.TOOL_START);
    });

    it('includes tool call id', () => {
      const msg = createToolStart('call-abc', 'Write', {});
      expect(msg.id).toBe('call-abc');
    });

    it('includes tool name', () => {
      const msg = createToolStart('call-1', 'Bash', {});
      expect(msg.tool).toBe('Bash');
    });

    it('includes tool input', () => {
      const input = { file_path: '/path/to/file' };
      const msg = createToolStart('call-1', 'Read', input);
      expect(msg.input).toEqual(input);
    });

    it('includes ISO timestamp', () => {
      const msg = createToolStart('call-1', 'Read', {});
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createToolResult', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TOOL_RESULT', () => {
      const msg = createToolResult('call-1', 'output');
      expect(msg.type).toBe(OutboundMessageType.TOOL_RESULT);
    });

    it('includes tool call id', () => {
      const msg = createToolResult('call-xyz', 'output');
      expect(msg.id).toBe('call-xyz');
    });

    it('includes output', () => {
      const msg = createToolResult('call-1', 'file contents');
      expect(msg.output).toBe('file contents');
    });

    it('sets success=true when no error', () => {
      const msg = createToolResult('call-1', 'output', null);
      expect(msg.success).toBe(true);
      expect(msg.error).toBe(null);
    });

    it('sets success=false when error is present', () => {
      const msg = createToolResult('call-1', null, 'File not found');
      expect(msg.success).toBe(false);
      expect(msg.error).toBe('File not found');
    });

    it('includes ISO timestamp', () => {
      const msg = createToolResult('call-1', 'output');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createFileRead', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type FILE_READ', () => {
      const msg = createFileRead('/path/file.js', 'content');
      expect(msg.type).toBe(OutboundMessageType.FILE_READ);
    });

    it('includes file path', () => {
      const msg = createFileRead('/home/user/file.txt', 'content');
      expect(msg.path).toBe('/home/user/file.txt');
    });

    it('includes file content', () => {
      const msg = createFileRead('/path/file.js', 'const x = 1;');
      expect(msg.content).toBe('const x = 1;');
    });

    it('spreads additional metadata', () => {
      const meta = { lines: 42, truncated: true };
      const msg = createFileRead('/path/file.js', 'content', meta);
      expect(msg.lines).toBe(42);
      expect(msg.truncated).toBe(true);
    });

    it('includes ISO timestamp', () => {
      const msg = createFileRead('/path/file.js', 'content');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createFileEdit', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type FILE_EDIT', () => {
      const diff = { oldContent: 'old', newContent: 'new' };
      const msg = createFileEdit('/path/file.js', diff);
      expect(msg.type).toBe(OutboundMessageType.FILE_EDIT);
    });

    it('includes file path', () => {
      const diff = { oldContent: 'old', newContent: 'new' };
      const msg = createFileEdit('/home/user/file.txt', diff);
      expect(msg.path).toBe('/home/user/file.txt');
    });

    it('includes diff object', () => {
      const diff = { oldContent: 'old', newContent: 'new', hunks: [] };
      const msg = createFileEdit('/path/file.js', diff);
      expect(msg.diff).toEqual(diff);
    });

    it('includes ISO timestamp', () => {
      const diff = { oldContent: 'old', newContent: 'new' };
      const msg = createFileEdit('/path/file.js', diff);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createBashOutput', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type BASH_OUTPUT when done=false', () => {
      const msg = createBashOutput('ls', 'output', null, false);
      expect(msg.type).toBe(OutboundMessageType.BASH_OUTPUT);
    });

    it('creates message with type BASH_END when done=true', () => {
      const msg = createBashOutput('ls', 'output', 0, true);
      expect(msg.type).toBe(OutboundMessageType.BASH_END);
    });

    it('includes command', () => {
      const msg = createBashOutput('git status', 'output');
      expect(msg.command).toBe('git status');
    });

    it('includes output', () => {
      const msg = createBashOutput('ls', 'file1.js\nfile2.js');
      expect(msg.output).toBe('file1.js\nfile2.js');
    });

    it('includes exitCode', () => {
      const msg = createBashOutput('ls', 'output', 0, true);
      expect(msg.exitCode).toBe(0);
    });

    it('includes done flag', () => {
      const msg = createBashOutput('ls', 'output', 0, true);
      expect(msg.done).toBe(true);
    });

    it('defaults done to false', () => {
      const msg = createBashOutput('ls', 'output');
      expect(msg.done).toBe(false);
    });

    it('includes ISO timestamp', () => {
      const msg = createBashOutput('ls', 'output');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createGitStatus', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type GIT_STATUS', () => {
      const status = { staged: [], unstaged: [], branch: 'main' };
      const msg = createGitStatus(status);
      expect(msg.type).toBe(OutboundMessageType.GIT_STATUS);
    });

    it('spreads all status properties', () => {
      const status = {
        staged: ['file1.js'],
        unstaged: ['file2.js'],
        branch: 'feature/test',
      };
      const msg = createGitStatus(status);
      expect(msg.staged).toEqual(['file1.js']);
      expect(msg.unstaged).toEqual(['file2.js']);
      expect(msg.branch).toBe('feature/test');
    });

    it('includes ISO timestamp', () => {
      const status = { staged: [], unstaged: [], branch: 'main' };
      const msg = createGitStatus(status);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createGitDiff', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type GIT_DIFF', () => {
      const msg = createGitDiff('/path/file.js', 'diff content');
      expect(msg.type).toBe(OutboundMessageType.GIT_DIFF);
    });

    it('includes file path as path property', () => {
      const msg = createGitDiff('/home/user/file.txt', 'diff');
      expect(msg.path).toBe('/home/user/file.txt');
    });

    it('includes diff content', () => {
      const msg = createGitDiff('/path/file.js', 'diff content here');
      expect(msg.diff).toBe('diff content here');
    });

    it('defaults additions to 0', () => {
      const msg = createGitDiff('/path/file.js', 'diff');
      expect(msg.additions).toBe(0);
    });

    it('defaults deletions to 0', () => {
      const msg = createGitDiff('/path/file.js', 'diff');
      expect(msg.deletions).toBe(0);
    });

    it('defaults staged to false', () => {
      const msg = createGitDiff('/path/file.js', 'diff');
      expect(msg.staged).toBe(false);
    });

    it('includes stats from stats parameter', () => {
      const stats = { additions: 5, deletions: 3, staged: true };
      const msg = createGitDiff('/path/file.js', 'diff', stats);
      expect(msg.additions).toBe(5);
      expect(msg.deletions).toBe(3);
      expect(msg.staged).toBe(true);
    });

    it('includes ISO timestamp', () => {
      const msg = createGitDiff('/path/file.js', 'diff');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createTaskUpdate', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with TASK_UPDATED type for non-list action', () => {
      const task = { id: 'task-1', name: 'Test' };
      const msg = createTaskUpdate('create', task);
      expect(msg.type).toBe(OutboundMessageType.TASK_UPDATED);
    });

    it('creates message with TASK_LIST type when action is list', () => {
      const task = { id: 'task-1' };
      const msg = createTaskUpdate('list', task);
      expect(msg.type).toBe(OutboundMessageType.TASK_LIST);
    });

    it('includes action', () => {
      const task = { id: 'task-1' };
      const msg = createTaskUpdate('update', task);
      expect(msg.action).toBe('update');
    });

    it('includes task data', () => {
      const task = { id: 'task-1', name: 'Test Task', status: 'pending' };
      const msg = createTaskUpdate('create', task);
      expect(msg.task).toEqual(task);
    });

    it('includes ISO timestamp', () => {
      const task = { id: 'task-1' };
      const msg = createTaskUpdate('update', task);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createTerminalOutput', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TERMINAL_OUTPUT', () => {
      const msg = createTerminalOutput('term-1', 'output data');
      expect(msg.type).toBe(OutboundMessageType.TERMINAL_OUTPUT);
    });

    it('includes terminal id', () => {
      const msg = createTerminalOutput('term-xyz', 'data');
      expect(msg.terminalId).toBe('term-xyz');
    });

    it('includes output data', () => {
      const msg = createTerminalOutput('term-1', 'hello world');
      expect(msg.data).toBe('hello world');
    });

    it('includes ANSI codes in data', () => {
      const msg = createTerminalOutput('term-1', '\x1b[32mgreen\x1b[0m');
      expect(msg.data).toContain('\x1b[32m');
    });

    it('includes ISO timestamp', () => {
      const msg = createTerminalOutput('term-1', 'data');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createTerminalExit', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TERMINAL_EXIT', () => {
      const msg = createTerminalExit('term-1', 0);
      expect(msg.type).toBe(OutboundMessageType.TERMINAL_EXIT);
    });

    it('includes terminal id', () => {
      const msg = createTerminalExit('term-abc', 1);
      expect(msg.terminalId).toBe('term-abc');
    });

    it('includes exit code', () => {
      const msg = createTerminalExit('term-1', 42);
      expect(msg.exitCode).toBe(42);
    });

    it('includes ISO timestamp', () => {
      const msg = createTerminalExit('term-1', 0);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createNotification', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type NOTIFICATION', () => {
      const msg = createNotification('info', 'Title', 'Message');
      expect(msg.type).toBe(OutboundMessageType.NOTIFICATION);
    });

    it('includes notification level', () => {
      const msg = createNotification('warning', 'Title', 'Message');
      expect(msg.level).toBe('warning');
    });

    it('includes notification title', () => {
      const msg = createNotification('info', 'My Title', 'Message');
      expect(msg.title).toBe('My Title');
    });

    it('includes notification message', () => {
      const msg = createNotification('success', 'Title', 'Operation completed');
      expect(msg.message).toBe('Operation completed');
    });

    it('includes ISO timestamp', () => {
      const msg = createNotification('error', 'Title', 'Message');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createError', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type ERROR', () => {
      const msg = createError('ENOENT', 'File not found');
      expect(msg.type).toBe(OutboundMessageType.ERROR);
    });

    it('includes error code', () => {
      const msg = createError('EPERM', 'Permission denied');
      expect(msg.code).toBe('EPERM');
    });

    it('includes error message', () => {
      const msg = createError('ENOENT', 'File not found');
      expect(msg.message).toBe('File not found');
    });

    it('includes empty details object by default', () => {
      const msg = createError('ENOENT', 'File not found');
      expect(msg.details).toEqual({});
    });

    it('includes additional details', () => {
      const details = { path: '/file.js', errno: -2 };
      const msg = createError('ENOENT', 'File not found', details);
      expect(msg.details).toEqual(details);
    });

    it('includes ISO timestamp', () => {
      const msg = createError('ENOENT', 'File not found');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createAutomationList', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type AUTOMATION_LIST', () => {
      const msg = createAutomationList([]);
      expect(msg.type).toBe(OutboundMessageType.AUTOMATION_LIST);
    });

    it('includes automations array', () => {
      const automations = [{ id: 'auto-1', name: 'Test' }];
      const msg = createAutomationList(automations);
      expect(msg.automations).toEqual(automations);
    });

    it('includes ISO timestamp', () => {
      const msg = createAutomationList([]);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createAutomationStatus', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type AUTOMATION_STATUS', () => {
      const msg = createAutomationStatus('auto-1', 'running');
      expect(msg.type).toBe(OutboundMessageType.AUTOMATION_STATUS);
    });

    it('includes automation id', () => {
      const msg = createAutomationStatus('auto-xyz', 'idle');
      expect(msg.automationId).toBe('auto-xyz');
    });

    it('includes status', () => {
      const msg = createAutomationStatus('auto-1', 'completed');
      expect(msg.status).toBe('completed');
    });

    it('spreads progress data', () => {
      const progress = { current: 5, total: 10, percent: 50 };
      const msg = createAutomationStatus('auto-1', 'running', progress);
      expect(msg.current).toBe(5);
      expect(msg.total).toBe(10);
      expect(msg.percent).toBe(50);
    });

    it('includes ISO timestamp', () => {
      const msg = createAutomationStatus('auto-1', 'idle');
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createAutomationResult', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type AUTOMATION_RESULT', () => {
      const msg = createAutomationResult('auto-1', {});
      expect(msg.type).toBe(OutboundMessageType.AUTOMATION_RESULT);
    });

    it('includes automation id', () => {
      const msg = createAutomationResult('auto-abc', { success: true });
      expect(msg.automationId).toBe('auto-abc');
    });

    it('spreads result data', () => {
      const result = { success: true, message: 'Done', duration: 1234 };
      const msg = createAutomationResult('auto-1', result);
      expect(msg.success).toBe(true);
      expect(msg.message).toBe('Done');
      expect(msg.duration).toBe(1234);
    });

    it('includes ISO timestamp', () => {
      const msg = createAutomationResult('auto-1', {});
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createInboxList', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type INBOX_LIST', () => {
      const msg = createInboxList([]);
      expect(msg.type).toBe(OutboundMessageType.INBOX_LIST);
    });

    it('includes items array', () => {
      const items = [{ id: 'item-1', text: 'Task' }];
      const msg = createInboxList(items);
      expect(msg.items).toEqual(items);
    });

    it('includes ISO timestamp', () => {
      const msg = createInboxList([]);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createInboxItem', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type INBOX_ITEM', () => {
      const item = { id: 'item-1' };
      const msg = createInboxItem(item);
      expect(msg.type).toBe(OutboundMessageType.INBOX_ITEM);
    });

    it('spreads item properties', () => {
      const item = { id: 'item-abc', title: 'Task', priority: 'high' };
      const msg = createInboxItem(item);
      expect(msg.id).toBe('item-abc');
      expect(msg.title).toBe('Task');
      expect(msg.priority).toBe('high');
    });

    it('includes ISO timestamp', () => {
      const item = { id: 'item-1' };
      const msg = createInboxItem(item);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  describe('createAskUserQuestion', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type ASK_USER_QUESTION', () => {
      const msg = createAskUserQuestion('tool-1', []);
      expect(msg.type).toBe(OutboundMessageType.ASK_USER_QUESTION);
    });

    it('includes tool id', () => {
      const msg = createAskUserQuestion('tool-xyz', []);
      expect(msg.toolId).toBe('tool-xyz');
    });

    it('includes questions array', () => {
      const questions = [{ question: 'Which one?' }];
      const msg = createAskUserQuestion('tool-1', questions);
      expect(msg.questions).toEqual(questions);
    });

    it('includes ISO timestamp', () => {
      const msg = createAskUserQuestion('tool-1', []);
      expect(msg.timestamp).toBe(now.toISOString());
    });
  });

  // ============================================================================
  // Parsing & Validation Tests
  // ============================================================================

  describe('parseInboundMessage', () => {
    it('parses valid JSON string', () => {
      const data = JSON.stringify({ type: 'message', content: 'Hello' });
      const result = parseInboundMessage(data);
      expect(result).not.toBeNull();
      expect(result.type).toBe('message');
      expect(result.content).toBe('Hello');
    });

    it('parses valid JSON Buffer', () => {
      const data = Buffer.from(JSON.stringify({ type: 'message', content: 'Hello' }));
      const result = parseInboundMessage(data);
      expect(result).not.toBeNull();
      expect(result.type).toBe('message');
    });

    it('returns null for invalid JSON', () => {
      const result = parseInboundMessage('{ invalid json }');
      expect(result).toBeNull();
    });

    it('returns null for unknown message type', () => {
      const data = JSON.stringify({ type: 'unknown_type', content: 'test' });
      const result = parseInboundMessage(data);
      expect(result).toBeNull();
    });

    it('returns null for missing type field', () => {
      const data = JSON.stringify({ content: 'Hello' });
      const result = parseInboundMessage(data);
      expect(result).toBeNull();
    });

    it('parses valid MESSAGE type', () => {
      const data = JSON.stringify({ type: 'message', content: 'text' });
      const result = parseInboundMessage(data);
      expect(result.type).toBe('message');
    });

    it('parses valid SESSION_INIT type', () => {
      const data = JSON.stringify({ type: 'session_init' });
      const result = parseInboundMessage(data);
      expect(result.type).toBe('session_init');
    });

    it('parses valid GIT_COMMIT type', () => {
      const data = JSON.stringify({ type: 'git_commit', message: 'commit message' });
      const result = parseInboundMessage(data);
      expect(result.type).toBe('git_commit');
    });

    it('parses valid AUTOMATION_RUN type', () => {
      const data = JSON.stringify({ type: 'automation_run', automationId: 'auto-1' });
      const result = parseInboundMessage(data);
      expect(result.type).toBe('automation_run');
    });
  });

  describe('validateUserMessage', () => {
    it('validates message with type MESSAGE and content', () => {
      const message = { type: 'message', content: 'Hello world' };
      expect(validateUserMessage(message)).toBe(true);
    });

    it('rejects message without type MESSAGE', () => {
      const message = { type: 'cancel', content: 'Hello' };
      expect(validateUserMessage(message)).toBe(false);
    });

    it('rejects message without content', () => {
      const message = { type: 'message' };
      expect(validateUserMessage(message)).toBe(false);
    });

    it('rejects message with empty content', () => {
      const message = { type: 'message', content: '' };
      expect(validateUserMessage(message)).toBe(false);
    });

    it('rejects message with whitespace-only content', () => {
      const message = { type: 'message', content: '   \n\t  ' };
      expect(validateUserMessage(message)).toBe(false);
    });

    it('rejects message with non-string content', () => {
      const message = { type: 'message', content: 123 };
      expect(validateUserMessage(message)).toBe(false);
    });

    it('accepts message with content containing whitespace', () => {
      const message = { type: 'message', content: '  Hello  ' };
      expect(validateUserMessage(message)).toBe(true);
    });

    it('accepts message with multiline content', () => {
      const message = { type: 'message', content: 'Line 1\nLine 2\nLine 3' };
      expect(validateUserMessage(message)).toBe(true);
    });
  });

  describe('serializeMessage', () => {
    it('serializes message to JSON string', () => {
      const message = { type: 'message', content: 'Hello' };
      const result = serializeMessage(message);
      expect(typeof result).toBe('string');
      expect(JSON.parse(result)).toEqual(message);
    });

    it('serializes object with nested properties', () => {
      const message = {
        type: 'tool_result',
        id: 'call-1',
        output: { key: 'value', nested: { deep: true } },
      };
      const result = serializeMessage(message);
      expect(JSON.parse(result)).toEqual(message);
    });

    it('serializes object with array properties', () => {
      const message = { type: 'task_list', tasks: [{ id: 1 }, { id: 2 }] };
      const result = serializeMessage(message);
      expect(JSON.parse(result)).toEqual(message);
    });

    it('serializes message with null values', () => {
      const message = { type: 'tool_result', error: null, success: true };
      const result = serializeMessage(message);
      expect(JSON.parse(result)).toEqual(message);
    });

    it('serializes message with special characters', () => {
      const message = {
        type: 'text',
        content: 'Special chars: <>&"\' \\n \\t',
      };
      const result = serializeMessage(message);
      expect(JSON.parse(result)).toEqual(message);
    });
  });
});
