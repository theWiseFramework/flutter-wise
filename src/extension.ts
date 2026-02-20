import * as vscode from "vscode";
import { registerInitWorkspace } from "./init/initWorkspace";
import { registerUndoWorkspaceInit } from "./init/undoWorkspaceInit";
import { registerCreateModule } from "./templates/createModule";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerInitWorkspace());
  context.subscriptions.push(registerUndoWorkspaceInit());
  context.subscriptions.push(registerCreateModule());
}

export function deactivate() {}
