import * as vscode from "vscode";
import { registerInitWorkspace } from "./init/initWorkspace";
import { registerUndoWorkspaceInit } from "./init/undoWorkspaceInit";
import { registerCreateModule } from "./templates/createModule";
import { FlutterWiseToolsProvider } from "./sidebar/toolsView";
import {
  FlutterWiseDevicesProvider,
  registerDevicesCommands,
} from "./sidebar/devicesView";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerInitWorkspace());
  context.subscriptions.push(registerUndoWorkspaceInit());
  context.subscriptions.push(registerCreateModule());

  const devicesProvider = new FlutterWiseDevicesProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "flutterWiseDevicesView",
      devicesProvider,
    ),
  );
  context.subscriptions.push(...registerDevicesCommands(devicesProvider));

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "flutterWiseToolsView",
      new FlutterWiseToolsProvider(),
    ),
  );
}

export function deactivate() {}
