import path from "node:path";
import { run } from "./providers.js";
import { wslPath } from "./hermes.js";
export async function hermesVoice(payload: {
  describe?: boolean;
  script?: string;
  output?: string;
}) {
  const published = JSON.parse(
    await run("wsl.exe", [
      "-u",
      "root",
      "--exec",
      "hermes",
      "--print-runtime-command",
    ]),
  );
  if (
    !Array.isArray(published) ||
    typeof published[0] !== "string" ||
    !published[0].startsWith("/")
  )
    throw new Error("Hermes did not publish a valid Python runtime.");
  const bootstrap =
    "import sys,os,runpy; sys.path.insert(0,'/root/.hermes/hermes-agent'); sys._hermes_pin_default_home=True; import hermes_bootstrap; os.environ.setdefault('HERMES_HOME',str(__import__('hermes_constants').get_default_hermes_root())); runpy.run_path(sys.argv[1],run_name='__main__')";
  const helper = wslPath(path.resolve("scripts/hermes_speech.py"));
  const result = await run(
    "wsl.exe",
    ["-u", "root", "--exec", published[0], "-I", "-c", bootstrap, helper],
    JSON.stringify({
      ...payload,
      output: payload.output ? wslPath(payload.output) : undefined,
    }),
  );
  return JSON.parse(result);
}
