import * as vscode from "vscode";

type Node = { label: string; description?: string; icon: vscode.ThemeIcon };

export class FlutterWiseToolsProvider implements vscode.TreeDataProvider<Node> {
  getTreeItem(element: Node): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label);
    item.description = element.description;
    item.iconPath = element.icon;
    return item;
  }

  getChildren(): Node[] {
    return [
      {
        label: "Shortcuts (coming soon)",
        description: "flutter clean, pub get, build, run…",
        icon: new vscode.ThemeIcon("tools"),
      },
    ];
  }
}
