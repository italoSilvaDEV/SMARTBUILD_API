const DISPLAY_NAME_MAX = 100;

export function baseDisplayName(client: any) {
  const name = (client.company_name ?? client.name ?? client.fullName ?? "").trim();
  return name || `Cliente ${client.id}`;
}

export function withSuffix(base: string, client: any) {
  const short = String(client.id ?? "").replace(/-/g, "").slice(0, 6) || Math.random().toString(36).slice(2, 8);
  const final = `${base} #${short}`;
  // QBO tem limite de tamanho no DisplayName; para segurança, corte em 100 chars
  return final.slice(0, DISPLAY_NAME_MAX);
}

// export function isDuplicateNameError(err: any): boolean {
//   const code = err?.Fault?.Error?.[0]?.code || err?.code;
//   const msg  = err?.Fault?.Error?.[0]?.Message || err?.message || "";
//   return code === '6240' || /duplicate name/i.test(String(msg));
// }

// utils/qboErrors.ts
export function isDuplicateNameError(err: any): boolean {
  try {
    // 1) code direto
    if (String(err?.code) === "6240") return true;

    // 2) Intuit Fault.Error como array (formas comuns)
    const arrays = [
      err?.Fault?.Error,
      err?.fault?.error,
      err?.response?.data?.Fault?.Error,
    ].filter(Array.isArray) as any[][];

    for (const arr of arrays) {
      for (const e of arr) {
        if (String(e?.code) === "6240") return true;
        const txt = [e?.Message, e?.message, e?.Detail, e?.detail]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (txt.includes("duplicate name")) return true;
      }
    }

    // 3) Mensagens soltas
    const candidates = [
      err,
      err?.message,
      err?.Message,
      err?.Detail,
      err?.response?.data?.message,
    ]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());

    return candidates.some((t) => t.includes("duplicate name"));
  } catch {
    return false;
  }
}

