import * as vscode from "vscode";
import { registerInitWorkspace } from "./init/initWorkspace";
import { registerUndoWorkspaceInit } from "./init/undoWorkspaceInit";
import { registerCreateModule } from "./templates/createModule";
import { FlutterWiseToolsProvider } from "./sidebar/toolsView";
import { FlutterWiseAvdProvider } from "./sidebar/avdView";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerInitWorkspace());
  context.subscriptions.push(registerUndoWorkspaceInit());
  context.subscriptions.push(registerCreateModule());

  // AVD
  const avdProvider = new FlutterWiseAvdProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("flutterWiseAvdView", avdProvider),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "flutterWiseToolsView",
      new FlutterWiseToolsProvider(),
    ),
  );
}

export function deactivate() {}
