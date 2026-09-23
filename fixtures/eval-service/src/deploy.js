#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHttpUploader } from './uploader.js';

export function parseArgs(argv) {
  const opts = { dir: 'public' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') opts.dir = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

/**
 * Upload every file under `dir`.
 * @param {{ dir: string, uploader: { upload(path: string, contents: Buffer): Promise<void> }, log?: (msg: string) => void }} options
 */
export async function deploy({ dir, uploader, log = console.log }) {
  const files = await listFiles(dir);
  for (const file of files) {
    await uploader.upload(file, await fs.readFile(path.join(dir, file)));
    log(`uploaded ${file}`);
  }
  log(`deployed ${files.length} file(s)`);
  return { files };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    await deploy({ dir: opts.dir, uploader: createHttpUploader() });
  } catch (err) {
    console.error(`deploy failed: ${err.message}`);
    process.exitCode = 1;
  }
}
