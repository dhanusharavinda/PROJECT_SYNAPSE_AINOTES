import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const yaml = require("js-yaml");
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const version = pkg.version;
const tag = `v${version}`;
const repo = `${pkg.build.publish.owner}/${pkg.build.publish.repo}`;
function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      result.error?.message || result.stderr.trim() || `${command} failed`,
    );
  return result.stdout.trim();
}
if (run("git", ["status", "--porcelain"]))
  throw new Error("Commit and push the reviewed source before publishing.");
const head = run("git", ["rev-parse", "HEAD"]);
const remote = run("git", ["ls-remote", "origin", "refs/heads/main"]).split(
  /\s/,
)[0];
if (remote !== head)
  throw new Error("Push this version to origin/main before publishing.");
const manifest = yaml.load(await fs.readFile("release/latest.yml", "utf8"));
const installer = `Synapse-Setup-${version}.exe`;
const entry = manifest.files?.find((file) => file.url === installer);
if (manifest.version !== version || !entry)
  throw new Error("Build the installer for the current version first.");
const bytes = await fs.readFile(path.join("release", installer));
if (
  bytes.length !== entry.size ||
  crypto.createHash("sha512").update(bytes).digest("base64") !== entry.sha512
)
  throw new Error("Installer checksum does not match latest.yml.");
const names = [installer, installer + ".blockmap", "latest.yml"];
for (const name of names) await fs.access(path.join("release", name));
const notes = path.join("docs", "releases", version + ".md");
await fs.access(notes);
const existing = JSON.parse(
  run("gh", [
    "release",
    "list",
    "--repo",
    repo,
    "--limit",
    "100",
    "--json",
    "tagName,isDraft",
  ]),
).find((release) => release.tagName === tag);
if (existing && !existing.isDraft)
  throw new Error(
    "This version is already published. Use a new version number.",
  );
if (!existing)
  run("gh", [
    "release",
    "create",
    tag,
    "--repo",
    repo,
    "--target",
    head,
    "--draft",
    "--title",
    `Synapse ${version}`,
    "--notes-file",
    notes,
  ]);
run("gh", [
  "release",
  "upload",
  tag,
  "--repo",
  repo,
  "--clobber",
  ...names.map((name) => path.join("release", name)),
]);
const release = JSON.parse(
  run("gh", [
    "release",
    "view",
    tag,
    "--repo",
    repo,
    "--json",
    "assets,isDraft,targetCommitish",
  ]),
);
if (!release.isDraft || release.targetCommitish !== head)
  throw new Error("Release target does not match this reviewed commit.");
for (const name of names) {
  const asset = release.assets.find((asset) => asset.name === name);
  if (!asset || asset.size !== (await fs.stat(path.join("release", name))).size)
    throw new Error("Release upload verification failed for " + name);
}
run("gh", [
  "release",
  "edit",
  tag,
  "--repo",
  repo,
  "--draft=false",
  "--latest",
]);
console.log(
  run("gh", [
    "release",
    "view",
    tag,
    "--repo",
    repo,
    "--json",
    "url",
    "--jq",
    ".url",
  ]),
);
