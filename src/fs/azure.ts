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

import * as AzureStorage from 'azure-storage';
import * as Crypto from 'crypto';
import * as FS from 'fs';
import * as FSExtra from 'fs-extra';
import * as MimeTypes from 'mime-types';
import * as Moment from 'moment';
import * as MomentTZ from 'moment-timezone';  // REQUIRED EXTENSION FOR moment MODULE!!!
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface AzureBlobConnection {
    account: string;
    client: AzureStorage.BlobService;
    container: string;
}

const NO_CONTINUE_TOKEN_YET = Symbol('NO_CONTINUE_TOKEN_YET');

/**
 * Azure Blob file system.
 */
export class AzureBlobFileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        const STAT = await this.tryGetStat(uri);

        if (false !== STAT) {
            throw vscode.FileSystemError.FileExists( uri );
        }

        await this.writeBlob(
            uriWithNewPath(uri, `${ toAzurePath(uri.path) }/.vscode-remote-workspace`),
            Buffer.alloc(0),
        );
    }

    /**
     * @inheritdoc
     */
    public async delete(uri: vscode.Uri, options: { recursive: boolean }) {
        const STAT = await this.statInner(uri);

        let blobsToDelete: string[] = [];

        if (vscode.FileType.Directory === STAT.type) {
            const FILES = await this.list(uri);

            const HAS_SUB_DIRS = (await this.readDirectory(uri)).filter(e => {
                return vscode.FileType.Directory === e[1];
            }).length > 0;

            if (!options.recursive) {
                if (HAS_SUB_DIRS) {
                    throw vscode.FileSystemError.NoPermissions( uri );
                }
            }

            blobsToDelete = FILES.map(i => {
                return i.name;
            });
        } else {
            blobsToDelete = [ uri.path ];
        }

        for (const B of blobsToDelete) {
            await this.deleteBlob(
                uriWithNewPath(uri, B)
            );
        }
    }

    private async deleteBlob(uri: vscode.Uri) {
        await this.forConnection(uri, (conn) => {
            return new Promise<void>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.deleteBlob(
                        conn.container,
                        toAzurePath(uri.path),
                        { },
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
        uri: vscode.Uri, action: (conn: AzureBlobConnection) => TResult | PromiseLike<TResult>
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
                .trace(e, 'fs.azure.AzureBlobFileSystem.forConnection()');

            throw e;
        }
    }

    private getBlob(uri: vscode.Uri) {
        return this.forConnection(uri, (conn) => {
            return new Promise<AzureStorage.BlobService.BlobResult>((resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    conn.client.getBlobMetadata(
                        conn.container,
                        toAzurePath(uri.path),
                        { },
                        (err, result) => {
                            COMPLETED(err, result);
                        }
                    );
                } catch (e) {
                    COMPLETED(e);
                }
            });
        });
    }

    private list(uri: vscode.Uri) {
        return this.forConnection(uri, (conn) => {
            const PATH = vscrw.normalizePath( uri.path );

            return new Promise<AzureStorage.BlobService.BlobResult[]>(async (resolve, reject) => {
                const BLOB_RESULTS: AzureStorage.BlobService.BlobResult[] = [];
                const COMPLETED = (err: any) => {
                    if (err) {
                        reject( err );
                    } else {
                        resolve(BLOB_RESULTS.filter(r => {
                            const KEY = vscode_helpers.normalizeString(r.name);

                            return '' !== KEY &&
                                   '/' !== KEY;
                        }).sort((x, y) => {
                            return vscode_helpers.compareValuesBy(x, y, r => {
                                return vscode_helpers.normalizeString( r.name );
                            });
                        }));
                    }
                };

                const HANDLE_RESULT = (result: AzureStorage.BlobService.ListBlobsResult) => {
                    if (!result) {
                        return;
                    }

                    vscode_helpers.asArray( result.entries ).forEach(e => {
                        BLOB_RESULTS.push(e);
                    });
                };

                try {
                    let currentContinuationToken: AzureStorage.common.ContinuationToken | symbol = NO_CONTINUE_TOKEN_YET;

                    const NEXT_SEGMENT = () => {
                        if (NO_CONTINUE_TOKEN_YET !== currentContinuationToken) {
                            if (!currentContinuationToken) {
                                COMPLETED(null);
                                return;
                            }
                        } else {
                            currentContinuationToken = undefined;
                        }

                        conn.client.listBlobsSegmentedWithPrefix(
                            conn.container,
                            '/' === PATH ? '' : (toAzurePath(PATH) + '/'),
                            <AzureStorage.common.ContinuationToken>currentContinuationToken,
                            { },
                            (err, result) => {
                                if (err) {
                                    COMPLETED( err );
                                    return;
                                }

                                HANDLE_RESULT(result);
                                NEXT_SEGMENT();
                            }
                        );
                    };

                    NEXT_SEGMENT();
                } catch (e) {
                    COMPLETED( e );
                }
            });
        });
    }

    private async openConnection(uri: vscode.Uri): Promise<AzureBlobConnection> {
        // format:
        //
        // azure://[account:key@][container][/path/to/file/or/folder]

        const PARAMS = vscrw.uriParamsToObject(uri);

        let account: string;
        let client: AzureStorage.BlobService;
        let container: string;
        let host = vscode_helpers.toStringSafe( PARAMS['host'] ).trim();
        let key: string;

        let accountAndKey: string | false = false;
        {
            // external auth file?
            let authFile = vscode_helpers.toStringSafe( PARAMS['auth'] );
            if (!vscode_helpers.isEmptyString(authFile)) {
                authFile = vscrw.mapToUsersHome( authFile );

                if (await vscode_helpers.isFile(authFile)) {
                    accountAndKey = (await FSExtra.readFile(authFile, 'utf8')).trim();
                }
            }
        }

        const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
        {
            const AUTH_HOST_SEP = AUTHORITITY.indexOf( '@' );
            if (AUTH_HOST_SEP > -1) {
                if (false === accountAndKey) {
                    accountAndKey = AUTHORITITY.substr(0, AUTH_HOST_SEP);
                }

                container = AUTHORITITY.substr(AUTH_HOST_SEP + 1);
            } else {
                container = AUTHORITITY;
            }
        }

        if (false !== accountAndKey) {
            const ACCOUNT_AND_KEY_SEP = accountAndKey.indexOf( ':' );
            if (ACCOUNT_AND_KEY_SEP > -1) {
                account = accountAndKey.substr(0, ACCOUNT_AND_KEY_SEP);
                key = accountAndKey.substr(ACCOUNT_AND_KEY_SEP + 1);
            } else {
                account = accountAndKey;
            }
        }

        const IS_DEV = vscode_helpers.isEmptyString( key );
        if (IS_DEV) {
            client = AzureStorage.createBlobService('UseDevelopmentStorage=true');

            if (vscode_helpers.isEmptyString(account)) {
                account = 'devstoreaccount1';
            }
        } else {
            account = vscode_helpers.toStringSafe(account).trim();
            if ('' === account) {
                account = undefined;
            }

            key = vscode_helpers.toStringSafe(key).trim();
            if ('' === key) {
                key = undefined;
            }

            client = AzureStorage.createBlobService(account, key,
                                                    '' === host ? undefined : host);
        }

        if (vscode_helpers.isEmptyString(container)) {
            container = 'vscode-remote-workspace';
        }

        return {
            account: vscode_helpers.toStringSafe(account).trim(),
            client: client,
            container: vscode_helpers.toStringSafe(container).trim(),
        };
    }

    private async readBlob(uri: vscode.Uri) {
        return this.forConnection(uri, (conn) => {
            return vscode_helpers.tempFile((tmpFile) => {
                return new Promise<Buffer>(async (resolve, reject) => {
                    const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                    try {
                        const STREAM = FS.createWriteStream( tmpFile );

                        conn.client.getBlobToStream(
                            conn.container,
                            toAzurePath(uri.path),
                            STREAM,
                            (err) => {
                                if (err) {
                                    COMPLETED(err);
                                    return;
                                }

                                try {
                                    FSExtra.readFile(tmpFile).then((data) => {
                                        COMPLETED(null, data);
                                    }, (err) => {
                                        COMPLETED(err);
                                    });
                                } catch (e) {
                                    COMPLETED(e);
                                }
                            }
                        );
                    } catch (e) {
                        COMPLETED(e);
                    }
                });
            }, {
                keep: false,
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        return this.forConnection(uri, async (conn) => {
            const PATH = vscrw.normalizePath( uri.path );
            const PATH_PARTS = PATH.split('/').filter(x => {
                return !vscode_helpers.isEmptyString(x);
            });

            const ENTRIES: vscrw_fs.DirectoryEntry[] = [];

            const LIST = await this.list(uri);
            const DIRS: string[] = [];

            for (const ITEM of LIST) {
                const KEY = vscode_helpers.toStringSafe( ITEM.name );
                const KEY_PARTS = KEY.split('/').filter(x => {
                    return !vscode_helpers.isEmptyString(x);
                });

                if (PATH_PARTS.length === (KEY_PARTS.length - 1)) {
                    ENTRIES.push([
                        ITEM.name, vscode.FileType.File
                    ]);
                } else if (KEY_PARTS.length >= PATH_PARTS.length) {
                    const D = vscode_helpers.from( KEY_PARTS )
                                            .take( PATH_PARTS.length + 1 )
                                            .joinToString('/');

                    if (DIRS.indexOf(D) < 0) {
                        DIRS.push(D);

                        ENTRIES.push([
                            D, vscode.FileType.Directory
                        ]);
                    }
                }
            }

            return vscode_helpers.from( ENTRIES ).orderBy(e => {
                return vscode.FileType.Directory === e[1] ? 0 : 1;
            }).thenBy(e => {
                return vscode_helpers.normalizeString( e[0] );
            }).toArray();
        });
    }

    /**
     * @inheritdoc
     */
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.readBlob(uri);
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('azure',
                                                        new AzureBlobFileSystem(),
                                                        { isCaseSensitive: true })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(oldUri, async (conn) => {
            const COPY_BLOB = async (from: string, to: string) => {
                await this.writeBlob(
                    uriWithNewPath(oldUri, to),
                    await this.readBlob(
                        uriWithNewPath(oldUri, from)
                    ),
                );
            };

            const DELETE_BLOB = async (blob: string) => {
                await this.deleteBlob(
                    uriWithNewPath(oldUri, blob)
                );
            };

            const OLD_STAT = await this.statInner(oldUri);

            const NEW_STAT = await this.tryGetStat(newUri);
            if (false !== NEW_STAT) {
                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists( newUri );
                }

                if (vscode.FileType.File === NEW_STAT.type) {
                    await DELETE_BLOB( newUri.path );
                }
            }

            const ITEMS_TO_MOVE: {
                oldPath: string;
                newPath: string;
            }[] = [];

            if (vscode.FileType.Directory === OLD_STAT.type) {
                const LIST = await this.list(oldUri);

                const OLD_DIR = toAzurePath(oldUri.path) + '/';
                const NEW_DIR = toAzurePath(newUri.path) + '/';

                for (const ITEM of LIST) {
                    const OLD_PATH = ITEM.name;
                    const NEW_PATH = NEW_DIR + OLD_PATH.substr(OLD_DIR.length);

                    ITEMS_TO_MOVE.push({
                        oldPath: OLD_PATH,
                        newPath: NEW_PATH,
                    });
                }
            } else {
                ITEMS_TO_MOVE.push({
                    oldPath: oldUri.path,
                    newPath: newUri.path,
                });
            }

            for (const I of ITEMS_TO_MOVE) {
                await COPY_BLOB( I.oldPath, I.newPath );
                await DELETE_BLOB( I.oldPath );
            }
        });
    }

    /**
     * @inheritdoc
     */
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this.statInner( uri );
    }

    private async statInner(uri: vscode.Uri): Promise<vscode.FileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0,
            };
        }

        return this.forConnection(uri, async (conn) => {
            const PATH = vscrw.normalizePath(uri.path);

            let result: vscode.FileStat | false = false;

            try {
                const BLOB = await this.getBlob(uri);
                if (BLOB) {
                    result = {
                        ctime: undefined,
                        mtime: undefined,
                        size: parseInt( vscode_helpers.normalizeString( BLOB.contentLength ) ),
                        type: vscode.FileType.File,
                    };

                    if (!vscode_helpers.isEmptyString( BLOB.lastModified )) {
                        let mtime = Moment( BLOB.lastModified );
                        if (mtime.isValid()) {
                            result.mtime = vscode_helpers.asUTC( mtime ).unix();
                        }
                    }
                }
            } catch { }

            if (false === result) {
                const LIST = await this.list(uri);
                if (LIST.length > 0) {
                    result = {
                        ctime: undefined,
                        mtime: undefined,
                        size: undefined,
                        type: vscode.FileType.Directory,
                    };
                }
            }

            if (false === result) {
                throw vscode.FileSystemError.FileNotFound( uri );
            }

            if (isNaN(result.mtime)) {
                result.mtime = 0;
            }
            result.ctime = result.mtime;

            if (isNaN(result.size)) {
                result.size = 0;
            }

            return result;
        });
    }

    private async tryGetStat(uri: vscode.Uri): Promise<vscode.FileStat | false> {
        let stat: vscode.FileStat | false;
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

    private async writeBlob(uri: vscode.Uri, data: Buffer) {
        const PATH = toAzurePath(uri.path);

        await this.forConnection(uri, (conn) => {
            return new Promise<void>(async (resolve, reject) => {
                const COMPLETED = vscode_helpers.createCompletedAction(resolve, reject);

                try {
                    let contentType = MimeTypes.lookup( Path.basename(PATH) );
                    if (false === contentType) {
                        contentType = 'application/octet-stream';
                    }

                    const MD5 = Crypto.createHash('md5')
                                      .update(data).digest('base64');

                    conn.client.createBlockBlobFromText(
                        conn.container,
                        PATH,
                        data,
                        {
                            contentSettings: {
                                contentMD5: MD5,
                                contentType: contentType,
                            }
                        },
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
    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: vscrw_fs.WriteFileOptions) {
        this.throwIfWriteFileIsNotAllowed(
            await this.tryGetStat(uri), options,
            uri
        );

        await this.writeBlob(uri,
                             vscrw.asBuffer(content));
    }
}

function toAzurePath(p: string) {
    return vscrw.normalizePath(p)
                .substr(1);
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`azure://${ uri.authority }/${ toAzurePath(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
