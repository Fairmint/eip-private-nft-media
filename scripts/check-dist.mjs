// Fails when the committed dist/ differs from a fresh `npm run build`.
// Consumers install this package from a git commit, and Bun does not run a
// git dependency's build, so dist/ must be committed and match src/.
import { execFileSync } from "node:child_process";

const status = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", "dist"],
  { encoding: "utf8" },
).trim();

if (status) {
  console.error(
    "dist/ is out of date with src/. Run `npm run build` and commit dist/:",
  );
  console.error(status);
  process.exit(1);
}

console.log("dist/ matches a fresh build.");
