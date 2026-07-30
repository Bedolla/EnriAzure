import { describe, expect, it } from "vitest";
import { WritePolicy } from "../../src/domain/configuration/WritePolicy.js";

describe("WritePolicy", (): void => {
  it("permits only reads by default", (): void => {
    const policy = WritePolicy.parse(undefined);

    expect((): void => policy.assertAllowed("read")).not.toThrow();
    expect((): void => policy.assertAllowed("write")).toThrow("read-only");
    expect((): void => policy.assertAllowed("destructive")).toThrow("read-only");
  });

  it("keeps delete and removal operations behind the full boundary", (): void => {
    const policy = WritePolicy.parse("write");

    expect((): void => policy.assertAllowed("write")).not.toThrow();
    expect((): void => policy.assertAllowed("destructive")).toThrow("ENRIAZURE_WRITE_POLICY=full");
  });

  it("uses full as the only configuration value that permits complete CRUD", (): void => {
    const fullPolicy = WritePolicy.parse("full");

    expect((): void => fullPolicy.assertAllowed("destructive")).not.toThrow();
    expect((): WritePolicy => WritePolicy.parse("destructive")).toThrow(
      "debe ser read-only, write o full",
    );
  });
});
