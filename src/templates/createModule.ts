import * as vscode from "vscode";
import * as path from "path";

const CMD = "flutterWise.createModule";

export function registerCreateModule(): vscode.Disposable {
  return vscode.commands.registerCommand(CMD, async (uri?: vscode.Uri) => {
    // In Explorer context menus, VS Code passes the clicked resource URI
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
      vscode.window.showErrorMessage("No folder selected.");
      return;
    }

    // Ensure it’s a folder
    const stat = await vscode.workspace.fs.stat(targetUri);
    if (stat.type !== vscode.FileType.Directory) {
      vscode.window.showErrorMessage("Please right-click a folder.");
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(targetUri);
    if (!folder) {
      vscode.window.showErrorMessage(
        "Selected folder is not inside a workspace.",
      );
      return;
    }

    // ✅ Enforce: must be exactly <workspace>/lib/modules
    const workspaceRoot = folder.uri.fsPath;
    const normalizedTarget = path.normalize(targetUri.fsPath);
    const expected = path.normalize(path.join(workspaceRoot, "lib", "modules"));

    if (normalizedTarget !== expected) {
      vscode.window.showWarningMessage(
        "This command is only available for the lib/modules folder.",
      );
      return;
    }

    // Ask for module name
    const name = await vscode.window.showInputBox({
      title: "Create Module",
      prompt: "Module name (snake_case recommended)",
      validateInput: (v) => {
        if (!v.trim()) {
          return "Module name is required";
        }
        if (!/^[a-z0-9_]+$/.test(v.trim())) {
          return "Use lowercase letters, numbers, underscores";
        }
        return null;
      },
    });

    if (!name) {
      return;
    }

    const moduleDir = vscode.Uri.joinPath(targetUri, name);

    // Create basic module structure (you can expand to MVC later)
    await vscode.workspace.fs.createDirectory(moduleDir);
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(moduleDir, "model"),
    );
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(moduleDir, "controller"),
    );
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(moduleDir, "view"),
    );

    // Example entry file
    const indexFile = vscode.Uri.joinPath(moduleDir, `${name}.dart`);
    const content = `// ${name} module\n\nlibrary ${name};\n`;
    await vscode.workspace.fs.writeFile(
      indexFile,
      Buffer.from(content, "utf8"),
    );

    const routesFile = vscode.Uri.joinPath(moduleDir, "routes.dart");
    await vscode.workspace.fs.writeFile(
      routesFile,
      Buffer.from(content, "utf8"),
    );

    vscode.window.showInformationMessage(`Module created: lib/modules/${name}`);
  });
}
