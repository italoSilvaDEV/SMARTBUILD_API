export function sanitizeEmail(raw?: string | null) {
    if (!raw) return null;
    const first = String(raw).trim().toLowerCase().split(',')[0].trim();
    // regex bem tolerante (RFC 5322 simplificado)
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first);
    return ok ? first : null;
  }
  