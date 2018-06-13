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
import * as FS from 'fs';
import * as FSExtra from 'fs-extra';
const FTP = require('@icetee/ftp');
const FTP_Legacy = require('ftp');
import * as Moment from 'moment';
import * as MomentTZ from 'moment-timezone';  // REQUIRED EXTENSION FOR moment MODULE!!!
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface FTPsConnection {
    cache: FTPsConnectionCache;
    client: any;
    followSymLinks: boolean;
}

interface FTPsConnectionCache {
    stats: any;
}

interface FTPsFileStat extends vscode.FileStat {
}

/**
 * Secure FTP file system.
 */
export class FTPsFileSystem extends vscrw_fs.FileSystemBase {
    // private readonly _CONN_CACHE: any = {};
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
                    if (FTPsFileSystem.scheme === vscode_helpers.normalizeString(execArgs.uri.scheme)) {
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
    public createDirectory(uri: vscode.Uri) {
        return this.forConnection(uri, async (conn) => {
            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.mkdir(vscrw.normalizePath(uri.path), true, (err) => {
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
    public delete(uri: vscode.Uri, options: { recursive: boolean }) {
        return this.forConnection(uri, async (conn) => {
            const STAT = await this.statInner(uri);

            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    const PATH = vscrw.normalizePath(uri.path);

                    if (vscode.FileType.Directory === STAT.type) {
                        conn.client.rmdir(PATH, options.recursive, (err) => {
                            COMPLETED(err);
                        });
                    } else {
                        conn.client.delete(PATH, (err) => {
                            COMPLETED(err);
                        });
                    }
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private async executeRemoteCommand(execArgs: vscrw.ExecuteRemoteCommandArguments) {
        const CONN = await this.openConnection(execArgs.uri, true);

        try {
            const CONN = await this.openConnection(execArgs.uri, true);

            try {
                await executeServerCommand(CONN.client, 'CWD ' + vscrw.normalizePath(execArgs.uri.path));

                return await executeServerCommand(CONN.client, execArgs.command);
            } finally {
                await tryCloseConnection(CONN);
            }
        } finally {
            await tryCloseConnection(CONN);
        }
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: FTPsConnection) => TResult | PromiseLike<TResult>,
        existingConn?: FTPsConnection
    ): Promise<TResult> {
        const USE_EXISTING_CONN = !_.isNil( existingConn );

        let conn: FTPsConnection;
        try {
            conn = USE_EXISTING_CONN ? existingConn
                                     : await this.openConnection(uri);

            if (action) {
                return await Promise.resolve(
                    action( conn )
                );
            }
        } catch (e) {
            this.logger
                .trace(e, 'fs.ftps.FTPsFileSystem.forConnection()');

            throw e;
        } finally {
            if (!USE_EXISTING_CONN) {
                tryCloseConnection(conn);
            }
        }
    }

    private list(uri: vscode.Uri, existingConn?: FTPsConnection) {
        return this.forConnection(uri, (conn) => {
            return listDirectory(
                conn.client,
                vscrw.normalizePath(uri.path),
            );
        }, existingConn);
    }

    /**
     * @inheritdoc
     */
    protected onDispose() {
        vscode_helpers.tryRemoveListener(
            vscode_helpers.EVENTS,
            vscrw.EVENT_EXECUTE_REMOTE_COMMAND, this._EXECUTE_REMOTE_COMMAND_LISTENER
        );
    }

    private openConnection(uri: vscode.Uri, noCache?: boolean): Promise<FTPsConnection> {
        // format:
        //
        // ftps://[user:password@]host:port[/path/to/file/or/folder]

        noCache = vscode_helpers.toBooleanSafe(noCache);

        const CACHE_KEY = vscrw.getConnectionCacheKey( uri );

        const PARAMS = vscrw.uriParamsToObject(uri);

        return new Promise<FTPsConnection>(async (resolve, reject) => {
            const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

            try {
                let conn: FTPsConnection | false = false;
                if (!noCache) {
                    conn = await this.testConnection(CACHE_KEY);
                }

                if (false === conn) {
                    const FOLLOW = vscrw.isTrue(PARAMS['follow'], true);
                    const HOST_AND_CRED = await vscrw.extractHostAndCredentials(uri, 21);
                    const IS_SECURE = vscrw.isTrue(PARAMS['secure'], true);
                    const LEGACY = vscrw.isTrue(PARAMS['legacy']);

                    let secureOpts: any;
                    if (IS_SECURE) {
                        secureOpts = {
                            rejectUnauthorized: vscrw.isTrue(PARAMS['rejectunauthorized'], false),
                        };
                    }

                    const KEEP_ALIVE = parseFloat(
                        vscode_helpers.toStringSafe(PARAMS['keepalive']).trim()
                    );

                    const CLIENT = LEGACY ? new FTP_Legacy()
                                          : new FTP();

                    CLIENT.once('error', function(err) {
                        if (err) {
                            COMPLETED(err);
                        }
                    });

                    CLIENT.once('ready', () => {
                        // tryCloseConnection( this._CONN_CACHE[ CACHE_KEY ] );

                        const NEW_CONN: FTPsConnection = {
                            cache: {
                                stats: {},
                            },
                            client: CLIENT,
                            followSymLinks: FOLLOW,
                        };
                        // this._CONN_CACHE[ CACHE_KEY ] = NEW_CONN;

                        COMPLETED(null, NEW_CONN);
                    });

                    CLIENT.connect({
                        host: HOST_AND_CRED.host, port: HOST_AND_CRED.port,
                        user: HOST_AND_CRED.user, password: HOST_AND_CRED.password,
                        secure: IS_SECURE,
                        secureOptions: secureOpts,
                        keepalive: Math.floor(
                            (isNaN(KEEP_ALIVE) ? 10.0
                                               : KEEP_ALIVE) * 1000.0
                        ),
                    });
                } else {
                    COMPLETED(null, conn);
                }
            } catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * @inheritdoc
     */
    public readDirectory(uri: vscode.Uri) {
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
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    const STREAM = await openRead(conn.client, uri.path);

                    STREAM.once('error', (err) => {
                        if (err) {
                            COMPLETED(err);
                        }
                    });

                    const TEMP_FILE = await vscode_helpers.tempFile((tf) => {
                        return tf;
                    }, {
                        keep: true,
                    });

                    const TRY_REMOVE_TEMP_FILE = async () => {
                        try {
                            if (await vscode_helpers.exists(TEMP_FILE)) {
                                await FSExtra.unlink(TEMP_FILE);
                            }
                        } catch (e) {
                            this.logger
                                .warn(e, 'fs.ftps.FTPsFileSystem.readFile.TRY_REMOVE_TEMP_FILE()');
                        }
                    };

                    const DOWNLOAD_COMPLETED = async () => {
                        try {
                            return await FSExtra.readFile( TEMP_FILE );
                        } finally {
                            await TRY_REMOVE_TEMP_FILE();
                        }
                    };

                    try {
                        STREAM.once('close', function() {
                            DOWNLOAD_COMPLETED().then((data) => {
                                COMPLETED(null, data);
                            }, (err) => {
                                COMPLETED(err);
                            });
                        }).once('error', function(err) {
                            TRY_REMOVE_TEMP_FILE().then(() => {
                                COMPLETED(err);
                            }, (e) => {
                                COMPLETED(err);
                            });
                        });

                        const WRITE_STREAM = FS.createWriteStream(TEMP_FILE);

                        WRITE_STREAM.once('error', (err) => {
                            if (err) {
                                COMPLETED(err);
                            }
                        });

                        STREAM.pipe( WRITE_STREAM );
                        STREAM.resume();
                    } catch (e) {
                        TRY_REMOVE_TEMP_FILE().then(() => {
                            COMPLETED(e);
                        }, (err) => {
                            COMPLETED(e);
                        });
                    }
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
        const NEW_FS = new FTPsFileSystem();

        try {
            context.subscriptions.push(
                vscode.workspace.registerFileSystemProvider(FTPsFileSystem.scheme,
                                                            NEW_FS,
                                                            { isCaseSensitive: true })
            );
        } catch (e) {
            vscode_helpers.tryDispose(NEW_FS);

            throw e;
        }
    }

    /**
     * @inheritdoc
     */
    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        return this.forConnection(oldUri, (conn) => {
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
    public static readonly scheme = 'ftps';

    /**
     * @inheritdoc
     */
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this.statInner( uri );
    }

    private async statInner(uri: vscode.Uri, existingConn?: FTPsConnection): Promise<FTPsFileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0,
            };
        }

        return this.forConnection(uri, async (conn) => {
            let stat: FTPsFileStat | false = false;

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
        }, existingConn);
    }

    private async testConnection(cacheKey: string): Promise<false | FTPsConnection> {
        return false;

        // TODO: implement later

        /*
        return new Promise<FTPsConnection | false>((resolve, reject) => {
            const CONN: FTPsConnection = this._CONN_CACHE[ cacheKey ];

            let completedInvoked = false;
            const COMPLETED = (result: FTPsConnection | false) => {
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
                        CONN.client['_send']('NOOP', function(err, text, code) {
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
        });*/
    }

    private async tryGetStat(uri: vscode.Uri, existingConn?: FTPsConnection): Promise<FTPsFileStat | false> {
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
    public writeFile(uri: vscode.Uri, content: Uint8Array, options: vscrw_fs.WriteFileOptions) {
        return this.forConnection(uri, (conn) => {
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
            conn['_send'](cmd, function(err: any, responseText: string, responseCode: number) {
                if (err) {
                    COMPLETED(err);
                } else {
                    COMPLETED(null,
                              new Buffer(`[${ responseCode }] '${ vscode_helpers.toStringSafe(responseText) }'`, 'ascii'));
                }
            });
        } catch (e) {
            COMPLETED(e);
        }
    });
}

function listDirectory(client: any, path: string) {
    return new Promise<any[]>((resolve, reject) => {
        const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

        try {
            client.list(vscrw.normalizePath(path), (err, items) => {
                COMPLETED(err, items);
            });
        } catch (e) {
            COMPLETED(e);
        }
    });
}

function openRead(client: any, path: string) {
    return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

        try {
            client.get(vscrw.normalizePath(path), (err, stream) => {
                COMPLETED(err, stream);
            });
        } catch (e) {
            COMPLETED(e);
        }
    });
}

async function toFileStat(item: any, uri: vscode.Uri, conn: FTPsConnection): Promise<FTPsFileStat> {
    if (item) {
        const STAT: vscode.FileStat = {
            ctime: undefined,
            mtime: undefined,
            size: undefined,
            type: vscode.FileType.Unknown,
        };

        switch (vscode_helpers.normalizeString( item.type )) {
            case '-':
                STAT.type = vscode.FileType.File;
                break;

            case 'd':
                STAT.type = vscode.FileType.Directory;
                break;

            case 'l':
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
            let date: number;
            if (Moment.isDate(item.date)) {
                date = vscode_helpers.asUTC(
                    Moment(date)
                ).unix();
            }

            STAT.ctime = date;
            STAT.mtime = date;
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

function tryCloseConnection(conn: FTPsConnection) {
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
        return vscode.Uri.parse(`ftps://${ uri.authority }${ vscode_helpers.toStringSafe(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
