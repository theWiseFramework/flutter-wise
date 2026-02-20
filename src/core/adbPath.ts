import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function adbName() {
  return process.platform === "win32" ? "adb.exe" : "adb";
}

export async function resolveAdbPath(): Promise<string | null> {
  const candidates: (string | undefined)[] = [];

  // 1) Env vars (if present)
  candidates.push(process.env.ANDROID_SDK_ROOT);
  candidates.push(process.env.ANDROID_HOME);

  // 2) VS Code settings (most reliable in extension land)
  candidates.push(
    vscode.workspace.getConfiguration("android").get<string>("androidSdkPath"),
  );
  candidates.push(
    vscode.workspace.getConfiguration("flutter").get<string>("androidSdkPath"),
  );

  // 3) Common macOS default
  if (process.platform === "darwin") {
    candidates.push(path.join(process.env.HOME ?? "", "Library/Android/sdk"));
  }

  for (const sdkRoot of candidates) {
    if (!sdkRoot) {continue;}
    const adb = path.join(sdkRoot, "platform-tools", adbName());
    if (await exists(adb)) {return adb;}
  }

  // 4) last resort: try PATH
  return "adb"; // may still fail if not in PATH, but caller can handle
}
