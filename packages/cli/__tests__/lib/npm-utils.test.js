/**
 * Tests for npm-utils.js
 *
 * Tests npm registry utility functions with mocked https requests
 */

const https = require('https');
const { EventEmitter } = require('events');

// Mock https module
jest.mock('https');

const { getLatestVersion } = require('../../tools/cli/lib/npm-utils');

describe('npm-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLatestVersion', () => {
    it('returns latest version on successful response', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', JSON.stringify({ version: '2.0.0' }));
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBe('2.0.0');
      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'registry.npmjs.org',
          path: '/agileflow/latest',
          method: 'GET',
        }),
        expect.any(Function)
      );
      expect(mockRequest.end).toHaveBeenCalled();
    });

    it('uses correct User-Agent header', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', JSON.stringify({ version: '1.0.0' }));
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      await getLatestVersion('test-package');

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'User-Agent': 'agileflow-cli' },
        }),
        expect.any(Function)
      );
    });

    it('returns null on non-200 status code', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 404;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', 'Not found');
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      const version = await getLatestVersion('nonexistent-package');

      expect(version).toBeNull();
    });

    it('returns null on network error', async () => {
      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation(() => {
        process.nextTick(() => {
          mockRequest.emit('error', new Error('Network error'));
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBeNull();
    });

    it('returns null on timeout', async () => {
      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn((timeout, callback) => {
        process.nextTick(callback);
      });

      https.request.mockImplementation(() => {
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBeNull();
      expect(mockRequest.setTimeout).toHaveBeenCalledWith(10000, expect.any(Function));
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('uses explicit TLS certificate validation (rejectUnauthorized: true)', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', JSON.stringify({ version: '1.0.0' }));
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      await getLatestVersion('agileflow');

      // Verify TLS certificate validation is explicitly enabled
      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          rejectUnauthorized: true,
        }),
        expect.any(Function)
      );
    });

    it('handles TLS certificate errors gracefully', async () => {
      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation(() => {
        process.nextTick(() => {
          const certError = new Error('certificate has expired');
          certError.code = 'CERT_HAS_EXPIRED';
          mockRequest.emit('error', certError);
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBeNull();
    });

    it('handles UNABLE_TO_VERIFY_LEAF_SIGNATURE errors', async () => {
      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation(() => {
        process.nextTick(() => {
          const certError = new Error('unable to verify the first certificate');
          certError.code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
          mockRequest.emit('error', certError);
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBeNull();
    });

    it('returns null on invalid JSON response', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', 'not valid json');
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBeNull();
    });

    it('returns null when version field is missing', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', JSON.stringify({ name: 'agileflow', description: 'test' }));
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBeNull();
    });

    it('handles chunked response data', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          // Simulate chunked response
          mockResponse.emit('data', '{"name":"agile');
          mockResponse.emit('data', 'flow","version"');
          mockResponse.emit('data', ':"1.2.3"}');
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      const version = await getLatestVersion('agileflow');

      expect(version).toBe('1.2.3');
    });

    it('constructs correct path for package name', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.destroy = jest.fn();
      mockRequest.setTimeout = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        process.nextTick(() => {
          mockResponse.emit('data', JSON.stringify({ version: '1.0.0' }));
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      await getLatestVersion('@scope/my-package');

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/@scope/my-package/latest',
        }),
        expect.any(Function)
      );
    });
  });
});
