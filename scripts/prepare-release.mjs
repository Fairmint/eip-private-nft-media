// Chooses the version the publish workflow releases, and writes it to
// package.json in the CI workspace only. Nothing is committed back.
//
// - package.json's version is published when neither npm nor a v* git tag has
//   it (the first release, or a deliberate minor or major bump).
// - Otherwise the next patch after the higher of npm's latest and
//   package.json's version, skipping any version npm or a git tag already has.
// - A commit that already carries a v* tag was released: nothing is published.
//
// Writes `version` and `should_publish` to GITHUB_OUTPUT when it is set.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const packageJsonUrl = new URL("../package.json", import.meta.url);

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
  if (!taken.has(packageVersion)) return packageVersion;

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

/** @param {string} name */
function readNpm(name) {
  try {
    const stdout = execFileSync("npm", ["view", name, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const info = JSON.parse(stdout);
    const versions = Array.isArray(info.versions)
      ? info.versions
      : [info.versions].filter(Boolean);
    return { latest: info["dist-tags"]?.latest ?? null, versions };
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (output.includes("E404")) return { latest: null, versions: [] };
    throw error;
  }
}

/** @param {string[]} args */
function gitTagVersions(args) {
  return execFileSync("git", ["tag", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
    .split("\n")
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => tag.slice(1));
}

/** @param {string} name @param {string} value */
function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

export function prepareRelease() {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const name = packageJson.name;

  const headTags = gitTagVersions(["--points-at", "HEAD"]);
  if (headTags.length > 0) {
    console.log(
      `HEAD is already released as v${headTags.join(", v")}; nothing to publish.`,
    );
    writeOutput("version", headTags[0]);
    writeOutput("should_publish", "false");
    return;
  }

  const npm = readNpm(name);
  const version = selectReleaseVersion({
    packageVersion: packageJson.version,
    npmLatest: npm.latest,
    npmVersions: npm.versions,
    tagVersions: gitTagVersions(["--list", "v*"]),
  });

  if (version !== packageJson.version) {
    packageJson.version = version;
    writeFileSync(packageJsonUrl, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  console.log(
    `Selected ${name}@${version} (npm latest: ${npm.latest ?? "not published"}).`,
  );
  writeOutput("version", version);
  writeOutput("should_publish", "true");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  prepareRelease();
}
