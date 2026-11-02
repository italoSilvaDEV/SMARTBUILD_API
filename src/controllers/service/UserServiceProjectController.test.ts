import { parseOptionalPagination } from "./UserServiceProjectController";

describe("parseOptionalPagination", () => {
  it("keeps the legacy full list when page is not sent", () => {
    expect(parseOptionalPagination({})).toBeNull();
    expect(parseOptionalPagination({ per_page: "10" })).toBeNull();
  });

  it("paginates with defaults and clamps the page size", () => {
    expect(parseOptionalPagination({ page: "0" })).toEqual({ page: 0, perPage: 20 });
    expect(parseOptionalPagination({ page: "2", per_page: "500" })).toEqual({ page: 2, perPage: 50 });
    expect(parseOptionalPagination({ page: "-3", per_page: "0" })).toEqual({ page: 0, perPage: 20 });
    expect(parseOptionalPagination({ page: "abc" })).toEqual({ page: 0, perPage: 20 });
  });
});
