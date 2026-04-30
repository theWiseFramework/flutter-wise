import * as vscode from "vscode";
import { execCmd, fileExists } from "../../core/exec";
import { resolveFlutterPath } from "../../core/flutterPath";
import * as path from "node:path";

export const CMD_FLUTTER_CLEAN = "flutterWise.shortcuts.flutterClean";
export const CMD_PUB_GET = "flutterWise.shortcuts.pubGet";
export const CMD_PUB_CACHE_REPAIR = "flutterWise.shortcuts.pubCacheRepair";
export const CMD_FLUTTER_BUILD = "flutterWise.shortcuts.flutterBuild";
export const CMD_FLUTTER_DOCTOR = "flutterWise.shortcuts.flutterDoctor";
export const CMD_DART_RESTART = "flutterWise.shortcuts.dartRestartAnalysis";

function getOutputChannel(): vscode.OutputChannel {
  let ch = vscode.window.createOutputChannel("Flutter Wise");
  return ch;
}

async function findProjectRoot(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;

  const tryFind = async (startPath: string | undefined) => {
    if (!startPath) {
      return undefined;
    }
    // Start from a directory. If a file path is provided, use its dirname.
    let dir = path.extname(startPath) ? path.dirname(startPath) : startPath;
    while (true) {
      const candidate = path.join(dir, "pubspec.yaml");
      if (await fileExists(candidate)) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    return undefined;
  };

  const candidates = new Set<string>();

  // Try active editor
  if (editor?.document?.uri?.fsPath) {
    const found = await tryFind(editor.document.uri.fsPath);
    if (found) {
      candidates.add(found);
    }
  }

  // Try workspace folders
  const wfs = vscode.workspace.workspaceFolders ?? [];
  for (const f of wfs) {
    const found = await tryFind(f.uri.fsPath);
    if (found) {
      candidates.add(found);
    }
  }

  // If there are candidate project roots, ask when multiple
  const roots = Array.from(candidates.values());
  if (roots.length === 1) {
    return roots[0];
  }
  if (roots.length > 1) {
    const pick = await vscode.window.showQuickPick(
      roots.map((r) => ({ label: path.basename(r) || r, description: r })),
      { placeHolder: "Select Flutter project to run command from" },
    );
    return pick?.description;
  }

  // No pubspec found — if single workspace folder, use it; if multiple, prompt to choose one
  if (wfs.length === 1) {
    return wfs[0].uri.fsPath;
  }
  if (wfs.length > 1) {
    const pick = await vscode.window.showQuickPick(
      wfs.map((f) => ({
        label: f.name || path.basename(f.uri.fsPath),
        description: f.uri.fsPath,
      })),
      { placeHolder: "Select workspace folder to run command from" },
    );
    return pick?.description;
  }

  return undefined;
}

async function runFlutter(args: string[]) {
  const out = getOutputChannel();
  out.show(true);

  const flutter = await resolveFlutterPath();
  const cwd = await findProjectRoot();
  out.appendLine(
    `> ${[flutter, ...args].join(" ")}  (cwd: ${cwd ?? process.cwd()})`,
  );
  const res = await execCmd(flutter, args, cwd);
  if (res.stdout) {
    out.appendLine(res.stdout.trim());
  }
  if (res.stderr) {
    out.appendLine(res.stderr.trim());
  }

  if (res.code !== 0) {
    vscode.window.showErrorMessage(
      `Flutter Wise: command failed (exit ${res.code}). See output for details.`,
    );
  } else {
    vscode.window.showInformationMessage(`Flutter Wise: command finished.`);
  }
}

export function registerToolsCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CMD_FLUTTER_CLEAN, async () =>
      runFlutter(["clean"]),
    ),
    vscode.commands.registerCommand(CMD_PUB_GET, async () =>
      runFlutter(["pub", "get"]),
    ),
    vscode.commands.registerCommand(CMD_PUB_CACHE_REPAIR, async () =>
      runFlutter(["pub", "cache", "repair"]),
    ),
    vscode.commands.registerCommand(CMD_FLUTTER_BUILD, async () =>
      runFlutter(["build"]),
    ),
    vscode.commands.registerCommand(CMD_FLUTTER_DOCTOR, async () =>
      runFlutter(["doctor"]),
    ),
    vscode.commands.registerCommand(CMD_DART_RESTART, async () => {
      const cmds = await vscode.commands.getCommands(true);
      if (cmds.includes("dart.restartAnalysisServer")) {
        try {
          await vscode.commands.executeCommand("dart.restartAnalysisServer");
          vscode.window.showInformationMessage("Dart: Restart Analysis Server executed.");
        } catch (e) {
          vscode.window.showErrorMessage("Failed to execute Dart restart command.");
        }
      } else {
        vscode.window.showWarningMessage("Dart extension command not available. Install/enable the Dart extension.");
      }
    }),
  ];
}
