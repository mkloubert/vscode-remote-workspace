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

import * as AWS from 'aws-sdk';
import * as MimeTypes from 'mime-types';
import * as Moment from 'moment';
import * as OS from 'os';
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface S3Connection {
    client: AWS.S3;
}

interface SharedIniFileCredentialsOptions {
    profile?: string;
}


const DEFAULT_ACL = 'private';
const DEFAULT_CREDENTIAL_TYPE = 'shared';

const KNOWN_CREDENTIAL_CLASSES = {
    'environment': AWS.EnvironmentCredentials,
    'file': AWS.FileSystemCredentials,
    'shared': AWS.SharedIniFileCredentials,
};

/**
 * S3 file system.
 */
export class S3FileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.tryGetStat(uri);
            if (false !== STAT) {
                throw vscode.FileSystemError.FileExists( uri );
            }

            await conn.client.putObject({
                Bucket: undefined,
                ACL: await this.getACL(uri),
                Key: toS3Path(uri.path) + '/',
                Body: null,
            }).promise();
        });
    }

    /**
     * @inheritdoc
     */
    public async delete(uri: vscode.Uri, options: { recursive: boolean }) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.statInner(uri);

            if (vscode.FileType.Directory === STAT.type) {
                const SELF_PATH = toS3Path(uri.path) + '/';

                const DELETE_SELF_ACTION = async () => {
                    let deleteSelf = false;
                    try {
                        const DIR = await conn.client.getObject({
                            Bucket: undefined,
                            Key: SELF_PATH
                        }).promise();

                        if (DIR) {
                            deleteSelf = true;
                        }
                    } catch { }

                    if (deleteSelf) {
                        await conn.client.deleteObject({
                            Bucket: this.getBucket(uri),
                            Key: SELF_PATH,
                        }).promise();
                    }
                };

                const LIST = await this.list(uri, true);
                const SUB_ITEMS = LIST.filter(x => {
                    return SELF_PATH !== x.Key;
                });

                const HAS_SUB_DIRS = (await this.readDirectory(uri)).filter(e => {
                    return vscode.FileType.Directory === e[1];
                }).length > 0;

                if (!options.recursive) {
                    if (HAS_SUB_DIRS) {
                        throw vscode.FileSystemError.NoPermissions( uri );
                    }
                }

                for (const SI of SUB_ITEMS) {
                    await conn.client.deleteObject({
                        Bucket: this.getBucket(uri),
                        Key: SI.Key,
                    }).promise();
                }

                await DELETE_SELF_ACTION();
            } else {
                await conn.client.deleteObject({
                    Bucket: this.getBucket(uri),
                    Key: toS3Path(uri.path),
                }).promise();
            }
        });
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: S3Connection) => TResult | PromiseLike<TResult>
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
                .trace(e, 'fs.s3.S3FileSystem.forConnection()');

            throw e;
        }
    }

    private async getACL(uri: vscode.Uri) {
        const PARAMS = vscrw.getUriParams(uri);

        let acl = vscode_helpers.normalizeString( PARAMS['acl'] );
        if ('' === acl) {
            acl = await this.getDefaultAcl();
        }

        return acl;
    }

    private async getDefaultAcl() {
        return DEFAULT_ACL;
    }

    private getBucket(uri: vscode.Uri) {
        let bucket: string;

        const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
        {
            const AUTH_HOST_SEP = AUTHORITITY.indexOf( '@' );
            if (AUTH_HOST_SEP > -1) {
                bucket = AUTHORITITY.substr(AUTH_HOST_SEP + 1);
            } else {
                bucket = AUTHORITITY;
            }
        }

        if (vscode_helpers.isEmptyString(bucket)) {
            bucket = 'vscode-remote-workspace';
        }

        return bucket.trim();
    }

    private async list(uri: vscode.Uri, recursive = false): Promise<AWS.S3.Object[]> {
        return this.forConnection(uri, async (conn) => {
            const PATH = vscrw.normalizePath(uri.path);
            const PATH_PARTS = PATH.split('/').filter(x => {
                return !vscode_helpers.isEmptyString(x);
            });

            const OBJECTS: AWS.S3.Object[] = [];

            const HANDLE_RESULT = async (result: AWS.S3.ListObjectsV2Output) => {
                if (!result) {
                    return;
                }

                vscode_helpers.asArray( result.Contents ).forEach(o => {
                    OBJECTS.push( o );
                });
            };

            let currentContinuationToken: string | false = false;
            const NEXT_SEGMENT = async () => {
                if (false !== currentContinuationToken) {
                    if (vscode_helpers.isEmptyString(currentContinuationToken)) {
                        return;
                    }
                } else {
                    currentContinuationToken = undefined;
                }

                const PARAMS: AWS.S3.Types.ListObjectsV2Request = {
                    Bucket: undefined,
                    ContinuationToken: <any>currentContinuationToken,
                    Prefix: '/' === PATH ? '' : (toS3Path(PATH) + '/'),
                };

                try {
                    const RESULT = await conn.client.listObjectsV2(PARAMS)
                                                .promise();

                    currentContinuationToken = RESULT.NextContinuationToken;

                    await HANDLE_RESULT(RESULT);
                    await NEXT_SEGMENT();
                } catch (e) {
                    throw e;
                }
            };

            await NEXT_SEGMENT();

            return OBJECTS.filter(o => {
                const KEY = vscode_helpers.normalizeString(o.Key);

                return '' !== KEY &&
                       '/' !== KEY;
            }).filter(o => {
                if (recursive) {
                    return true;
                }

                const KEY = vscode_helpers.toStringSafe( o.Key );
                const KEY_PARTS = KEY.split('/').filter(x => {
                    return !vscode_helpers.isEmptyString(x);
                });

                return PATH_PARTS.length === (KEY_PARTS.length - 1);
            }).sort((x, y) => {
                return vscode_helpers.compareValuesBy(x, y, o => {
                    return vscode_helpers.normalizeString(o.Key);
                });
            });
        });
    }

    private async openConnection(uri: vscode.Uri): Promise<S3Connection> {
        // format:
        //
        // s3://[credential_type@]bucket[/path/to/file/or/folder]

        const PARAMS = vscrw.getUriParams(uri);

        const AWS_DIR = Path.resolve(
            Path.join(
                OS.homedir(),
                '.aws'
            )
        );

        const AS_FULL_PATH = (p: string) => {
            p = vscode_helpers.toStringSafe(p);
            if (!Path.isAbsolute(p)) {
                p = Path.join(AWS_DIR, p);
            }

            return Path.resolve( p );
        };

        let credentialClass: any;
        let credentialConfig: any;
        let credentialType: string;

        const AUTHORITITY = vscode_helpers.toStringSafe( uri.authority );
        {
            const AUTH_HOST_SEP = AUTHORITITY.indexOf( '@' );
            if (AUTH_HOST_SEP > -1) {
                credentialType = vscode_helpers.normalizeString(
                    AUTHORITITY.substr(0, AUTH_HOST_SEP)
                );
                if ('' === credentialType) {
                    credentialType = DEFAULT_CREDENTIAL_TYPE;
                }

            } else {
                credentialType = DEFAULT_CREDENTIAL_TYPE;
            }

            credentialClass = KNOWN_CREDENTIAL_CLASSES[ credentialType ];
        }

        if (!credentialClass) {
            throw new Error(`Credential type '${ credentialType }' is not supported!`);
        }

        switch (credentialType) {
            case 'environment':
                {
                    const VAR_NAME = vscode_helpers.toStringSafe( PARAMS['varprefix'] ).toUpperCase().trim();
                    if ('' !== VAR_NAME) {
                        credentialConfig = VAR_NAME;
                    }
                }
                break;

            case 'shared':
                {
                    const OPTS: SharedIniFileCredentialsOptions = {
                        profile: vscode_helpers.toStringSafe( PARAMS['profile'] ).trim(),
                    };

                    if ('' === OPTS.profile) {
                        OPTS.profile = undefined;
                    }

                    credentialConfig = OPTS;
                }
                break;
        }

        const S3: S3Connection = {
            client: new AWS.S3({
                credentials: new credentialClass(credentialConfig),
                params: {
                    Bucket: this.getBucket( uri ),
                    ACL: this.getDefaultAcl(),
                },
            }),
        };

        return S3;
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        return this.forConnection(uri, async (conn) => {
            const PATH = vscrw.normalizePath(uri.path);
            const PATH_PARTS = PATH.split('/').filter(x => {
                return !vscode_helpers.isEmptyString(x);
            });

            const ENTRIES: vscrw_fs.DirectoryEntry[] = [];

            for (const O of await this.list(uri)) {
                const KEY = vscode_helpers.toStringSafe(O.Key);

                const NEW_ENTRY: vscrw_fs.DirectoryEntry = [
                    Path.basename( vscrw.normalizePath(KEY) ),
                    vscode.FileType.Unknown,
                ];

                if (KEY.endsWith('/')) {
                    NEW_ENTRY[1] = vscode.FileType.Directory;
                } else {
                    NEW_ENTRY[1] = vscode.FileType.File;
                }

                ENTRIES.push( NEW_ENTRY );
            }

            return vscode_helpers.from(ENTRIES).orderBy(e => {
                return vscode.FileType.Directory === e[1] ? 0 : 1;
            }).toArray();
        });
    }

    /**
     * @inheritdoc
     */
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, async (conn) => {
            const PARAMS: AWS.S3.GetObjectRequest = {
                Bucket: undefined,
                Key: toS3Path(uri.path),
            };

            const DATA = await conn.client.getObject(PARAMS)
                                          .promise();

            let result: any = await vscode_helpers.asBuffer(DATA.Body);
            if (!Buffer.isBuffer(result)) {
                result = Buffer.alloc(0);
            }

            return result;
        });
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(S3FileSystem.scheme,
                                                        new S3FileSystem(),
                                                        { isCaseSensitive: true })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(oldUri, async (conn) => {
            const OLD_STAT = await this.statInner(oldUri);

            const NEW_STAT = await this.tryGetStat(newUri);
            if (false !== NEW_STAT) {
                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists( newUri );
                }

                if (vscode.FileType.File === NEW_STAT.type) {
                    await conn.client.deleteObject({
                        Bucket: this.getBucket(newUri),
                        Key: toS3Path(newUri.path),
                    }).promise();
                }
            }

            const ITEMS_TO_MOVE: {
                oldPath: string;
                newPath: string;
            }[] = [];

            const ITEMS_TO_DELETE: string[] = [];

            const END_ACTIONS: Function[] = [];

            if (vscode.FileType.Directory === OLD_STAT.type) {
                const LIST = await this.list(oldUri, true);

                const OLD_DIR = toS3Path(oldUri.path) + '/';
                ITEMS_TO_DELETE.push( OLD_DIR );

                const NEW_DIR = toS3Path(newUri.path) + '/';

                for (const F of LIST) {
                    const OLD_PATH = F.Key;
                    const NEW_PATH = NEW_DIR + OLD_PATH.substr(OLD_DIR.length);

                    ITEMS_TO_MOVE.push({
                        oldPath: OLD_PATH,
                        newPath: NEW_PATH,
                    });
                }

                END_ACTIONS.push(async () => {
                    try {
                        const DIR = await conn.client.getObject({
                            Bucket: undefined,
                            Key: OLD_DIR
                        }).promise();

                        if (DIR) {
                            await conn.client.deleteObject({
                                Bucket: await this.getACL(oldUri),
                                Key: OLD_DIR,
                            }).promise();
                        }
                    } catch { }
                });

                END_ACTIONS.push(async () => {
                    let createNewDir = true;
                    try {
                        const DIR = await conn.client.getObject({
                            Bucket: undefined,
                            Key: NEW_DIR
                        }).promise();

                        if (DIR) {
                            createNewDir = false;
                        }
                    } catch { }

                    if (createNewDir) {
                        await conn.client.putObject({
                            Bucket: undefined,
                            ACL: await this.getACL(newUri),
                            Key: NEW_DIR,
                            Body: null,
                        }).promise();
                    }
                });
            } else {
                ITEMS_TO_MOVE.push({
                    oldPath: toS3Path(oldUri.path),
                    newPath: toS3Path(newUri.path),
                });
            }

            for (const I of ITEMS_TO_MOVE) {
                const OLD_BUCKET = this.getBucket(oldUri);
                const OLD_PATH = I.oldPath;

                const NEW_PATH = I.newPath;

                await conn.client.copyObject({
                    Bucket: OLD_BUCKET,
                    CopySource: `${ OLD_BUCKET }/${ OLD_PATH }`,
                    Key: NEW_PATH,
                }).promise();

                await conn.client.deleteObject({
                    Bucket: OLD_BUCKET,
                    Key: OLD_PATH,
                }).promise();
            }

            for (const I of ITEMS_TO_DELETE) {
                const OLD_BUCKET = this.getBucket(oldUri);

                await conn.client.deleteObject({
                    Bucket: OLD_BUCKET,
                    Key: I,
                }).promise();
            }

            for (const A of END_ACTIONS) {
                await Promise.resolve( A() );
            }
        });
    }

    /**
     * Stores the name of the scheme.
     */
    public static readonly scheme = 's3';

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
                const FILE = await conn.client.getObject({
                    Bucket: undefined,
                    Key: toS3Path(PATH)
                }).promise();

                if (FILE) {
                    result = {
                        ctime: undefined,
                        mtime: undefined,
                        size: parseInt( vscode_helpers.normalizeString(FILE.ContentLength) ),
                        type: vscode.FileType.File,
                    };

                    if (FILE.LastModified) {
                        result.mtime = Moment( FILE.LastModified ).unix();
                    }
                }
            } catch { }

            if (false === result) {
                const DIR = await conn.client.getObject({
                    Bucket: undefined,
                    Key: toS3Path(PATH) + '/'
                }).promise();

                if (DIR) {
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

    /**
     * @inheritdoc
     */
    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: vscrw_fs.WriteFileOptions) {
        await this.forConnection(uri, async (conn) => {
            this.throwIfWriteFileIsNotAllowed(
                await this.tryGetStat(uri), options,
                uri
            );

            const PATH = vscrw.normalizePath(uri.path);

            let contentType = MimeTypes.lookup( Path.basename(PATH) );
            if (false === contentType) {
                contentType = 'application/octet-stream';
            }

            const PARAMS: AWS.S3.PutObjectRequest = {
                ACL: await this.getACL(uri),
                Bucket: undefined,
                ContentType: contentType,
                Key: toS3Path(PATH),
                Body: vscrw.asBuffer(content),
            };

            await conn.client.putObject(PARAMS)
                             .promise();
        });
    }
}

function toS3Path(p: string) {
    return vscrw.normalizePath(p)
                .substr(1);
}
