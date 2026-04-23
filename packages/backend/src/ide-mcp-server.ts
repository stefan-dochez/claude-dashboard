import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from './logger.js';

const log = createLogger('ide-mcp');

export interface OpenFileEntry {
  path: string;
  highlightLine?: number;
}

export interface IdeSelection {
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}

interface IdeState {
  openFiles: OpenFileEntry[];
  activeFilePath: string | null;
  selection: IdeSelection | null;
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

/**
 * Per-instance MCP server that Claude Code connects to as its "IDE".
 *
 * Discovery works both ways:
 *   1. We set CLAUDE_CODE_SSE_PORT + ENABLE_IDE_INTEGRATION on the spawned
 *      claude PTY so it connects directly to our port.
 *   2. We also write ~/.claude/ide/<port>.lock as a fallback, in case claude
 *      decides to verify the lockfile before trusting the port.
 *
 * Auth: connection upgrade requires header
 *   x-claude-code-ide-authorization: <authToken>
 * matching the token we wrote in the lockfile.
 */
export class IdeMcpServer extends EventEmitter {
  readonly instanceId: string;
  readonly workspacePath: string;
  readonly authToken: string;

  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private _port: number | null = null;
  private lockfilePath: string | null = null;
  private clients = new Set<WebSocket>();
  private state: IdeState = { openFiles: [], activeFilePath: null, selection: null };

  constructor(instanceId: string, workspacePath: string) {
    super();
    this.instanceId = instanceId;
    this.workspacePath = workspacePath;
    this.authToken = randomUUID();
  }

  get port(): number | null { return this._port; }

  async start(): Promise<{ port: number; authToken: string }> {
    const httpServer = createServer();
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      const authHeader = req.headers['x-claude-code-ide-authorization'];
      if (typeof authHeader !== 'string' || authHeader !== this.authToken) {
        log.warn(`Rejected IDE WS connection for ${this.instanceId}: bad auth`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => this.handleConnection(ws));
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        httpServer.removeListener('error', reject);
        resolve();
      });
    });

    const addr = httpServer.address();
    if (!addr || typeof addr !== 'object') {
      httpServer.close();
      throw new Error('Failed to bind IDE MCP server');
    }

    this.httpServer = httpServer;
    this.wss = wss;
    this._port = addr.port;

    await this.writeLockfile();
    log.info(`IDE MCP server for ${this.instanceId} listening on 127.0.0.1:${this._port}`);
    return { port: this._port, authToken: this.authToken };
  }

  async stop(): Promise<void> {
    for (const ws of this.clients) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.clients.clear();

    if (this.wss) {
      await new Promise<void>(res => this.wss!.close(() => res()));
      this.wss = null;
    }
    if (this.httpServer) {
      await new Promise<void>(res => this.httpServer!.close(() => res()));
      this.httpServer = null;
    }
    await this.removeLockfile();
    log.info(`IDE MCP server for ${this.instanceId} stopped`);
  }

  /**
   * Apply a batch of state changes and emit at most one selection_changed
   * notification at the end. Using individual setters in sequence would fire
   * intermediate notifications with stale state (e.g. active file changed but
   * selection not yet cleared), which Claude would then see before the final
   * value.
   */
  updateState(patch: { openFiles?: OpenFileEntry[]; activeFilePath?: string | null; selection?: IdeSelection | null }): void {
    let notify = false;
    if (patch.openFiles !== undefined) {
      this.state.openFiles = [...patch.openFiles];
    }
    if (patch.activeFilePath !== undefined && this.state.activeFilePath !== patch.activeFilePath) {
      this.state.activeFilePath = patch.activeFilePath;
      notify = true;
    }
    if (patch.selection !== undefined && !selectionsEqual(this.state.selection, patch.selection)) {
      this.state.selection = patch.selection;
      notify = true;
    }
    if (notify) this.pushSelectionNotification();
  }

  setOpenFiles(files: OpenFileEntry[]): void {
    this.updateState({ openFiles: files });
  }
  setActiveFilePath(p: string | null): void {
    this.updateState({ activeFilePath: p });
  }
  setSelection(sel: IdeSelection | null): void {
    this.updateState({ selection: sel });
  }

  private pushSelectionNotification(): void {
    const sel = this.state.selection;
    const filePath = sel?.filePath ?? this.state.activeFilePath ?? '';
    log.info(`selection_changed → file=${filePath || '<none>'} text=${sel ? `${sel.text.length} chars L${sel.startLine}-${sel.endLine}` : 'empty'}`);
    const fileUrl = filePath ? `file://${filePath}` : '';
    const payload = sel
      ? {
          text: sel.text,
          filePath: sel.filePath,
          fileUrl,
          selection: {
            // LSP range is half-open [start, end) — to cover lines L..N (1-indexed inclusive)
            // we emit start=(L-1, 0) and end=(N, 0), i.e. the character after the last line.
            start: { line: sel.startLine - 1, character: 0 },
            end: { line: sel.endLine, character: 0 },
            isEmpty: false,
          },
        }
      : {
          text: '',
          filePath,
          fileUrl,
          selection: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
            isEmpty: true,
          },
        };
    this.pushNotification('selection_changed', payload);
  }

  notifyAtMentioned(sel: IdeSelection): void {
    this.pushNotification('at_mentioned', {
      filePath: sel.filePath,
      lineStart: sel.startLine,
      lineEnd: sel.endLine,
    });
  }

  private async writeLockfile(): Promise<void> {
    if (this._port == null) return;
    const dir = process.env.CLAUDE_CONFIG_DIR
      ? path.join(process.env.CLAUDE_CONFIG_DIR, 'ide')
      : path.join(os.homedir(), '.claude', 'ide');
    await fs.mkdir(dir, { recursive: true });
    this.lockfilePath = path.join(dir, `${this._port}.lock`);
    const payload = {
      pid: process.pid,
      workspaceFolders: [this.workspacePath],
      ideName: 'Claude Dashboard',
      transport: 'ws',
      authToken: this.authToken,
    };
    await fs.writeFile(this.lockfilePath, JSON.stringify(payload, null, 2));
  }

  private async removeLockfile(): Promise<void> {
    if (!this.lockfilePath) return;
    try { await fs.unlink(this.lockfilePath); } catch { /* ignore */ }
    this.lockfilePath = null;
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    log.info(`Claude connected to IDE MCP (${this.instanceId}, ${this.clients.size} client(s))`);
    ws.on('message', raw => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isJsonRpcRequest(parsed)) return;
      this.handleRequest(ws, parsed).catch(err => {
        log.warn(`Request handler error on ${this.instanceId}:`, err);
      });
    });
    ws.on('close', () => {
      this.clients.delete(ws);
      log.info(`Claude disconnected from IDE MCP (${this.instanceId})`);
    });
    ws.on('error', err => log.warn(`WS error on ${this.instanceId}: ${err.message}`));
  }

  private async handleRequest(ws: WebSocket, msg: JsonRpcRequest): Promise<void> {
    const { id, method, params } = msg;

    const respond = (result: unknown): void => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
    };
    const respondErr = (code: number, message: string): void => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
    };

    // Notifications (no id) expect no response
    if (id === undefined || id === null) {
      // We accept initialized/cancelled etc. silently
      return;
    }

    try {
      switch (method) {
        case 'initialize':
          respond({
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'claude-dashboard-ide', version: '1' },
            capabilities: { tools: {} },
          });
          return;
        case 'tools/list':
          respond({ tools: this.toolDescriptors() });
          return;
        case 'tools/call': {
          const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
          const toolName = p?.name ?? '';
          const args = p?.arguments ?? {};
          const result = await this.callTool(toolName, args);
          respond({ content: [{ type: 'text', text: JSON.stringify(result) }] });
          return;
        }
        default:
          respondErr(-32601, `Method not found: ${method}`);
      }
    } catch (err) {
      respondErr(-32000, err instanceof Error ? err.message : 'Unknown error');
    }
  }

  private toolDescriptors(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return [
      {
        name: 'getOpenEditors',
        description: 'List files currently open in the Claude Dashboard side panel.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'getCurrentSelection',
        description: 'Return the current text selection in the dashboard file viewer.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'getLatestSelection',
        description: 'Return the most recent selection recorded from the file viewer.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'getWorkspaceFolders',
        description: 'Return the workspace folders for the current instance.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'openFile',
        description: 'Open a file in the dashboard file viewer, optionally scrolled to a line range.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            startLine: { type: 'number' },
            endLine: { type: 'number' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'close_tab',
        description: 'Close an open file tab by path or basename.',
        inputSchema: {
          type: 'object',
          properties: { tabName: { type: 'string' } },
          required: ['tabName'],
        },
      },
      {
        name: 'getDiagnostics',
        description: 'LSP diagnostics (not available in Claude Dashboard — returns empty).',
        inputSchema: { type: 'object', properties: { uri: { type: 'string' } } },
      },
      {
        name: 'checkDocumentDirty',
        description: 'Check if a document has unsaved changes (dashboard is read-only — always false).',
        inputSchema: { type: 'object', properties: { filePath: { type: 'string' } } },
      },
      {
        name: 'saveDocument',
        description: 'Save a document (no-op — dashboard file viewer is read-only).',
        inputSchema: { type: 'object', properties: { filePath: { type: 'string' } } },
      },
      {
        name: 'closeAllDiffTabs',
        description: 'Close all diff tabs (no-op — dashboard does not open diffs).',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'openDiff',
        description: 'Show a diff between two files (not supported in Claude Dashboard).',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'executeCode',
        description: 'Execute code in a Jupyter kernel (not supported).',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'getOpenEditors':
        return {
          openEditors: this.state.openFiles.map(f => ({
            filePath: f.path,
            isActive: f.path === this.state.activeFilePath,
          })),
        };
      case 'getCurrentSelection':
      case 'getLatestSelection': {
        const sel = this.state.selection;
        const filePath = sel?.filePath ?? this.state.activeFilePath ?? '';
        const fileUrl = filePath ? `file://${filePath}` : '';
        if (!sel) {
          return {
            text: '',
            filePath,
            fileUrl,
            selection: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
              isEmpty: true,
            },
          };
        }
        return {
          text: sel.text,
          filePath: sel.filePath,
          fileUrl,
          selection: {
            start: { line: sel.startLine - 1, character: 0 },
            end: { line: sel.endLine, character: 0 },
            isEmpty: false,
          },
        };
      }
      case 'getWorkspaceFolders':
        return {
          folders: [{ name: path.basename(this.workspacePath), uri: `file://${this.workspacePath}`, path: this.workspacePath }],
          rootPath: this.workspacePath,
        };
      case 'openFile': {
        const filePath = String(args.filePath ?? '');
        if (!filePath) throw new Error('filePath is required');
        const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
        const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;
        this.emit('open-file', filePath, startLine, endLine);
        return { success: true };
      }
      case 'close_tab': {
        const tabName = String(args.tabName ?? '');
        if (!tabName) throw new Error('tabName is required');
        this.emit('close-tab', tabName);
        return { success: true };
      }
      case 'getDiagnostics':
        return { diagnostics: [] };
      case 'checkDocumentDirty':
        return { isDirty: false };
      case 'saveDocument':
        return { success: true, note: 'Claude Dashboard file viewer is read-only' };
      case 'closeAllDiffTabs':
        return { closed: 0 };
      case 'openDiff':
        return { accepted: false, error: 'openDiff is not supported in Claude Dashboard' };
      case 'executeCode':
        return { error: 'executeCode is not supported' };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private pushNotification(method: string, params: unknown): void {
    if (this.clients.size === 0) return;
    log.debug(`push ${method} -> ${this.clients.size} client(s)`);
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    for (const ws of this.clients) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}

function isJsonRpcRequest(v: unknown): v is JsonRpcRequest {
  return !!v && typeof v === 'object' && typeof (v as { method?: unknown }).method === 'string';
}

function selectionsEqual(a: IdeSelection | null, b: IdeSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.filePath === b.filePath
    && a.startLine === b.startLine
    && a.endLine === b.endLine
    && a.text === b.text;
}
