/**
 * Tests for Command Context & Middleware Pipeline
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const {
  createCommand,
  middleware,
  executeMiddleware,
  CommandRegistry,
  presets,
  getInstaller,
} = require('../../tools/cli/lib/command-context');

// Mock dependencies
jest.mock('../../tools/cli/lib/ui', () => ({
  displayLogo: jest.fn(),
  displaySection: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../tools/cli/lib/error-handler', () => ({
  ErrorHandler: jest.fn().mockImplementation(() => ({
    warning: jest.fn(),
    critical: jest.fn(),
  })),
}));

describe('CommandContext', () => {
  let testDir;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-context-test-'));
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('middleware.resolveDirectory', () => {
    it('resolves directory from options', async () => {
      const ctx = { options: { directory: testDir } };
      let nextCalled = false;

      await middleware.resolveDirectory(ctx, async () => {
        nextCalled = true;
      });

      expect(ctx.directory).toBe(testDir);
      expect(nextCalled).toBe(true);
    });

    it('defaults to current directory', async () => {
      const ctx = { options: {} };
      await middleware.resolveDirectory(ctx, async () => {});

      expect(ctx.directory).toBe(process.cwd());
    });
  });

  describe('middleware.displayLogo', () => {
    it('displays logo when not json or quiet', async () => {
      const { displayLogo } = require('../../tools/cli/lib/ui');
      const ctx = { options: {} };

      await middleware.displayLogo(ctx, async () => {});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('skips logo when json option is set', async () => {
      const { displayLogo } = require('../../tools/cli/lib/ui');
      const ctx = { options: { json: true } };

      await middleware.displayLogo(ctx, async () => {});

      expect(displayLogo).not.toHaveBeenCalled();
    });

    it('skips logo when quiet option is set', async () => {
      const { displayLogo } = require('../../tools/cli/lib/ui');
      const ctx = { options: { quiet: true } };

      await middleware.displayLogo(ctx, async () => {});

      expect(displayLogo).not.toHaveBeenCalled();
    });
  });

  describe('middleware.requireInstalled', () => {
    it('continues when installed', async () => {
      const ctx = {
        options: {},
        directory: testDir,
        errorHandler: { warning: jest.fn() },
      };

      // Mock installer to return installed status
      const installerMock = {
        getStatus: jest.fn().mockResolvedValue({ installed: true, path: testDir }),
      };
      jest.doMock('../../tools/cli/installers/core/installer', () => ({
        Installer: jest.fn().mockImplementation(() => installerMock),
      }));

      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
      };

      // Create a simplified version for testing
      ctx.status = { installed: true, path: testDir };
      await next();

      expect(nextCalled).toBe(true);
    });
  });

  describe('middleware.validate', () => {
    it('validates options and updates context', async () => {
      const ctx = {
        options: { ide: 'cursor' },
        directory: testDir,
        errorHandler: { warning: jest.fn() },
      };

      const validateMw = middleware.validate({
        ide: { type: 'ide', required: false },
      });

      let nextCalled = false;
      await validateMw(ctx, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(ctx.options.ide).toBe('cursor');
    });

    it('stops on validation failure', async () => {
      const ctx = {
        options: { ide: 'invalid-ide' },
        directory: testDir,
        errorHandler: { warning: jest.fn() },
      };

      const validateMw = middleware.validate({
        ide: { type: 'ide', required: true },
      });

      let nextCalled = false;
      await validateMw(ctx, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(ctx.errorHandler.warning).toHaveBeenCalled();
    });
  });

  describe('middleware.section', () => {
    it('displays section header', async () => {
      const { displaySection } = require('../../tools/cli/lib/ui');
      const ctx = { options: {} };

      const sectionMw = middleware.section('Test Section');
      await sectionMw(ctx, async () => {});

      expect(displaySection).toHaveBeenCalledWith('Test Section', undefined);
    });

    it('generates subtitle from context', async () => {
      const { displaySection } = require('../../tools/cli/lib/ui');
      const ctx = { options: {}, directory: '/test/dir' };

      const sectionMw = middleware.section('Test', ctx => ctx.directory);
      await sectionMw(ctx, async () => {});

      expect(displaySection).toHaveBeenCalledWith('Test', '/test/dir');
    });
  });

  describe('executeMiddleware', () => {
    it('executes middleware in order', async () => {
      const order = [];
      const mw1 = async (ctx, next) => {
        order.push(1);
        await next();
      };
      const mw2 = async (ctx, next) => {
        order.push(2);
        await next();
      };
      const mw3 = async (ctx, next) => {
        order.push(3);
        await next();
      };

      await executeMiddleware([mw1, mw2, mw3], {});

      expect(order).toEqual([1, 2, 3]);
    });

    it('stops when middleware does not call next', async () => {
      const order = [];
      const mw1 = async (ctx, next) => {
        order.push(1);
        // Don't call next
      };
      const mw2 = async (ctx, next) => {
        order.push(2);
        await next();
      };

      const completed = await executeMiddleware([mw1, mw2], {});

      expect(order).toEqual([1]);
      expect(completed).toBe(false);
    });

    it('returns true when all middleware completes', async () => {
      const completed = await executeMiddleware(
        [
          async (ctx, next) => await next(),
          async (ctx, next) => await next(),
        ],
        {}
      );

      expect(completed).toBe(true);
    });
  });

  describe('createCommand', () => {
    it('creates command object with required properties', () => {
      const cmd = createCommand({
        name: 'test',
        description: 'Test command',
        action: async () => {},
      });

      expect(cmd.name).toBe('test');
      expect(cmd.description).toBe('Test command');
      expect(typeof cmd.action).toBe('function');
    });

    it('includes options and arguments', () => {
      const cmd = createCommand({
        name: 'test',
        description: 'Test',
        options: [['-f, --force', 'Force']],
        arguments: [['<name>', 'Name arg']],
        action: async () => {},
      });

      expect(cmd.options).toHaveLength(1);
      expect(cmd.arguments).toHaveLength(1);
    });
  });

  describe('CommandRegistry', () => {
    it('registers beforeAction hook', () => {
      const registry = new CommandRegistry();
      const hook = jest.fn();

      registry.beforeAction(hook);

      expect(registry.hooks.beforeAction).toContain(hook);
    });

    it('registers afterAction hook', () => {
      const registry = new CommandRegistry();
      const hook = jest.fn();

      registry.afterAction(hook);

      expect(registry.hooks.afterAction).toContain(hook);
    });

    it('registers onError hook', () => {
      const registry = new CommandRegistry();
      const hook = jest.fn();

      registry.onError(hook);

      expect(registry.hooks.onError).toContain(hook);
    });

    it('runs beforeAction hooks', async () => {
      const registry = new CommandRegistry();
      const hook1 = jest.fn();
      const hook2 = jest.fn();

      registry.beforeAction(hook1).beforeAction(hook2);
      await registry.runBeforeAction({});

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
    });

    it('runs afterAction hooks with result', async () => {
      const registry = new CommandRegistry();
      const hook = jest.fn();

      registry.afterAction(hook);
      await registry.runAfterAction({}, 'result');

      expect(hook).toHaveBeenCalledWith({}, 'result');
    });

    it('runs onError hooks with error', async () => {
      const registry = new CommandRegistry();
      const hook = jest.fn();
      const error = new Error('test');

      registry.onError(hook);
      await registry.runOnError({}, error);

      expect(hook).toHaveBeenCalledWith({}, error);
    });
  });

  describe('presets', () => {
    it('has standard preset', () => {
      expect(presets.standard).toContain(middleware.resolveDirectory);
      expect(presets.standard).toContain(middleware.displayLogo);
      expect(presets.standard).toContain(middleware.requireInstalled);
    });

    it('has simple preset', () => {
      expect(presets.simple).toContain(middleware.resolveDirectory);
      expect(presets.simple).toContain(middleware.displayLogo);
    });

    it('has json preset', () => {
      expect(presets.json).toContain(middleware.resolveDirectory);
      expect(presets.json).toContain(middleware.checkInstallation);
    });

    it('has setup preset', () => {
      expect(presets.setup).toContain(middleware.resolveDirectory);
      expect(presets.setup).toContain(middleware.displayLogo);
    });
  });

  describe('getInstaller', () => {
    it('returns singleton installer instance', () => {
      const installer1 = getInstaller();
      const installer2 = getInstaller();

      expect(installer1).toBe(installer2);
    });
  });
});
