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
const jsFTP = require('jsftp');
const ParseListening = require("parse-listing");
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface FTPConnection {
    client: any;
}

interface FTPDirectoryItem {
    name: string;
    size: string;
    time: number;
    type: number;
}

/**
 * FTP file system.
 */
export class FTPFileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        await this.forConnection(uri, (conn) => {
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                const MKDIR = (dir: string) => {
                    dir = vscrw.normalizePath(dir);
                    const U = uriWithNewPath(uri, dir);

                    return new Promise<boolean>(async (res, rej) => {
                        const COMP = vscode_helpers.createCompletedAction(res, rej);

                        try {
                            if ('/' !== dir) {
                                const STAT = await this.tryGetStat(U, conn);
                                if (false === STAT) {
                                    conn.client.raw('mkd', [ dir ], (err) => {
                                        if (err) {
                                            COMP(err);
                                        } else {
                                            COMP(null, true);
                                        }
                                    });
                                } else {
                                    if (vscode.FileType.Directory !== STAT.type) {
                                        throw vscode.FileSystemError.FileNotADirectory(U);
                                    } else {
                                        COMP(null, false);  // already exists
                                    }
                                }
                            } else {
                                COMP(null, false);  // not the root
                            }
                        } catch (e) {
                            COMP(e);
                        }
                    });
                };

                try {
                    const PARTS = vscrw.normalizePath(uri.path).split('/');
                    for (let i = 0; i < PARTS.length; i++) {
                        await MKDIR(
                            vscode_helpers.from(PARTS)
                                          .take(i + 1)
                                          .toArray()
                                          .join('/')
                        );
                    }

                    COMPLETED(null);
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private async dele(uri: vscode.Uri, existingConn?: FTPConnection) {
        await this.forConnection(uri, (conn) => {
            return new Promise<void>(async (res, rej) => {
                const COMP = vscode_helpers.createCompletedAction(res, rej);

                try {
                    const STAT = await this.statInner(uri, conn);
                    if (vscode.FileType.Directory === STAT.type) {
                        throw vscode.FileSystemError.FileIsADirectory(uri);
                    }

                    conn.client.raw('dele', vscrw.normalizePath(uri.path), (err) => {
                        COMP(err);
                    });
                } catch (e) {
                    COMP(e);
                }
            });
        }, existingConn);
    }

    /**
     * @inheritdoc
     */
    public delete(uri: vscode.Uri, options: { recursive: boolean }) {
        return this.forConnection(uri, (conn) => {
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    const STAT = await this.statInner(uri, conn);

                    const DELE = async (file: string) => {
                        file = vscrw.normalizePath( file );
                        const U = uriWithNewPath(uri, file);

                        return await this.dele(
                            U, conn
                        );
                    };

                    const RMD = (dir: string) => {
                        dir = vscrw.normalizePath( dir );
                        const U = uriWithNewPath(uri, dir);

                        return new Promise<boolean>(async (res, rej) => {
                            const COMP = vscode_helpers.createCompletedAction(res, rej);

                            try {
                                const STAT = await this.statInner(U, conn);
                                if (vscode.FileType.Directory !== STAT.type) {
                                    throw vscode.FileSystemError.FileNotADirectory( U );
                                }

                                conn.client.raw('rmd', dir, (err) => {
                                    COMP(err);
                                });
                            } catch (e) {
                                COMP(e);
                            }
                        });
                    };

                    if (vscode.FileType.Directory === STAT.type) {
                        const REMOVE_FOLDER = async (dir: string) => {
                            dir = vscrw.normalizePath( dir );
                            const U = uriWithNewPath(uri, dir);

                            const LIST = (await this.list(U, conn)).map(x => {
                                return {
                                    name: x.name,
                                    stat: toFileStat(x),
                                };
                            });

                            // first the sub folders
                            if (options.recursive) {
                                const SUB_DIRS = vscode_helpers.from(LIST)
                                                               .where(x => vscode.FileType.Directory === x.stat.type)
                                                               .orderByDescending(x => x.stat.size)
                                                               .thenBy(x => vscode_helpers.normalizeString(x));
                                for (const ITEM of SUB_DIRS) {
                                    await REMOVE_FOLDER(
                                        dir + '/' + ITEM.name
                                    );
                                }
                            }

                            // then the files
                            const FILES = vscode_helpers.from(LIST)
                                                        .where(x => vscode.FileType.File === x.stat.type)
                                                        .orderByDescending(x => x.stat.size)
                                                        .thenBy(x => vscode_helpers.normalizeString(x));
                            for (const ITEM of FILES) {
                                await DELE(
                                    dir + '/' + ITEM.name
                                );
                            }

                            // now the directory itself
                            await RMD( dir );
                        };

                        await REMOVE_FOLDER( uri.path );
                    } else {
                        await DELE( uri.path );
                    }
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: FTPConnection) => TResult | PromiseLike<TResult>,
        existingConn?: FTPConnection
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
                    CONN.client.destroy();
                } catch { }
            }
        }
    }

    private async list(uri: vscode.Uri, existingConn?: FTPConnection): Promise<FTPDirectoryItem[]> {
        return this.forConnection(uri, (conn) => {
            return new Promise<FTPDirectoryItem[]>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.list(vscrw.normalizePath(uri.path), (err, result) => {
                        if (err) {
                            if ('451' === vscode_helpers.normalizeString(err.code)) {
                                COMPLETED(null, []);
                                return;
                            }

                            COMPLETED(err);
                            return;
                        }

                        try {
                            ParseListening.parseEntries(result, (err, list) => {
                                if (err) {
                                    COMPLETED(err);
                                } else {
                                    COMPLETED(null,
                                              vscode_helpers.asArray( list )
                                                            .filter(x => !vscode_helpers.isEmptyString(x.name)));
                                }
                            });
                        } catch (e) {
                            COMPLETED( e );
                        }
                    });
                } catch (e) {
                    COMPLETED( e );
                }
            });
        }, existingConn);
    }

    private async openConnection(uri: vscode.Uri): Promise<FTPConnection> {
        // format:
        //
        // ftp://[user:password@]host:port[/path/to/file/or/folder]

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
            port = 21;
        }
        if (vscode_helpers.isEmptyString( username )) {
            username = undefined;
        }
        if ('' === vscode_helpers.toStringSafe( password )) {
            password = undefined;
        }

        return {
            client: new jsFTP({
                host: host,
                port: port,
                user: username,
                pass: password,
            }),
        };
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        const RESULT: vscrw_fs.DirectoryEntry[] = [];

        for (const ITEM of await this.list(uri)) {
            const STAT = toFileStat( ITEM );

            RESULT.push(
                [ ITEM.name, STAT.type ]
            );
        }

        return RESULT;
    }

    /**
     * @inheritdoc
     */
    public readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, (conn) => {
            return new Promise<Uint8Array>((resolve, reject) => {
                let completedInvoked = false;
                let resultBuffer: Buffer;
                let socket: any;
                const COMPLETED = (err: any) => {
                    if (completedInvoked) {
                        return;
                    }
                    completedInvoked = true;

                    vscode_helpers.tryRemoveAllListeners( socket );

                    if (err) {
                        reject( err );
                    } else {
                        resolve(
                            vscrw.toUInt8Array( resultBuffer )
                        );
                    }
                };

                try {
                    conn.client.get(vscrw.normalizePath( uri.path ), (err, s) => {
                        if (err) {
                            COMPLETED( err );
                            return;
                        }

                        try {
                            socket = s;
                            resultBuffer = Buffer.alloc( 0 );

                            socket.on("data", function(data: Buffer) {
                                try {
                                    if (data) {
                                        resultBuffer = Buffer.concat([ resultBuffer, data ]);
                                    }
                                } catch (e) {
                                    COMPLETED(e);
                                }
                            });

                            socket.once("close", function(hadErr) {
                                if (hadErr) {
                                    COMPLETED(new Error('Could not close socket!'));
                                } else {
                                    COMPLETED(null);
                                }
                            });

                            socket.resume();
                        } catch (e) {
                            COMPLETED(e);
                        }
                    });
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
            vscode.workspace.registerFileSystemProvider('ftp',
                                                        new FTPFileSystem(),
                                                        { isCaseSensitive: true })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(oldUri, (conn) => {
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    const OLD_STAT = await this.statInner(oldUri, conn);

                    const NEW_STAT = await this.tryGetStat(newUri, conn);
                    if (false !== NEW_STAT) {
                        if (!options.overwrite) {
                            throw vscode.FileSystemError.FileExists( newUri );
                        }
                    }

                    conn.client.rename(vscrw.normalizePath(oldUri.path), vscrw.normalizePath(newUri.path), (err) => {
                        COMPLETED(err);
                    });
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this.statInner( uri );
    }

    private async statInner(uri: vscode.Uri, existingConn?: FTPConnection): Promise<vscode.FileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0,
            };
        }

        let stat: vscode.FileStat | false = false;

        try {
            const URI_PATH = vscrw.normalizePath( uri.path );

            const NAME = Path.basename( URI_PATH );
            const DIR = vscrw.normalizePath( Path.dirname( URI_PATH ) );

            const PARENT_URI = uriWithNewPath( uri, DIR );

            const LIST = await this.list( PARENT_URI );

            for (const ITEM of LIST) {
                if (ITEM.name === NAME) {
                    stat = toFileStat( ITEM );
                    break;
                }
            }
        } catch { }

        if (false === stat) {
            throw vscode.FileSystemError.FileNotFound( uri );
        }

        return stat;
    }

    private async tryGetStat(uri: vscode.Uri, existingConn?: FTPConnection): Promise<vscode.FileStat | false> {
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
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
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

                    conn.client.put(new Buffer(content), vscrw.normalizePath( uri.path ), (err) => {
                        COMPLETED( err );
                    });
                } catch (e) {
                    COMPLETED( e );
                }
            });
        });
    }
}

function toFileStat(item: FTPDirectoryItem): vscode.FileStat {
    if (item) {
        const STAT: vscode.FileStat = {
            ctime: undefined,
            mtime: undefined,
            size: undefined,
            type: vscode.FileType.Unknown,
        };

        switch (vscode_helpers.normalizeString( item.type )) {
            case '0':
                STAT.ctime = parseInt( vscode_helpers.toStringSafe(item.time).trim() );
                STAT.mtime = parseInt( vscode_helpers.toStringSafe(item.time).trim() );
                STAT.size = parseInt( vscode_helpers.toStringSafe(item.size).trim() );
                STAT.type = vscode.FileType.File;
                break;

            case '1':
                STAT.type = vscode.FileType.Directory;
                break;
        }

        if (isNaN( STAT.ctime )) {
            STAT.ctime = 0;
        }
        if (isNaN( STAT.mtime )) {
            STAT.mtime = 0;
        }
        if (isNaN( STAT.size )) {
            STAT.size = 0;
        }

        return STAT;
    }
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`ftp://${ uri.authority }${ vscode_helpers.toStringSafe(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
