// Chooses the version the publish workflow releases, and writes it to
// package.json in the CI workspace only. Nothing is committed back.
//
// - package.json's version is published when neither npm nor a v* git tag has
//   it (the first release, or a deliberate minor or major bump). It is refused
//   when it is lower than npm's latest, because publishing it would move the
//   latest dist-tag backwards.
// - Otherwise the next patch after the higher of npm's latest and
//   package.json's version, skipping any version npm or a git tag already has
//   (a version unpublished from npm included: npm never reuses one).
// - A commit that was already released publishes nothing: HEAD carries a v*
//   tag, or a version on npm records HEAD's full SHA as its gitHead (a re-run
//   after npm publish succeeded and the tag job did not). In the second case
//   the commit still needs its tag, so should_tag stays true.
// - A package npm does not have (E404) has nothing published; every other npm
//   or git error fails the run.
//
// Writes `version`, `should_publish` and `should_tag` to GITHUB_OUTPUT when it
// is set.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const defaultPackageJsonUrl = new URL("../package.json", import.meta.url);

/**
 * @param {{
 *   packageVersion: string;
 *   npmLatest: string | null;
 *   npmVersions: readonly string[];
 *   tagVersions: readonly string[];
 * }} input
 * @returns {string}
 */
export function selectReleaseVersion({
  packageVersion,
  npmLatest,
  npmVersions,
  tagVersions,
}) {
  parseVersion(packageVersion);
  const taken = new Set([...npmVersions, ...tagVersions]);
  if (!taken.has(packageVersion)) {
    if (npmLatest !== null && compareVersions(packageVersion, npmLatest) < 0) {
      throw new Error(
        `package.json's version ${packageVersion} is lower than npm's latest ${npmLatest}; publishing it would move the latest dist-tag backwards. Raise the version in package.json.`,
      );
    }
    return packageVersion;
  }

  let base = packageVersion;
  if (npmLatest !== null && compareVersions(npmLatest, base) > 0) {
    base = npmLatest;
  }
  let candidate = nextPatch(base);
  while (taken.has(candidate)) candidate = nextPatch(candidate);
  return candidate;
}

/** @param {string} left @param {string} right */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

/** @param {string} version */
function nextPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

/** @param {string} version @returns {[number, number, number]} */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected a MAJOR.MINOR.PATCH version, got ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Runs a command and returns its stdout. On a non-zero exit it throws an error
 * carrying `stdout` and `stderr`, as execFileSync does.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @returns {string}
 */
export function runCommand(command, args) {
  return execFileSync(command, [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** @param {unknown} error */
function isNpmNotFound(error) {
  if (typeof error !== "object" || error === null) return false;
  const { stdout, stderr } =
    /** @type {{ stdout?: unknown; stderr?: unknown }} */ (error);
  return `${stdout ?? ""}${stderr ?? ""}`.includes("E404");
}

/**
 * Reads what npm has published for `name`: the latest dist-tag, every version
 * number npm will refuse, and the gitHead each MAJOR.MINOR.PATCH version was
 * published from. E404 (the package does not exist) means nothing is
 * published; every other error is thrown.
 *
 * npm never reuses a version number, even after it is unpublished, but the
 * packument's `versions` leaves unpublished ones out. Its `time` object keeps
 * a key for every version ever published, so every MAJOR.MINOR.PATCH key there
 * counts as taken too.
 *
 * @param {string} name
 * @param {(command: string, args: readonly string[]) => string} [run]
 * @returns {{
 *   latest: string | null;
 *   versions: string[];
 *   gitHeads: { version: string; gitHead: string }[];
 * }}
 */
export function readNpm(name, run = runCommand) {
  let stdout;
  try {
    stdout = run("npm", ["view", name, "--json"]);
  } catch (error) {
    if (isNpmNotFound(error))
      return { latest: null, versions: [], gitHeads: [] };
    throw error;
  }
  const info = JSON.parse(stdout);
  /** @type {string[]} */
  const published = Array.isArray(info.versions)
    ? info.versions
    : [info.versions].filter(Boolean);
  const unpublished =
    typeof info.time === "object" && info.time !== null
      ? Object.keys(info.time).filter(
          (key) => /^\d+\.\d+\.\d+$/.test(key) && !published.includes(key),
        )
      : [];
  const versions = [...published, ...unpublished];
  const latest = info["dist-tags"]?.latest ?? null;

  // One request for every stable version's gitHead. npm view's range matching
  // leaves out prereleases, which this workflow never publishes; when no
  // stable version is still published the range would be E404, so it is not
  // asked.
  /** @type {{ version: string; gitHead: string }[]} */
  const gitHeads = [];
  if (published.some((version) => /^\d+\.\d+\.\d+$/.test(version))) {
    const parsed = JSON.parse(
      run("npm", ["view", `${name}@>=0.0.0`, "version", "gitHead", "--json"]),
    );
    for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
      if (
        typeof entry?.version === "string" &&
        typeof entry?.gitHead === "string"
      ) {
        gitHeads.push({ version: entry.version, gitHead: entry.gitHead });
      }
    }
  }
  return { latest, versions, gitHeads };
}

/**
 * @param {readonly string[]} args
 * @param {(command: string, args: readonly string[]) => string} [run]
 * @returns {string[]}
 */
export function readGitTagVersions(args, run = runCommand) {
  return run("git", ["tag", ...args])
    .split("\n")
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => tag.slice(1));
}

/** @param {string} name @param {string} value */
function writeGitHubOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

/**
 * @param {{
 *   run?: (command: string, args: readonly string[]) => string;
 *   packageJsonUrl?: URL;
 *   output?: (name: string, value: string) => void;
 *   log?: (message: string) => void;
 * }} [options]
 * @returns {{ version: string; shouldPublish: boolean; shouldTag: boolean }}
 */
export function prepareRelease({
  run = runCommand,
  packageJsonUrl = defaultPackageJsonUrl,
  output = writeGitHubOutput,
  log = console.log,
} = {}) {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const name = packageJson.name;

  /**
   * @param {string} version
   * @param {boolean} shouldPublish
   * @param {boolean} shouldTag
   */
  const finish = (version, shouldPublish, shouldTag) => {
    output("version", version);
    output("should_publish", String(shouldPublish));
    output("should_tag", String(shouldTag));
    return { version, shouldPublish, shouldTag };
  };

  const headTags = readGitTagVersions(["--points-at", "HEAD"], run);
  if (headTags.length > 0) {
    log(
      `HEAD is already released as v${headTags.join(", v")}; nothing to publish.`,
    );
    return finish(/** @type {string} */ (headTags[0]), false, false);
  }

  const npm = readNpm(name, run);
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  const publishedFromHead = npm.gitHeads.find(
    (entry) => entry.gitHead === head,
  );
  if (publishedFromHead) {
    log(
      `${name}@${publishedFromHead.version} on npm was published from HEAD (${head}); nothing to publish.`,
    );
    return finish(publishedFromHead.version, false, true);
  }

  const version = selectReleaseVersion({
    packageVersion: packageJson.version,
    npmLatest: npm.latest,
    npmVersions: npm.versions,
    tagVersions: readGitTagVersions(["--list", "v*"], run),
  });

  if (version !== packageJson.version) {
    packageJson.version = version;
    writeFileSync(packageJsonUrl, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  log(
    `Selected ${name}@${version} (npm latest: ${npm.latest ?? "not published"}).`,
  );
  return finish(version, true, true);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  prepareRelease();
}
