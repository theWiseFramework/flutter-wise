import * as vscode from "vscode";

export function parsePubspecPackageName(pubspec: string): string | undefined {
  const match = pubspec.match(
    /^\s*name\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/m,
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

export async function getPubspecPackageName(
  workspaceRoot: vscode.Uri,
): Promise<string | undefined> {
  const pubspecUri = vscode.Uri.joinPath(workspaceRoot, "pubspec.yaml");

  try {
    const content = await vscode.workspace.fs.readFile(pubspecUri);
    return parsePubspecPackageName(Buffer.from(content).toString("utf8"));
  } catch {
    return undefined;
  }
}
