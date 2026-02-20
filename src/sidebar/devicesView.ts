import * as vscode from "vscode";
import { execCmd, showToolMissing } from "../core/exec";

type Node =
  | { kind: "group"; label: string; icon: vscode.ThemeIcon; children: Node[] }
  | {
      kind: "action";
      label: string;
      description?: string;
      icon: vscode.ThemeIcon;
      command?: vscode.Command;
      contextValue?: string;
    };

export class FlutterWiseDevicesProvider implements vscode.TreeDataProvider<Node> {
  getTreeItem(element: Node): vscode.TreeItem | Thenable<vscode.TreeItem> {
      throw new Error("Method not implemented.");
  }
  getChildren(element?: Node | undefined): vscode.ProviderResult<Node[]> {
      throw new Error("Method not implemented.");
  }
  getParent?(element: Node): vscode.ProviderResult<Node> {
      throw new Error("Method not implemented.");
  }
  resolveTreeItem?(item: vscode.TreeItem, element: Node, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
      throw new Error("Method not implemented.");
  }
  private _onDidChangeTreeData = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }


}
