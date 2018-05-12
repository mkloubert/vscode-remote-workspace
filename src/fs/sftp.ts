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
import * as Moment from 'moment';
import * as Path from 'path';
import * as SFTP from 'ssh2-sftp-client';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface SFTPConnection {
    client: SFTP;
}

/**
 * SFTP file system.
 */
export class SFTPFileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.tryGetStat( uri );
            if (false !== STAT) {
                if (vscode.FileType.Directory === STAT.type) {
                    throw vscode.FileSystemError.FileExists( uri );
                } else {
                    throw vscode.FileSystemError.NoPermissions( uri );
                }
            }

            await conn.client.mkdir(
                vscrw.normalizePath(uri.path), true
            );
        });
    }

    /**
     * @inheritdoc
     */
    public async delete(uri: vscode.Uri, options: { recursive: boolean }) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.tryGetStat( uri );
            if (false !== STAT) {
                if (vscode.FileType.Directory === STAT.type) {
                    await conn.client.rmdir(
                        vscrw.normalizePath(uri.path), options.recursive
                    );
                } else {
                    await conn.client.delete(
                        vscrw.normalizePath(uri.path)
                    );
                }

                if (vscode.FileType.Directory === STAT.type) {
                    throw vscode.FileSystemError.FileExists( uri );
                } else {
                    throw vscode.FileSystemError.NoPermissions( uri );
                }
            }

            throw vscode.FileSystemError.FileNotFound( uri );
        });
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: SFTPConnection) => TResult | PromiseLike<TResult>,
        existingConn?: SFTPConnection
    ): Promise<TResult> {
        const USE_EXISTING_CONN = !_.isNil( existingConn );

        const CONN = USE_EXISTING_CONN ? existingConn
                                       : await this.openConnection(uri);
        try {
            if (action) {
                return await Promise.resolve(
                    action( CONN )
                );
            }
        } finally {
            if (!USE_EXISTING_CONN) {
                try {
                    await CONN.client.end();
                } catch { }
            }
        }
    }

    private async openConnection(uri: vscode.Uri): Promise<SFTPConnection> {
        // format:
        //
        // sftp://[user:password@]host:port[/path/to/file/or/folder]

        const NEW_CONNECTION: SFTPConnection = {
            client: new SFTP(),
        };

        let username: string;
        let password: string;
        let host: string;
        let port: number;

        const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
        {
            const AUTH_HOST_SEP = AUTHORITITY.indexOf( '@' );
            if (AUTH_HOST_SEP > -1) {
                const HOST_AND_PORT = AUTHORITITY.substr(AUTH_HOST_SEP + 1).trim();
                const USER_AND_PWD = AUTHORITITY.substr(0, AUTH_HOST_SEP);

                const HOST_PORT_SEP = HOST_AND_PORT.indexOf( ':' );
                if (HOST_PORT_SEP > -1) {
                    host = HOST_AND_PORT.substr(0, HOST_PORT_SEP).trim();
                    port = parseInt(
                        HOST_AND_PORT.substr(HOST_PORT_SEP + 1).trim()
                    );
                } else {
                    host = HOST_AND_PORT;
                }

                const USER_AND_PWD_SEP = USER_AND_PWD.indexOf( ':' );
                if (USER_AND_PWD_SEP > -1) {
                    username = USER_AND_PWD.substr(0, USER_AND_PWD_SEP);
                    password = USER_AND_PWD.substr(USER_AND_PWD_SEP + 1);
                } else {
                    username = USER_AND_PWD;
                }
            } else {
                host = AUTHORITITY;
            }
        }

        if (vscode_helpers.isEmptyString( host )) {
            host = '127.0.0.1';
        }
        if (isNaN( port )) {
            port = 22;
        }
        if (vscode_helpers.isEmptyString( username )) {
            username = undefined;
        }
        if ('' === vscode_helpers.toStringSafe( password )) {
            password = undefined;
        }

        const OPTS = {
            host: host,
            port: port,
            username: username,
            password: password,
        };

        await NEW_CONNECTION.client.connect(
            OPTS
        );

        return NEW_CONNECTION;
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return this.forConnection(uri, async (conn) => {
            const ITEMS: [string, vscode.FileType][] = [];

            try {
                const LIST = await conn.client.list(
                    vscrw.normalizePath( uri.path )
                );

                LIST.map(i => toFileStat(i)).forEach(i => {
                    ITEMS.push([
                        i[0], i[1].type
                    ]);
                });
            } catch {
                throw vscode.FileSystemError.FileNotFound( uri );
            }

            return vscode_helpers.from( ITEMS ).orderBy(i => {
                return i[1] === vscode.FileType.Directory ? 0 : 1;
            }).thenBy(i => {
                return vscode_helpers.normalizeString( i[0] );
            }).toArray();
        });
    }

    /**
     * @inheritdoc
     */
    public readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, async (conn) => {
            let data: Uint8Array | false = false;

            try {
                data = vscrw.toUInt8Array(
                    await vscode_helpers.asBuffer(
                        await conn.client.get(
                            vscrw.normalizePath( uri.path )
                        )
                    )
                );
            } catch {
                data = false;
            }

            if (false === data) {
                throw vscode.FileSystemError.FileNotFound( uri );
            }

            return data;
        });
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('sftp',
                                                        new SFTPFileSystem(),
                                                        { isCaseSensitive: true })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(oldUri, async (conn) => {
            const OLD_STAT = await this.tryGetStat( oldUri, conn );
            if (false === OLD_STAT) {
                throw vscode.FileSystemError.FileNotFound( oldUri );
            }

            const NEW_STAT = await this.tryGetStat( newUri, conn );
            if (false !== NEW_STAT) {
                if (vscode.FileType.Directory === NEW_STAT.type) {
                    throw vscode.FileSystemError.FileIsADirectory( newUri );
                }

                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists( newUri );
                }
            }

            await conn.client.rename(
                vscrw.normalizePath( oldUri.path ),
                vscrw.normalizePath( newUri.path ),
            );
        });
    }

    /**
     * @inheritdoc
     */
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this.statInner( uri );
    }

    private async statInner(uri: vscode.Uri, existingConn?: SFTPConnection): Promise<vscode.FileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: Moment.utc().unix(),
                size: 0,
            };
        }

        return await this.forConnection(uri, async (conn) => {
            let stat: vscode.FileStat | false = false;

            try {
                const URI_PATH = vscrw.normalizePath( uri.path );

                const NAME = Path.basename( URI_PATH );
                const DIR = vscrw.normalizePath( Path.dirname( URI_PATH ) );

                const LIST = await conn.client.list( DIR );

                for (const ITEM of LIST) {
                    if (ITEM.name === NAME) {
                        stat = toFileStat( ITEM )[1];
                        break;
                    }
                }
            } catch { }

            if (false === stat) {
                throw vscode.FileSystemError.FileNotFound( uri );
            }

            return stat;
        }, existingConn);
    }

    private async tryGetStat(uri: vscode.Uri, existingConn?: SFTPConnection): Promise<vscode.FileStat | false> {
        let stat: vscode.FileStat | false;
        try {
            stat = await this.statInner( uri, existingConn );
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
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.tryGetStat(uri, conn);

            if (false === STAT) {
                if (!options.create) {
                    throw vscode.FileSystemError.FileNotFound( uri );
                }
            } else {
                if (vscode.FileType.Directory === STAT.type) {
                    throw vscode.FileSystemError.FileIsADirectory( uri );
                }

                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists( uri );
                }
            }

            await conn.client.put(
                new Buffer( content ),
                vscrw.normalizePath( uri.path ),
            );
        });
    }
}

function toFileStat(fi: SFTP.FileInfo): [ string, vscode.FileStat ] {
    if (fi) {
        const STAT: vscode.FileStat = {
            type: vscode.FileType.Unknown,
            ctime: 0,
            mtime: Moment.utc().unix(),
            size: 0,
        };

        if ('d' === fi.type) {
            STAT.type = vscode.FileType.Directory;
        } else if ('-' === fi.type) {
            STAT.type = vscode.FileType.File;
            STAT.size = fi.size;
            STAT.ctime = fi.modifyTime;
            STAT.mtime = fi.modifyTime;
        }

        return [ fi.name, STAT ];
    }
}
