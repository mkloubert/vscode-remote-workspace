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
const jsFTP = require('jsftp');
const ParseListening = require("parse-listing");
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface FTPConnection {
    cache: FTPConnectionCache;
    client: any;
    followSymLinks: boolean;
    noop: string;
}

interface FTPConnectionCache {
    stats: any;
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
    private readonly _CONN_CACHE: any = {};
    private readonly _EXECUTE_REMOTE_COMMAND_LISTENER: Function;

    /**
     * Initializes a new instance of that class.
     */
    public constructor() {
        super();

        this._EXECUTE_REMOTE_COMMAND_LISTENER = (execArgs: vscrw.ExecuteRemoteCommandArguments) => {
            execArgs.increaseExecutionCounter();

            (async () => {
                try {
                    if (FTPFileSystem.scheme === vscode_helpers.normalizeString(execArgs.uri.scheme)) {
                        const RESPONSE = await this.executeRemoteCommand(execArgs);

                        if (execArgs.callback) {
                            execArgs.callback(null, {
                                stdOut: RESPONSE,
                            });
                        }
                    }
                } catch (e) {
                    if (execArgs.callback) {
                        execArgs.callback(e);
                    } else {
                        throw e;
                    }
                }
            })().then(() => {
            }, (err) => {
                vscrw.showError(err);
            });
        };

        vscode_helpers.EVENTS.on(vscrw.EVENT_EXECUTE_REMOTE_COMMAND,
                                 this._EXECUTE_REMOTE_COMMAND_LISTENER);
    }

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

                            const LIST: any[] = [];
                            for (const ITEM of await this.list(U, conn)) {
                                LIST.push({
                                    name: ITEM.name,
                                    stat: await toFileStat(ITEM, U, conn),
                                });
                            }

                            const SUB_DIRS = vscode_helpers.from(LIST)
                                                           .where(x => vscode.FileType.Directory === x.stat.type)
                                                           .orderByDescending(x => x.stat.size)
                                                           .thenBy(x => vscode_helpers.normalizeString(x))
                                                           .toArray();

                            const FILES = vscode_helpers.from(LIST)
                                                        .where(x => vscode.FileType.Directory !== x.stat.type)
                                                        .orderByDescending(x => x.stat.size)
                                                        .thenBy(x => vscode_helpers.normalizeString(x))
                                                        .toArray();

                            // first the sub folders
                            if (options.recursive) {
                                for (const ITEM of SUB_DIRS) {
                                    await REMOVE_FOLDER(
                                        dir + '/' + ITEM.name
                                    );
                                }
                            } else {
                                if (SUB_DIRS.length > 0) {
                                    throw vscode.FileSystemError.NoPermissions( uri );
                                }
                            }

                            // then the files
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

                    COMPLETED(null);
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private async executeRemoteCommand(execArgs: vscrw.ExecuteRemoteCommandArguments) {
        const CONN = await this.openConnection(execArgs.uri, true);

        try {
            await executeServerCommand(CONN.client, 'CWD ' + vscrw.normalizePath(execArgs.uri.path));

            return await executeServerCommand(CONN.client, execArgs.command);
        } finally {
            await tryCloseConnection(CONN);
        }
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: FTPConnection) => TResult | PromiseLike<TResult>,
        existingConn?: FTPConnection
    ): Promise<TResult> {
        try {
            const USE_EXISTING_CONN = !_.isNil( existingConn );

            const CONN = USE_EXISTING_CONN ? existingConn
                                           : await this.openConnection(uri);

            if (action) {
                return await Promise.resolve(
                    action( CONN )
                );
            }
        } catch (e) {
            this.logger
                .trace(e, 'fs.ftp.FTPFileSystem.forConnection()');

            throw e;
        }
    }

    private async list(uri: vscode.Uri, existingConn?: FTPConnection): Promise<FTPDirectoryItem[]> {
        return this.forConnection(uri, (conn) => {
            return listDirectory(conn.client,
                                 uri.path);
        }, existingConn);
    }

    /**
     * @inheritdoc
     */
    protected onDispose() {
        for (const CACHE_KEY of Object.keys(this._CONN_CACHE)) {
            try {
                tryCloseConnection(
                    this._CONN_CACHE[ CACHE_KEY ]
                );
            } catch { } finally {
                delete this._CONN_CACHE[ CACHE_KEY ];
            }
        }

        vscode_helpers.tryRemoveListener(
            vscode_helpers.EVENTS,
            vscrw.EVENT_EXECUTE_REMOTE_COMMAND, this._EXECUTE_REMOTE_COMMAND_LISTENER
        );
    }

    private async openConnection(uri: vscode.Uri, noCache?: boolean): Promise<FTPConnection> {
        // format:
        //
        // ftp://[user:password@]host:port[/path/to/file/or/folder]

        noCache = vscode_helpers.toBooleanSafe(noCache);

        const CACHE_KEY = vscrw.getConnectionCacheKey( uri );

        const PARAMS = vscrw.getUriParams(uri);

        let conn: FTPConnection | false = false;
        if (!noCache) {
            conn = await this.testConnection(CACHE_KEY);
        }

        if (false === conn) {
            const HOST_AND_CRED = await vscrw.extractHostAndCredentials(uri, 21);

            let keepAlive = parseFloat(
                vscode_helpers.toStringSafe( PARAMS['keepalive'] ).trim()
            );

            let noop = vscode_helpers.toStringSafe( PARAMS['noop'] );
            if (vscode_helpers.isEmptyString(noop)) {
                noop = undefined;
            }

            if (!noCache) {
                tryCloseConnection( this._CONN_CACHE[ CACHE_KEY ] );
            }

            conn = {
                cache: {
                    stats: {},
                },
                client: new jsFTP({
                    host: HOST_AND_CRED.host,
                    port: HOST_AND_CRED.port,
                    user: HOST_AND_CRED.user,
                    pass: HOST_AND_CRED.password,
                }),
                followSymLinks: vscrw.isTrue(PARAMS['follow'], true),
                noop: noop,
            };

            if (!noCache) {
                this._CONN_CACHE[ CACHE_KEY ] = conn;
            }

            if (!isNaN(keepAlive)) {
                conn.client.keepAlive(
                    Math.floor(keepAlive * 1000.0)
                );
            }
        }

        return conn;
    }

    /**
     * @inheritdoc
     */
    public readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        return this.forConnection(uri, async (conn) => {
            const RESULT: vscrw_fs.DirectoryEntry[] = [];

            for (const ITEM of await this.list(uri, conn)) {
                const STAT = await toFileStat(ITEM, uri, conn);

                RESULT.push(
                    [ ITEM.name, STAT.type ]
                );
            }

            return RESULT;
        });
    }

    /**
     * @inheritdoc
     */
    public readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, (conn) => {
            return new Promise<Uint8Array>(async (resolve, reject) => {
                let completedInvoked = false;
                let resultBuffer: Buffer;
                let socket: NodeJS.ReadableStream;
                const COMPLETED = (err: any) => {
                    if (completedInvoked) {
                        return;
                    }
                    completedInvoked = true;

                    vscode_helpers.tryRemoveAllListeners( socket );

                    if (err) {
                        reject( err );
                    } else {
                        resolve( resultBuffer );
                    }
                };

                try {
                    socket = await openRead(conn.client, uri.path);

                    resultBuffer = Buffer.alloc(0);

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
        });
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        const NEW_FS = new FTPFileSystem();

        try {
            context.subscriptions.push(
                NEW_FS,

                vscode.workspace.registerFileSystemProvider(FTPFileSystem.scheme,
                                                            NEW_FS,
                                                            { isCaseSensitive: true }),
            );
        } catch (e) {
            vscode_helpers.tryDispose( NEW_FS );

            throw e;
        }
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
     * Stores the name of the scheme.
     */
    public static readonly scheme = 'ftp';

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

        return this.forConnection(uri, async (conn) => {
            let stat: vscode.FileStat | false = false;

            try {
                const URI_PATH = vscrw.normalizePath( uri.path );

                const NAME = Path.basename( URI_PATH );
                const DIR = vscrw.normalizePath( Path.dirname( URI_PATH ) );

                const PARENT_URI = uriWithNewPath( uri, DIR );

                const LIST = await this.list(PARENT_URI, conn);

                for (const ITEM of LIST) {
                    if (ITEM.name === NAME) {
                        stat = await toFileStat(ITEM,
                                                uriWithNewPath(uri, DIR),
                                                conn);
                        break;
                    }
                }
            } catch { }

            if (false === stat) {
                throw vscode.FileSystemError.FileNotFound( uri );
            }

            return stat;
        });
    }

    private async testConnection(cacheKey: string) {
        return new Promise<FTPConnection | false>((resolve, reject) => {
            const CONN: FTPConnection = this._CONN_CACHE[ cacheKey ];

            let completedInvoked = false;
            const COMPLETED = (result: FTPConnection | false) => {
                if (completedInvoked) {
                    return;
                }
                completedInvoked = true;

                if (false === result) {
                    delete this._CONN_CACHE[ cacheKey ];

                    tryCloseConnection( CONN );
                }

                resolve( result );
            };

            let action = () => {
                COMPLETED(false);
            };

            if (!_.isNil(CONN)) {
                action = () => {
                    try {
                        let cmd: string;
                        let cmdArgs: string[];
                        if (_.isNil(CONN.noop)) {
                            cmd = 'NOOP';
                            cmdArgs = [];
                        } else {
                            const PARTS = vscode_helpers.from( CONN.noop.split(' ') )
                                                        .skipWhile(x => '' === x.trim())
                                                        .toArray();

                            cmd = PARTS[0];

                            cmdArgs = vscode_helpers.from(PARTS)
                                                    .skip(1)
                                                    .skipWhile(x => '' === x.trim())
                                                    .toArray();
                        }

                        CONN.client.raw(cmd, cmdArgs, (err) => {
                            COMPLETED(err ? false : CONN);
                        });
                    } catch {
                        COMPLETED(false);
                    }
                };
            }

            try {
                action();
            } catch {
                COMPLETED(false);
            }
        });
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
    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: vscrw_fs.WriteFileOptions) {
        await this.forConnection(uri, async (conn) => {
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    this.throwIfWriteFileIsNotAllowed(
                        await this.tryGetStat(uri), options,
                        uri
                    );

                    conn.client.put(vscrw.asBuffer(content), vscrw.normalizePath( uri.path ), (err) => {
                        COMPLETED( err );
                    });
                } catch (e) {
                    COMPLETED( e );
                }
            });
        });
    }
}


function executeServerCommand(conn: any, cmd: string) {
    cmd = vscode_helpers.toStringSafe(cmd);

    return new Promise<Buffer>((resolve, reject) => {
        const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

        try {
            const PARTS = cmd.split(' ')
                             .filter(x => '' !== x.trim());

            let c: string;
            if (PARTS.length > 0) {
                c = PARTS[0].trim();
            }

            const ARGS = PARTS.filter((a, i) => i > 0);

            conn.raw(c, ARGS, function(err, result) {
                if (err) {
                    COMPLETED( err );
                } else {
                    let response: Buffer;
                    if (_.isNil(result)) {
                        response = result;
                    } else {
                        response = new Buffer(`[${ result.code }] '${ vscode_helpers.toStringSafe(result.text) }'`, 'ascii');
                    }

                    COMPLETED(null, response);
                }
            });
        } catch (e) {
            COMPLETED(e);
        }
    });
}

function listDirectory(conn: any, path: string) {
    return new Promise<FTPDirectoryItem[]>((resolve, reject) => {
        const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

        try {
            conn.list(vscrw.normalizePath(path), (err, result) => {
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
}

function openRead(conn: any, path: string) {
    return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

        try {
            conn.get(vscrw.normalizePath(path), (err, stream) => {
                COMPLETED(err, stream);
            });
        } catch (e) {
            COMPLETED(e);
        }
    });
}

async function toFileStat(item: FTPDirectoryItem, uri: vscode.Uri, conn: FTPConnection): Promise<vscode.FileStat> {
    if (item) {
        const STAT: vscode.FileStat = {
            ctime: undefined,
            mtime: undefined,
            size: undefined,
            type: vscode.FileType.Unknown,
        };

        switch (vscode_helpers.normalizeString( item.type )) {
            case '0':
                STAT.type = vscode.FileType.File;
                break;

            case '1':
                STAT.type = vscode.FileType.Directory;
                break;

            case '2':
                {
                    STAT.type = vscode.FileType.SymbolicLink;

                    if (conn.followSymLinks) {
                        try {
                            const FILE_OR_FOLDER = vscrw.normalizePath(
                                Path.join(uri.path, item.name)
                            );

                            const CACHED_VALUE: vscode.FileType = conn.cache.stats[ FILE_OR_FOLDER ];
                            if (_.isNil(CACHED_VALUE)) {
                                let type: vscode.FileType | false = false;

                                try {
                                    // first try to check if file ...
                                    const STREAM: any = await openRead(conn.client, FILE_OR_FOLDER);

                                    // ... yes
                                    try {
                                        if (_.isFunction(STREAM.destroy)) {
                                            STREAM.destroy();
                                        }
                                    } catch { }

                                    type = vscode.FileType.File;
                                } catch {
                                    // now try to check if directory ...
                                    try {
                                        await listDirectory(
                                            conn.client, FILE_OR_FOLDER
                                        );

                                        // ... yes
                                        type = vscode.FileType.Directory;
                                    } catch { /* no, handle as symbol link */ }
                                }

                                // TODO: implement later
                                /*
                                if (false !== type) {
                                    conn.cache.stats[ FILE_OR_FOLDER ] = STAT.type = type;
                                }
                                */

                                if (false !== type) {
                                    STAT.type = type;
                                }
                            }
                        } catch {
                            STAT.type = vscode.FileType.SymbolicLink;
                        }
                    }
                }
                break;
        }

        if (vscode.FileType.File === STAT.type) {
            STAT.ctime = parseInt( vscode_helpers.toStringSafe(item.time).trim() );
            STAT.mtime = parseInt( vscode_helpers.toStringSafe(item.time).trim() );
            STAT.size = parseInt( vscode_helpers.toStringSafe(item.size).trim() );
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

function tryCloseConnection(conn: FTPConnection) {
    try {
        if (conn) {
            conn.client.destroy();
        }

        return true;
    } catch {
        return false;
    }
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`ftp://${ uri.authority }${ vscode_helpers.toStringSafe(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
