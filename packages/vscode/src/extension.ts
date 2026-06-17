import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
// Wire-format diagnostic produced inside the JSON envelope by every `twf`
// subcommand. Generated from the Go DTO layer (envelope.Diagnostic) and shared
// via the @temporal-architect/wire-types package; consumed type-only (the
// import is erased at compile time, so it adds no runtime dependency).
import type { Diagnostic as TwfDiagnostic } from "@temporal-architect/wire-types";

const execFileAsync = promisify(execFile);
const copyFileAsync = promisify(fs.copyFile);

let client: LanguageClient | undefined;
// Track the last active text editor for returning focus after webview clicks
let lastActiveTextEditor: vscode.TextEditor | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Add bundled bin/ to terminal PATH so `twf` is available to users and AI agents
  setupTerminalPath(context);

  // Symlink bundled `twf` into ~/.local/bin so AI agent shells (which don't
  // inherit the integrated terminal's PATH) can resolve it without `go install`
  linkTwfOnPath(context);

  // Install bundled skills to ~/.cursor/skills/
  installSkills(context);

  // Start LSP client (uses bundled binary by default)
  startLanguageClient(context);

  // Track the last active text editor (before webview takes focus)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        lastActiveTextEditor = editor;
      }
    })
  );

  // Register install skills command
  const installSkillsCommand = vscode.commands.registerCommand(
    "twf.installSkills",
    async () => {
      try {
        await installSkills(context);
        const cursorSkillsDir = path.join(os.homedir(), ".cursor", "skills");
        vscode.window.showInformationMessage(
          `Temporal Architect skills installed to ${cursorSkillsDir}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to install skills: ${msg}`);
      }
    }
  );
  context.subscriptions.push(installSkillsCommand);

  // Register visualize file command
  const visualizeCommand = vscode.commands.registerCommand(
    "twf.visualize",
    async (uri?: vscode.Uri) => {
      // If called from explorer context menu, use the URI
      if (uri) {
        await WorkflowVisualizerPanel.createOrShowForFile(context.extensionUri, uri.fsPath);
        return;
      }

      // Otherwise use active editor
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "twf") {
        vscode.window.showWarningMessage("Please open a .twf file to visualize");
        return;
      }
      await WorkflowVisualizerPanel.createOrShowForFile(context.extensionUri, editor.document.uri.fsPath);
    }
  );

  // Register visualize folder command
  const visualizeFolderCommand = vscode.commands.registerCommand(
    "twf.visualizeFolder",
    async (uri?: vscode.Uri) => {
      let folderPath: string | undefined;

      if (uri) {
        folderPath = uri.fsPath;
      } else {
        // Prompt user to select a folder
        const folders = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          title: "Select folder containing .twf files",
        });
        if (folders && folders.length > 0) {
          folderPath = folders[0].fsPath;
        }
      }

      if (!folderPath) {
        return;
      }

      // Find all .twf files in the folder
      const pattern = new vscode.RelativePattern(folderPath, "**/*.twf");
      const uris = await vscode.workspace.findFiles(pattern);

      if (uris.length === 0) {
        vscode.window.showWarningMessage("No .twf files found in the selected folder");
        return;
      }

      const files = uris.map((u) => u.fsPath);
      // No focused file - show all workflows. _setFiles canonicalizes + dedupes.
      await WorkflowVisualizerPanel.createOrShowForFolder(context.extensionUri, folderPath, files, undefined);
    }
  );

  context.subscriptions.push(visualizeCommand);
  context.subscriptions.push(visualizeFolderCommand);

  // Watch for document changes to update visualization
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "twf") {
        WorkflowVisualizerPanel.refreshIfVisible();
      }
    })
  );

  // Watch for active editor changes to update focused file
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === "twf") {
        WorkflowVisualizerPanel.updateFocusedFile(editor.document.uri.fsPath);
      }
    })
  );
}

/**
 * Resolve the path to the twf binary.
 * Priority: user config > bundled binary > system PATH.
 */
function resolveTwfBinary(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration("twf.lsp");
  const configPath = config.get<string>("path", "");
  if (configPath) {
    return configPath;
  }

  // Check for bundled binary
  const ext = process.platform === "win32" ? ".exe" : "";
  const bundled = path.join(context.extensionPath, "bin", `twf${ext}`);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  // Fall back to system PATH
  return "twf";
}

/**
 * Add the extension's bin/ directory to the integrated terminal PATH.
 * This makes `twf` available to both the user and AI agents.
 */
function setupTerminalPath(context: vscode.ExtensionContext) {
  const binDir = path.join(context.extensionPath, "bin");
  if (fs.existsSync(binDir)) {
    context.environmentVariableCollection.prepend(
      "PATH",
      binDir + path.delimiter
    );
  }
}

// globalState key recording the ~/.local/bin/twf entry this extension manages.
// It is how we distinguish a link we created (safe to refresh) from a `twf` the
// user placed there themselves (must never be clobbered).
const TWF_PATH_LINK_KEY = "twf.pathLinkTarget";

/**
 * Link the bundled `twf` into ~/.local/bin so it resolves on the agent's PATH.
 *
 * `setupTerminalPath` only reaches the integrated terminal via
 * `environmentVariableCollection`; an AI agent's shell does not inherit that,
 * so extension-only users (no `go install`) get an agent that can't find `twf`.
 * `~/.local/bin` is already on the typical agent PATH (it also holds `claude`)
 * and is the installer's default `INSTALL_DIR`.
 *
 * Refreshes on every activation so the link tracks the bundled binary's
 * version. Never clobbers a user-managed `twf`: an existing entry we didn't
 * record in globalState is left untouched.
 */
async function linkTwfOnPath(context: vscode.ExtensionContext) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const bundled = path.join(context.extensionPath, "bin", `twf${ext}`);
  if (!fs.existsSync(bundled)) {
    return;
  }

  const binDir = path.join(os.homedir(), ".local", "bin");
  const target = path.join(binDir, `twf${ext}`);
  const owned = context.globalState.get<string>(TWF_PATH_LINK_KEY) === target;

  try {
    let exists = true;
    try {
      fs.lstatSync(target);
    } catch {
      exists = false;
    }

    // Leave a `twf` we didn't create (user `go install`, another tool) alone.
    if (exists && !owned) {
      console.warn(`twf already present at ${target}; leaving it untouched`);
      return;
    }

    fs.mkdirSync(binDir, { recursive: true });
    // Refresh so the entry always points at the current bundled binary.
    fs.rmSync(target, { force: true });
    if (process.platform === "win32") {
      // Symlinks require elevation on Windows; copy instead.
      await copyFileAsync(bundled, target);
    } else {
      fs.symlinkSync(bundled, target);
    }
    await context.globalState.update(TWF_PATH_LINK_KEY, target);
  } catch (err) {
    console.warn("Failed to link twf onto PATH:", err);
  }
}

// Skill folders to remove from ~/.cursor/skills on activation so upgrading
// users don't keep stale duplicates. Covers folders created by older versions
// of this extension (before skills were renamed to their canonical
// `temporal-architect-*` names) and the `temporal-skills/` namespace from
// early manual installs of the repo's skills tree. Removal is recursive, so
// `temporal-skills` clears its nested `design` / `author-go` copies too.
const LEGACY_SKILL_DIRS = [
  "temporal-design",
  "temporal-author-go",
  "temporal-skills",
];

/**
 * Install bundled skills to ~/.cursor/skills/.
 *
 * Auto-discovers all skill directories containing SKILL.md in the extension
 * bundle. The bundle directory name is the canonical skill name and becomes the
 * installed folder name verbatim — Cursor uses the folder name as the skill's
 * identity (it must match the SKILL.md `name` frontmatter), so no prefixing.
 *
 * Reconciles on every activation: removes legacy folders from prior versions
 * and does a fresh copy of each skill (clearing any previous install) so files
 * dropped from the bundle don't linger in the user's copy.
 */
async function installSkills(context: vscode.ExtensionContext) {
  const bundledSkillsDir = path.join(context.extensionPath, "skills");
  if (!fs.existsSync(bundledSkillsDir)) {
    return;
  }

  const cursorSkillsDir = path.join(os.homedir(), ".cursor", "skills");

  try {
    // Drop skill folders this extension created under older names.
    for (const legacy of LEGACY_SKILL_DIRS) {
      fs.rmSync(path.join(cursorSkillsDir, legacy), {
        recursive: true,
        force: true,
      });
    }

    // Discover all skill directories (each contains a SKILL.md)
    const entries = fs.readdirSync(bundledSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillSrc = path.join(bundledSkillsDir, entry.name);
      const skillMd = path.join(skillSrc, "SKILL.md");
      if (!fs.existsSync(skillMd)) {
        continue;
      }

      // Fresh copy: clear any prior install of this skill first so files
      // removed from the bundle don't survive in the user's copy.
      const skillDest = path.join(cursorSkillsDir, entry.name);
      fs.rmSync(skillDest, { recursive: true, force: true });
      await copyDirRecursive(skillSrc, skillDest);
    }
  } catch (err) {
    console.warn("Failed to install skills:", err);
  }
}

/**
 * Recursively copy a directory, creating destinations as needed.
 */
async function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await copyFileAsync(srcPath, destPath);
    }
  }
}

/**
 * Canonicalize and deduplicate a list of file paths.
 *
 * Paths coming from different sources (vscode.workspace.findFiles vs
 * editor.document.uri.fsPath vs a saved URI) can refer to the same file
 * while being non-equal strings — differing in case on case-insensitive
 * filesystems, in symlink resolution, or in path separator normalization.
 * Without deduplication the parser is invoked twice on the same file and
 * every definition appears twice downstream in the visualizer.
 */
function dedupeFilePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const caseInsensitive =
    process.platform === "darwin" || process.platform === "win32";
  for (const p of paths) {
    let canonical: string;
    try {
      canonical = fs.realpathSync.native(p);
    } catch {
      canonical = path.resolve(p);
    }
    if (caseInsensitive) {
      canonical = canonical.toLowerCase();
    }
    if (seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    out.push(p);
  }
  return out;
}

function startLanguageClient(context: vscode.ExtensionContext) {
  const command = resolveTwfBinary(context);

  const serverOptions: ServerOptions = {
    run: { command, args: ["lsp"] } as Executable,
    debug: { command, args: ["lsp"] } as Executable,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "twf" }],
    outputChannelName: "TWF Language Server",
  };

  client = new LanguageClient(
    "twf-lsp",
    "TWF Language Server",
    serverOptions,
    clientOptions
  );

  client.start().catch((err) => {
    vscode.window.showWarningMessage(
      `Failed to start TWF language server: ${err.message}. ` +
      `Install it with: go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@latest`
    );
  });

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        client.stop();
      }
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (client) {
    return client.stop();
  }
  return undefined;
}

/**
 * Manages workflow visualizer webview panels
 */
class WorkflowVisualizerPanel {
  public static currentPanel: WorkflowVisualizerPanel | undefined;
  public static readonly viewType = "twfVisualizer";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _folderPath: string;
  private _files: string[] = [];
  private _focusedFile: string | undefined;
  private _disposables: vscode.Disposable[] = [];

  /**
   * Sole mutator of _files. Canonicalizes + dedupes on the way in so the
   * invariant "_files contains no path that refers to the same physical file
   * as another entry" holds automatically, regardless of which call site
   * constructed the list.
   */
  private _setFiles(files: string[]): void {
    this._files = dedupeFilePaths(files);
  }

  /**
   * Create or show the visualizer for a single file.
   * This will parse all .twf files in the same folder for context,
   * but only show workflows from the focused file at top level.
   */
  public static async createOrShowForFile(extensionUri: vscode.Uri, filePath: string) {
    const folderPath = path.dirname(filePath);

    // Find all .twf files in the folder for context, plus the focused file
    // (which findFiles can legitimately omit if the folder is outside the
    // workspace or shadowed by an exclude). _setFiles handles dedup.
    const pattern = new vscode.RelativePattern(folderPath, "*.twf");
    const uris = await vscode.workspace.findFiles(pattern);
    const files = [...uris.map((u) => u.fsPath), filePath];

    await WorkflowVisualizerPanel.createOrShowForFolder(extensionUri, folderPath, files, filePath);
  }

  /**
   * Create or show the visualizer for a folder with optional focused file.
   */
  public static async createOrShowForFolder(
    extensionUri: vscode.Uri,
    folderPath: string,
    files: string[],
    focusedFile: string | undefined
  ) {
    const column = vscode.ViewColumn.Beside;

    // If we already have a panel, update it (preserveFocus to not steal from editor)
    if (WorkflowVisualizerPanel.currentPanel) {
      WorkflowVisualizerPanel.currentPanel._panel.reveal(column, true);
      WorkflowVisualizerPanel.currentPanel._folderPath = folderPath;
      WorkflowVisualizerPanel.currentPanel._setFiles(files);
      WorkflowVisualizerPanel.currentPanel._focusedFile = focusedFile;
      WorkflowVisualizerPanel.currentPanel._update();
      return;
    }

    // Create a new panel (preserveFocus to not steal from editor)
    const panel = vscode.window.createWebviewPanel(
      WorkflowVisualizerPanel.viewType,
      "TWF Visualizer",
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
        ],
      }
    );

    WorkflowVisualizerPanel.currentPanel = new WorkflowVisualizerPanel(
      panel,
      extensionUri,
      folderPath,
      files,
      focusedFile
    );
  }

  public static refreshIfVisible() {
    if (WorkflowVisualizerPanel.currentPanel) {
      WorkflowVisualizerPanel.currentPanel._update();
    }
  }

  /**
   * Update the focused file and refresh the visualization.
   * Only updates if the new file is in the same folder or a .twf file.
   *
   * Short-circuits when neither the folder nor the focused file changed.
   * `onDidChangeActiveTextEditor` re-fires every time the .twf editor regains
   * focus — including the focus dance triggered by the webview's "refocus"
   * message after every click. Without this guard each click in the
   * visualizer would trigger a full reparse + AST repost, which in turn
   * resets the GraphView's force simulation to fresh random positions on
   * every interaction (manifests as ~1 Hz "teleport" frames).
   */
  public static async updateFocusedFile(filePath: string) {
    if (!WorkflowVisualizerPanel.currentPanel) {
      return;
    }

    const panel = WorkflowVisualizerPanel.currentPanel;
    const newFolderPath = path.dirname(filePath);
    const sameFolder = newFolderPath === panel._folderPath;
    const sameFile = filePath === panel._focusedFile;

    if (sameFolder && sameFile) {
      return;
    }

    if (!sameFolder) {
      const pattern = new vscode.RelativePattern(newFolderPath, "*.twf");
      const uris = await vscode.workspace.findFiles(pattern);
      const files = [...uris.map((u) => u.fsPath), filePath];

      panel._folderPath = newFolderPath;
      panel._setFiles(files);
    }

    panel._focusedFile = filePath;
    panel._update();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    folderPath: string,
    files: string[],
    focusedFile: string | undefined
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._folderPath = folderPath;
    this._setFiles(files);
    this._focusedFile = focusedFile;

    // Set initial HTML content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case "ready":
            this._update();
            break;
          case "refocus":
            // Return focus to the last active text editor after webview interaction
            if (lastActiveTextEditor) {
              vscode.window.showTextDocument(
                lastActiveTextEditor.document,
                { viewColumn: lastActiveTextEditor.viewColumn, preserveFocus: false }
              );
            }
            break;
          case "openFile":
            // Open a file in the editor when the file filter narrows to a single file
            if (message.file) {
              const uri = vscode.Uri.file(message.file);
              vscode.window.showTextDocument(uri, { preserveFocus: false });
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    WorkflowVisualizerPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private async _update() {
    try {
      const ast = await this._parseFilesWithMetadata();
      // `twf graph` is best-effort: graph extraction can fail in ways that
      // `twf parse` doesn't (e.g. binary not yet rebuilt), but the tree
      // view doesn't need it. If we can't get a parser graph, post the AST
      // anyway and let the graph view render empty.
      const parserGraph = await this._extractGraph();
      this._panel.webview.postMessage({ type: "ast", data: { ast, parserGraph } });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: "error", message: errorMessage });
    }
  }

  /**
   * Run `twf graph --json` once over the full file set. The graph is
   * single-resolution-context (cross-file dispatch must resolve across
   * the same merged AST `twf parse` already merges), so we make one
   * multi-file call rather than per-file.
   *
   * Returns the `graph` payload from the envelope, or `undefined` if
   * the call failed or the graph wasn't produced. Failures are logged
   * but never thrown — the graph view degrades to "empty graph" rather
   * than blocking the tree view.
   */
  private async _extractGraph(): Promise<unknown | undefined> {
    if (this._files.length === 0) return undefined;

    const config = vscode.workspace.getConfiguration("twf.parser");
    const configPath = config.get<string>("path", "");

    let resolvedCommand: string;
    if (configPath) {
      resolvedCommand = configPath;
    } else {
      const ext = process.platform === "win32" ? ".exe" : "";
      const bundled = path.join(this._extensionUri.fsPath, "bin", `twf${ext}`);
      resolvedCommand = fs.existsSync(bundled) ? bundled : "twf";
    }

    try {
      const { stdout, stderr } = await execFileAsync(resolvedCommand, [
        "graph",
        "--json",
        ...this._files,
      ]);
      if (stderr) {
        console.warn("twf graph stderr:", stderr);
      }
      const envelope = JSON.parse(stdout) as { graph?: unknown };
      return envelope.graph;
    } catch (err) {
      // Per-file parse errors come through as diagnostics (still
      // produces a graph); only catastrophic failures land here.
      console.warn("Failed to extract deployment graph:", err);
      return undefined;
    }
  }

  /**
   * Parse files and add metadata for source files and focused file.
   */
  private async _parseFilesWithMetadata(): Promise<unknown> {
    const config = vscode.workspace.getConfiguration("twf.parser");
    const configPath = config.get<string>("path", "");

    // Resolve parser binary: user config > bundled binary > system PATH
    let resolvedCommand: string;
    if (configPath) {
      resolvedCommand = configPath;
    } else {
      const ext = process.platform === "win32" ? ".exe" : "";
      const bundled = path.join(this._extensionUri.fsPath, "bin", `twf${ext}`);
      resolvedCommand = fs.existsSync(bundled) ? bundled : "twf";
    }

    const parts = (resolvedCommand + " parse").split(/\s+/);
    const parserCommand = parts[0];
    const baseArgs = parts.slice(1);

    if (this._files.length === 0) {
      throw new Error("No .twf files to parse");
    }

    // Parse each file individually to track source files
    const allDefinitions: unknown[] = [];
    const allErrors: { file: string; error: string; stderr?: string }[] = [];
    // Structured validator/resolver/parse diagnostics from `twf parse`'s
    // JSON envelope. Distinct from `allErrors` (FileError), which is now
    // reserved for catastrophic parser-process failures (missing binary,
    // IO failure, malformed envelope).
    const allDiagnostics: TwfDiagnostic[] = [];

    for (const file of this._files) {
      try {
        const { stdout, stderr } = await execFileAsync(parserCommand, [
          ...baseArgs,
          file,
        ]);

        // Diagnostics ride in the envelope now; stderr from `twf parse`
        // is expected to be empty on a successful run. Surface any
        // non-empty stderr through the dev console for debugging but
        // do NOT wrap it as a FileError — that path masqueraded
        // structured warnings as parser failures and is now gone. Older
        // `twf` binaries that still write warnings to stderr will fail
        // to surface them in the UI; this is a known incompatibility
        // documented against this code path.
        if (stderr) {
          console.warn("Parser stderr:", stderr);
        }

        const parsed = JSON.parse(stdout) as {
          definitions?: unknown[];
          diagnostics?: TwfDiagnostic[];
        };

        // Add sourceFile to each definition
        if (parsed.definitions) {
          for (const def of parsed.definitions) {
            (def as { sourceFile?: string }).sourceFile = file;
            allDefinitions.push(def);
          }
        }

        // Forward structured diagnostics into the webview payload.
        // `twf parse` emits the path it was invoked with (absolute,
        // matching the path the extension already passes); stamp a
        // safety-net `file` on any diagnostic the producer left blank
        // so the shown/hidden file-filter partition downstream has a
        // valid key.
        if (parsed.diagnostics) {
          for (const diag of parsed.diagnostics) {
            allDiagnostics.push({
              ...diag,
              file: diag.file && diag.file.length > 0 ? diag.file : file,
            });
          }
        }
      } catch (err) {
        // Catastrophic parser-process failures only: execFileAsync
        // rejecting (binary missing, exec error) or JSON.parse
        // throwing. Validator/resolver warnings are NOT errors and
        // travel via parsed.diagnostics above.
        const errMsg = err instanceof Error ? err.message : String(err);
        const stderr = (err as { stderr?: string }).stderr;
        allErrors.push({
          file,
          error: errMsg,
          stderr: stderr ? stderr.trim() : undefined,
        });
        console.warn(`Failed to parse ${file}:`, err);
      }
    }

    // Return combined AST with focusedFile metadata, any process-level
    // FileErrors, and the structured diagnostics envelope. The two are
    // distinct: FileError covers parser-process failures; Diagnostic
    // covers validator/resolver/parse findings inside a successful run.
    return {
      definitions: allDefinitions,
      errors: allErrors.length > 0 ? allErrors : undefined,
      diagnostics: allDiagnostics.length > 0 ? allDiagnostics : undefined,
      focusedFile: this._focusedFile,
    };
  }

  private _getHtmlForWebview(): string {
    const webview = this._panel.webview;

    // Get URIs for webview resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview", "visualizer.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview", "visualizer.css")
    );

    // Use a nonce to only allow specific scripts
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>TWF Workflow Visualizer</title>
    <style>
      html, body, #root {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
        overflow: auto;
      }
    </style>
</head>
<body class="vscode-dark">
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
