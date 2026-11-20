import { describe, expect, it } from "vitest";
import { selectReleaseVersion } from "../scripts/prepare-release.mjs";

describe("selectReleaseVersion", () => {
  it("publishes package.json's version when the package is not on npm", () => {
    expect(
      selectReleaseVersion({
        packageVersion: "0.1.0",
        npmLatest: null,
        npmVersions: [],
        tagVersions: [],
      }),
    ).toBe("0.1.0");
  });

  it("publishes package.json's version when it is ahead of npm and free", () => {
    expect(
      selectReleaseVersion({
        packageVersion: "0.2.0",
        npmLatest: "0.1.4",
        npmVersions: ["0.1.0", "0.1.4"],
        tagVersions: ["0.1.0", "0.1.4"],
      }),
    ).toBe("0.2.0");
  });

  it("takes the next patch when package.json's version is npm's latest", () => {
    expect(
      selectReleaseVersion({
        packageVersion: "0.1.0",
        npmLatest: "0.1.0",
        npmVersions: ["0.1.0"],
        tagVersions: ["0.1.0"],
      }),
    ).toBe("0.1.1");
  });

  it("increments from npm's latest when it is ahead of package.json", () => {
    expect(
      selectReleaseVersion({
        packageVersion: "0.1.0",
        npmLatest: "0.1.3",
        npmVersions: ["0.1.0", "0.1.1", "0.1.2", "0.1.3"],
        tagVersions: [],
      }),
    ).toBe("0.1.4");
  });

  it("skips versions already on npm or already tagged", () => {
    expect(
      selectReleaseVersion({
        packageVersion: "0.1.0",
        npmLatest: "0.1.0",
        npmVersions: ["0.1.0", "0.1.2"],
        tagVersions: ["0.1.1", "0.1.3"],
      }),
    ).toBe("0.1.4");
  });

  it("treats a version that only exists as a git tag as taken", () => {
    expect(
      selectReleaseVersion({
        packageVersion: "0.1.0",
        npmLatest: null,
        npmVersions: [],
        tagVersions: ["0.1.0"],
      }),
    ).toBe("0.1.1");
  });

  it("rejects a version that is not MAJOR.MINOR.PATCH", () => {
    expect(() =>
      selectReleaseVersion({
        packageVersion: "0.1.0-beta.1",
        npmLatest: null,
        npmVersions: [],
        tagVersions: [],
      }),
    ).toThrow(/MAJOR\.MINOR\.PATCH/);
  });
});
