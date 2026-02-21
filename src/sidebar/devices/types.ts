export type ConnectMethod = "ip" | "qr" | "pair";

export type DevicesActionId =
  | "refresh"
  | "connect"
  | "connectIp"
  | "connectQr"
  | "connectPair";

export type DevicesTone = "neutral" | "ok" | "warning" | "error";

export type DevicesItemKind = "status" | "device" | "action";

export type AdbDevice = {
  serial: string;
  state: string;
  model?: string;
  details?: string;
};

export type MdnsService = {
  instance: string;
  serviceType: string;
  endpoint: string;
};

export type DevicesViewItem = {
  kind: DevicesItemKind;
  label: string;
  description?: string;
  tone: DevicesTone;
  actionId?: DevicesActionId;
};

export type DevicesViewSection = {
  title: string;
  items: DevicesViewItem[];
};

export type DevicesQrPairingState = {
  payload: string;
  pairServiceName: string;
  pairCode: string;
  statusMessage: string;
};

export type DevicesViewModel = {
  sections: DevicesViewSection[];
  qrPairing?: DevicesQrPairingState;
};

export type DevicesWebviewMessage =
  | { type: "ready" }
  | { type: "action"; action: DevicesActionId }
  | { type: "cancelQr" };
