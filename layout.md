flutter/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ .vscode/
│  ├─ launch.json
│  └─ tasks.json
├─ src/
│  ├─ extension.ts                 # activation + command registration
│  ├─ core/
│  │  ├─ commands.ts               # central command IDs + register helpers
│  │  ├─ context.ts                # workspace detection + context keys
│  │  ├─ settings.ts               # read/write workspace settings
│  │  ├─ fs.ts                     # file ops helpers (mkdirp, writeFileSafe)
│  │  ├─ terminal.ts               # run flutter/adb commands in terminal
│  │  └─ logger.ts                 # output channel + debug logging
│  ├─ init/
│  │  ├─ initWorkspace.ts          # Flutter: Initialize Workspace command
│  │  └─ recommendedSettings.ts    # excludes + default settings payload
│  ├─ templates/
│  │  ├─ createFeature.ts          # feature -> mvc scaffolding command
│  │  ├─ templateEngine.ts         # render templates, variables, naming
│  │  └─ builtins/
│  │     └─ feature-mvc/           # your baked-in template
│  │        ├─ controller.dart.tpl
│  │        ├─ model.dart.tpl
│  │        ├─ view.dart.tpl
│  │        └─ README.md.tpl
│  ├─ flutter/
│  │  ├─ detect.ts                 # isFlutterWorkspace (pubspec.yaml)
│  │  ├─ toolchain.ts              # locate flutter, dart, adb; sanity checks
│  │  ├─ run.ts                    # spawn flutter commands (clean/pub get/etc)
│  │  └─ pubspec/
│  │     ├─ pubspecCodelens.ts     # codelens/actions in pubspec.yaml
│  │     └─ pubspecCustomEditor.ts # (optional) fancy UI editor
│  ├─ logs/
│  │  ├─ flutterLogs.ts            # capture + parse flutter logs
│  │  ├─ parser.ts                 # regex rules, levels, tags
│  │  └─ webview/
│  │     ├─ panel.ts               # webview panel (filter/search)
│  │     └─ ui/                    # web assets (built/packed)
│  ├─ adb/
│  │  ├─ pair.ts                   # adb pair/connect helpers
│  │  ├─ devices.ts                # list devices, status
│  │  └─ qrWebview.ts              # (optional) QR scan UI
│  └─ ui/
│     ├─ statusBar.ts              # status bar buttons (flutter clean, etc.)
│     └─ treeViews/                # optional sidebars
├─ assets/
│  ├─ icons/                       # file icon theme svgs/pngs
│  ├─ product-icons/               # UI icons (optional)
│  └─ images/                      # README screenshots, banners
└─ themes/
   ├─ flutter-light.json
   ├─ flutter-dark.json            # optional
   └─ flutter-icon-theme.json