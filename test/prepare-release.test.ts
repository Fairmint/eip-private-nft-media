import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareRelease,
  selectReleaseVersion,
  type CommandRunner,
} from "../scripts/prepare-release.mjs";

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

  it("refuses a free package.json version lower than npm's latest", () => {
    expect(() =>
      selectReleaseVersion({
        packageVersion: "0.1.0",
        npmLatest: "0.2.3",
        npmVersions: ["0.2.0", "0.2.3"],
        tagVersions: ["0.2.0", "0.2.3"],
      }),
    ).toThrow(/lower than npm's latest 0\.2\.3/);
  });
});

const NAME = "@fairmint/eip-private-nft-media";
const HEAD = "1111111111111111111111111111111111111111";

class CommandError extends Error {
  constructor(
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(`Command failed: ${stderr}`);
  }
}

interface FakeRegistry {
  /** npm view <name> --json; an Error is thrown instead of returned. */
  packument?: object | Error;
  /** npm view <name>@>=0.0.0 version gitHead --json */
  gitHeads?: object | Error;
  headTags?: string[];
  allTags?: string[];
}

function fakeRunner(registry: FakeRegistry): CommandRunner {
  return (command, args) => {
    const call = `${command} ${args.join(" ")}`;
    switch (call) {
      case "git tag --points-at HEAD":
        return (registry.headTags ?? []).map((tag) => `${tag}\n`).join("");
      case "git tag --list v*":
        return (registry.allTags ?? []).map((tag) => `${tag}\n`).join("");
      case "git rev-parse HEAD":
        return `${HEAD}\n`;
      case `npm view ${NAME} --json`:
      case `npm view ${NAME}@>=0.0.0 version gitHead --json`: {
        const value = call.endsWith("gitHead --json")
          ? registry.gitHeads
          : registry.packument;
        if (value instanceof Error) throw value;
        if (value === undefined) throw new Error(`unexpected call: ${call}`);
        return JSON.stringify(value);
      }
      default:
        throw new Error(`unexpected call: ${call}`);
    }
  };
}

function notFound() {
  return new CommandError(
    JSON.stringify({ error: { code: "E404", summary: "Not Found" } }),
    "npm error code E404\nnpm error 404 Not Found",
  );
}

describe("prepareRelease", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function run(registry: FakeRegistry, packageVersion = "0.1.0") {
    const directory = mkdtempSync(join(tmpdir(), "prepare-release-"));
    directories.push(directory);
    const packageJsonPath = join(directory, "package.json");
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify({ name: NAME, version: packageVersion }, null, 2)}\n`,
    );
    const outputs: Record<string, string> = {};
    const result = prepareRelease({
      run: fakeRunner(registry),
      packageJsonUrl: pathToFileURL(packageJsonPath),
      output: (name, value) => {
        outputs[name] = value;
      },
      log: () => {},
    });
    const written = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version: string;
    };
    return { result, outputs, writtenVersion: written.version };
  }

  it("selects package.json's version when npm has no such package (E404)", () => {
    const { result, outputs, writtenVersion } = run({ packument: notFound() });
    expect(result).toEqual({
      version: "0.1.0",
      shouldPublish: true,
      shouldTag: true,
    });
    expect(outputs).toEqual({
      version: "0.1.0",
      should_publish: "true",
      should_tag: "true",
    });
    expect(writtenVersion).toBe("0.1.0");
  });

  it("fails closed on an npm error other than E404", () => {
    const unauthorized = new CommandError(
      JSON.stringify({ error: { code: "E401", summary: "Unauthorized" } }),
      "npm error code E401",
    );
    expect(() => run({ packument: unauthorized })).toThrow(/E401/);
    expect(() => run({ packument: new Error("ETIMEDOUT") })).toThrow(
      /ETIMEDOUT/,
    );
  });

  it("fails closed when the gitHead lookup fails", () => {
    expect(() =>
      run({
        packument: { "dist-tags": { latest: "0.1.0" }, versions: ["0.1.0"] },
        gitHeads: notFound(),
      }),
    ).toThrow(/E404/);
  });

  it("publishes nothing when HEAD already carries a v* tag", () => {
    const { result, outputs } = run({ headTags: ["v0.1.3"] });
    expect(result).toEqual({
      version: "0.1.3",
      shouldPublish: false,
      shouldTag: false,
    });
    expect(outputs).toEqual({
      version: "0.1.3",
      should_publish: "false",
      should_tag: "false",
    });
  });

  it("publishes nothing, but still tags, when npm has a version from HEAD", () => {
    const { result, outputs, writtenVersion } = run({
      packument: {
        "dist-tags": { latest: "0.1.2" },
        versions: ["0.1.0", "0.1.1", "0.1.2"],
      },
      gitHeads: [
        { version: "0.1.0", gitHead: "a".repeat(40) },
        { version: "0.1.1", gitHead: HEAD },
        { version: "0.1.2", gitHead: "b".repeat(40) },
      ],
      allTags: ["v0.1.0"],
    });
    expect(result).toEqual({
      version: "0.1.1",
      shouldPublish: false,
      shouldTag: true,
    });
    expect(outputs).toEqual({
      version: "0.1.1",
      should_publish: "false",
      should_tag: "true",
    });
    expect(writtenVersion).toBe("0.1.0");
  });

  it("reads a single published version's gitHead (npm prints an object)", () => {
    const { result } = run({
      packument: { "dist-tags": { latest: "0.1.0" }, versions: "0.1.0" },
      gitHeads: { version: "0.1.0", gitHead: HEAD },
    });
    expect(result).toEqual({
      version: "0.1.0",
      shouldPublish: false,
      shouldTag: true,
    });
  });

  it("writes the next free patch to package.json", () => {
    const { result, outputs, writtenVersion } = run({
      packument: {
        "dist-tags": { latest: "0.1.1" },
        versions: ["0.1.0", "0.1.1"],
      },
      gitHeads: [
        { version: "0.1.0", gitHead: "a".repeat(40) },
        { version: "0.1.1", gitHead: "b".repeat(40) },
      ],
      allTags: ["v0.1.0", "v0.1.1"],
    });
    expect(result).toEqual({
      version: "0.1.2",
      shouldPublish: true,
      shouldTag: true,
    });
    expect(outputs).toEqual({
      version: "0.1.2",
      should_publish: "true",
      should_tag: "true",
    });
    expect(writtenVersion).toBe("0.1.2");
  });

  it("refuses to publish a version lower than npm's latest", () => {
    expect(() =>
      run(
        {
          packument: {
            "dist-tags": { latest: "0.2.3" },
            versions: ["0.2.0", "0.2.3"],
          },
          gitHeads: [
            { version: "0.2.0", gitHead: "a".repeat(40) },
            { version: "0.2.3", gitHead: "b".repeat(40) },
          ],
        },
        "0.1.0",
      ),
    ).toThrow(/move the latest dist-tag backwards/);
  });
});
