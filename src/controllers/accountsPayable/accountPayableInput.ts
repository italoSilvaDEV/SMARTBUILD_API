import { Prisma } from "@prisma/client";

export type AccountPayableInput = {
  name: string;
  description: string;
  amount: Prisma.Decimal;
};

type ValidationResult =
  | { ok: true; value: AccountPayableInput }
  | { ok: false; error: string };

export function validateAccountPayableInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid account payable data" };
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) {
    return { ok: false, error: "Name must contain 1 to 100 characters" };
  }

  const description = input.description == null ? "" : input.description;
  if (typeof description !== "string" || description.length > 500) {
    return { ok: false, error: "Description cannot exceed 500 characters" };
  }

  // Decimal strings avoid binary floating-point rounding for currency.
  if (typeof input.amount !== "string" || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(input.amount)) {
    return { ok: false, error: "Amount must be a positive USD decimal with up to two decimal places" };
  }
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) {
    return { ok: false, error: "Amount must be greater than zero" };
  }

  return { ok: true, value: { name, description: description.trim(), amount } };
}
