import * as vscode from "vscode";
import { registerInitWorkspace } from "./init/initWorkspace";
import { registerUndoWorkspaceInit } from "./init/undoWorkspaceInit";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerInitWorkspace());
  context.subscriptions.push(registerUndoWorkspaceInit());
}

export function deactivate() {}
