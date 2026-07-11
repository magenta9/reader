import { spawn } from "node:child_process";

export function spawnCommand(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    const forwardSignal = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    const cleanup = () => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
    };
    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolveResult({ code, signal });
    });
  });
}

export function assertCommand(result, label) {
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}`);
  if (result.code !== 0) throw new Error(`${label} failed with exit code ${result.code}`);
}
