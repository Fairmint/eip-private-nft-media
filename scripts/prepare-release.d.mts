export interface ReleaseVersionInput {
  packageVersion: string;
  npmLatest: string | null;
  npmVersions: readonly string[];
  tagVersions: readonly string[];
}

export function selectReleaseVersion(input: ReleaseVersionInput): string;
export function compareVersions(left: string, right: string): number;
export function prepareRelease(): void;
