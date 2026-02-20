# Flutter Wise

<p align="center">
  <img src="https://raw.githubusercontent.com/theWiseFramework/flutter-wise/refs/heads/main/assets/product/logo.png" alt="Flutter Wise Logo" width="180" />
</p>

Flutter Wise is a VS Code extension for Flutter teams that combines:

- workspace setup automation
- module scaffolding for a `lib/modules` architecture
- Android device discovery and wireless ADB pairing tools
- custom Flutter-focused file icons and dark theme

## Features

### 1. Workspace Setup (and Undo)

Run `Flutter Wise: Setup Workspace` to:

- apply recommended `files.exclude` and `search.exclude` patterns for Flutter projects
- mark the workspace as initialized
- switch to the Flutter Wise icon theme (configurable)
- store your previous icon theme so it can be restored later

Run `Flutter Wise: Undo Workspace Setup` to remove only the patterns and icon-theme changes added by Flutter Wise.

### 2. Create Flutter Module

Right-click `lib/modules` and run `Flutter Wise: Create Flutter Module`.

This creates a module with starter files:

- `model/<name>_model.dart`
- `controller/<name>_ctrl.dart`
- `view/pages/<name>_page.dart`
- `routes.dart`
- `<name>.dart` barrel

It also appends an export entry to `lib/modules/modules.dart` when missing.

### 3. Devices Sidebar (ADB)

In the **Flutter Wise** activity bar container, the **Devices** view provides:

- ADB status checks
- connected device list
- connection actions:
  - Connect by IP
  - Connect by pairing code
  - Connect by QR (Wireless Debugging flow)
  - Refresh

The QR flow opens a webview QR panel, waits for mDNS pairing discovery, pairs with `adb pair`, and attempts automatic `adb connect`.

### 4. Theme and Icon Theme

Flutter Wise still ships with:

- `Flutter Wise Dark Theme`
- `Flutter Wise Icons`

You can use these independently, or let workspace setup apply the icon theme automatically.

## Commands

- `Flutter Wise: Setup Workspace`
- `Flutter Wise: Undo Workspace Setup`
- `Flutter Wise: Create Flutter Module`
- `Flutter Wise: Refresh Devices`
- `Flutter Wise: Connect Device`
- `Flutter Wise: Connect Device by IP`
- `Flutter Wise: Connect Device by QR`
- `Flutter Wise: Connect Device by Pairing Code`

## Requirements

- VS Code `1.109.0` or newer
- Flutter project/workspace
- Android platform-tools (`adb`) installed for device features

`adb` is resolved from:

1. `ANDROID_SDK_ROOT` / `ANDROID_HOME`
2. VS Code settings: `android.androidSdkPath` or `flutter.androidSdkPath`
3. macOS default: `~/Library/Android/sdk`
4. PATH fallback (`adb`)

## Extension Settings

- `flutterWise.autoExcludeGeneratedFiles` (default: `true`)
- `flutterWise.useIconTheme` (default: `true`)
- `flutterWise.preferredIconThemeId` (default: `flutter-wise-icons`)

State-tracking settings used internally:

- `flutterWise.initialized`
- `flutterWise.appliedFilesExclude`
- `flutterWise.appliedSearchExclude`
- `flutterWise.previousIconTheme`

## Installation

### Visual Studio Marketplace

1. Open **Extensions** in VS Code.
2. Search for `Flutter Wise`.
3. Click **Install**.

### Open VSX

1. Open extensions in your Open VSX-based editor (for example, VSCodium).
2. Search for `Flutter Wise`.
3. Click **Install**.

## Notes

- The module creation command is intentionally limited to `lib/modules`.
- A **Shortcuts** sidebar exists and is currently marked as coming soon.

## License

MIT (see `LICENSE`).
