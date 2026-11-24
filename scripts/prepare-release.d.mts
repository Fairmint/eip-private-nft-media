export interface ReleaseVersionInput {
  packageVersion: string;
  npmLatest: string | null;
  npmVersions: readonly string[];
  tagVersions: readonly string[];
}

/** Returns stdout; throws an error carrying `stdout` and `stderr` on failure. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
) => string;

export interface NpmPublished {
  latest: string | null;
  /** Every release version npm refuses: published, and unpublished (from `time`). */
  versions: string[];
  gitHeads: { version: string; gitHead: string }[];
}

export interface PrepareReleaseOptions {
  run?: CommandRunner;
  packageJsonUrl?: URL;
  output?: (name: string, value: string) => void;
  log?: (message: string) => void;
}

export function selectReleaseVersion(input: ReleaseVersionInput): string;
export function compareVersions(left: string, right: string): number;
export const runCommand: CommandRunner;
export function readNpm(name: string, run?: CommandRunner): NpmPublished;
export function readGitTagVersions(
  args: readonly string[],
  run?: CommandRunner,
): string[];
export function prepareRelease(options?: PrepareReleaseOptions): {
  version: string;
  shouldPublish: boolean;
  shouldTag: boolean;
};
