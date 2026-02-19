import * as vscode from "vscode";
import {
  RECOMMENDED_FILES_EXCLUDE,
  RECOMMENDED_SEARCH_EXCLUDE,
} from "./recommendedExcludes";
import { addKeysToWorkspaceObjectSetting, mapKeys } from "../core/settings";

const COMMAND_ID = "flutterWise.initWorkspace";

export function registerInitWorkspace(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_ID, async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];

    if (!folder) {
      vscode.window.showErrorMessage(
        "Open a folder/workspace first, then run Flutter Wise: Initialize Workspace.",
      );
      return;
    }

    const cfg = vscode.workspace.getConfiguration("flutterWise", folder.uri);

    const autoExclude =
      cfg.get<boolean>("autoExcludeGeneratedFiles", true) ?? true;
    const already = cfg.get<boolean>("initialized", false) === true;

    if (already) {
      const choice = await vscode.window.showInformationMessage(
        "Flutter Wise is already Setup",
        "Re-apply",
        "Cancel",
      );
      if (choice !== "Re-apply") {
        return;
      }
    }

    const appliedFilesExcludeKey = "appliedFilesExclude";
    const appliedSearchExcludeKey = "appliedSearchExclude";

    const previouslyAppliedFiles =
      cfg.get<string[]>(appliedFilesExcludeKey, []) ?? [];
    const previouslyAppliedSearch =
      cfg.get<string[]>(appliedSearchExcludeKey, []) ?? [];

    let addedFiles: string[] = [];
    let addedSearch: string[] = [];

    if (autoExclude) {
      addedFiles = await addKeysToWorkspaceObjectSetting({
        scopeUri: folder.uri,
        section: "files",
        key: "exclude",
        add: RECOMMENDED_FILES_EXCLUDE,
      });

      addedSearch = await addKeysToWorkspaceObjectSetting({
        scopeUri: folder.uri,
        section: "search",
        key: "exclude",
        add: RECOMMENDED_SEARCH_EXCLUDE,
      });
    }

    // Track what we applied (union)
    const nextAppliedFiles = Array.from(
      new Set([
        ...previouslyAppliedFiles,
        ...addedFiles,
        ...mapKeys(RECOMMENDED_FILES_EXCLUDE),
      ]),
    );

    const nextAppliedSearch = Array.from(
      new Set([
        ...previouslyAppliedSearch,
        ...addedSearch,
        ...mapKeys(RECOMMENDED_SEARCH_EXCLUDE),
      ]),
    );

    // Store state in workspace folder settings
    await cfg.update(
      "initialized",
      true,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await cfg.update(
      appliedFilesExcludeKey,
      nextAppliedFiles,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await cfg.update(
      appliedSearchExcludeKey,
      nextAppliedSearch,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );

    // UI context (optional)
    await vscode.commands.executeCommand(
      "setContext",
      "flutterWise.initialized",
      true,
    );

    const useIconTheme = cfg.get<boolean>("useIconTheme", true) ?? true;
    const preferredIconThemeId =
      cfg.get<string>("preferredIconThemeId", "flutter-wise-icons") ??
      "flutter-wise-icons";

    const wb = vscode.workspace.getConfiguration("workbench", folder.uri);

    // Apply icon theme if enabled and not already set to ours
    if (useIconTheme) {
      const currentIconTheme = wb.get<string>("iconTheme");
      if (currentIconTheme !== preferredIconThemeId) {
        await wb.update(
          "iconTheme",
          preferredIconThemeId,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
      }
    }

    vscode.window.showInformationMessage("Flutter Wise initialized.");
  });
}
