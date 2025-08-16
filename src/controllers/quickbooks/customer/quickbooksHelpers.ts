import type { Prisma } from "@prisma/client";

export function jsonSafe(input: any) {
    try {
      return JSON.parse(
        JSON.stringify(input, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v
        )
      );
    } catch {
      return { _unserializable: true };
    }
  }

export function deepEqual(a: any, b: any) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  


