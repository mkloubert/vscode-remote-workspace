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
import * as HTTPs from 'https';
import * as Path from 'path';
const Slack = require('@slack/client');
import * as URL from 'url';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface SlackConnection {
    channel: string;
    client: any;
    token: string;
}

interface SlackFile {
    created?: number;
    id?: string;
    internal_name?: string;
    name?: string;
    size?: number;
    timestamp?: number;
    url_private_download?: string;
}

interface SlackFileStat extends vscode.FileStat {
    id?: string;
    internal_name?: string;
    url_private_download?: string;
}

/**
 * Slack file system.
 */
export class SlackFileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        throw vscode.FileSystemError.NoPermissions( uri );
    }

    /**
     * @inheritdoc
     */
    public async delete(uri: vscode.Uri, options: { recursive: boolean }) {
        throw vscode.FileSystemError.NoPermissions( uri );
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: SlackConnection) => TResult | PromiseLike<TResult>
    ): Promise<TResult> {
        const CONN = await this.openConnection(uri);
        if (action) {
            return await Promise.resolve(
                action( CONN )
            );
        }
    }

    private list(uri: vscode.Uri) {
        return this.forConnection(uri, (conn) => {
            return new Promise<SlackFile[]>(async (resolve, reject) => {
                const ALL_FILES: SlackFile[] = [];

                let completedInvoked = false;
                const COMPLETED = (err: any) => {
                    if (completedInvoked) {
                        return;
                    }
                    completedInvoked = true;

                    if (err) {
                        reject( err );
                    } else {
                        resolve( ALL_FILES );
                    }
                };

                try {
                    const STAT = await this.statInner(uri);
                    if (vscode.FileType.Directory !== STAT.type) {
                        throw vscode.FileSystemError.FileNotADirectory( uri );
                    }

                    let currentPage = 0;

                    const NEXT_SEGMENT = () => {
                        try {
                            ++currentPage;

                            conn.client.files.list({
                                channel: conn.channel,
                                page: currentPage,
                            }, (err, info) => {
                                if (err) {
                                    COMPLETED(err);
                                    return;
                                }

                                try {
                                    vscode_helpers.asArray(info.files).forEach((f: SlackFile) => {
                                        ALL_FILES.push( f );
                                    });

                                    let isDone = true;
                                    if (info.paging) {
                                        isDone = currentPage >= info.paging.pages;
                                    }

                                    if (isDone) {
                                        COMPLETED(null);
                                    } else {
                                        NEXT_SEGMENT();
                                    }
                                } catch (e) {
                                    COMPLETED(e);
                                }
                            });
                        } catch (e) {
                            COMPLETED(e);
                        }
                    };

                    NEXT_SEGMENT();
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private async openConnection(uri: vscode.Uri): Promise<SlackConnection> {
        // format:
        //
        // slack://token@channel[/]

        const PARAMS = vscrw.uriParamsToObject(uri);

        let channel: string;

        let token: string | false = false;

        {
            // external auth file?
            let authFile = vscode_helpers.toStringSafe( PARAMS['auth'] );
            if (!vscode_helpers.isEmptyString(authFile)) {
                authFile = vscrw.mapToUsersHome( authFile );

                if (await vscode_helpers.isFile(authFile)) {
                    token = (await FSExtra.readFile(authFile, 'utf8')).trim();
                }
            }
        }

        const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
        {
            const TOKEN_CHANNEL_SEP = AUTHORITITY.indexOf( '@' );
            if (TOKEN_CHANNEL_SEP > -1) {
                if (false === token) {
                    token = AUTHORITITY.substr(0, TOKEN_CHANNEL_SEP).trim();
                }

                channel = AUTHORITITY.substr(TOKEN_CHANNEL_SEP + 1).toUpperCase().trim();
            }
        }

        if (false === token) {
            token = undefined;
        }

        if (vscode_helpers.isEmptyString(channel)) {
            channel = undefined;
        }
        if (vscode_helpers.isEmptyString(token)) {
            token = undefined;
        }

        return {
            channel: channel,
            client: new Slack.WebClient(token),
            token: <string>token,
        };
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        return (await this.list(uri)).map(f => {
            return <vscrw_fs.DirectoryEntry>[ f.name, vscode.FileType.File ];
        });
    }

    /**
     * @inheritdoc
     */
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, (conn) => {
            return new Promise<Uint8Array>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    const STAT = await this.statInner(uri);
                    if (vscode.FileType.File !== STAT.type) {
                        throw vscode.FileSystemError.FileIsADirectory( uri );
                    }

                    if (_.isNil(conn.token)) {
                        throw vscode.FileSystemError.NoPermissions( uri );
                    }

                    if (vscode_helpers.isEmptyString(STAT.url_private_download)) {
                        throw vscode.FileSystemError.Unavailable( uri );
                    }

                    const DOWNLOAD_URL = URL.parse( STAT.url_private_download );

                    HTTPs.request({
                        hostname: DOWNLOAD_URL.host,
                        headers: {
                            'Authorization': `Bearer ${ conn.token }`,
                        },
                        path: DOWNLOAD_URL.path,
                    }, (resp) => {
                        if (200 === resp.statusCode) {
                            vscode_helpers.readAll(resp).then((data) => {
                                COMPLETED(null,
                                          vscrw.toUInt8Array(data));
                            }, (err) => {
                                COMPLETED(err);
                            });
                        } else {
                            COMPLETED(
                                new Error(`Unexpected response ${resp.statusCode}: '${resp.statusMessage}'`)
                            );
                        }
                    }).end();
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('slack',
                                                        new SlackFileSystem(),
                                                        { isCaseSensitive: false })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        throw vscode.FileSystemError.NoPermissions( oldUri );
    }

    /**
     * @inheritdoc
     */
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this.statInner( uri );
    }

    private statInner(uri: vscode.Uri): Promise<SlackFileStat> {
        return this.forConnection(uri, async (conn) => {
            if ('/' === vscrw.normalizePath(uri.path)) {
                if (!_.isNil(conn.channel)) {
                    return {
                        type: vscode.FileType.Directory,
                        ctime: 0,
                        mtime: 0,
                        size: 0,
                    };
                }
            }

            if (!_.isNil(conn.channel)) {
                if (2 === uri.path.split('/').length) {
                    const PATH = vscrw.normalizePath(
                        vscode_helpers.normalizeString(uri.path)
                    );

                    const PARENT_PATH = Path.dirname( uri.path );
                    const PARENT_URI = uriWithNewPath(
                        uri, PARENT_PATH
                    );

                    const FOUND_FILE = vscode_helpers.from( await this.list(PARENT_URI) ).orderByDescending(f => {
                        return f.created;
                    }).thenByDescending(f => {
                        return f.timestamp;
                    }).firstOrDefault(f => {
                        return PATH === vscrw.normalizePath(
                            vscode_helpers.normalizeString(f.name)
                        );
                    }, false);

                    if (false !== FOUND_FILE) {
                        const STAT: SlackFileStat = {
                            ctime: parseInt( vscode_helpers.toStringSafe(FOUND_FILE.created).trim() ),
                            id: vscode_helpers.toStringSafe(FOUND_FILE.id).trim(),
                            internal_name: vscode_helpers.toStringSafe(FOUND_FILE.internal_name).trim(),
                            mtime: parseInt( vscode_helpers.toStringSafe(FOUND_FILE.timestamp).trim() ),
                            size: parseInt( vscode_helpers.toStringSafe(FOUND_FILE.size).trim() ),
                            type: vscode.FileType.File,
                            url_private_download: FOUND_FILE.url_private_download,
                        };

                        if (isNaN(STAT.ctime)) {
                            STAT.ctime = 0;
                        }
                        if ('' === STAT.id) {
                            STAT.id = undefined;
                        }
                        if ('' === STAT.internal_name) {
                            STAT.internal_name = undefined;
                        }
                        if (isNaN(STAT.mtime)) {
                            STAT.mtime = 0;
                        }
                        if (isNaN(STAT.size)) {
                            STAT.size = 0;
                        }

                        return STAT;
                    }
                }
            }

            throw vscode.FileSystemError.FileNotFound( uri );
        });
    }

    private async tryGetStat(uri: vscode.Uri): Promise<SlackFileStat | false> {
        let stat: SlackFileStat | false;
        try {
            stat = await this.statInner( uri );
        } catch {
            stat = false;
        }

        return stat;
    }

    /**
     * @inheritdoc
     */
    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // TODO: implement
        return {
            dispose: () => {

            }
        };
    }

    /**
     * @inheritdoc
     */
    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }) {
        throw vscode.FileSystemError.NoPermissions( uri );
    }
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`slack://${ uri.authority }${ vscrw.normalizePath(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
