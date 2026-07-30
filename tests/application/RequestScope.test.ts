import { describe, expect, it } from "vitest";
import { RequestScope } from "../../src/application/services/RequestScope.js";

describe("RequestScope", (): void => {
  it("uses defaults and encodes every route segment", (): void => {
    const scope = new RequestScope({
      collection: "My Collection",
      project: "Project/One",
    });

    expect(scope.project({}, "_apis/git/repositories")).toBe(
      "/My%20Collection/Project%2FOne/_apis/git/repositories",
    );
    expect(scope.projectSegment(undefined)).toBe("Project%2FOne");
  });

  it("lets each request override the configured collection and project defaults", (): void => {
    const scope = new RequestScope({
      collection: "Default Collection",
      project: "Default Project",
    });

    expect(
      scope.project(
        {
          collection: "Other Collection",
          project: "Other Project",
        },
        "_apis/git/repositories",
      ),
    ).toBe("/Other%20Collection/Other%20Project/_apis/git/repositories");
    expect(scope.projectSegment("Explicit Project")).toBe("Explicit%20Project");
  });

  it("encodes hierarchy paths without losing their segment boundaries", (): void => {
    const scope = new RequestScope({});

    expect(scope.hierarchySegments("Release 1\\Sprint/Two", "iteration_path")).toBe(
      "Release%201/Sprint/Two",
    );
    expect((): string => scope.hierarchySegments("../unsafe", "iteration_path")).toThrow(
      "segmentos de jerarquía seguros",
    );
  });

  it("requires missing scope explicitly", (): void => {
    const scope = new RequestScope({});

    expect((): string => scope.collection({}, "_apis/projects")).toThrow(
      "collection es obligatorio",
    );
  });
});
