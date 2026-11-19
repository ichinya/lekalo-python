import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// CI builds the host workspace before running the Python adapter gates.
const suffix = process.platform === "win32" ? ".exe" : "";
const host = process.env.LEKALO_BIN
  ?? fileURLToPath(new URL(`../target/debug/lekalo${suffix}`, import.meta.url));
const adapter = process.env.LEKALO_PYTHON_ADAPTER_BIN
  ?? fileURLToPath(new URL(`./external/lekalo-python/target/debug/lekalo-target-python${suffix}`, import.meta.url));
const fixtures = new URL("./fixtures/", import.meta.url);
const profile = readFileSync(new URL("python-scan/standalone/profile.compact.json", fixtures), "utf8").trim();
const temporaryParent = realpathSync(tmpdir());
const scratch = mkdtempSync(join(temporaryParent, "lekalo-python-observed-host-"));

after(() => {
  const checked = realpathSync(scratch);
  assert.equal(dirname(checked), temporaryParent);
  assert(basename(checked).startsWith("lekalo-python-observed-host-"));
  rmSync(checked, { recursive: true, force: true, maxRetries: 3 });
});

function project(module) {
  const cwd = mkdtempSync(join(scratch, "case-"));
  cpSync(new URL("loader/valid-zero-modules/lekalo", fixtures), join(cwd, "lekalo"), { recursive: true });
  const directory = join(cwd, "lekalo/modules", module);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "module.yaml"), JSON.stringify({
    schema_version: "0.2.16", definitions: [{ id: module, kind: "module", version: 1 }],
  }));
  cpSync(new URL("python-scan/standalone/pyproject.toml", fixtures), join(cwd, "pyproject.toml"));
  mkdirSync(join(cwd, "src"));
  return cwd;
}

function scan(cwd, profileJson = profile) {
  const result = spawnSync(host, [
    "scan", "--target", "python", "--profile", "standalone", "--project", ".", "--json",
    "--", adapter, "--lekalo-project-profile-json", profileJson,
  ], { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}

for (const [label, identifier] of [
  ["Unicode", "привет"],
  ["192 ASCII characters", "a".repeat(185)],
  ["193 ASCII characters", "a".repeat(186)],
  ["256 ASCII characters", "a".repeat(249)],
]) {
  test(`the observed host accepts ${label} alongside healthy declarations`, () => {
    const cwd = project("sample");
    writeFileSync(join(cwd, "src/sample.py"), `def ${identifier}():\n    pass\ndef healthy():\n    pass\n`);
    const result = scan(cwd);
    assert.equal(result.status, 0, result.stdout || result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "valid");
    assert.equal(summary.symbols, 2, "both the unusual and healthy declarations must survive");
  });
}

test("a Python source root can propose bindings in a differently named model module", () => {
  const cwd = project("inventory");
  const source = "def reserve():\n    pass\n";
  writeFileSync(join(cwd, "src/services.py"), source);
  const launch = JSON.parse(profile);
  const root = launch.readRoots.find(({ path }) => path === "src");
  root.semanticModule = "missing";
  const refused = scan(cwd, JSON.stringify(launch));
  assert.equal(refused.status, 1);
  const rejection = JSON.parse(refused.stderr || refused.stdout);
  assert(rejection.reasonCodes.includes("observed.unknown-module"));

  root.semanticModule = "inventory";
  const accepted = scan(cwd, JSON.stringify(launch));
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
  const summary = JSON.parse(accepted.stdout);
  assert.equal(summary.symbols, 1);
  assert.equal(summary.inferred, 1);
  assert.equal(summary.confirmed, 0);
  const index = JSON.parse(readFileSync(join(cwd, ".lekalo/import/observed/index.json"), "utf8"));
  assert.deepEqual(index.symbols.map(({ id }) => id), ["inventory.services.reserve"]);
  assert.deepEqual(index.native_symbols.map(({ qualified_name }) => qualified_name), ["services.reserve"]);
  assert.equal(readFileSync(join(cwd, "src/services.py"), "utf8"), source);
});
