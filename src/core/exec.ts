import * as vscode from "vscode";
import { execFile } from "node:child_process";

export type ExecResult = { stdout: string; stderr: string; code: number };

export function execCmd(
  command: string,
  args: string[] = [],
  cwd?: string,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      const code =
        typeof (error as any)?.code === "number" ? (error as any).code : 0;
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        code: error ? code || 1 : 0,
      });
    });
  });
}

export async function commandExists(cmd: string): Promise<boolean> {
  // cross-platform-ish: try executing without args; many tools exit non-0 but exist
  const r = await execCmd(cmd, ["version"]);
  if (r.code === 0) {return true;}

  // fallback: try running cmd with no args (also may return non-0)
  const r2 = await execCmd(cmd, []);
  return r2.stderr.length > 0 || r2.stdout.length > 0 || r2.code !== 127;
}

export function showToolMissing(tool: string) {
  vscode.window.showWarningMessage(
    `Flutter Wise: "${tool}" not found in PATH. Install Android platform-tools / Android SDK tools and ensure "${tool}" is available.`,
  );
}
