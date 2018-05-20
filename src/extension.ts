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
import * as OS from 'os';
import * as Path from 'path';
import * as URL from 'url';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw_fs_azure from './fs/azure';
import * as vscrw_fs_dropbox from './fs/dropbox';
import * as vscrw_fs_ftp from './fs/ftp';
import * as vscrw_fs_s3 from './fs/s3';
import * as vscrw_fs_sftp from './fs/sftp';
import * as vscrw_fs_slack from './fs/slack';
import * as vscrw_fs_webdav from './fs/webdav';

/**
 * A key value paris.
 */
export type KeyValuePairs<TValue = any> = { [key: string]: TValue };

/**
 * The name of the extension's directory inside the user's home directory.
 */
export const EXTENSION_DIR = '.vscode-remote-workspace';
let isDeactivating = false;
let logger: vscode_helpers.Logger;

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
        const CLASSES = [
            vscrw_fs_sftp.SFTPFileSystem,
            vscrw_fs_ftp.FTPFileSystem,
            vscrw_fs_dropbox.DropboxFileSystem,
            vscrw_fs_azure.AzureBlobFileSystem,
            vscrw_fs_s3.S3FileSystem,
            vscrw_fs_slack.SlackFileSystem,
            vscrw_fs_webdav.WebDAVFileSystem,
        ];

        for (const C of CLASSES) {
            try {
                C.register( context );
            } catch (e) {
                showError(e);
            }
        }
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
