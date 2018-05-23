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
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';
const WebDAV = require('webdav-client');

interface WebDAVConnection {
    client: any;
}

interface WebDAVConnectionOptions {
    authenticator?: any;
    password?: string;
    url: string;
    username?: string;
}

interface WebDAVFileStat extends vscode.FileStat {
}

interface WebDAVReaddirComplexResult {
    creationDate: number;
    lastModified: number;
    name: string;
    size: number;
    type: 'd' | 'f';
}

/**
 * WebDAV file system.
 */
export class WebDAVFileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public copy(source: vscode.Uri, destination: vscode.Uri, options: vscrw_fs.CopyOptions) {
        return this.forConnection(source, (conn) => {
            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.copy(
                        toWebDAVPath(source.path),
                        toWebDAVPath(destination.path),
                        options.overwrite,
                        (err) => {
                            COMPLETED(err);
                        }
                    );
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        return this.forConnection(uri, (conn) => {
            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.mkdir(
                        toWebDAVPath(uri.path),
                        (err) => {
                            COMPLETED(err);
                        }
                    );
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async delete(uri: vscode.Uri, options: { recursive: boolean }) {
        return this.forConnection(uri, (conn) => {
            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.delete(
                        toWebDAVPath(uri.path),
                        (err) => {
                            COMPLETED(err);
                        }
                    );
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: WebDAVConnection) => TResult | PromiseLike<TResult>
    ): Promise<TResult> {
        try {
            const CONN = await this.openConnection(uri);

            if (action) {
                return await Promise.resolve(
                    action( CONN )
                );
            }
        } catch (e) {
            this.logger
                .trace(e, 'fs.webdav.WebDAVFileSystem.forConnection()');

            throw e;
        }
    }

    private getDetails(uri: vscode.Uri) {
        return this.forConnection(uri, (conn) => {
            return new Promise<WebDAVReaddirComplexResult>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.getProperties(
                        toWebDAVPath( uri.path ),
                        (err: any, properties: any) => {
                            if (err) {
                                COMPLETED(err);
                                return;
                            }

                            try {
                                const NEW_RESULT: WebDAVReaddirComplexResult = {
                                    creationDate: undefined,
                                    lastModified: undefined,
                                    name: Path.basename(uri.path),
                                    size: undefined,
                                    type: 'f',
                                };

                                let creationdate: Moment.Moment;
                                let lastmodified: Moment.Moment;

                                if (properties) {
                                    for (const P in properties) {
                                        try {
                                            const PROP = properties[P];
                                            if (_.isNil(PROP)) {
                                                continue;
                                            }

                                            switch (vscode_helpers.normalizeString(P)) {
                                                case 'dav:creationdate':
                                                    if (!vscode_helpers.isEmptyString(PROP.content)) {
                                                        creationdate = Moment(
                                                            vscode_helpers.toStringSafe(PROP.content).trim()
                                                        );
                                                    }
                                                    break;

                                                case 'dav:getlastmodified':
                                                    if (!vscode_helpers.isEmptyString(PROP.content)) {
                                                        lastmodified = Moment(
                                                            vscode_helpers.toStringSafe(PROP.content).trim()
                                                        );
                                                    }
                                                    break;

                                                case 'dav:getcontentlength':
                                                    if (!vscode_helpers.isEmptyString(PROP.content)) {
                                                        NEW_RESULT.size = parseInt(
                                                            vscode_helpers.toStringSafe(PROP.content).trim()
                                                        );
                                                    }
                                                    break;

                                                case 'dav:resourcetype':
                                                    {
                                                        const IS_DIR = vscode_helpers.from(
                                                            vscode_helpers.asArray(PROP.content)
                                                        ).any(c => {
                                                            return 'dav:collection' ===
                                                                    vscode_helpers.normalizeString(c.name);
                                                        });

                                                        if (IS_DIR) {
                                                            NEW_RESULT.type = 'd';
                                                        }
                                                    }
                                                    break;
                                            }
                                        } catch { }
                                    }
                                }

                                if (creationdate && creationdate.isValid()) {
                                    NEW_RESULT.creationDate = vscode_helpers.asUTC( creationdate ).unix();
                                }
                                if (lastmodified && lastmodified.isValid()) {
                                    NEW_RESULT.lastModified = vscode_helpers.asUTC( lastmodified ).unix();
                                }

                                if (isNaN(NEW_RESULT.creationDate)) {
                                    NEW_RESULT.creationDate = 0;
                                }
                                if (isNaN(NEW_RESULT.lastModified)) {
                                    NEW_RESULT.lastModified = 0;
                                }
                                if (isNaN(NEW_RESULT.size)) {
                                    NEW_RESULT.size = 0;
                                }

                                COMPLETED(null, NEW_RESULT);
                            } catch (e) {
                                COMPLETED(e);
                            }
                        }
                    );
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private list(uri: vscode.Uri) {
        return this.forConnection(uri, async (conn) => {
            const WF = vscode_helpers.buildWorkflow();

            return WF.next(() => {
                return new Promise<string[]>((resolve, reject) => {
                    const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                    try {
                        conn.client.readdir(
                            toWebDAVPath(uri.path),
                            {
                                properties: false,
                            },
                            (err: any, files: string[]) => {
                                if (err) {
                                    COMPLETED(err);
                                } else {
                                    COMPLETED(null,
                                              vscode_helpers.asArray(files));
                                }
                            }
                        );
                    } catch (e) {
                        COMPLETED(e);
                    }
                });
            }).next((files) => {
                return new Promise<WebDAVReaddirComplexResult[]>(async (resolve, reject) => {
                    const ALL_RESULTS: WebDAVReaddirComplexResult[] = [];
                    const COMPLETED = (err: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve( vscode_helpers.from(ALL_RESULTS).orderBy(r => {
                                return 'd' === r.type ? 0 : 1;
                            }).thenBy(r => {
                                return vscode_helpers.normalizeString(r.name);
                            }).toArray() );
                        }
                    };

                    try {
                        const GET_NEXT_PROPERTIES = async () => {
                            if (files.length < 1) {
                                COMPLETED(null);
                                return;
                            }

                            const F = files.shift();

                            try {
                                ALL_RESULTS.push(
                                    await this.getDetails(
                                        uriWithNewPath(uri,
                                                       vscrw.normalizePath(uri.path) + '/' + F)
                                    )
                                );
                            } catch { }

                            await GET_NEXT_PROPERTIES();
                        };

                        await GET_NEXT_PROPERTIES();
                    } catch (e) {
                        COMPLETED(e);
                    }
                });
            }).start();
        });
    }

    private async openConnection(uri: vscode.Uri): Promise<WebDAVConnection> {
        // format:
        //
        // webdav://[user:password@]host[:port][/path/to/file/or/folder]

        const PARAMS = vscrw.uriParamsToObject(uri);

        let base = vscrw.normalizePath(
            vscode_helpers.toStringSafe(PARAMS['base'])
        );
        let host: string;
        let username: string;
        let port: number;
        let ssl = vscrw.isTrue(PARAMS['ssl']);
        let password: string;

        let userAndPwd: string | false = false;
        {
            // external auth file?
            let authFile = vscode_helpers.toStringSafe( PARAMS['auth'] );
            if (!vscode_helpers.isEmptyString(authFile)) {
                authFile = vscrw.mapToUsersHome( authFile );

                if (await vscode_helpers.isFile(authFile)) {
                    userAndPwd = (await FSExtra.readFile(authFile, 'utf8')).trim();
                }
            }
        }

        const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
        {
            const AUTH_HOST_SEP = AUTHORITITY.indexOf( '@' );
            if (AUTH_HOST_SEP > -1) {
                if (false === userAndPwd) {
                    userAndPwd = AUTHORITITY.substr(0, AUTH_HOST_SEP);
                }

                const HOST_AND_PORT = AUTHORITITY.substr(AUTH_HOST_SEP + 1).trim();

                const HOST_PORT_SEP = HOST_AND_PORT.indexOf( ':' );
                if (HOST_PORT_SEP > -1) {
                    host = HOST_AND_PORT.substr(0, HOST_PORT_SEP).trim();
                    port = parseInt(
                        HOST_AND_PORT.substr(HOST_PORT_SEP + 1).trim()
                    );
                } else {
                    host = HOST_AND_PORT;
                }

                const USER_AND_PWD_SEP = userAndPwd.indexOf( ':' );
                if (USER_AND_PWD_SEP > -1) {
                    username = userAndPwd.substr(0, USER_AND_PWD_SEP);
                    password = userAndPwd.substr(USER_AND_PWD_SEP + 1);
                } else {
                    username = userAndPwd;
                }
            } else {
                host = AUTHORITITY;
            }
        }

        if (false !== userAndPwd) {
            const USER_AND_PWD_SEP = userAndPwd.indexOf( ':' );
            if (USER_AND_PWD_SEP > -1) {
                username = userAndPwd.substr(0, USER_AND_PWD_SEP);
                password = userAndPwd.substr(USER_AND_PWD_SEP + 1);
            } else {
                username = userAndPwd;
            }
        }

        if (vscode_helpers.isEmptyString( host )) {
            host = '127.0.0.1';
        }
        if (isNaN( port )) {
            port = ssl ? 443 : 80;
        }
        if (vscode_helpers.isEmptyString( username )) {
            username = undefined;
        }
        if ('' === vscode_helpers.toStringSafe( password )) {
            password = undefined;
        }

        let authenticator: any;
        if (!_.isNil(username) || !_.isNil(password)) {
            authenticator = new WebDAV.BasicAuthenticator();
        }

        const OPTS: WebDAVConnectionOptions = {
            authenticator: authenticator,
            password: password,
            username: username,
            url: `http${ ssl ? 's' : '' }://${ host }:${ port }${ base }`,
        };

        return {
            client: new WebDAV.Connection(OPTS),
        };
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        try {
            const ENTRIES: vscrw_fs.DirectoryEntry[] = [];

            const LIST = await this.list(uri);
            for (const ITEM of LIST) {
                ENTRIES.push([
                    ITEM.name,
                    'd' === ITEM.type ? vscode.FileType.Directory
                                      : vscode.FileType.File
                ]);
            }

            return ENTRIES;
        } catch (e) {
            vscode.FileSystemError.FileNotFound( uri );
        }
    }

    /**
     * @inheritdoc
     */
    public readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, (conn) => {
            return new Promise<Uint8Array>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.get(
                        toWebDAVPath(uri.path),
                        (err: any, body: string) => {
                            if (err) {
                                COMPLETED(err);
                            } else {
                                try {
                                    COMPLETED(null,
                                              new Buffer(body, 'binary'));
                                } catch (e) {
                                    COMPLETED(e);
                                }
                            }
                        }
                    );
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
            vscode.workspace.registerFileSystemProvider('webdav',
                                                        new WebDAVFileSystem(),
                                                        { isCaseSensitive: true })
        );
    }

    /**
     * @inheritdoc
     */
    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        return this.forConnection(oldUri, (conn) => {
            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.move(
                        toWebDAVPath(oldUri.path),
                        toWebDAVPath(newUri.path),
                        options.overwrite,
                        (err) => {
                            COMPLETED(err);
                        }
                    );
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

    private async statInner(uri: vscode.Uri): Promise<WebDAVFileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0,
            };
        }

        const DETAILS = await this.getDetails(uri);

        return {
            ctime: DETAILS.creationDate,
            mtime: DETAILS.lastModified,
            size: DETAILS.size,
            type: 'd' === DETAILS.type ? vscode.FileType.Directory
                                       : vscode.FileType.File,
        };
    }

    private async tryGetStat(uri: vscode.Uri): Promise<WebDAVFileStat | false> {
        let stat: WebDAVFileStat | false;
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
    public writeFile(uri: vscode.Uri, content: Uint8Array, options: vscrw_fs.WriteFileOptions) {
        return this.forConnection(uri, (conn) => {
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    this.throwIfWriteFileIsNotAllowed(
                        await this.tryGetStat(uri), options,
                        uri
                    );

                    conn.client.put(
                        toWebDAVPath(uri.path),
                        vscrw.asBuffer(content).toString('binary'),
                        (err: any) => {
                            COMPLETED(err);
                        }
                    );
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }
}

function toWebDAVPath(p: string) {
    return encodeURI( vscrw.normalizePath(p) );
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`webdav://${ uri.authority }${ vscrw.normalizePath(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
