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
import * as FSExtra from 'fs-extra';
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
 * Name, which tells search providers to clear their file search caches.
 */
export const EVENT_CLEAR_FILE_SEARCH_CACHE = 'vscrwClearFileSearchCache';
/**
 * Name, which tells search providers to clear all of their search caches.
 */
export const EVENT_CLEAR_SEARCH_CACHE = 'vscrwClearSearchCache';
/**
 * Name, which tells search providers to clear their text search caches.
 */
export const EVENT_CLEAR_TEXT_SEARCH_CACHE = 'vscrwClearTextSearchCache';
/**
 * The name of the extension's directory inside the user's home directory.
 */
export const EXTENSION_DIR = '.vscode-remote-workspace';
let isDeactivating = false;
let logger: vscode_helpers.Logger;
let nextReceiveRemoteURICommandId = Number.MIN_SAFE_INTEGER;

export async function activate(context: vscode.ExtensionContext) {
    const WF = vscode_helpers.buildWorkflow();

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

            let logMsg = vscode_helpers.toStringSafe(ctx.message);
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

    WF.next(() => {
        for (const C of getClasses()) {
            try {
                C.register( context );
            } catch (e) {
                showError(e);
            }
        }
    });

    // commands
    WF.next(() => {
        context.subscriptions.push(
            // clearFileSearchCache
            vscode.commands.registerCommand('extension.remote.workspace.clearFileSearchCache', async () => {
                try {
                    vscode_helpers.EVENTS.emit(EVENT_CLEAR_FILE_SEARCH_CACHE,
                                               null);
                } catch (e) {
                    showError(e);
                }
            }),

            // clearSearchCache
            vscode.commands.registerCommand('extension.remote.workspace.clearSearchCache', async () => {
                try {
                    vscode_helpers.EVENTS.emit(EVENT_CLEAR_SEARCH_CACHE,
                                               null);
                } catch (e) {
                    showError(e);
                }
            }),

            // clearTextSearchCache
            vscode.commands.registerCommand('extension.remote.workspace.clearTextSearchCache', async () => {
                try {
                    vscode_helpers.EVENTS.emit(EVENT_CLEAR_TEXT_SEARCH_CACHE,
                                               null);
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

    vscode_helpers.EVENTS.removeAllListeners();
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

    const PARAMS = uriParamsToObject(uri);

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
           `${ JSON.stringify( uriParamsToObject( uri ) ) }\n` +
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

/**
 * Extracts the query parameters of an URI to an object.
 *
 * @param {URL.Url|vscode.Uri} uri The URI.
 *
 * @return {deploy_contracts.KeyValuePairs<string>} The parameters of the URI as object.
 */
export function uriParamsToObject(uri: URL.Url | vscode.Uri): KeyValuePairs<string> {
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
