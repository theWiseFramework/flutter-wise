import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { resolveAdbPath } from "../../core/adbPath";
import { commandExists, execCmd, showToolMissing } from "../../core/exec";
import type {
  AdbDevice,
  ConnectMethod,
  DevicesQrPairingState,
  DevicesViewItem,
  DevicesViewModel,
  MdnsService,
} from "./types";

const ADB_TLS_PAIRING_SERVICE = "_adb-tls-pairing._tcp";
const ADB_TLS_CONNECT_SERVICE = "_adb-tls-connect._tcp";
const QR_SCAN_TIMEOUT_MS = 90_000;
const CONNECT_DISCOVERY_TIMEOUT_MS = 20_000;

type QrPairingSession = {
  cancelled: boolean;
};

export class FlutterWiseDevicesController {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private qrPairing?: DevicesQrPairingState;
  private qrSession?: QrPairingSession;

  refresh(): void {
    this.onDidChangeEmitter.fire();
  }

  cancelQrPairing(): void {
    if (this.qrSession) {
      this.qrSession.cancelled = true;
    }

    this.clearQrPairingState();
  }

  async getViewModel(): Promise<DevicesViewModel> {
    const adb = (await resolveAdbPath()) ?? "adb";
    const adbExists = await commandExists(adb);

    if (!adbExists) {
      return {
        sections: [
          {
            title: "ADB Status",
            items: [
              {
                kind: "status",
                label: "adb not found in PATH",
                description: "Install Android platform-tools",
                tone: "error",
              },
            ],
          },
        ],
      };
    }

    const startServer = await execCmd(adb, ["start-server"]);
    const devicesResult = await execCmd(adb, ["devices", "-l"]);
    const adbOk = startServer.code === 0 && devicesResult.code === 0;
    const devices = adbOk ? this.parseAdbDevices(devicesResult.stdout) : [];

    return {
      sections: [
        {
          title: "ADB Status",
          items: [
            {
              kind: "status",
              label: adbOk ? "adb ready" : "adb failed",
              description: adbOk
                ? "Server reachable"
                : this.cleanOutput(startServer.stderr) ||
                  this.cleanOutput(devicesResult.stderr) ||
                  "Check adb setup and retry",
              tone: adbOk ? "ok" : "error",
            },
          ],
        },
        {
          title: "Connected Devices",
          items:
            devices.length > 0
              ? devices.map<DevicesViewItem>((device) => ({
                  kind: "device",
                  label: device.model ?? device.serial,
                  description: device.details
                    ? `${device.state} · ${device.details}`
                    : device.state,
                  tone: device.state === "device" ? "ok" : "warning",
                }))
              : [
                  {
                    kind: "device",
                    label: "No connected devices",
                    description: "Enable USB debugging or wireless debugging",
                    tone: "neutral",
                  },
                ],
        },
        {
          title: "Connection",
          items: [
            {
              kind: "action",
              label: "Connect Device...",
              description: "IP address, QR code, or pairing code",
              tone: "neutral",
              actionId: "connect",
            },
            {
              kind: "action",
              label: "Connect by IP",
              tone: "neutral",
              actionId: "connectIp",
            },
            {
              kind: "action",
              label: "Connect by QR",
              tone: "neutral",
              actionId: "connectQr",
            },
            {
              kind: "action",
              label: "Connect by Pairing Code",
              tone: "neutral",
              actionId: "connectPair",
            },
            {
              kind: "action",
              label: "Refresh",
              tone: "neutral",
              actionId: "refresh",
            },
          ],
        },
      ],
      qrPairing: this.qrPairing ? { ...this.qrPairing } : undefined,
    };
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
          description: "Show QR code for Android Wireless debugging",
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
        await this.connectByQrCode();
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

    const adb = (await resolveAdbPath()) ?? "adb";
    const pairResult = await execCmd(adb, [
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

    const pairOutput = this.cleanOutput(pairResult.stdout) || "Pairing succeeded.";
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

  async connectByQrCode(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    if (this.qrSession) {
      this.cancelQrPairing();
    }

    const adb = (await resolveAdbPath()) ?? "adb";
    const pairServiceName = `studio-${this.randomFromAlphabet(8, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
    const pairCode = this.randomFromAlphabet(12, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    const payload = `WIFI:T:ADB;S:${pairServiceName};P:${pairCode};;`;

    const session: QrPairingSession = { cancelled: false };
    this.qrSession = session;
    this.setQrPairingState({
      payload,
      pairServiceName,
      pairCode,
      statusMessage:
        "Open Android Wireless debugging and scan this QR code to start pairing.",
    });

    try {
      const knownConnectEndpoints = new Set(
        (await this.listMdnsServices(adb))
          .filter((service) => service.serviceType.includes(ADB_TLS_CONNECT_SERVICE))
          .map((service) => service.endpoint),
      );

      const pairingEndpoint = await this.waitForPairingEndpoint(
        adb,
        pairServiceName,
        QR_SCAN_TIMEOUT_MS,
        () => !this.isQrSessionActive(session),
        (remainingSeconds) => {
          this.updateQrStatus(`Waiting for phone scan... ${remainingSeconds}s`);
        },
      );

      if (!this.isQrSessionActive(session)) {
        return;
      }

      if (!pairingEndpoint) {
        vscode.window.showWarningMessage(
          "QR pairing timed out. Scan the QR code again and retry.",
        );
        this.clearQrPairingState();
        return;
      }

      this.updateQrStatus("QR scan detected. Pairing with device...");

      const pairResult = await execCmd(adb, ["pair", pairingEndpoint, pairCode]);
      if (!this.isQrSessionActive(session)) {
        return;
      }

      if (pairResult.code !== 0) {
        const reason =
          this.cleanOutput(pairResult.stderr) ||
          this.cleanOutput(pairResult.stdout);
        vscode.window.showErrorMessage(
          `adb pair failed${reason ? `: ${reason}` : ""}`,
        );
        this.clearQrPairingState();
        return;
      }

      const pairOutput = this.cleanOutput(pairResult.stdout) || "Pairing succeeded.";
      vscode.window.showInformationMessage(pairOutput);

      this.updateQrStatus("Pairing successful. Waiting for connection endpoint...");

      const connectEndpoint = await this.waitForConnectEndpoint(
        adb,
        knownConnectEndpoints,
        CONNECT_DISCOVERY_TIMEOUT_MS,
        () => !this.isQrSessionActive(session),
      );

      if (!this.isQrSessionActive(session)) {
        return;
      }

      if (!connectEndpoint) {
        vscode.window.showInformationMessage(
          "Device paired. If it is not connected yet, tap Refresh or use Connect by IP.",
        );
        this.clearQrPairingState();
        this.refresh();
        return;
      }

      this.updateQrStatus(`Connecting to ${connectEndpoint}...`);
      await this.runAdbConnect(connectEndpoint);
      this.clearQrPairingState();
      this.refresh();
    } finally {
      if (this.qrSession === session) {
        this.qrSession = undefined;
      }
    }
  }

  private isQrSessionActive(session: QrPairingSession): boolean {
    return this.qrSession === session && !session.cancelled;
  }

  private setQrPairingState(state: DevicesQrPairingState): void {
    this.qrPairing = state;
    this.refresh();
  }

  private updateQrStatus(statusMessage: string): void {
    if (!this.qrPairing) {
      return;
    }

    this.qrPairing = {
      ...this.qrPairing,
      statusMessage,
    };
    this.refresh();
  }

  private clearQrPairingState(): void {
    this.qrPairing = undefined;
    this.refresh();
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

  private async waitForPairingEndpoint(
    adb: string,
    pairServiceName: string,
    timeoutMs: number,
    isCancelled: () => boolean,
    onTick: (remainingSeconds: number) => void,
  ): Promise<string | undefined> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (isCancelled()) {
        return undefined;
      }

      const elapsed = Date.now() - startedAt;
      const remainingSeconds = Math.ceil((timeoutMs - elapsed) / 1000);
      onTick(Math.max(0, remainingSeconds));

      const services = await this.listMdnsServices(adb);
      const pairingService = services.find(
        (service) =>
          service.instance === pairServiceName &&
          service.serviceType.includes(ADB_TLS_PAIRING_SERVICE),
      );

      if (pairingService) {
        return pairingService.endpoint;
      }

      await this.sleep(1000);
    }

    return undefined;
  }

  private async waitForConnectEndpoint(
    adb: string,
    knownConnectEndpoints: Set<string>,
    timeoutMs: number,
    isCancelled: () => boolean,
  ): Promise<string | undefined> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (isCancelled()) {
        return undefined;
      }

      const services = await this.listMdnsServices(adb);
      const connectServices = services.filter((service) =>
        service.serviceType.includes(ADB_TLS_CONNECT_SERVICE),
      );

      const freshService = connectServices.find(
        (service) => !knownConnectEndpoints.has(service.endpoint),
      );

      if (freshService) {
        return freshService.endpoint;
      }

      await this.sleep(1000);
    }

    if (isCancelled()) {
      return undefined;
    }

    const finalServices = await this.listMdnsServices(adb);
    const finalConnectServices = finalServices.filter((service) =>
      service.serviceType.includes(ADB_TLS_CONNECT_SERVICE),
    );

    if (finalConnectServices.length === 1) {
      return finalConnectServices[0].endpoint;
    }

    return undefined;
  }

  private async listMdnsServices(adb: string): Promise<MdnsService[]> {
    const result = await execCmd(adb, ["mdns", "services"]);
    if (result.code !== 0) {
      return [];
    }

    return this.parseMdnsServices(result.stdout);
  }

  private parseMdnsServices(stdout: string): MdnsService[] {
    const services: MdnsService[] = [];

    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 3) {
        continue;
      }

      const [instance, serviceType, endpoint] = parts;
      if (!instance || !serviceType || !endpoint) {
        continue;
      }

      services.push({ instance, serviceType, endpoint });
    }

    return services;
  }

  private randomFromAlphabet(length: number, alphabet: string): string {
    const bytes = randomBytes(length);
    let result = "";

    for (let i = 0; i < length; i += 1) {
      result += alphabet[bytes[i] % alphabet.length];
    }

    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async ensureAdbReady(showErrors: boolean): Promise<boolean> {
    const adb = (await resolveAdbPath()) ?? "adb";
    const adbExists = await commandExists(adb);

    if (!adbExists) {
      if (showErrors) {
        showToolMissing("adb");
      }
      return false;
    }

    const server = await execCmd(adb, ["start-server"]);
    if (server.code !== 0) {
      if (showErrors) {
        const reason = this.cleanOutput(server.stderr) || this.cleanOutput(server.stdout);
        vscode.window.showErrorMessage(
          `Failed to start adb server${reason ? `: ${reason}` : ""}`,
        );
      }
      return false;
    }

    return true;
  }

  private async runAdbConnect(endpoint: string): Promise<void> {
    const adb = (await resolveAdbPath()) ?? "adb";
    const result = await execCmd(adb, ["connect", endpoint]);
    const output = this.cleanOutput(result.stdout) || this.cleanOutput(result.stderr);

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
