import * as vscode from "vscode";
import type { DevicesActionId } from "./types";
import { FlutterWiseDevicesController } from "./controller";

export const CMD_REFRESH = "flutterWise.devices.refresh";
export const CMD_CONNECT = "flutterWise.devices.connect";
export const CMD_CONNECT_IP = "flutterWise.devices.connect.ip";
export const CMD_CONNECT_QR = "flutterWise.devices.connect.qr";
export const CMD_CONNECT_PAIR = "flutterWise.devices.connect.pair";

export const actionToCommand: Record<DevicesActionId, string> = {
  refresh: CMD_REFRESH,
  connect: CMD_CONNECT,
  connectIp: CMD_CONNECT_IP,
  connectQr: CMD_CONNECT_QR,
  connectPair: CMD_CONNECT_PAIR,
};

export function registerDevicesCommands(
  controller: FlutterWiseDevicesController,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CMD_REFRESH, () => controller.refresh()),
    vscode.commands.registerCommand(CMD_CONNECT, () =>
      controller.promptConnectMethod(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_IP, () =>
      controller.connectByIpAddress(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_QR, () =>
      controller.connectByQrCode(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_PAIR, () =>
      controller.connectByPairingCode(),
    ),
  ];
}
