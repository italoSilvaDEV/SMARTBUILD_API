import { Router } from 'express';
import { checkToken } from '../middlewares/checkToken';
import { prisma } from '../utils/prisma';
import { parseAttendanceDiagnostic, persistAttendanceDiagnostics } from '../services/AttendanceDiagnostics';

export const attendanceDiagnosticsRoutes = Router();
const limits = new Map<string, { at: number; count: number }>();
attendanceDiagnosticsRoutes.post('/mobile/attendance-diagnostics', checkToken, async (req, res) => {
  const directory = process.env.ATTENDANCE_DIAGNOSTICS_DIR;
  if (!directory) return res.sendStatus(503);
  const userId = (req as any).userId as string;
  const now = Date.now();
  for (const [key, value] of limits) if (now - value.at >= 60_000) limits.delete(key);
  const limit = limits.get(userId) || { at: now, count: 0 };
  if (limit.count >= 12 || limits.size >= 10_000) return res.sendStatus(429);
  limit.count++; limits.set(userId, limit);
  const { companyId, events } = req.body || {};
  if (typeof companyId !== 'string' || !/^[a-zA-Z0-9-]{1,191}$/.test(companyId) ||
    !Array.isArray(events) || !events.length || events.length > 30 ||
    Buffer.byteLength(JSON.stringify(events)) > 64_000) return res.sendStatus(400);
  let parsed: ReturnType<typeof parseAttendanceDiagnostic>[];
  try { parsed = events.map(e => parseAttendanceDiagnostic(e, userId, companyId, now)); }
  catch { return res.sendStatus(400); }
  try {
    const member = await prisma.user.findFirst({ where: { id: userId,
      OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] }, select: { id: true } });
    if (!member) return res.sendStatus(403);
    await persistAttendanceDiagnostics(directory, parsed);
    return res.json({ acceptedIds: parsed.map(e => e.id) });
  } catch { return res.sendStatus(503); }
});
