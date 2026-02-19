import * as vscode from "vscode";
import { removeKeysFromWorkspaceObjectSetting } from "../core/settings";

const CMD_UNDO = "flutterWise.undoWorkspaceInit";

export function registerUndoWorkspaceInit(): vscode.Disposable {
  return vscode.commands.registerCommand(CMD_UNDO, async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage("Open a folder/workspace first.");
      return;
    }

    const cfg = vscode.workspace.getConfiguration("flutterWise", folder.uri);

    const appliedFiles = cfg.get<string[]>("appliedFilesExclude", []) ?? [];
    const appliedSearch = cfg.get<string[]>("appliedSearchExclude", []) ?? [];

    if (appliedFiles.length === 0 && appliedSearch.length === 0) {
      vscode.window.showInformationMessage(
        "Nothing to undo: Flutter Wise has no recorded excludes for this workspace.",
      );
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      "Undo Flutter Wise initialization? This removes only Flutter Wise exclude patterns from workspace settings.",
      "Undo",
      "Cancel",
    );
    if (choice !== "Undo") {
      return;
    }

    const removedFiles = await removeKeysFromWorkspaceObjectSetting({
      scopeUri: folder.uri,
      section: "files",
      key: "exclude",
      removeGlobs: appliedFiles,
    });

    const removedSearch = await removeKeysFromWorkspaceObjectSetting({
      scopeUri: folder.uri,
      section: "search",
      key: "exclude",
      removeGlobs: appliedSearch,
    });

    // Reset Flutter Wise state
    await cfg.update(
      "initialized",
      false,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await cfg.update(
      "appliedFilesExclude",
      [],
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await cfg.update(
      "appliedSearchExclude",
      [],
      vscode.ConfigurationTarget.WorkspaceFolder,
    );

    await vscode.commands.executeCommand(
      "setContext",
      "flutterWise.initialized",
      false,
    );

    vscode.window.showInformationMessage(
      `Undo complete. Removed ${removedFiles} files.exclude + ${removedSearch} search.exclude patterns.`,
    );
  });
}
