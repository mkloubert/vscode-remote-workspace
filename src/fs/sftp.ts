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
import * as OS from 'os';
import * as Path from 'path';
import * as SFTP from 'ssh2-sftp-client';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface SFTPConnection {
    cache: SFTPConnectionCache;
    client: SFTP;
    followSymLinks: boolean;
    noop: string;
}

interface SFTPConnectionCache {
    stats: any;
}

/**
 * SFTP file system.
 */
export class SFTPFileSystem extends vscrw_fs.FileSystemBase {
    private readonly _CONN_CACHE: any = {};

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
            const STAT = await this.statInner( uri, conn );

            if (vscode.FileType.Directory === STAT.type) {
                await conn.client.rmdir(
                    vscrw.normalizePath(uri.path), options.recursive
                );
            } else {
                await conn.client.delete(
                    vscrw.normalizePath(uri.path)
                );
            }
        });
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: SFTPConnection) => TResult | PromiseLike<TResult>,
        existingConn?: SFTPConnection
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
                .trace(e, 'fs.sftp.SFTPFileSystem.forConnection()');

            throw e;
        }
    }

    /**
     * @inheritdoc
     */
    protected onDispose() {
        for (const CACHE_KEY of Object.keys(this._CONN_CACHE)) {
            this.tryCloseAndDeleteConnectionSync( CACHE_KEY );
        }
    }

    private async openConnection(uri: vscode.Uri): Promise<SFTPConnection> {
        // format:
        //
        // sftp://[user:password@]host:port[/path/to/file/or/folder]

        const CACHE_KEY = vscrw.getConnectionCacheKey( uri );

        const PARAMS = vscrw.uriParamsToObject(uri);

        let conn = await this.testConnection( CACHE_KEY );

        if (false === conn) {
            const HOST_AND_CRED = await vscrw.extractHostAndCredentials(uri, 22);

            let noop = vscode_helpers.toStringSafe( PARAMS['noop'] );
            if (vscode_helpers.isEmptyString(noop)) {
                noop = undefined;
            }

            conn = {
                cache: {
                    stats: {}
                },
                client: new SFTP(),
                followSymLinks: vscrw.isTrue(PARAMS['follow'], true),
                noop: noop,
            };

            let agent = vscode_helpers.toStringSafe( PARAMS['agent'] );
            let agentForward = vscode_helpers.normalizeString( PARAMS['agentforward'] );
            let debug = vscrw.isTrue( PARAMS['debug'] );
            let hashes = vscode_helpers.normalizeString( PARAMS['allowedhashes'] ).split(',').map(h => {
                return h.trim();
            }).filter(h => {
                return '' !== h;
            });
            let hostHash = vscode_helpers.normalizeString( PARAMS['hash'] );
            let keepAlive = parseFloat(
                vscode_helpers.toStringSafe( PARAMS['keepalive'] ).trim()
            );
            const NO_PHRASE_FILE = vscrw.isTrue( PARAMS['nophrasefile'] );
            let passphrase = vscode_helpers.toStringSafe( PARAMS['phrase'] );
            let readyTimeout = parseInt(
                vscode_helpers.normalizeString( PARAMS['timeout'] )
            );
            let tryKeyboard = vscode_helpers.normalizeString( PARAMS['trykeyboard'] );

            if ('' === passphrase) {
                passphrase = undefined;
            }

            // external passphrase file?
            try {
                if (!vscode_helpers.isEmptyString(passphrase)) {
                    if (!NO_PHRASE_FILE) {
                        const PHRASE_FILE = await vscrw.mapToUsersHome(passphrase);

                        if (await vscode_helpers.isFile(PHRASE_FILE)) {
                            // read from file
                            passphrase = await FSExtra.readFile(PHRASE_FILE, 'utf8');
                        }
                    }
                }
            } catch { }

            let privateKey: Buffer;
            let key = vscode_helpers.toStringSafe( PARAMS['key'] );
            if (!vscode_helpers.isEmptyString(key)) {
                try {
                    let keyFile = key;
                    if (!Path.isAbsolute(keyFile)) {
                        keyFile = Path.join(
                            OS.homedir(),
                            '.ssh',
                            keyFile
                        );
                    }
                    keyFile = Path.resolve( keyFile );

                    if (await vscode_helpers.isFile( keyFile )) {
                        privateKey = await FSExtra.readFile( keyFile );
                    }
                } catch { }

                if (!privateKey) {
                    privateKey = new Buffer(key, 'base64');
                }
            }

            const OPTS: any = {
                agent: vscode_helpers.isEmptyString(agent) ? undefined
                                                           : agent,
                agentForward: vscrw.isTrue(agentForward),
                host: HOST_AND_CRED.host,
                hostHash: <any>('' === hostHash ? 'md5' : hostHash),
                hostVerifier: (keyHash) => {
                    if (hashes.length < 1) {
                        return true;
                    }

                    return hashes.indexOf(
                        vscode_helpers.normalizeString(keyHash)
                    ) > -1;
                },
                keepaliveInterval: isNaN( keepAlive ) ? undefined
                                                      : Math.floor(keepAlive * 1000.0),
                passphrase: '' === passphrase ? undefined
                                              : passphrase,
                password: HOST_AND_CRED.password,
                privateKey: privateKey,
                port: HOST_AND_CRED.port,
                readyTimeout: isNaN(readyTimeout) ? 20000
                                                  : readyTimeout,
                tryKeyboard: '' === tryKeyboard ? undefined
                                                : vscrw.isTrue(tryKeyboard),
                username: HOST_AND_CRED.user,
            };

            if (debug) {
                OPTS.debug = (information: string) => {
                    try {
                        this.logger
                            .info(information,
                                  `sftp://${ HOST_AND_CRED.host }:${ HOST_AND_CRED.port }`);
                    } catch { }
                };
            }

            await this.tryCloseAndDeleteConnection( CACHE_KEY );

            if (tryKeyboard) {
                const PWD = vscode_helpers.toStringSafe( HOST_AND_CRED.password );

                conn.client['client'].on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
                    try {
                        finish([ PWD ]);
                    } catch (e) {
                        this.logger
                            .trace(e, 'fs.sftp.SFTPFileSystem.openConnection(keyboard-interactive)');
                    }
                });
            }

            await conn.client.connect(
                OPTS
            );
            this._CONN_CACHE[ CACHE_KEY ] = conn;
        }

        return conn;
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        return this.forConnection(uri, async (conn) => {
            const ITEMS: vscrw_fs.DirectoryEntry[] = [];

            try {
                const LIST = await conn.client.list(
                    vscrw.normalizePath( uri.path )
                );

                for (const ITEM of LIST) {
                    const S = await toFileStat(ITEM, uri, conn);

                    ITEMS.push([
                        S[0], S[1].type
                    ]);
                }
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
            return vscode_helpers.asBuffer(
                await conn.client.get(
                    vscrw.normalizePath( uri.path )
                )
            );
        });
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(SFTPFileSystem.scheme,
                                                        new SFTPFileSystem(),
                                                        { isCaseSensitive: true })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(oldUri, async (conn) => {
            const OLD_STAT = await this.statInner( oldUri, conn );

            const NEW_STAT = await this.tryGetStat( newUri, conn );
            if (false !== NEW_STAT) {
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
     * Stores the name of the scheme.
     */
    public static readonly scheme = 'sftp';

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
                mtime: 0,
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
                        const S = await toFileStat(ITEM,
                                                   uriWithNewPath(uri, DIR),
                                                   conn);

                        stat = S[1];
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

    private async testConnection(cacheKey: string): Promise<SFTPConnection | false> {
        let result: SFTPConnection | false = false;

        const CONN: SFTPConnection = this._CONN_CACHE[ cacheKey ];
        if (!_.isNil(CONN)) {
            try {
                if (_.isNil(CONN.noop)) {
                    await CONN.client.list('/');
                } else {
                    await execServerCommand(CONN.client,
                                            CONN.noop);
                }

                result = CONN;
            } catch {
                result = false;
            }
        }

        if (false === result) {
            await this.tryCloseAndDeleteConnection( cacheKey );
        }

        return result;
    }

    private async tryCloseAndDeleteConnection(cacheKey: string) {
        await tryCloseConnection(
            this._CONN_CACHE[ cacheKey ]
        );

        delete this._CONN_CACHE[ cacheKey ];
    }

    private tryCloseAndDeleteConnectionSync(cacheKey: string) {
        this.tryCloseAndDeleteConnection(
            cacheKey
        ).then(() => {
        }, (err) => {
        });
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
    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: vscrw_fs.WriteFileOptions) {
        await this.forConnection(uri, async (conn) => {
            this.throwIfWriteFileIsNotAllowed(
                await this.tryGetStat(uri), options,
                uri
            );

            await conn.client.put(
                vscrw.asBuffer(content),
                vscrw.normalizePath( uri.path ),
            );
        });
    }
}

async function toFileStat(fi: SFTP.FileInfo, uri: vscode.Uri, conn: SFTPConnection): Promise<[ string, vscode.FileStat ]> {
    if (fi) {
        const STAT: vscode.FileStat = {
            type: vscode.FileType.Unknown,
            ctime: 0,
            mtime: 0,
            size: 0,
        };

        if ('d' === fi.type) {
            STAT.type = vscode.FileType.Directory;
        } else if ('l' === fi.type) {
            STAT.type = vscode.FileType.SymbolicLink;

            if (conn.followSymLinks) {
                try {
                    const FILE_OR_FOLDER = vscrw.normalizePath(
                        Path.join(uri.path, fi.name)
                    );

                    const CACHED_VALUE: vscode.FileType = conn.cache.stats[ FILE_OR_FOLDER ];
                    if (_.isNil(CACHED_VALUE)) {
                        let type: vscode.FileType | false = false;

                        try {
                            // first try to check if file ...
                            const STREAM: any = await conn.client.get(
                                FILE_OR_FOLDER
                            );

                            // ... yes
                            try {
                                if (_.isFunction(STREAM.close)) {
                                    STREAM.close();
                                }
                            } catch { }

                            type = vscode.FileType.File;
                        } catch {
                            // now try to check if directory ...
                            try {
                                await conn.client.list(
                                    FILE_OR_FOLDER
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
                    } else {
                        STAT.type = CACHED_VALUE;
                    }
                } catch {
                    STAT.type = vscode.FileType.SymbolicLink;
                }
            }
        } else if ('-' === fi.type) {
            STAT.type = vscode.FileType.File;
        }

        if (vscode.FileType.File === STAT.type) {
            STAT.size = fi.size;
            STAT.ctime = fi.modifyTime;
            STAT.mtime = fi.modifyTime;
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

        return [ fi.name, STAT ];
    }
}

function execServerCommand(conn: SFTP, cmd: string) {
    cmd = vscode_helpers.toStringSafe(cmd);

    return new Promise<Buffer>((resolve, reject) => {
        let output: Buffer;

        let completedInvoked = false;
        const COMPLETED = (err: any) => {
            if (completedInvoked) {
                return;
            }
            completedInvoked = true;

            if (err) {
                reject(err);
            } else {
                resolve(output);
            }
        };

        try {
            output = Buffer.alloc(0);

            conn['client'].exec(cmd, (err, stream) => {
                if (err) {
                    COMPLETED(err);
                    return;
                }

                try {
                    let dataListener: (chunk: any) => void;
                    let endListener: (chunk: any) => void;
                    let errorListener: (err: any) => void;

                    const CLOSE_STREAM = (err: any) => {
                        vscode_helpers.tryRemoveListener(stream,
                                                         'end', endListener);
                        vscode_helpers.tryRemoveListener(stream,
                                                         'error', errorListener);
                        vscode_helpers.tryRemoveListener(stream,
                                                         'data', dataListener);

                        COMPLETED(err);
                    };

                    errorListener = (streamErr) => {
                        CLOSE_STREAM( streamErr );
                    };

                    endListener = () => {
                        CLOSE_STREAM( null );
                    };

                    dataListener = (chunk) => {
                        if (_.isNil(chunk)) {
                            return;
                        }

                        try {
                            if (!Buffer.isBuffer(chunk)) {
                                chunk = new Buffer(vscode_helpers.toStringSafe(chunk),
                                                   'binary');
                            }

                            output = Buffer.concat([ output, chunk ]);
                        } catch (e) {
                            CLOSE_STREAM(e);
                        }
                    };

                    try {
                        stream.once('error', errorListener);
                        stream.once('end', endListener);
                        stream.on('data', dataListener);
                    } catch (e) {
                        CLOSE_STREAM(e);
                    }
                } catch (e) {
                    COMPLETED(e);
                }
            });
        } catch (e) {
            COMPLETED(e);
        }
    });
}

async function tryCloseConnection(conn: SFTPConnection) {
    try {
        if (conn) {
            await conn.client.end();
        }

        return true;
    } catch {
        return false;
    }
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`sftp://${ uri.authority }${ vscode_helpers.toStringSafe(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
