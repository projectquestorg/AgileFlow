'use strict';

/**
 * dashboard-websocket.js - WebSocket Frame Encoding/Decoding
 *
 * Pure functions for encoding and decoding WebSocket frames.
 * Extracted from dashboard-server.js for testability.
 */

/**
 * Encode a WebSocket frame
 * @param {string|Buffer} data - Data to encode
 * @param {number} [opcode=0x1] - Frame opcode (0x1 = text, 0x2 = binary)
 * @returns {Buffer}
 */
function encodeWebSocketFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode; // FIN + opcode
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * Decode a WebSocket frame
 * @param {Buffer} buffer - Buffer containing frame data
 * @returns {{ opcode: number, payload: Buffer, totalLength: number } | null}
 */
function decodeWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;

  let headerLength = 2;
  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    headerLength = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    headerLength = 10;
  }

  if (masked) headerLength += 4;

  const totalLength = headerLength + payloadLength;
  if (buffer.length < totalLength) return null;

  let payload = buffer.slice(headerLength, totalLength);

  // Unmask if needed
  if (masked) {
    const mask = buffer.slice(headerLength - 4, headerLength);
    payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[headerLength + i] ^ mask[i % 4];
    }
  }

  return { opcode, payload, totalLength };
}

module.exports = {
  encodeWebSocketFrame,
  decodeWebSocketFrame,
};
