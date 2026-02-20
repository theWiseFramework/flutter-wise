import * as vscode from "vscode";
import { commandExists, execCmd, showToolMissing } from "../core/exec";
import { resolveAdbPath } from "../core/adbPath";

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

type AdbDevice = {
  serial: string;
  state: string;
  model?: string;
  details?: string;
};

const CMD_REFRESH = "flutterWise.devices.refresh";
const CMD_CONNECT = "flutterWise.devices.connect";
const CMD_CONNECT_IP = "flutterWise.devices.connect.ip";
const CMD_CONNECT_QR = "flutterWise.devices.connect.qr";
const CMD_CONNECT_PAIR = "flutterWise.devices.connect.pair";

type ConnectMethod = "ip" | "qr" | "pair";

export class FlutterWiseDevicesProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.kind === "group") {
      const item = new vscode.TreeItem(
        element.label,
        element.children.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = element.icon;
      return item;
    }

    const item = new vscode.TreeItem(element.label);
    item.description = element.description;
    item.iconPath = element.icon;
    item.command = element.command;
    item.contextValue = element.contextValue;
    return item;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (element?.kind === "group") {
      return element.children;
    }

    return this.buildRootNodes();
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  async promptConnectMethod(): Promise<void> {
    const adbReady = await this.ensureAdbReady(true);
    if (!adbReady) {
      return;
    }

    const method = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { method: ConnectMethod }
    >(
      [
        {
          label: "Connect by IP address",
          description: "Run adb connect <host:port>",
          method: "ip",
        },
        {
          label: "Connect by QR code",
          description: "Paste the Wireless debugging QR payload",
          method: "qr",
        },
        {
          label: "Connect by pairing code",
          description: "Run adb pair <host:port> <code>",
          method: "pair",
        },
      ],
      {
        title: "Connect Android Device",
        placeHolder: "Choose connection method",
      },
    );

    if (!method) {
      return;
    }

    switch (method.method) {
      case "ip":
        await this.connectByIpAddress();
        break;
      case "qr":
        await this.connectByQrPayload();
        break;
      case "pair":
        await this.connectByPairingCode();
        break;
      default:
        break;
    }

    this.refresh();
  }

  async connectByIpAddress(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    const endpoint = await vscode.window.showInputBox({
      title: "Connect Device by IP",
      prompt: "Enter device endpoint (example: 192.168.1.17:5555)",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Endpoint is required";
        }
        return null;
      },
    });
    if (!endpoint) {
      return;
    }

    await this.runAdbConnect(endpoint.trim());
  }

  async connectByPairingCode(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    const pairEndpoint = await vscode.window.showInputBox({
      title: "Pair Device",
      prompt: "Enter pairing endpoint (example: 192.168.1.17:42115)",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Pairing endpoint is required";
        }
        return null;
      },
    });
    if (!pairEndpoint) {
      return;
    }

    const pairingCode = await vscode.window.showInputBox({
      title: "Pair Device",
      prompt: "Enter pairing code from Android wireless debugging screen",
      password: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return "Pairing code is required";
        }
        return null;
      },
    });
    if (!pairingCode) {
      return;
    }

    const adb = await resolveAdbPath();

    const pairResult = await execCmd(adb!, [
      "pair",
      pairEndpoint.trim(),
      pairingCode.trim(),
    ]);
    if (pairResult.code !== 0) {
      const reason =
        this.cleanOutput(pairResult.stderr) ||
        this.cleanOutput(pairResult.stdout);
      vscode.window.showErrorMessage(
        `adb pair failed${reason ? `: ${reason}` : ""}`,
      );
      return;
    }

    const pairOutput =
      this.cleanOutput(pairResult.stdout) || "Pairing succeeded.";
    vscode.window.showInformationMessage(pairOutput);

    const suggestedHost = pairEndpoint.trim().split(":")[0];
    const connectEndpoint = await vscode.window.showInputBox({
      title: "Connect Device",
      prompt: "Enter connect endpoint (example: 192.168.1.17:5555)",
      value: suggestedHost ? `${suggestedHost}:5555` : "",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Connect endpoint is required";
        }
        return null;
      },
    });
    if (!connectEndpoint) {
      return;
    }

    await this.runAdbConnect(connectEndpoint.trim());
  }

  async connectByQrPayload(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    const payload = await vscode.window.showInputBox({
      title: "Connect by QR Code",
      prompt:
        "Paste QR payload (example: WIFI:T:ADB;S:192.168.1.17:42115;P:123456;;)",
      validateInput: (value) => {
        if (!value.trim()) {
          return "QR payload is required";
        }
        const parsed = this.parseQrPayload(value);
        if (!parsed) {
          return "Invalid QR payload format";
        }
        return null;
      },
    });
    if (!payload) {
      return;
    }

    const parsed = this.parseQrPayload(payload);
    if (!parsed) {
      vscode.window.showErrorMessage(
        "Unable to parse QR payload. Use format WIFI:T:ADB;S:<host:port>;P:<code>;;",
      );
      return;
    }

    const adb = await resolveAdbPath();

    const pairResult = await execCmd(adb!, [
      "pair",
      parsed.pairEndpoint,
      parsed.pairCode,
    ]);
    if (pairResult.code !== 0) {
      const reason =
        this.cleanOutput(pairResult.stderr) ||
        this.cleanOutput(pairResult.stdout);
      vscode.window.showErrorMessage(
        `adb pair failed${reason ? `: ${reason}` : ""}`,
      );
      return;
    }

    const pairOutput =
      this.cleanOutput(pairResult.stdout) || "Pairing succeeded.";
    vscode.window.showInformationMessage(pairOutput);
    await this.runAdbConnect(parsed.connectEndpoint);
  }

  private async buildRootNodes(): Promise<Node[]> {
    const adb = await resolveAdbPath();
    const adbExists = await commandExists(adb!);
    if (!adbExists) {
      return [
        {
          kind: "group",
          label: "ADB Status",
          icon: new vscode.ThemeIcon("warning"),
          children: [
            {
              kind: "action",
              label: "adb not found in PATH",
              description: "Install Android platform-tools",
              icon: new vscode.ThemeIcon("error"),
            },
          ],
        },
      ];
    }

    const startServer = await execCmd(adb!, ["start-server"]);
    const devicesResult = await execCmd(adb!, ["devices", "-l"]);
    const adbOk = startServer.code === 0 && devicesResult.code === 0;
    const devices = adbOk ? this.parseAdbDevices(devicesResult.stdout) : [];
    console.log("ADB State :", devices);

    return [
      {
        kind: "group",
        label: "ADB Status",
        icon: new vscode.ThemeIcon(adbOk ? "pass-filled" : "error"),
        children: [
          {
            kind: "action",
            label: adbOk ? "adb ready" : "adb failed",
            description: adbOk
              ? "Server reachable"
              : this.cleanOutput(startServer.stderr) ||
                this.cleanOutput(devicesResult.stderr) ||
                "Check adb setup and retry",
            icon: new vscode.ThemeIcon(adbOk ? "check" : "error"),
          },
        ],
      },
      {
        kind: "group",
        label: "Connected Devices",
        icon: new vscode.ThemeIcon("device-mobile"),
        children:
          devices.length > 0
            ? devices.map<Node>((device) => ({
                kind: "action",
                label: device.model ?? device.serial,
                description: device.details
                  ? `${device.state} · ${device.details}`
                  : device.state,
                icon: new vscode.ThemeIcon(
                  device.state === "device" ? "vm-active" : "warning",
                ),
              }))
            : [
                {
                  kind: "action",
                  label: "No connected devices",
                  description: "Enable USB debugging or wireless debugging",
                  icon: new vscode.ThemeIcon("circle-slash"),
                },
              ],
      },
      {
        kind: "group",
        label: "Connection",
        icon: new vscode.ThemeIcon("plug"),
        children: [
          {
            kind: "action",
            label: "Connect Device…",
            description: "IP address, QR code, or pairing code",
            icon: new vscode.ThemeIcon("add"),
            command: {
              command: CMD_CONNECT,
              title: "Connect Device",
            },
          },
          {
            kind: "action",
            label: "Connect by IP",
            icon: new vscode.ThemeIcon("globe"),
            command: {
              command: CMD_CONNECT_IP,
              title: "Connect by IP",
            },
          },
          {
            kind: "action",
            label: "Connect by QR",
            icon: new vscode.ThemeIcon("symbol-event"),
            command: {
              command: CMD_CONNECT_QR,
              title: "Connect by QR",
            },
          },
          {
            kind: "action",
            label: "Connect by Pairing Code",
            icon: new vscode.ThemeIcon("key"),
            command: {
              command: CMD_CONNECT_PAIR,
              title: "Connect by Pairing Code",
            },
          },
          {
            kind: "action",
            label: "Refresh",
            icon: new vscode.ThemeIcon("refresh"),
            command: {
              command: CMD_REFRESH,
              title: "Refresh Devices",
            },
          },
        ],
      },
    ];
  }

  private parseAdbDevices(stdout: string): AdbDevice[] {
    const devices: AdbDevice[] = [];

    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("List of devices attached")) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        continue;
      }

      const serial = parts[0];
      const state = parts[1];

      // Everything after state is key:value pairs
      const kvParts = parts.slice(2);

      const kv: Record<string, string> = {};
      for (const part of kvParts) {
        const [key, value] = part.split(":");
        if (key && value) {
          kv[key] = value;
        }
      }

      devices.push({
        serial,
        state,
        model: kv["model"] ?? undefined,
        details: kvParts.join(" ") || undefined,
      });
    }

    return devices;
  }

  private parseQrPayload(
    raw: string,
  ):
    | { pairEndpoint: string; pairCode: string; connectEndpoint: string }
    | undefined {
    const value = raw.trim();
    const serviceMatch = value.match(/(?:^|;)S:([^;]+)(?:;|$)/i);
    const codeMatch = value.match(/(?:^|;)P:([^;]+)(?:;|$)/i);
    if (!serviceMatch || !codeMatch) {
      return undefined;
    }

    const pairEndpoint = serviceMatch[1].trim();
    const pairCode = codeMatch[1].trim();
    if (!pairEndpoint || !pairCode) {
      return undefined;
    }

    const host = pairEndpoint.split(":")[0];
    const connectEndpoint = host ? `${host}:5555` : pairEndpoint;
    return { pairEndpoint, pairCode, connectEndpoint };
  }

  private async ensureAdbReady(showErrors: boolean): Promise<boolean> {
    const adb = await resolveAdbPath();
    const adbExists = await commandExists(adb!);
    if (!adbExists) {
      if (showErrors) {
        showToolMissing("adb");
      }
      return false;
    }

    const server = await execCmd(adb!, ["start-server"]);
    if (server.code !== 0) {
      if (showErrors) {
        const reason =
          this.cleanOutput(server.stderr) || this.cleanOutput(server.stdout);
        vscode.window.showErrorMessage(
          `Failed to start adb server${reason ? `: ${reason}` : ""}`,
        );
      }
      return false;
    }

    return true;
  }

  private async runAdbConnect(endpoint: string): Promise<void> {
    const adb = await resolveAdbPath();
    const result = await execCmd(adb!, ["connect", endpoint]);
    const output =
      this.cleanOutput(result.stdout) || this.cleanOutput(result.stderr);

    if (result.code !== 0) {
      vscode.window.showErrorMessage(
        `adb connect failed${output ? `: ${output}` : ""}`,
      );
      return;
    }

    vscode.window.showInformationMessage(output || `Connected to ${endpoint}.`);
  }

  private cleanOutput(value: string): string {
    return value.trim().replace(/\s+/g, " ");
  }
}

export function registerDevicesCommands(
  provider: FlutterWiseDevicesProvider,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CMD_REFRESH, () => provider.refresh()),
    vscode.commands.registerCommand(CMD_CONNECT, () =>
      provider.promptConnectMethod(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_IP, () =>
      provider.connectByIpAddress(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_QR, () =>
      provider.connectByQrPayload(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_PAIR, () =>
      provider.connectByPairingCode(),
    ),
  ];
}
