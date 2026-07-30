import { describe, expect, it } from "vitest";
import { SecretRedactor } from "../../src/application/services/SecretRedactor.js";

describe("SecretRedactor", (): void => {
  it("redacts credential properties and masked Variable Group values recursively", (): void => {
    const redactor = new SecretRedactor();

    const result = redactor.redact({
      authorization: {
        parameters: {
          username: "deployment-user",
          password: "classified-test-value",
          clientSecret: "another-test-value",
        },
      },
      variables: {
        PUBLIC: { value: "visible", isSecret: false },
        PRIVATE: { value: "server-echoed-test-value", isSecret: true },
      },
      securityToken: "resource-token-is-not-automatically-a-credential",
    });

    expect(result).toEqual({
      authorization: {
        parameters: {
          username: "deployment-user",
          password: "[REDACTED]",
          clientSecret: "[REDACTED]",
        },
      },
      variables: {
        PUBLIC: { value: "visible", isSecret: false },
        PRIVATE: { value: null, isSecret: true },
      },
      securityToken: "resource-token-is-not-automatically-a-credential",
    });
    expect(JSON.stringify(result)).not.toContain("classified-test-value");
    expect(JSON.stringify(result)).not.toContain("server-echoed-test-value");
  });
});
