import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import test from "node:test";

test("a native job survives cache retirement and retains its lease through cold readback", () => {
  const script=fileURLToPath(new URL("./native_job.py", import.meta.url));
  execFileSync(process.env.PYTHON || (process.platform==="win32" ? "python" : "python3"), ["-B",script]);
});
