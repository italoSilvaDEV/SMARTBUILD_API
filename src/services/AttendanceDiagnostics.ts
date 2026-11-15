import { promises as fs } from 'fs';
import path from 'path';

const fields = new Set(['reason', 'mode', 'status', 'code', 'busy', 'hasUser', 'inFlight',
  'unconfirmed', 'hasActiveAttendance', 'ready', 'accuracy', 'hasAttendance', 'success',
  'waitingForResponse', 'detectedProjects', 'hasInsideProjectId', 'servicesLoaded',
  'attendanceId', 'projectId', 'serviceProjectId', 'count', 'hasToken', 'operation', 'state', 'pending', 'hasActive', 'durationMs']);
const text = (v: unknown, nullable = false): string | null => {
  if (nullable && (v === null || v === undefined)) return null;
  if (typeof v !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(v)) throw new Error('Invalid field');
  return v;
};
export function parseAttendanceDiagnostic(input: any, userId: string, companyId: string, now = Date.now()) {
  if (!input || input.userId !== userId || input.companyId !== companyId ||
    !Number.isSafeInteger(input.at) || input.at < now - 7 * 86400_000 || input.at > now + 300_000)
    throw new Error('Invalid event');
  const r = input.release;
  if (!r || !['android', 'ios'].includes(r.platform) || typeof r.embedded !== 'boolean')
    throw new Error('Invalid release');
  const details: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(input.details || {})) {
    if (!fields.has(k)) continue;
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) details[k] = v as any;
    else if (typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(v)) details[k] = v;
  }
  return { id: text(input.id), traceId: text(input.traceId, true), stage: text(input.stage),
    at: input.at, receivedAt: now, userId, companyId, details,
    release: { appVersion: text(r.appVersion), build: text(r.build), updateId: text(r.updateId, true),
      runtimeVersion: text(r.runtimeVersion, true), channel: text(r.channel, true),
      embedded: r.embedded, platform: r.platform } };
}
let writing: Promise<unknown> = Promise.resolve();
export function persistAttendanceDiagnostics(directory: string, events: ReturnType<typeof parseAttendanceDiagnostic>[]) {
  const task = writing.then(async () => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(directory, day + '.jsonl');
    const bytes = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    const size = await fs.stat(file).then(s => s.size).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return 0; throw e;
    });
    if (size + Buffer.byteLength(bytes) > 64 * 1024 * 1024) throw new Error('Daily diagnostic limit');
    // Acknowledge only after the append has completed. Retries may repeat IDs; consumers deduplicate by id.
    await fs.appendFile(file, bytes, { mode: 0o600 });
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    for (const name of await fs.readdir(directory)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(0, 10) < cutoff)
        await fs.unlink(path.join(directory, name)).catch(() => {});
    }
  });
  writing = task.catch(() => {});
  return task;
}
