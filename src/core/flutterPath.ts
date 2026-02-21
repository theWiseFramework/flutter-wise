import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function flutterExecName(): string {
  return process.platform === "win32" ? "flutter.bat" : "flutter";
}

export async function resolveFlutterPath(): Promise<string> {
  const sdkRoots: (string | undefined)[] = [];

  sdkRoots.push(process.env.FLUTTER_ROOT);
  sdkRoots.push(
    vscode.workspace.getConfiguration("dart").get<string>("flutterSdkPath"),
  );
  sdkRoots.push(
    vscode.workspace.getConfiguration("flutter").get<string>("sdkPath"),
  );

  for (const sdkRoot of sdkRoots) {
    if (!sdkRoot) {
      continue;
    }

    const flutterPath = path.join(sdkRoot, "bin", flutterExecName());
    if (await exists(flutterPath)) {
      return flutterPath;
    }
  }

  return "flutter";
}
