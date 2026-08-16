import {
  getExpectedDocumentServiceCount,
  hasSmartBuilderDocumentImportIntent,
} from "../../src/utils/smartBuilderDocumentIntent";

describe("SmartBuilder document import intent", () => {
  it("recognizes the exact Portuguese instruction used in the reported flow", () => {
    const message = "criar todos os serviços iguais ao documento";

    expect(message).toHaveLength(43);
    expect(hasSmartBuilderDocumentImportIntent(message, true)).toBe(true);
  });

  it("recognizes an English request to create every service from an attachment", () => {
    expect(hasSmartBuilderDocumentImportIntent(
      "Create all services from the attached document",
      true
    )).toBe(true);
  });

  it("does not activate import mode without an attachment", () => {
    expect(hasSmartBuilderDocumentImportIntent(
      "criar todos os serviços iguais ao documento",
      false
    )).toBe(false);
  });

  it("does not treat a generic attachment reference as a copy request", () => {
    expect(hasSmartBuilderDocumentImportIntent(
      "Review the attached document and tell me what you think",
      true
    )).toBe(false);
  });

  it("uses every priced document row as the expected service count", () => {
    const documentContext = {
      lineItems: Array.from({ length: 15 }, (_, index) => ({ name: `Item ${index + 1}` })),
      scopeGroups: Array.from({ length: 4 }, (_, index) => ({ title: `Group ${index + 1}` })),
    };

    expect(getExpectedDocumentServiceCount(documentContext)).toBe(15);
  });
});
