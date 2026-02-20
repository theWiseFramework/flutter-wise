import * as vscode from "vscode";
import * as path from "path";
import { getPubspecPackageName } from "../core/pubspec";

const CMD = "flutterWise.createModule";

function toPascalCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

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

    const packageName = (await getPubspecPackageName(folder.uri)) ?? "app";
    const moduleDir = vscode.Uri.joinPath(targetUri, name);

    // Create basic module structure (you can expand to MVC later)
    await vscode.workspace.fs.createDirectory(moduleDir);
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(moduleDir, "model"),
    );
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(moduleDir, "controller"),
    );
    const viewDir = vscode.Uri.joinPath(moduleDir, "view");
    await vscode.workspace.fs.createDirectory(viewDir);
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(viewDir, "pages"),
    );
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(viewDir, "widgets"),
    );

    const modelName = `${toPascalCase(name)}Model`;
    const controllerName = `${toPascalCase(name)}Controller`;

    const modelFile = vscode.Uri.joinPath(moduleDir, "model", `${name}_model.dart`);
    const modelContent = `class ${modelName} {
  final String title;

  const ${modelName}({required this.title});
}
`;
    await vscode.workspace.fs.writeFile(
      modelFile,
      Buffer.from(modelContent, "utf8"),
    );

    const controllerFile = vscode.Uri.joinPath(
      moduleDir,
      "controller",
      `${name}_ctrl.dart`,
    );
    const controllerContent = `import '../model/${name}_model.dart';

class ${controllerName} {
  ${modelName} get initialData => const ${modelName}(title: '${toPascalCase(name)}');
}
`;
    await vscode.workspace.fs.writeFile(
      controllerFile,
      Buffer.from(controllerContent, "utf8"),
    );

    const routesFile = vscode.Uri.joinPath(moduleDir, "routes.dart");
    const pageName = `${toPascalCase(name)}Page`;
    const routesContent = `import 'package:${packageName}/common.dart';

GoRoute ${name}Routes([GlobalKey<NavigatorState>? parentNavigatorKey]) {
  return GoRoute(
    path: ${pageName}.path,
    builder: (context, state) {
      return const ${pageName}();
    },
    routes: [
   
    ],
  );
}
`;
    await vscode.workspace.fs.writeFile(
      routesFile,
      Buffer.from(routesContent, "utf8"),
    );

    const pageFile = vscode.Uri.joinPath(viewDir, "pages", `${name}_page.dart`);
    const pageContent = `import 'package:${packageName}/common.dart';

class ${pageName} extends StatelessWidget {
  static const path = '/${name}';

  const ${pageName}({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('${pageName}'),
      ),
    );
  }
}
`;
    await vscode.workspace.fs.writeFile(
      pageFile,
      Buffer.from(pageContent, "utf8"),
    );

    // Example entry file
    const indexFile = vscode.Uri.joinPath(moduleDir, `${name}.dart`);
    const content = `
export 'model/${name}_model.dart';
export 'controller/${name}_ctrl.dart';
export 'view/pages/${name}_page.dart';
export 'routes.dart';
`;
    await vscode.workspace.fs.writeFile(
      indexFile,
      Buffer.from(content, "utf8"),
    );

    const modulesBarrelFile = vscode.Uri.joinPath(targetUri, "modules.dart");
    const exportLine = `export '${name}/${name}.dart';`;
    let modulesBarrelContent = "";

    try {
      const existing = await vscode.workspace.fs.readFile(modulesBarrelFile);
      modulesBarrelContent = Buffer.from(existing).toString("utf8");
    } catch {
      modulesBarrelContent = "";
    }

    const hasExport = modulesBarrelContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(exportLine);

    if (!hasExport) {
      const nextContent = modulesBarrelContent.trim().length
        ? `${modulesBarrelContent.replace(/\s*$/, "\n")}${exportLine}\n`
        : `${exportLine}\n`;
      await vscode.workspace.fs.writeFile(
        modulesBarrelFile,
        Buffer.from(nextContent, "utf8"),
      );
    }

    vscode.window.showInformationMessage(`Module created: lib/modules/${name}`);
  });
}
