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

/**
 * A key value paris.
 */
export type KeyValuePairs<TValue = any> = { [key: string]: TValue };

let isDeactivating = false;

export async function activate(context: vscode.ExtensionContext) {
    const WF = vscode_helpers.buildWorkflow();

    WF.next(() => {
        const CLASSES = [
            vscrw_fs_sftp.SFTPFileSystem,
            vscrw_fs_ftp.FTPFileSystem,
            vscrw_fs_dropbox.DropboxFileSystem,
            vscrw_fs_azure.AzureBlobFileSystem,
            vscrw_fs_s3.S3FileSystem,
            vscrw_fs_slack.SlackFileSystem,
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
        await WF.start();
    }
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
 * Checks if a value represents (true).
 *
 * @param {any} value The value to check.
 *
 * @return {boolean} Represents (true) or not.
 */
export function isTrue(value: any) {
    return (true === value) || ['1', 'true', 'y', 'yes'].indexOf(
        vscode_helpers.normalizeString(value)
    ) > -1;
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
 * Converts a buffer to an UInt8 array.
 *
 * @param {Buffer} buff The input value.
 *
 * @return {Uint8Array} The output value.
 */
export function toUInt8Array(buff: Buffer): Uint8Array {
    if (_.isNil(buff)) {
        return <any>buff;
    }

    const ARR = new Uint8Array( buff.length );
    for (let i = 0; i < buff.length; i++) {
        ARR[i] = buff.readUInt8(i);
    }

    return ARR;
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
