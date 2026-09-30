import { validateAccountPayableInput } from "./accountPayableInput";

const validBody = (amount: unknown) => ({ name: " Office rent ", description: " Monthly ", amount });

describe("validateAccountPayableInput", () => {
  it.each(["1", "0.01", "100.50", "9999999999999.99"])("accepts valid USD amount %s", (amount) => {
    const result = validateAccountPayableInput(validBody(amount));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Office rent");
      expect(result.value.description).toBe("Monthly");
      expect(result.value.amount.toFixed(2)).toBe(
        amount.includes(".") ? amount : `${amount}.00`,
      );
    }
  });

  it.each(["0", "0.00", "-1", "1.001", "10000000000000", "1,000.00", 10, null])(
    "rejects invalid USD amount %s",
    (amount) => {
      expect(validateAccountPayableInput(validBody(amount)).ok).toBe(false);
    },
  );

  it("rejects missing name and oversized descriptions", () => {
    expect(validateAccountPayableInput({ name: " ", amount: "1" }).ok).toBe(false);
    expect(validateAccountPayableInput({ name: "Rent", description: "x".repeat(501), amount: "1" }).ok).toBe(false);
  });
});
