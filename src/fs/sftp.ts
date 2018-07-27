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
const SFTP = require('ssh2-sftp-client');
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

type FileModeMapper = { [mode: string]: string | string[] };

interface SFTPConnection {
    cache: SFTPConnectionCache;
    changeMode: (ft: vscode.FileType, u: vscode.Uri, m?: number) => PromiseLike<boolean>;
    client: any;
    followSymLinks: boolean;
    keepMode: boolean;
    noop: string;
}

interface SFTPConnectionCache {
    stats: any;
}

interface SFTPFileRights {
    user: string;
    group: string;
    other: string;
}

interface SFTPFileStat extends vscode.FileStat {
    __vscrw_fileinfo: any;
}

type STPModeValueOrPath = string | number | false;

/**
 * SFTP file system.
 */
export class SFTPFileSystem extends vscrw_fs.FileSystemBase {
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
                    if (SFTPFileSystem.scheme === vscode_helpers.normalizeString(execArgs.uri.scheme)) {
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

            await conn.changeMode(vscode.FileType.Directory, uri);
        });
    }

    /**
     * @inheritdoc
     */
    public createTerminal(uri: vscode.Uri): vscode.TerminalRenderer {
        const NO_AUTH_URI = vscrw.uriWithoutAuthority(uri);

        let shell: vscode.TerminalRenderer;

        const ON_NEW_LINE = (isInitial = false) => {
            shell.write(`sftp@${ NO_AUTH_URI.authority }:${ vscrw.normalizePath(NO_AUTH_URI.path) }$ `);
        };

        shell = vscrw_fs.createRemoteTerminal({
            onLine: (line) => {
                return this.forConnection(uri, async (conn) => {
                    shell.write("\r\n");

                    const RESULT = await execServerCommand(conn.client, line);
                    if (RESULT) {
                        RESULT.toString('utf8').split("\n").forEach(l => {
                            while (l.endsWith("\r")) {
                                l = l.substr(0, l.length - 1);
                            }

                            shell.write(l);
                            shell.write("\r\n");
                        });
                    }
                });
            },
            onNewLine: () => {
                ON_NEW_LINE();
            },
            uri: uri,
        });

        ON_NEW_LINE(true);
        return shell;
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

    private async executeRemoteCommand(execArgs: vscrw.ExecuteRemoteCommandArguments) {
        const CONN = await this.openConnection(execArgs.uri, true);

        try {
            return await this.forConnection(execArgs.uri, (conn) => {
                return execServerCommand(
                    conn.client, `cd "${ execArgs.uri.path }" && ${ execArgs.command }`
                );
            }, CONN);
        } finally {
            await tryCloseConnection(CONN);
        }
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

        vscode_helpers.tryRemoveListener(
            vscode_helpers.EVENTS,
            vscrw.EVENT_EXECUTE_REMOTE_COMMAND, this._EXECUTE_REMOTE_COMMAND_LISTENER
        );
    }

    private async openConnection(uri: vscode.Uri, noCache?: boolean): Promise<SFTPConnection> {
        // format:
        //
        // sftp://[user:password@]host:port[/path/to/file/or/folder]

        noCache = vscode_helpers.toBooleanSafe(noCache);

        const CACHE_KEY = vscrw.getConnectionCacheKey( uri );

        const PARAMS = vscrw.getUriParams(uri);

        let conn: SFTPConnection | false = false;
        if (!noCache) {
            conn = await this.testConnection(CACHE_KEY);
        }

        if (false === conn) {
            const HOST_AND_CRED = await vscrw.extractHostAndCredentials(uri, 22);

            const MODE = vscode_helpers.toStringSafe( PARAMS['mode'] );

            let dirMode = vscode_helpers.toStringSafe( PARAMS['dirmode'] );
            if (vscode_helpers.isEmptyString(dirMode)) {
                dirMode = MODE;
            }

            let fileModeValueOrPath: STPModeValueOrPath = false;
            if (!vscode_helpers.isEmptyString(MODE)) {
                fileModeValueOrPath = parseInt(MODE.trim());

                if (isNaN(fileModeValueOrPath)) {
                    fileModeValueOrPath = MODE;
                }
            }

            let dirModeValueOrPath: STPModeValueOrPath = false;
            if (!vscode_helpers.isEmptyString(dirMode)) {
                dirModeValueOrPath = parseInt(dirMode.trim());

                if (isNaN(dirModeValueOrPath)) {
                    dirModeValueOrPath = dirMode;
                }
            }

            let noop = vscode_helpers.toStringSafe( PARAMS['noop'] );
            if (vscode_helpers.isEmptyString(noop)) {
                noop = undefined;
            }

            conn = {
                cache: {
                    stats: {}
                },
                changeMode: (ft, u, m?) => {
                    const LOG_TAG = `fs.sftp.openConnection.changeMode(${ u })`;

                    m = parseInt(
                        vscode_helpers.toStringSafe(m).trim()
                    );

                    return new Promise<boolean>(async (resolve, reject) => {
                        let completedInvoked = false;
                        const COMPLETED = (err: any) => {
                            if (completedInvoked) {
                                return;
                            }
                            completedInvoked = true;

                            if (err) {
                                this.logger
                                    .trace(err, LOG_TAG);

                                resolve(false);
                            } else {
                                resolve(true);
                            }
                        };

                        try {
                            const SFTP_CONN = <SFTPConnection>conn;

                            let action = () => {
                                COMPLETED(null);
                            };

                            let modeValueOrPathToUse: STPModeValueOrPath = false;
                            if (isNaN(m)) {
                                if (vscode.FileType.Directory === ft) {
                                    modeValueOrPathToUse = dirModeValueOrPath;
                                } else {
                                    modeValueOrPathToUse = fileModeValueOrPath;
                                }
                            } else {
                                // use explicit value
                                modeValueOrPathToUse = m;
                            }

                            if (false !== modeValueOrPathToUse) {
                                let mapper: FileModeMapper;
                                if (_.isNumber(modeValueOrPathToUse)) {
                                    mapper = {};
                                    mapper[ modeValueOrPathToUse ] = '**/*';
                                } else if (_.isString(modeValueOrPathToUse)) {
                                    const MODE_FILE = vscrw.mapToUsersHome(modeValueOrPathToUse);

                                    if (await vscode_helpers.isFile(MODE_FILE)) {
                                        mapper = JSON.parse(
                                            await FSExtra.readFile(MODE_FILE, 'utf8')
                                        );
                                    } else {
                                        this.logger
                                            .warn(`Mode file '${ modeValueOrPathToUse }' not found!`, LOG_TAG);
                                    }
                                }

                                if (mapper) {
                                    const FILE_OR_FOLDER = vscrw.normalizePath(u.path);

                                    let modeToSet: number | false = false;
                                    for (const M in mapper) {
                                        const MODE_VALUE = parseInt(
                                            vscode_helpers.toStringSafe(M).trim(), 8
                                        );

                                        if (isNaN(MODE_VALUE)) {
                                            this.logger
                                                .warn(`'${ M }' is not valid mode value!`, LOG_TAG);

                                            continue;
                                        }

                                        const PATTERNS = vscode_helpers.asArray(mapper[M]).map(x => {
                                            return vscode_helpers.toStringSafe(x);
                                        }).filter(x => !vscode_helpers.isEmptyString(x)).map(x => {
                                            if (!x.trim().startsWith('/')) {
                                                x = '/' + x;
                                            }

                                            return x;
                                        });

                                        if (vscode_helpers.doesMatch(FILE_OR_FOLDER, PATTERNS)) {
                                            modeToSet = MODE_VALUE;  // last wins
                                        }
                                    }

                                    if (false !== modeToSet) {
                                        this.logger
                                            .info(`Setting mode of '${ FILE_OR_FOLDER }' to ${ modeToSet.toString(8) }`, LOG_TAG);

                                        action = () => {
                                            SFTP_CONN.client['sftp'].chmod(FILE_OR_FOLDER, <number>modeToSet, (err) => {
                                                COMPLETED(err);
                                            });
                                        };
                                    }
                                }
                            }

                            action();
                        } catch (e) {
                            COMPLETED(e);
                        }
                    });
                },
                client: new SFTP(),
                followSymLinks: vscrw.isTrue(PARAMS['follow'], true),
                keepMode: vscrw.isTrue(PARAMS['keepmode'], true),
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

            if (!noCache) {
                await this.tryCloseAndDeleteConnection( CACHE_KEY );
            }

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

            if (!noCache) {
                this._CONN_CACHE[ CACHE_KEY ] = conn;
            }
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
     *
     * @return {SFTPFileSystem} The registrated provider instance.
     */
    public static register(context: vscode.ExtensionContext) {
        const NEW_FS = new SFTPFileSystem();

        try {
            context.subscriptions.push(
                vscode.workspace.registerFileSystemProvider(SFTPFileSystem.scheme,
                                                            NEW_FS,
                                                            { isCaseSensitive: true })
            );
        } catch (e) {
            vscode_helpers.tryDispose( NEW_FS );

            throw e;
        }

        return NEW_FS;
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

            await conn.changeMode(OLD_STAT.type, newUri);
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

    private async statInner(uri: vscode.Uri, existingConn?: SFTPConnection): Promise<SFTPFileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                '__vscrw_fileinfo': undefined,
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0,
            };
        }

        return await this.forConnection(uri, async (conn) => {
            let stat: SFTPFileStat | false = false;

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

    /**
     * @inheritdoc
     */
    public get supportsTerminal() {
        return true;
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

    private async tryGetMod(uri: vscode.Uri, stat?: SFTPFileStat | false) {
        if (arguments.length < 2) {
            stat = await this.tryGetStat(uri);
        }

        let mod: number;

        if (false !== stat) {
            if (stat.__vscrw_fileinfo) {
                mod = chmodRightsToNumber(
                    stat.__vscrw_fileinfo.rights
                );
            }
        }

        return mod;
    }

    private async tryGetStat(uri: vscode.Uri, existingConn?: SFTPConnection): Promise<SFTPFileStat | false> {
        let stat: SFTPFileStat | false;
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
            const STAT = await this.tryGetStat(uri);

            this.throwIfWriteFileIsNotAllowed(
                STAT, options,
                uri
            );

            let oldMod: number;
            if (conn.keepMode) {
                oldMod = await this.tryGetMod(uri, STAT);
            }

            await conn.client.put(
                vscrw.asBuffer(content),
                vscrw.normalizePath( uri.path ),
            );

            await conn.changeMode(vscode.FileType.File, uri, oldMod);
        });
    }
}

function chmodRightsToNumber(rights: SFTPFileRights): number {
    if (_.isNil(rights)) {
        return <any>rights;
    }

    const USER = vscode_helpers.normalizeString(rights.user);
    const GROUP = vscode_helpers.normalizeString(rights.group);
    const OTHER = vscode_helpers.normalizeString(rights.other);

    let u = 0;
    for (let i = 0; i < USER.length; i++) {
        switch (USER[i]) {
            case 'r':
                u = u | 4;
                break;

            case 'w':
                u = u | 2;
                break;

            case 'x':
                u = u | 1;
                break;
        }
    }

    let g = 0;
    for (let i = 0; i < GROUP.length; i++) {
        switch (GROUP[i]) {
            case 'r':
                g = g | 4;
                break;

            case 'w':
                g = g | 2;
                break;

            case 'x':
                g = g | 1;
                break;
        }
    }

    let o = 0;
    for (let i = 0; i < OTHER.length; i++) {
        switch (OTHER[i]) {
            case 'r':
                o = o | 4;
                break;

            case 'w':
                o = o | 2;
                break;

            case 'x':
                o = o | 1;
                break;
        }
    }

    return parseInt(
        `${ u }${ g }${ o }`
    );
}

function execServerCommand(conn: any, cmd: string) {
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

async function toFileStat(fi: any, uri: vscode.Uri, conn: SFTPConnection): Promise<[ string, SFTPFileStat ]> {
    if (fi) {
        const STAT: SFTPFileStat = {
            '__vscrw_fileinfo': fi,
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
