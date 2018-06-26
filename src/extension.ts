'use strict';

/**
 * This file is part of the vscode-remote-workspace distribution.
 * Copyright (c) Marcel Joachim Kloubert.
 *
 * vscode-remote-workspace is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, version 3.
 *
 * vscode-remote-workspace is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import * as _ from 'lodash';
import * as Crypto from 'crypto';
import * as FSExtra from 'fs-extra';
import * as Marked from 'marked';
import * as Moment from 'moment';
import * as MomentTZ from 'moment-timezone';  // REQUIRED EXTENSION FOR moment MODULE!!!
import * as Net from 'net';  // REQUIRED EXTENSION FOR moment MODULE!!!
import * as OS from 'os';
import * as Path from 'path';
import * as SimpleSocket from 'node-simple-socket';
import * as URL from 'url';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw_fs_azure from './fs/azure';
import * as vscrw_fs_dropbox from './fs/dropbox';
import * as vscrw_fs_ftp from './fs/ftp';
import * as vscrw_fs_ftps from './fs/ftps';
import * as vscrw_fs_s3 from './fs/s3';
import * as vscrw_fs_sftp from './fs/sftp';
import * as vscrw_fs_slack from './fs/slack';
import * as vscrw_fs_webdav from './fs/webdav';

/**
 * A quick pick item with an (optional) action.
 */
export interface ActionQuickPickItem extends vscode.QuickPickItem {
    /**
     * The action for the item.
     */
    action?: () => any;
}

/**
 * Arguments for an event that executes git on a remote workspace.
 */
export interface ExecuteRemoteCommandArguments {
    /**
     * The optional callback.
     */
    readonly callback?: ExecuteRemoteCommandCallback;
    /**
     * The command to execute.
     */
    readonly command: string;
    /**
     * The number of event executions.
     */
    readonly executionCount: number;
    /**
     * Increase the value of 'executionCount' property.
     */
    readonly increaseExecutionCounter: () => void;
    /**
     * The URI where to run the command.
     */
    readonly uri: vscode.Uri;
}

/**
 * The callback for an event that executes a command on a remote workspace.
 *
 * @param {any} err The error (if occurred).
 * @param {ExecuteRemoteCommandResult} [result] The result.
 */
export type ExecuteRemoteCommandCallback = (err: any, result?: ExecuteRemoteCommandResult) => any;

/**
 * The result of a remote command execution.
 */
export interface ExecuteRemoteCommandResult {
    /**
     * The data of the "standard output".
     */
    stdOut?: Buffer;
}

/**
 * Stores host, port and credentials.
 */
export interface HostAndCredentials {
    /**
     * The host address.
     */
    host: string;
    /**
     * The password.
     */
    password: string;
    /**
     * The TCP port.
     */
    port: number;
    /**
     * The username.
     */
    user: string;
}

/**
 * Describes the structure of the package file of that extenstion.
 */
export interface PackageFile {
    /**
     * The display name.
     */
    readonly displayName: string;
    /**
     * The (internal) name.
     */
    readonly name: string;
    /**
     * The version string.
     */
    readonly version: string;
}

/**
 * A key value paris.
 */
export type KeyValuePairs<TValue = any> = { [key: string]: TValue };

interface SharedRemoteUri {
    uri: string;
}

interface WorkspaceQuickPickItem extends vscode.QuickPickItem {
    action?: () => any;
    folder: vscode.WorkspaceFolder;
}

const DEFAULT_SHARE_URI_PORT = 1248;
/**
 * Name of the event for running a command on a remote workspace.
 */
export const EVENT_EXECUTE_REMOTE_COMMAND = 'vscrwExecuteRemoteCommand';
/**
 * The name of the extension's directory inside the user's home directory.
 */
export const EXTENSION_DIR = '.vscode-remote-workspace';
let extension: vscode.ExtensionContext;
let isDeactivating = false;
const KEY_LAST_GIT_ARGS = 'vscrwLastGitArgs';
const KEY_LAST_KNOWN_VERSION = 'vscrwLastKnownVersion';
const KEY_LAST_REMOTE_COMMANDS = 'vscrwLastRemoteCommands';
const KEY_PARAMS = 'params';
let logger: vscode_helpers.Logger;
let nextReceiveRemoteURICommandId = Number.MIN_SAFE_INTEGER;
let outputChannel: vscode.OutputChannel;
let packageFile: PackageFile;
const REGISTRATED_SCHEMES: string[] = [];

type StringRepository = { [key: string]: string };

export async function activate(context: vscode.ExtensionContext) {
    extension = context;

    const WF = vscode_helpers.buildWorkflow();

    // package file
    WF.next(async () => {
        try {
            const CUR_DIR = __dirname;
            const FILE_PATH = Path.join(CUR_DIR, '../package.json');

            packageFile = JSON.parse(
                await FSExtra.readFile(FILE_PATH, 'utf8')
            );
        } catch { }
    });

    // extension's directory in user's home
    WF.next(async () => {
        try {
            const EXT_DIR = mapToUsersHome('./' + EXTENSION_DIR);
            if (!(await vscode_helpers.exists(EXT_DIR))) {
                await FSExtra.mkdirs( EXT_DIR );
            }
        } catch { }
    });

    // logger
    WF.next(() => {
        logger = vscode_helpers.createLogger((ctx) => {
            const EXT_DIR = mapToUsersHome('./' + EXTENSION_DIR);
            if (!vscode_helpers.isDirectorySync(EXT_DIR)) {
                return;
            }

            const LOGS_DIR = Path.join(EXT_DIR, '.logs');
            if (!FSExtra.existsSync(LOGS_DIR)) {
                FSExtra.mkdirsSync(LOGS_DIR);
            }

            if (!vscode_helpers.isDirectorySync(LOGS_DIR)) {
                return;
            }

            let logType = ctx.type;
            if (_.isNil(logType)) {
                logType = vscode_helpers.LogType.Debug;
            }

            let time = ctx.time;
            if (!Moment.isMoment(time)) {
                time = Moment.utc();
            }
            time = vscode_helpers.asUTC(time);

            if (vscode_helpers.LogType.Trace !== ctx.type) {
                if (ctx.type > vscode_helpers.LogType.Info) {
                    return;
                }
            }

            let msg = `${vscode_helpers.LogType[logType].toUpperCase().trim()}`;

            const TAG = vscode_helpers.normalizeString(
                _.replace(
                    vscode_helpers.normalizeString(ctx.tag),
                    /\s/ig,
                    '_'
                )
            );
            if ('' !== TAG) {
                msg += ' ' + TAG;
            }

            let logMsg: string;
            if (ctx.message instanceof Error) {
                logMsg = `${
                    vscode_helpers.isEmptyString(ctx.message.name) ? '' : `(${ vscode_helpers.toStringSafe(ctx.message.name).trim() }) `
                }${ vscode_helpers.toStringSafe(ctx.message.message) }`;
            } else {
                logMsg = vscode_helpers.toStringSafe(ctx.message);
            }

            if (vscode_helpers.LogType.Trace === ctx.type) {
                const STACK = vscode_helpers.toStringSafe(
                    (new Error()).stack
                ).split("\n").filter(l => {
                    return l.toLowerCase()
                            .trim()
                            .startsWith('at ');
                }).join("\n");

                logMsg += `\n\nStack:\n${STACK}`;
            }

            msg += ` - [${time.format('DD/MMM/YYYY:HH:mm:ss')} +0000] "${
                _.replace(logMsg, /"/ig, '\\"')
            }"${OS.EOL}`;

            const LOG_FILE = Path.resolve(
                Path.join(
                    LOGS_DIR,
                    `${time.format('YYYYMMDD')}.log`
                )
            );

            FSExtra.appendFileSync(LOG_FILE, msg, 'utf8');
        });
    });

    // output channel
    WF.next(() => {
        context.subscriptions.push(
            outputChannel = vscode.window.createOutputChannel('Remote Workspace')
        );

        outputChannel.hide();
    });

    // extension information
    WF.next(() => {
        const NOW = Moment();

        if (packageFile) {
            outputChannel.appendLine(`${packageFile.displayName} (${packageFile.name}) - v${packageFile.version}`);
        }

        outputChannel.appendLine(`Copyright (c) 2018-${NOW.format('YYYY')}  Marcel Joachim Kloubert <marcel.kloubert@gmx.net>`);
        outputChannel.appendLine('');
        outputChannel.appendLine(`GitHub : https://github.com/mkloubert/vscode-remote-workspace`);
        outputChannel.appendLine(`Twitter: https://twitter.com/mjkloubert`);
        outputChannel.appendLine(`Donate : https://paypal.me/MarcelKloubert`);

        outputChannel.appendLine('');
        outputChannel.appendLine('Initializing ...');
        outputChannel.appendLine('');
    });

    // file system providers
    WF.next(() => {
        for (const C of getClasses()) {
            outputChannel.append(`Register provider for '${ C.scheme }' scheme ... `);

            try {
                C.register( context );
                outputChannel.appendLine('[OK]');

                REGISTRATED_SCHEMES.push(
                    vscode_helpers.normalizeString(C.scheme),
                );
            } catch (e) {
                outputChannel.appendLine(`[ERROR: '${ vscode_helpers.toStringSafe(e) }']`);
            }
        }
    });

    // event fallbacks
    WF.next(() => {
        vscode_helpers.EVENTS.on(
            EVENT_EXECUTE_REMOTE_COMMAND,
            (args: ExecuteRemoteCommandArguments) => {
                if (args.executionCount < 1) {
                    if (args.callback) {
                        args.callback(null, null);
                    }
                }
            }
        );
    });

    // commands
    WF.next(() => {
        context.subscriptions.push(
            // executeGit()
            vscode.commands.registerCommand('extension.remote.workspace.executeGit', async () => {
                try {
                    const WORKSPACES = vscode_helpers.asArray(
                        vscode.workspace.workspaceFolders
                    ).filter(ws => {
                        return isRemoteExecutionSupported(ws.uri);
                    });

                    const QUICK_PICKS: ActionQuickPickItem[] = vscode_helpers.from(
                        WORKSPACES
                    ).orderBy(x => vscode_helpers.normalizeString(x.name))
                     .thenBy(x => x.index)
                     .select(ws => {
                                 let name = vscode_helpers.toStringSafe(ws.name);
                                 if ('' === name) {
                                     name = `Workspace #${ ws.index }`;
                                 }

                                 return {
                                     action: async () => {
                                         const GIT_ARGS_KEY = toUriKey(ws.uri);

                                         const REPO = getStringRepo( KEY_LAST_GIT_ARGS );
                                         const LGA = REPO[ GIT_ARGS_KEY ];

                                         let gitArgs = await vscode.window.showInputBox({
                                             ignoreFocusOut: true,
                                             placeHolder: "Enter arguments for 'git' command ('--version', e.g.)",
                                             value: LGA,
                                         });

                                         if (vscode_helpers.isEmptyString(gitArgs)) {
                                             return;
                                         }

                                         REPO[ GIT_ARGS_KEY ] = gitArgs;
                                         await saveStringRepo( KEY_LAST_GIT_ARGS, REPO );

                                         if (gitArgs.trim().startsWith('git ')) {
                                             gitArgs = gitArgs.substr(gitArgs.indexOf('git ') + 4);
                                         }

                                         const COMMAND_TO_EXECUTE = `git ${ gitArgs }`;

                                         outputChannel.show();
                                         try {
                                             await executeRemoteCommand(ws.uri, COMMAND_TO_EXECUTE);
                                         } catch (e) {
                                             logger.trace(e, 'extension.remote.workspace.executeGit(1)');
                                         }
                                     },
                                     label: name,
                                     detail: `${ ws.uri }`,
                                 };
                             })
                     .toArray();

                    if (QUICK_PICKS.length < 1) {
                        vscode.window.showWarningMessage(
                            "No supported workspace found, for running 'git' command!"
                        );

                        return;
                    }

                    let selectedItem: ActionQuickPickItem;
                    if (1 === QUICK_PICKS.length) {
                        selectedItem = QUICK_PICKS[0];
                    } else {
                        selectedItem = await vscode.window.showQuickPick(
                            QUICK_PICKS,
                            {
                                placeHolder: "Select the workspace, where you want to run 'git' ...",
                            }
                        );
                    }

                    if (selectedItem) {
                        if (selectedItem.action) {
                            await selectedItem.action();
                        }
                    }
                } catch (e) {
                    showError(e);
                }
            }),

            // executeRemoteCommmand
            vscode.commands.registerCommand('extension.remote.workspace.executeRemoteCommmand', async () => {
                try {
                    const WORKSPACES = vscode_helpers.asArray(
                        vscode.workspace.workspaceFolders
                    ).filter(ws => {
                        return isRemoteExecutionSupported(ws.uri);
                    });

                    const QUICK_PICKS: ActionQuickPickItem[] = vscode_helpers.from(
                        WORKSPACES
                    ).orderBy(x => vscode_helpers.normalizeString(x.name))
                     .thenBy(x => x.index)
                     .select(ws => {
                                 let name = vscode_helpers.toStringSafe(ws.name);
                                 if ('' === name) {
                                     name = `Workspace #${ ws.index }`;
                                 }

                                 return {
                                     action: async () => {
                                         const CMD_KEY = toUriKey(ws.uri);

                                         const REPO = getStringRepo( KEY_LAST_REMOTE_COMMANDS );
                                         const LGA = REPO[ CMD_KEY ];

                                         const CMD_TO_EXECUTE = await vscode.window.showInputBox({
                                             ignoreFocusOut: true,
                                             placeHolder: "Enter the command to execute ...",
                                             value: LGA,
                                         });

                                         if (vscode_helpers.isEmptyString(CMD_TO_EXECUTE)) {
                                             return;
                                         }

                                         REPO[ CMD_KEY ] = CMD_TO_EXECUTE;
                                         await saveStringRepo( KEY_LAST_REMOTE_COMMANDS, REPO );

                                         outputChannel.show();
                                         try {
                                             await executeRemoteCommand(ws.uri, CMD_TO_EXECUTE);
                                         } catch (e) {
                                             logger.trace(e, 'extension.remote.workspace.executeRemoteCommmand(1)');
                                         }
                                     },
                                     label: name,
                                     detail: `${ ws.uri }`,
                                 };
                             })
                     .toArray();

                    if (QUICK_PICKS.length < 1) {
                        vscode.window.showWarningMessage(
                            "No supported workspace found, for running a remote command!"
                        );

                        return;
                    }

                    let selectedItem: ActionQuickPickItem;
                    if (1 === QUICK_PICKS.length) {
                        selectedItem = QUICK_PICKS[0];
                    } else {
                        selectedItem = await vscode.window.showQuickPick(
                            QUICK_PICKS,
                            {
                                placeHolder: "Select the workspace, where you want to run the command ...",
                            }
                        );
                    }

                    if (selectedItem) {
                        if (selectedItem.action) {
                            await selectedItem.action();
                        }
                    }
                } catch (e) {
                    showError(e);
                }
            }),

            // openURI
            vscode.commands.registerCommand('extension.remote.workspace.openURI', async () => {
                try {
                    const URI_VALUE = await vscode.window.showInputBox({
                        password: false,
                        placeHolder: 'Enter a supported URI here ...',
                        prompt: "Open Remote URI",
                        validateInput: (v) => {
                            try {
                                if (!vscode_helpers.isEmptyString(v)) {
                                    const U = vscode.Uri.parse( v.trim() );
                                    if (!isSchemeSupported(U)) {
                                        return `Unsupported protocol '${ U.scheme }'!`;
                                    }
                                }
                            } catch (e) {
                                if (e instanceof Error) {
                                    return e.message;
                                } else {
                                    return vscode_helpers.toStringSafe(e);
                                }
                            }
                        }
                    });

                    if (vscode_helpers.isEmptyString( URI_VALUE )) {
                        return;
                    }

                    const URI = vscode.Uri.parse( URI_VALUE );

                    if (!isSchemeSupported(URI)) {
                        vscode.window.showWarningMessage(
                            `Protocol '${ URI.scheme }' is not supported!`
                        );

                        return;
                    }

                    let name = await vscode.window.showInputBox({
                        password: false,
                        placeHolder: 'Press ENTER to use default ...',
                        prompt: "Custom Name For Remote Workspace"
                    });
                    if (_.isNil(name)) {
                        return;
                    }

                    name = name.trim();
                    if ('' === name) {
                        name = undefined;
                    }

                    vscode.workspace.updateWorkspaceFolders(
                        0, 0,
                        {
                            uri: URI,
                            name: name,
                        },
                    );
                } catch (e) {
                    showError(e);
                }
            }),

            // receiveWorkspaceURI
            vscode.commands.registerCommand('extension.remote.workspace.receiveWorkspaceURI', async () => {
                try {
                    const PORT_VALUE = await vscode.window.showInputBox({
                        password: false,
                        placeHolder: `Enter the TCP port you want to listen on (default: ${ DEFAULT_SHARE_URI_PORT })...`,
                        prompt: "Receive Remote URI",
                        validateInput: (v) => {
                            if (vscode_helpers.isEmptyString(v)) {
                                return;
                            }

                            const PORT = parseInt(
                                vscode_helpers.toStringSafe(v).trim()
                            );

                            if (isNaN(PORT)) {
                                return 'No number entered!';
                            }

                            if (PORT < 1 || PORT > 65535) {
                                return 'Value must be between 0 and 65535!';
                            }
                        }
                    });

                    if (_.isNil( PORT_VALUE )) {
                        return;
                    }

                    let port = parseInt(
                        vscode_helpers.toStringSafe(PORT_VALUE).trim()
                    );
                    if (isNaN(port)) {
                        port = DEFAULT_SHARE_URI_PORT;
                    }

                    let server: Net.Server;
                    const CLOSE_SERVER = () => {
                        try {
                            if (server) {
                                server.close();
                            }
                        } catch (e) {
                            getLogger().trace(e,
                                              'extension.remote.workspace.receiveWorkspaceURI.CLOSE_SERVER()');
                        }
                    };

                    let btn: vscode.StatusBarItem;
                    let cmd: vscode.Disposable;
                    const DISPOSE_BUTTON = () => {
                        vscode_helpers.tryDispose( btn );
                        vscode_helpers.tryDispose( cmd );
                    };

                    const DISPOSE_ALL = () => {
                        DISPOSE_BUTTON();
                        CLOSE_SERVER();
                    };

                    try {
                        server = await SimpleSocket.listen(port, (err, socket) => {
                            if (err) {
                                DISPOSE_ALL();

                                showError(err);
                            } else {
                                socket.readJSON<SharedRemoteUri>().then((sru) => {
                                    (async () => {
                                        if (!sru) {
                                            return;
                                        }

                                        if (vscode_helpers.isEmptyString(sru.uri)) {
                                            return;
                                        }

                                        try {
                                            const URI = vscode.Uri.parse(sru.uri);
                                            if (isSchemeSupported(URI)) {
                                                const SELECTED_ITEM = await vscode.window.showWarningMessage(
                                                    `'${ socket.socket.remoteAddress }' wants to share a remote URI of type '${ URI.scheme }' with you.`,
                                                    {

                                                    },
                                                    {
                                                        title: 'Reject',
                                                        isCloseAffordance: true,
                                                        value: 0,
                                                    },
                                                    {
                                                        title: 'Open In Editor',
                                                        value: 1,
                                                    },
                                                    {
                                                        title: 'Open As Folder',
                                                        value: 2,
                                                    }
                                                );

                                                if (!SELECTED_ITEM) {
                                                    return;
                                                }

                                                if (0 === SELECTED_ITEM.value) {
                                                    return;
                                                }

                                                if (1 === SELECTED_ITEM.value) {
                                                    await vscode_helpers.openAndShowTextDocument({
                                                        content: `${ URI }`,
                                                        language: 'plaintext',
                                                    });
                                                } else if (2 === SELECTED_ITEM.value) {
                                                    vscode.workspace.updateWorkspaceFolders(
                                                        0, 0,
                                                        {
                                                            uri: URI,
                                                        },
                                                    );
                                                }

                                                DISPOSE_ALL();
                                            }
                                        } catch (e) {
                                            showError(e);
                                        }
                                    })().then(() => {
                                    }, (err) => {
                                        showError(err);
                                    });
                                }, (err) => {
                                    showError(err);
                                });
                            }
                        });

                        const CMD_ID = `extension.remote.workspace.receiveWorkspaceURI.button${ nextReceiveRemoteURICommandId++ }`;

                        cmd = vscode.commands.registerCommand(CMD_ID, () => {
                            DISPOSE_ALL();
                        });

                        btn = vscode.window.createStatusBarItem();

                        btn.text = 'Waiting for remote URI ...';
                        btn.tooltip = `... on port ${ port }.\n\nClick here to cancel ...`;
                        btn.command = CMD_ID;

                        btn.show();
                    } catch (e) {
                        DISPOSE_ALL();

                        throw e;
                    }
                } catch (e) {
                    showError(e);
                }
            }),

            // resetRemoteCommandHistory
            vscode.commands.registerCommand('extension.remote.workspace.resetRemoteCommandHistory', async () => {
                await saveStringRepo(KEY_LAST_GIT_ARGS, undefined);
                await saveStringRepo(KEY_LAST_REMOTE_COMMANDS, undefined);
            }),

            // sendWorkspaceURI
            vscode.commands.registerCommand('extension.remote.workspace.sendWorkspaceURI', async () => {
                try {
                    const QUICK_PICKS: WorkspaceQuickPickItem[] = vscode_helpers.asArray(
                        vscode.workspace.workspaceFolders
                    ).filter(ws => isSchemeSupported(ws.uri)).map(wsf => {
                        let name = vscode_helpers.toStringSafe(wsf.name).trim();
                        if ('' === name) {
                            name = `Workspace #${ wsf.index }`;
                        }

                        return {
                            action: async () => {
                                const HOST_AND_PORT = await vscode.window.showInputBox({
                                    password: false,
                                    placeHolder: `HOST_ADDRESS[:TCP_PORT = ${ DEFAULT_SHARE_URI_PORT }]`,
                                    prompt: "Recipient Of Workspace URI",
                                });

                                if (vscode_helpers.isEmptyString(HOST_AND_PORT)) {
                                    return;
                                }

                                let host: string;
                                let port: number;

                                const HOST_PORT_SEP = HOST_AND_PORT.indexOf(':');
                                if (HOST_PORT_SEP > -1) {
                                    host = HOST_AND_PORT.substr(0, HOST_PORT_SEP).trim();
                                    port = parseInt(
                                        HOST_AND_PORT.substr(HOST_PORT_SEP + 1).trim()
                                    );
                                } else {
                                    host = HOST_AND_PORT;
                                }

                                host = vscode_helpers.normalizeString(host);
                                if ('' === host) {
                                    host = '127.0.0.1';
                                }

                                if (isNaN(port)) {
                                    port = DEFAULT_SHARE_URI_PORT;
                                }

                                const SOCKET = await SimpleSocket.connect(port, host);
                                try {
                                    await SOCKET.writeJSON<SharedRemoteUri>({
                                        uri: `${ wsf.uri }`
                                    });
                                } finally {
                                    SOCKET.end();
                                }
                            },
                            folder: wsf,
                            label: name,
                        };
                    });

                    if (QUICK_PICKS.length < 1) {
                        vscode.window.showWarningMessage(
                            'No workspace folder found, which can be shared!'
                        );

                        return;
                    }

                    let selectedItem: WorkspaceQuickPickItem;
                    if (1 === QUICK_PICKS.length) {
                        selectedItem = QUICK_PICKS[0];
                    } else {
                        selectedItem = await vscode.window.showQuickPick(QUICK_PICKS, {
                            canPickMany: false,
                            placeHolder: 'Select the workspace, you would like to share ...',
                        });
                    }

                    if (selectedItem) {
                        await selectedItem.action();
                    }
                } catch (e) {
                    showError(e);
                }
            }),
        );
    });

    // show CHANGELOG
    WF.next(async () => {
        let versionToUpdate: string | false = false;

        try {
            if (packageFile) {
                const VERSION = vscode_helpers.normalizeString( packageFile.version );
                if ('' !== VERSION) {
                    const LAST_VERSION = vscode_helpers.normalizeString(
                        context.globalState.get(KEY_LAST_KNOWN_VERSION, '')
                    );
                    if (LAST_VERSION !== VERSION) {
                        const CHANGELOG_FILE = Path.resolve(
                            Path.join(__dirname, '../CHANGELOG.md')
                        );

                        if (await vscode_helpers.isFile(CHANGELOG_FILE)) {
                            const MARKDOWN = await FSExtra.readFile(CHANGELOG_FILE, 'utf8');

                            let changeLogView: vscode.WebviewPanel;
                            try {
                                changeLogView = vscode.window.createWebviewPanel(
                                    'vscodeRemoteWorkspaceChangelog',
                                    'Remote Workspace ChangeLog',
                                    vscode.ViewColumn.One,
                                    {
                                        enableCommandUris: false,
                                        enableFindWidget: false,
                                        enableScripts: false,
                                        retainContextWhenHidden: true,
                                    }
                                );

                                changeLogView.webview.html = Marked(MARKDOWN, {
                                    breaks: true,
                                    gfm: true,
                                    mangle: true,
                                    silent: true,
                                    tables: true,
                                    sanitize: true,
                                });
                            } catch (e) {
                                vscode_helpers.tryDispose( changeLogView );

                                throw e;
                            }
                        }

                        versionToUpdate = VERSION;
                    }
                }
            }
        } catch {
        } finally {
            try {
                if (false !== versionToUpdate) {
                    await context.globalState.update(KEY_LAST_KNOWN_VERSION,
                                                     versionToUpdate);
                }
            } catch { }
        }
    });

    WF.next(() => {
        outputChannel.appendLine('');
        outputChannel.appendLine('Extension has been initialized.');
        outputChannel.appendLine('');
    });

    if (!isDeactivating) {
        try {
            await WF.start();
        } catch (e) {
            try {
                const L = logger;
                if (L) {
                    L.trace(e, 'extension.activate()');
                }
            } catch { }
        }
    }
}

/**
 * Returns an UInt8 array as buffer.
 *
 * @param {Uint8Array} arr The input value.
 * @param {boolean} [noNull] Do not return a (null) / (undefined) value.
 *
 * @return {Buffer} The output value.
 */
export function asBuffer(arr: Uint8Array, noNull = true): Buffer {
    if (Buffer.isBuffer(arr)) {
        return arr;
    }

    noNull = vscode_helpers.toBooleanSafe(noNull, true);

    if (_.isNil(arr)) {
        return noNull ? Buffer.alloc(0)
                      : <any>arr;
    }

    return new Buffer(arr);
}

export function deactivate() {
    if (isDeactivating) {
        return;
    }

    isDeactivating = true;
}

/**
 * Executes a command on a remote workspace.
 *
 * @param {vscode.Uri} uri The URI where to execute.
 * @param {string} cmd The command to execute.
 *
 * @return {Promise<ExecuteRemoteCommandResult>} The promise with the result of the execution.
 */
export function executeRemoteCommand(uri: vscode.Uri, cmd: string) {
    cmd = vscode_helpers.toStringSafe(cmd);

    return new Promise<ExecuteRemoteCommandResult>((resolve, reject) => {
        let completedExecuted = false;
        const COMPLETED = (err: any, result?: ExecuteRemoteCommandResult) => {
            if (completedExecuted) {
                return;
            }
            completedExecuted = true;

            if (err) {
                let errMsg: string;
                if (err instanceof Error) {
                    errMsg = `${
                        vscode_helpers.isEmptyString(err.name) ? '' : `(${ vscode_helpers.toStringSafe(err.name).trim() }) `
                    }${ vscode_helpers.toStringSafe(err.message) }`;
                } else {
                    errMsg = vscode_helpers.toStringSafe(err);
                }

                outputChannel.appendLine(`[ERROR: '${ errMsg }']`);
                outputChannel.appendLine('');

                reject(err);
            } else {
                outputChannel.appendLine('[Done]');
                outputChannel.appendLine('');

                if (result && result.stdOut && result.stdOut.length > 0) {
                    outputChannel.appendLine('');
                    outputChannel.appendLine( result.stdOut.toString('utf8') );
                }

                resolve(result);
            }
        };

        let executionCount = 0;

        const ARGS: ExecuteRemoteCommandArguments = {
            callback: (err, response) => {
                COMPLETED(err, response);
            },
            command: cmd,
            executionCount: undefined,
            increaseExecutionCounter: () => {
                ++executionCount;
            },
            uri: uri,
        };

        // ARGS.executionCount
        Object.defineProperty(ARGS, 'executionCount', {
            get: () => {
                return executionCount;
            }
        });

        try {
            outputChannel.append(`Executing '${ cmd }' on '${ uriWithoutAuthority(uri) }' ... `);

            vscode_helpers.EVENTS.emit(
                EVENT_EXECUTE_REMOTE_COMMAND,
                ARGS,
            );
        } catch (e) {
            COMPLETED(e);
        }
    });
}

/**
 * Extracts the host, port and credentials from an URI.
 *
 * @param {vscode.Uri} uri The URI.
 * @param {number} [defaultPort] The default TCP port.
 *
 * @return {Promise<HostAndCredentials>} The promise with the extracted data.
 */
export async function extractHostAndCredentials(uri: vscode.Uri, defaultPort?: number): Promise<HostAndCredentials> {
    if (_.isNaN(uri)) {
        return <any>uri;
    }

    const DATA: HostAndCredentials = {
        host: undefined,
        password: undefined,
        port: undefined,
        user: undefined,
    };

    const PARAMS = getUriParams(uri);

    let userAndPwd: string | false = false;
    {
        // external auth file?
        let authFile = vscode_helpers.toStringSafe( PARAMS['auth'] );
        if (!vscode_helpers.isEmptyString(authFile)) {
            authFile = mapToUsersHome( authFile );

            if (await vscode_helpers.isFile(authFile)) {
                userAndPwd = (await FSExtra.readFile(authFile, 'utf8')).trim();
            }
        }
    }

    const UPDATE_HOST_AND_PORT = (hostAndPort: string) => {
        hostAndPort = vscode_helpers.toStringSafe(hostAndPort).trim();

        const HOST_PORT_SEP = hostAndPort.indexOf( ':' );
        if (HOST_PORT_SEP > -1) {
            DATA.host = hostAndPort.substr(0, HOST_PORT_SEP).trim();
            DATA.port = parseInt(
                hostAndPort.substr(HOST_PORT_SEP + 1).trim()
            );
        } else {
            DATA.host = hostAndPort;
            DATA.port = undefined;
        }
    };

    const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
    {
        const AUTH_HOST_SEP = AUTHORITITY.lastIndexOf( '@' );
        if (AUTH_HOST_SEP > -1) {
            if (false === userAndPwd) {
                userAndPwd = AUTHORITITY.substr(0, AUTH_HOST_SEP);
            }

            UPDATE_HOST_AND_PORT(
                AUTHORITITY.substr(AUTH_HOST_SEP + 1)
            );
        } else {
            UPDATE_HOST_AND_PORT(
                AUTHORITITY
            );
        }
    }

    if (false !== userAndPwd) {
        const USER_AND_PWD_SEP = userAndPwd.indexOf( ':' );
        if (USER_AND_PWD_SEP > -1) {
            DATA.user = userAndPwd.substr(0, USER_AND_PWD_SEP);
            DATA.password = userAndPwd.substr(USER_AND_PWD_SEP + 1);
        } else {
            DATA.user = userAndPwd;
        }
    }

    if (vscode_helpers.isEmptyString(DATA.host)) {
        DATA.host = '127.0.0.1';
    }

    if (isNaN(DATA.port)) {
        DATA.port = parseInt(
            vscode_helpers.toStringSafe(defaultPort).trim()
        );
    }
    if (isNaN(DATA.port)) {
        DATA.port = undefined;
    }

    if (vscode_helpers.isEmptyString(DATA.user)) {
        DATA.user = undefined;
    }

    if ('' === vscode_helpers.toStringSafe(DATA.password)) {
        DATA.password = undefined;
    }

    return DATA;
}

function getClasses() {
    return [
        vscrw_fs_sftp.SFTPFileSystem,
        vscrw_fs_ftp.FTPFileSystem,
        vscrw_fs_dropbox.DropboxFileSystem,
        vscrw_fs_azure.AzureBlobFileSystem,
        vscrw_fs_s3.S3FileSystem,
        vscrw_fs_slack.SlackFileSystem,
        vscrw_fs_webdav.WebDAVFileSystem,
        vscrw_fs_ftps.FTPsFileSystem,
    ];
}

/**
 * Generates a connection cache key from an URI.
 *
 * @param {vscode.Uri} uri The URI.
 *
 * @return {string} The generated key.
 */
export function getConnectionCacheKey(uri: vscode.Uri): string {
    if (_.isNil(uri)) {
        return <any>uri;
    }

    return `${ vscode_helpers.normalizeString(uri.scheme) }\n` +
           `${ vscode_helpers.toStringSafe(uri.authority) }\n` +
           `${ JSON.stringify( getUriParams( uri ) ) }\n` +
           `${ vscode_helpers.normalizeString(uri.fragment) }`;
}

/**
 * Gets the extension-wide logger.
 *
 * @return {vscode_helpers.Logger} The extension logger.
 */
export function getLogger() {
    return logger;
}

function getStringRepo(key: string, defaultValue?: StringRepository) {
    key = vscode_helpers.toStringSafe(key);

    if (arguments.length < 2) {
        defaultValue = {};
    }

    let repo: StringRepository;

    try {
        repo = extension.workspaceState
                        .get<StringRepository>(key, defaultValue);
    } catch { }

    if (_.isNil(repo)) {
        repo = defaultValue;
    }

    return repo;
}

/**
 * Returns the parameters of an URI.
 *
 * @param {URL.Url|vscode.Uri} uri The URI.
 *
 * @return {KeyValuePairs<string>} The extracted / loaded parameters.
 */
export function getUriParams(uri: URL.Url | vscode.Uri): KeyValuePairs<string> {
    if (_.isNil(uri)) {
        return <any>uri;
    }

    const URI_PARAMS = uriParamsToObject(uri);

    const PARAMS: KeyValuePairs<string> = {};
    const APPLY_PARAMS = (paramsAndValues: any) => {
        if (_.isNil(paramsAndValues)) {
            return;
        }

        for (const P in paramsAndValues) {
            const PARAM_KEY = vscode_helpers.normalizeString(P);

            if (PARAM_KEY !== KEY_PARAMS) {
                PARAMS[ PARAM_KEY ] = vscode_helpers.toStringSafe( paramsAndValues[P] );
            }
        }
    };

    // first the explicit ones
    APPLY_PARAMS( URI_PARAMS );

    // now from external JSON file?
    let paramsFile = vscode_helpers.toStringSafe( URI_PARAMS[KEY_PARAMS] );
    if (!vscode_helpers.isEmptyString(paramsFile)) {
        if (!Path.isAbsolute(paramsFile)) {
            paramsFile = Path.join(
                OS.homedir(), paramsFile
            );
        }

        paramsFile = Path.resolve(paramsFile);

        APPLY_PARAMS(
            JSON.parse(
                FSExtra.readFileSync(paramsFile, 'utf8')
            )
        );
    }

    // we do not need the 'params' parameter anymore
    delete PARAMS[ KEY_PARAMS ];

    return PARAMS;
}

function isRemoteExecutionSupported(uri: vscode.Uri) {
    if (uri) {
        const SCHEME = vscode_helpers.normalizeString(uri.scheme);

        switch (SCHEME) {
            case vscrw_fs_ftp.FTPFileSystem.scheme:
            case vscrw_fs_ftps.FTPsFileSystem.scheme:
            case vscrw_fs_sftp.SFTPFileSystem.scheme:
                return REGISTRATED_SCHEMES.indexOf(SCHEME) > -1;
        }
    }

    return false;
}

/**
 * Checks if a URI scheme is supported by that extension.
 *
 * @param {vscode.Uri} uri The URI to check.
 *
 * @return {boolean} Is supported or not.
 */
export function isSchemeSupported(uri: vscode.Uri) {
    if (uri) {
        return getClasses().map(c => <string>c.scheme)
                           .indexOf( vscode_helpers.normalizeString(uri.scheme) ) > -1;
    }

    return false;
}

/**
 * Checks if a value represents (true).
 *
 * @param {any} value The value to check.
 * @param {boolean} [ifEmpty] The custom value to return if value is an empty string.
 *
 * @return {boolean} Represents (true) or not.
 */
export function isTrue(value: any, ifEmpty = false) {
    if (vscode_helpers.isEmptyString(value)) {
        return vscode_helpers.toBooleanSafe(ifEmpty);
    }

    return (true === value) || ['1', 'true', 'y', 'yes'].indexOf(
        vscode_helpers.normalizeString(value)
    ) > -1;
}

/**
 * Maps a path to a the current user's home directory (if relative).
 *
 * @param {string} p The input value.
 *
 * @return {string} The mapped path.
 */
export function mapToUsersHome(p: string) {
    p = vscode_helpers.toStringSafe(p);

    if (!Path.isAbsolute(p)) {
        p = Path.join(
            OS.homedir(), p
        );
    }

    return Path.resolve(p);
}

/**
 * Normalizes a path.
 *
 * @param {string} p The path to normalize.
 *
 * @return {string} The normalized path.
 */
export function normalizePath(p: string) {
    p = vscode_helpers.toStringSafe(p);
    p = p.split( Path.sep )
         .join('/');

    while (p.trim().startsWith('/')) {
        p = p.substr(p.indexOf('/') + 1);
    }

    while (p.trim().endsWith('/')) {
        p = p.substr(0, p.lastIndexOf('/'));
    }

    if (!p.trim().startsWith('/')) {
        p = '/' + p;
    }

    return p;
}

async function saveStringRepo(key: string, repo: StringRepository) {
    key = vscode_helpers.toStringSafe(key);

    try {
        await extension.workspaceState
                       .update(key, repo);

        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Shows an error popup.
 *
 * @param {any} err The error to show.
 */
export async function showError(err): Promise<string | undefined> {
    if (err) {
        return await vscode.window.showErrorMessage(
            `ERROR: ${ vscode_helpers.toStringSafe(err) }`
        );
    }
}

function toUriKey(uri: vscode.Uri) {
    if (uri) {
        const URI_STR = `${ uri }`;
        const URI_NO_AUTH_STR = `${ uriWithoutAuthority(uri) }`;

        return `${ URI_NO_AUTH_STR }\n${ Crypto.createHash('sha256')
                                               .update(new Buffer(URI_STR, 'utf8'))
                                               .digest('hex') }`;
    }
}

function uriParamsToObject(uri: URL.Url | vscode.Uri): KeyValuePairs<string> {
    if (_.isNil(uri)) {
        return <any>uri;
    }

    let params: any;
    if (!vscode_helpers.isEmptyString(uri.query)) {
        // s. https://css-tricks.com/snippets/jquery/get-query-params-object/
        params = uri.query.replace(/(^\?)/, '')
                          .split("&")
                          .map(function(n) { return n = n.split("="), this[vscode_helpers.normalizeString(n[0])] =
                                                                      vscode_helpers.toStringSafe(decodeURIComponent(n[1])), this; }
                          .bind({}))[0];
    }

    return params || {};
}

/**
 * Returns a new URI object without authority / credentials.
 *
 * @param {vscode.Uri} uri The input value.
 *
 * @return {vscode.Uri} The output value.
 */
export function uriWithoutAuthority(uri: vscode.Uri): vscode.Uri {
    if (uri) {
        const SCHEME = vscode_helpers.normalizeString(uri.scheme);

        let authority = '';
        switch (SCHEME) {
            case vscrw_fs_ftp.FTPFileSystem.scheme:
            case vscrw_fs_ftps.FTPsFileSystem.scheme:
            case vscrw_fs_sftp.SFTPFileSystem.scheme:
            case vscrw_fs_webdav.WebDAVFileSystem.scheme:
                {
                    authority = vscode_helpers.toStringSafe(uri.authority);

                    const CREDENTIAL_SEP = authority.indexOf('@');
                    if (CREDENTIAL_SEP > -1) {
                        authority = authority.substr(CREDENTIAL_SEP + 1).trim();
                    }
                }
                break;
        }

        return vscode.Uri.parse(`${ uri.scheme }://${ authority }${ uri.path }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
