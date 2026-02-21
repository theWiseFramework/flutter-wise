import * as vscode from "vscode";
import { registerInitWorkspace } from "./init/initWorkspace";
import { registerUndoWorkspaceInit } from "./init/undoWorkspaceInit";
import { registerCreateModule } from "./templates/createModule";
import { FlutterWiseToolsWebviewProvider } from "./sidebar/tools/webviewProvider";
import { registerDevicesCommands } from "./sidebar/devices/commands";
import { FlutterWiseDevicesController } from "./sidebar/devices/controller";
import { FlutterWiseDevicesWebviewProvider } from "./sidebar/devices/webviewProvider";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerInitWorkspace());
  context.subscriptions.push(registerUndoWorkspaceInit());
  context.subscriptions.push(registerCreateModule());

  const devicesController = new FlutterWiseDevicesController();
  const devicesWebviewProvider = new FlutterWiseDevicesWebviewProvider(
    devicesController,
  );
  const toolsWebviewProvider = new FlutterWiseToolsWebviewProvider();

  context.subscriptions.push(
    devicesWebviewProvider,
    vscode.window.registerWebviewViewProvider(
      "flutterWiseDevicesView",
      devicesWebviewProvider,
    ),
  );
  context.subscriptions.push(...registerDevicesCommands(devicesController));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "flutterWiseToolsView",
      toolsWebviewProvider,
    ),
  );
}

export function deactivate() {}
