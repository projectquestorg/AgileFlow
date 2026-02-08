/**
 * WebSocket Frame Encoding/Decoding Tests
 *
 * Tests for encodeWebSocketFrame and decodeWebSocketFrame functions
 * from lib/dashboard-server.js. These are pure functions that don't
 * require server infrastructure or ports.
 */

'use strict';

const { encodeWebSocketFrame, decodeWebSocketFrame } = require('../../lib/dashboard-server');

describe('WebSocket Frame Encoding/Decoding', () => {
  // ============================================================================
  // ENCODING TESTS
  // ============================================================================

  describe('encodeWebSocketFrame', () => {
    describe('small payloads (< 126 bytes)', () => {
      test('encodes text string with 2-byte header', () => {
        const data = 'Hello';
        const frame = encodeWebSocketFrame(data);

        expect(frame).toBeInstanceOf(Buffer);
        // Should be 7 bytes: 2-byte header + 5-byte payload
        expect(frame.length).toBe(7);

        // First byte: FIN (0x80) + opcode 0x1 (text) = 0x81
        expect(frame[0]).toBe(0x81);
        // Second byte: no mask (0) + length (5) = 0x05
        expect(frame[1]).toBe(0x05);
        // Payload
        expect(frame.slice(2).toString()).toBe('Hello');
      });

      test('encodes empty string', () => {
        const data = '';
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(2);
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(0x00);
      });

      test('encodes single byte payload', () => {
        const data = 'X';
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(3);
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(0x01);
        expect(frame[2]).toBe(0x58); // ASCII 'X'
      });

      test('encodes 125-byte payload (max for 2-byte header)', () => {
        const data = 'a'.repeat(125);
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(127); // 2 + 125
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(125);
        expect(frame.slice(2).toString()).toBe(data);
      });
    });

    describe('medium payloads (126-65535 bytes)', () => {
      test('encodes 126-byte payload with 16-bit extended length', () => {
        const data = 'a'.repeat(126);
        const frame = encodeWebSocketFrame(data);

        // 4-byte header + 126-byte payload
        expect(frame.length).toBe(130);
        // First byte: FIN + opcode
        expect(frame[0]).toBe(0x81);
        // Second byte: no mask + 126 indicator
        expect(frame[1]).toBe(126);
        // Bytes 2-3: 16-bit big-endian length = 126
        expect(frame.readUInt16BE(2)).toBe(126);
        // Payload starts at byte 4
        expect(frame.slice(4).toString()).toBe(data);
      });

      test('encodes 1000-byte payload', () => {
        const data = 'b'.repeat(1000);
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(1004); // 4 + 1000
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(126);
        expect(frame.readUInt16BE(2)).toBe(1000);
        expect(frame.slice(4).toString()).toBe(data);
      });

      test('encodes 65535-byte payload (max for 16-bit length)', () => {
        const data = 'c'.repeat(65535);
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(65539); // 4 + 65535
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(126);
        expect(frame.readUInt16BE(2)).toBe(65535);
        expect(frame.slice(4).toString()).toBe(data);
      });
    });

    describe('large payloads (>= 65536 bytes)', () => {
      test('encodes 65536-byte payload with 64-bit extended length', () => {
        const data = 'd'.repeat(65536);
        const frame = encodeWebSocketFrame(data);

        // 10-byte header + 65536-byte payload
        expect(frame.length).toBe(65546);
        expect(frame[0]).toBe(0x81);
        // Second byte: no mask + 127 indicator
        expect(frame[1]).toBe(127);
        // Bytes 2-9: 64-bit big-endian length
        expect(frame.readBigUInt64BE(2)).toBe(BigInt(65536));
        // Payload starts at byte 10
        expect(frame.slice(10).toString()).toBe(data);
      });

      test('encodes 1MB payload', () => {
        const data = 'e'.repeat(1024 * 1024);
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(1024 * 1024 + 10);
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(127);
        expect(frame.readBigUInt64BE(2)).toBe(BigInt(1024 * 1024));
      });
    });

    describe('different opcodes', () => {
      test('encodes with binary opcode (0x2)', () => {
        const data = Buffer.from([0x00, 0x01, 0x02]);
        const frame = encodeWebSocketFrame(data, 0x2);

        // First byte: FIN (0x80) + opcode 0x2 (binary) = 0x82
        expect(frame[0]).toBe(0x82);
        expect(frame[1]).toBe(3);
        expect(frame.slice(2)).toEqual(data);
      });

      test('encodes with continuation opcode (0x0)', () => {
        const data = 'cont';
        const frame = encodeWebSocketFrame(data, 0x0);

        // First byte: FIN (0x80) + opcode 0x0 = 0x80
        expect(frame[0]).toBe(0x80);
        expect(frame[1]).toBe(4);
      });

      test('encodes with ping opcode (0x9)', () => {
        const data = '';
        const frame = encodeWebSocketFrame(data, 0x9);

        // First byte: FIN (0x80) + opcode 0x9 = 0x89
        expect(frame[0]).toBe(0x89);
        expect(frame[1]).toBe(0);
      });

      test('encodes with pong opcode (0xa)', () => {
        const data = '';
        const frame = encodeWebSocketFrame(data, 0xa);

        // First byte: FIN (0x80) + opcode 0xa = 0x8a
        expect(frame[0]).toBe(0x8a);
        expect(frame[1]).toBe(0);
      });

      test('encodes with close opcode (0x8)', () => {
        const data = '';
        const frame = encodeWebSocketFrame(data, 0x8);

        // First byte: FIN (0x80) + opcode 0x8 = 0x88
        expect(frame[0]).toBe(0x88);
        expect(frame[1]).toBe(0);
      });
    });

    describe('Buffer input', () => {
      test('encodes Buffer input directly', () => {
        const data = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
        const frame = encodeWebSocketFrame(data);

        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(5);
        expect(frame.slice(2)).toEqual(data);
      });

      test('encodes binary Buffer (non-text)', () => {
        const data = Buffer.from([0x00, 0xff, 0x80, 0x42]);
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(6);
        expect(frame.slice(2)).toEqual(data);
      });

      test('encodes empty Buffer', () => {
        const data = Buffer.alloc(0);
        const frame = encodeWebSocketFrame(data);

        expect(frame.length).toBe(2);
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(0);
      });
    });

    describe('unicode and emoji data', () => {
      test('encodes UTF-8 emoji', () => {
        const data = '😀';
        const frame = encodeWebSocketFrame(data);

        // UTF-8 emoji is 4 bytes
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(4);
        expect(frame.slice(2).toString()).toBe(data);
      });

      test('encodes multiple unicode characters', () => {
        const data = '你好世界'; // Chinese "Hello World"
        const frame = encodeWebSocketFrame(data);

        // Each character is 3 bytes in UTF-8
        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(12);
        expect(frame.slice(2).toString()).toBe(data);
      });

      test('encodes mixed ascii and unicode', () => {
        const data = 'Hello 世界 😀';
        const frame = encodeWebSocketFrame(data);

        expect(frame[0]).toBe(0x81);
        expect(frame.slice(2).toString()).toBe(data);
      });
    });

    describe('default parameters', () => {
      test('uses text opcode (0x1) by default', () => {
        const frame = encodeWebSocketFrame('test');

        expect(frame[0]).toBe(0x81); // FIN + 0x1
      });

      test('accepts data as only parameter', () => {
        const frame = encodeWebSocketFrame('test');

        expect(frame[0]).toBe(0x81);
        expect(frame[1]).toBe(4);
      });
    });
  });

  // ============================================================================
  // DECODING TESTS
  // ============================================================================

  describe('decodeWebSocketFrame', () => {
    describe('small unmasked frames', () => {
      test('decodes small unmasked text frame', () => {
        const payload = Buffer.from('Hello');
        const frame = Buffer.concat([
          Buffer.from([0x81, 0x05]), // FIN + text opcode, length 5
          payload,
        ]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(7);
      });

      test('decodes empty unmasked frame', () => {
        const frame = Buffer.from([0x81, 0x00]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload.length).toBe(0);
        expect(result.totalLength).toBe(2);
      });

      test('decodes single byte frame', () => {
        const frame = Buffer.from([0x81, 0x01, 0x42]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload[0]).toBe(0x42);
        expect(result.totalLength).toBe(3);
      });

      test('decodes 125-byte frame', () => {
        const payload = Buffer.alloc(125, 'a');
        const frame = Buffer.concat([Buffer.from([0x81, 125]), payload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(127);
      });
    });

    describe('medium unmasked frames (16-bit length)', () => {
      test('decodes 126-byte frame with extended length', () => {
        const payload = Buffer.alloc(126, 'b');
        const header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(126, 2);
        const frame = Buffer.concat([header, payload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(130);
      });

      test('decodes 1000-byte frame', () => {
        const payload = Buffer.alloc(1000, 'c');
        const header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(1000, 2);
        const frame = Buffer.concat([header, payload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(1004);
      });

      test('decodes 65535-byte frame', () => {
        const payload = Buffer.alloc(65535, 'd');
        const header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(65535, 2);
        const frame = Buffer.concat([header, payload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(65539);
      });
    });

    describe('large unmasked frames (64-bit length)', () => {
      test('decodes 65536-byte frame with 64-bit length', () => {
        const payload = Buffer.alloc(65536, 'e');
        const header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(65536), 2);
        const frame = Buffer.concat([header, payload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(65546);
      });

      test('decodes large frame (> 1MB)', () => {
        const largeSize = 2 * 1024 * 1024; // 2MB
        const payload = Buffer.alloc(largeSize, 'f');
        const header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(largeSize), 2);
        const frame = Buffer.concat([header, payload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payload);
        expect(result.totalLength).toBe(10 + largeSize);
      });
    });

    describe('masked frames', () => {
      test('decodes masked frame (XOR unmask)', () => {
        const payloadData = Buffer.from('Hello');
        const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);

        // Mask the payload
        const maskedPayload = Buffer.alloc(5);
        for (let i = 0; i < 5; i++) {
          maskedPayload[i] = payloadData[i] ^ mask[i % 4];
        }

        // Create frame: header + mask + masked payload
        const header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = 0x80 | 5; // Mask bit (0x80) + length (5)
        const frame = Buffer.concat([header, mask, maskedPayload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payloadData);
        expect(result.totalLength).toBe(2 + 4 + 5);
      });

      test('decodes masked 16-bit extended length frame', () => {
        const payloadData = Buffer.alloc(200, 'x');
        const mask = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);

        const maskedPayload = Buffer.alloc(200);
        for (let i = 0; i < 200; i++) {
          maskedPayload[i] = payloadData[i] ^ mask[i % 4];
        }

        const header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 0x80 | 126; // Mask + extended length
        header.writeUInt16BE(200, 2);
        const frame = Buffer.concat([header, mask, maskedPayload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payloadData);
        expect(result.totalLength).toBe(4 + 4 + 200);
      });

      test('decodes masked 64-bit extended length frame', () => {
        const payloadData = Buffer.alloc(100000, 'y');
        const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);

        const maskedPayload = Buffer.alloc(100000);
        for (let i = 0; i < 100000; i++) {
          maskedPayload[i] = payloadData[i] ^ mask[i % 4];
        }

        const header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 0x80 | 127; // Mask + extended length
        header.writeBigUInt64BE(BigInt(100000), 2);
        const frame = Buffer.concat([header, mask, maskedPayload]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x1);
        expect(result.payload).toEqual(payloadData);
        expect(result.totalLength).toBe(10 + 4 + 100000);
      });

      test('decodes masked frame with all-zero mask', () => {
        const payloadData = Buffer.from('test');
        const mask = Buffer.from([0x00, 0x00, 0x00, 0x00]);

        // Masked with all-zero mask = same as payload
        const frame = Buffer.concat([
          Buffer.from([0x81, 0x84]), // FIN + text, mask + length 4
          mask,
          payloadData,
        ]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.payload).toEqual(payloadData);
      });
    });

    describe('different opcodes', () => {
      test('decodes binary opcode (0x2)', () => {
        const payload = Buffer.from([0x00, 0x01, 0x02]);
        const frame = Buffer.concat([
          Buffer.from([0x82, 0x03]), // FIN + binary, length 3
          payload,
        ]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x2);
        expect(result.payload).toEqual(payload);
      });

      test('decodes continuation opcode (0x0)', () => {
        const payload = Buffer.from('cont');
        const frame = Buffer.concat([
          Buffer.from([0x80, 0x04]), // FIN + continuation, length 4
          payload,
        ]);

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x0);
      });

      test('decodes ping opcode (0x9)', () => {
        const frame = Buffer.from([0x89, 0x00]); // FIN + ping, length 0

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x9);
        expect(result.payload.length).toBe(0);
      });

      test('decodes pong opcode (0xa)', () => {
        const frame = Buffer.from([0x8a, 0x00]); // FIN + pong, length 0

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0xa);
      });

      test('decodes close opcode (0x8)', () => {
        const frame = Buffer.from([0x88, 0x00]); // FIN + close, length 0

        const result = decodeWebSocketFrame(frame);

        expect(result).not.toBeNull();
        expect(result.opcode).toBe(0x8);
      });
    });

    describe('incomplete frames (edge cases)', () => {
      test('returns null for buffer < 2 bytes', () => {
        const frame = Buffer.from([0x81]);

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null for empty buffer', () => {
        const result = decodeWebSocketFrame(Buffer.alloc(0));

        expect(result).toBeNull();
      });

      test('returns null for incomplete 16-bit extended length', () => {
        const frame = Buffer.from([0x81, 126, 0x00]); // Missing second length byte

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null for incomplete 64-bit extended length', () => {
        // Only 4 bytes of 8-byte length
        const frame = Buffer.concat([Buffer.from([0x81, 127]), Buffer.alloc(4)]);

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null when payload not fully received (small frame)', () => {
        // Says 5 bytes payload but only have 3
        const frame = Buffer.from([0x81, 0x05, 0x48, 0x65, 0x6c]); // "Hel"

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null when payload not fully received (16-bit)', () => {
        // Says 200 bytes but only have 100
        const header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(200, 2);
        const frame = Buffer.concat([header, Buffer.alloc(100)]);

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null when payload not fully received (64-bit)', () => {
        // Says 100000 bytes but only have 50000
        const header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(100000), 2);
        const frame = Buffer.concat([header, Buffer.alloc(50000)]);

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null for incomplete masked frame header', () => {
        // Mask bit set but no mask bytes provided
        const frame = Buffer.from([0x81, 0x84]); // Says masked + 4 bytes

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });

      test('returns null when masked frame incomplete', () => {
        // Mask provided but payload incomplete
        const frame = Buffer.concat([
          Buffer.from([0x81, 0x84]), // Mask + length 4
          Buffer.from([0x12, 0x34, 0x56, 0x78]), // Mask
          Buffer.from([0x00]), // Only 1 byte of 4-byte payload
        ]);

        const result = decodeWebSocketFrame(frame);

        expect(result).toBeNull();
      });
    });
  });

  // ============================================================================
  // ROUND-TRIP TESTS
  // ============================================================================

  describe('round-trip: encode then decode', () => {
    test('round-trip small text', () => {
      const original = 'Hello, WebSocket!';
      const frame = encodeWebSocketFrame(original);
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.opcode).toBe(0x1);
      expect(result.payload.toString()).toBe(original);
    });

    test('round-trip empty string', () => {
      const original = '';
      const frame = encodeWebSocketFrame(original);
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.payload.toString()).toBe(original);
    });

    test('round-trip unicode/emoji', () => {
      const original = 'Hello 世界 😀';
      const frame = encodeWebSocketFrame(original);
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.payload.toString()).toBe(original);
    });

    test('round-trip medium payload (126-65535)', () => {
      const original = 'x'.repeat(10000);
      const frame = encodeWebSocketFrame(original);
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.payload.toString()).toBe(original);
    });

    test('round-trip large payload (>= 65536)', () => {
      const original = 'y'.repeat(100000);
      const frame = encodeWebSocketFrame(original);
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.payload.toString()).toBe(original);
    });

    test('round-trip binary data', () => {
      const original = Buffer.from([0x00, 0xff, 0x80, 0x42, 0xaa, 0xbb]);
      const frame = encodeWebSocketFrame(original);
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.payload).toEqual(original);
    });

    test('round-trip with custom opcode', () => {
      const original = 'binary';
      const frame = encodeWebSocketFrame(original, 0x2); // binary opcode
      const result = decodeWebSocketFrame(frame);

      expect(result).not.toBeNull();
      expect(result.opcode).toBe(0x2);
      expect(result.payload.toString()).toBe(original);
    });

    test('round-trip multiple frames in buffer', () => {
      // Create two frames back-to-back
      const frame1 = encodeWebSocketFrame('first');
      const frame2 = encodeWebSocketFrame('second');
      const combined = Buffer.concat([frame1, frame2]);

      // Decode first frame
      const result1 = decodeWebSocketFrame(combined);
      expect(result1).not.toBeNull();
      expect(result1.payload.toString()).toBe('first');

      // Decode second frame using remaining buffer
      const result2 = decodeWebSocketFrame(combined.slice(result1.totalLength));
      expect(result2).not.toBeNull();
      expect(result2.payload.toString()).toBe('second');
    });
  });

  // ============================================================================
  // PROTOCOL COMPLIANCE TESTS
  // ============================================================================

  describe('WebSocket protocol compliance', () => {
    test('FIN bit is always set (bit 7 of first byte)', () => {
      const frame = encodeWebSocketFrame('test');

      // FIN bit should be set (0x80)
      expect(frame[0] & 0x80).toBe(0x80);
    });

    test('server-to-client frames are not masked', () => {
      const frame = encodeWebSocketFrame('test');

      // Second byte should not have mask bit set
      expect(frame[1] & 0x80).toBe(0);
    });

    test('opcode is in lower 4 bits of first byte', () => {
      const frame = encodeWebSocketFrame('test', 0x2);

      // Lower 4 bits should be 0x2
      expect(frame[0] & 0x0f).toBe(0x2);
    });

    test('length is in lower 7 bits of second byte (small)', () => {
      const frame = encodeWebSocketFrame('12345');

      // Lower 7 bits should be length (5)
      expect(frame[1] & 0x7f).toBe(5);
    });

    test('extended length indicator 126 for 16-bit', () => {
      const frame = encodeWebSocketFrame('a'.repeat(200));

      expect(frame[1] & 0x7f).toBe(126);
    });

    test('extended length indicator 127 for 64-bit', () => {
      const frame = encodeWebSocketFrame('b'.repeat(100000));

      expect(frame[1] & 0x7f).toBe(127);
    });

    test('client-to-server frames are masked during decode', () => {
      // Create a client frame (with mask bit)
      const payload = Buffer.from('test');
      const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      const maskedPayload = Buffer.alloc(4);
      for (let i = 0; i < 4; i++) {
        maskedPayload[i] = payload[i] ^ mask[i];
      }

      const frame = Buffer.concat([
        Buffer.from([0x81, 0x84]), // Mask + length 4
        mask,
        maskedPayload,
      ]);

      const result = decodeWebSocketFrame(frame);

      // After unmasking, should get original payload
      expect(result.payload).toEqual(payload);
    });
  });
});
