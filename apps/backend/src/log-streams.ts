/**
 * Pino multistream — duplicate every log line to BOTH stdout and a
 * rotating file under `apps/backend/logs/server.log`.
 *
 * Why duplicate instead of replacing stdout: the dev server's terminal
 * stays useful (live tail), AND we get a persistent log file that
 * survives restarts / crashes / re-runs. The file is the source of
 * truth when debugging "what was happening at 14:32 when the page broke".
 *
 * The file directory is created on first use; if creation fails we
 * silently degrade to stdout-only rather than crashing the server.
 */

import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';

/**
 * Where the log file lives. Relative paths are resolved against the
 * backend workspace root so the file ends up next to the source code,
 * not in whatever cwd the user happened to invoke the dev server from.
 */
const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

let ensured = false;
function ensureLogDir(): boolean {
  if (ensured) return true;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    ensured = true;
    return true;
  } catch {
    return false;
  }
}

export function buildLogStreams(): pino.StreamEntry[] | undefined {
  // In tests we don't want a side-effect file in the workspace.
  if (process.env.NODE_ENV === 'test') return undefined;
  if (!ensureLogDir()) return undefined;
  return [
    { stream: process.stdout, level: 'debug' },
    {
      stream: pino.destination({ dest: LOG_FILE, sync: false, mkdir: true }),
      level: 'debug',
    },
  ];
}

/** Path to the log file — exported for the README + the admin debug page. */
export const LOG_FILE_PATH = LOG_FILE;
