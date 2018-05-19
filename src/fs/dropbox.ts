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

import * as Dropbox from 'dropbox';
import * as FSExtra from 'fs-extra';
const IsomorphicFetch = require('isomorphic-fetch');  // REQUIRED EXTENSION FOR dropbox MODULE!!!
import * as Moment from 'moment';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';
import * as vscrw from '../extension';
import * as vscrw_fs from '../fs';

interface DropboxConnection {
    client: Dropbox.Dropbox;
}

interface DropboxFileEntry {
    '.tag': string;
    name: string;
}

interface DropboxFileStat extends vscode.FileStat {
}

const NO_CURSOR_YET = Symbol('NO_CURSOR_YET');

/**
 * Dropbox file system.
 */
export class DropboxFileSystem extends vscrw_fs.FileSystemBase {
    /**
     * @inheritdoc
     */
    public async copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(source, async (conn) => {
            const SRC_STAT = await this.statInner(source);

            const DEST_STAT = await this.tryGetStat(source);
            if (false !== DEST_STAT) {
                if (options.overwrite) {
                    await conn.client.filesDeleteV2({
                        path: toDropboxPath(destination.path),
                    });
                } else {
                    throw vscode.FileSystemError.FileExists( destination );
                }
            }

            await conn.client.filesCopyV2({
                from_path: toDropboxPath(source.path),
                to_path: toDropboxPath(destination.path),
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async createDirectory(uri: vscode.Uri) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.tryGetStat(uri);
            if (false !== STAT) {
                throw vscode.FileSystemError.FileExists( uri );
            }

            await conn.client.filesCreateFolderV2({
                autorename: false,
                path: toDropboxPath(uri.path),
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async delete(uri: vscode.Uri, options: { recursive: boolean }) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.statInner(uri);

            if (vscode.FileType.Directory === STAT.type) {
                if (!options.recursive) {
                    const LIST = await this.list(uri);
                    const HAS_SUB_DIRS = LIST.filter(i => {
                        return 'folder' === vscode_helpers.normalizeString(i['.tag']);
                    }).length > 0;

                    if (HAS_SUB_DIRS) {
                        throw vscode.FileSystemError.NoPermissions( uri );
                    }
                }
            }

            await conn.client.filesDeleteV2({
                path: toDropboxPath(uri.path)
            });
        });
    }

    private async forConnection<TResult = any>(
        uri: vscode.Uri, action: (conn: DropboxConnection) => TResult | PromiseLike<TResult>
    ): Promise<TResult> {
        const CONN = await this.openConnection(uri);
        if (action) {
            return await Promise.resolve(
                action( CONN )
            );
        }
    }

    private list(uri: vscode.Uri): Promise<DropboxFileEntry[]> {
        return this.forConnection(uri, async (conn) => {
            const ALL_ENTRIES: DropboxFileEntry[] = [];

            let cursor: symbol | string = NO_CURSOR_YET;
            const NEXT_SEGMENT = async () => {
                let result: Dropbox.files.ListFolderResult;
                if (cursor === NO_CURSOR_YET) {
                    result = await conn.client.filesListFolder({
                        include_media_info: true,
                        include_mounted_folders: true,
                        path: toDropboxPath(uri.path),
                        recursive: false,
                    });
                } else {
                    result = await conn.client.filesListFolderContinue({
                        cursor: <string>cursor,
                    });
                }

                vscode_helpers.asArray( result.entries ).forEach(e => {
                    ALL_ENTRIES.push( e );
                });

                if (result.has_more) {
                    cursor = result.cursor;

                    if (!vscode_helpers.isEmptyString(cursor)) {
                        await NEXT_SEGMENT();
                    }
                }
            };

            await NEXT_SEGMENT();

            return ALL_ENTRIES;
        });
    }

    private async openConnection(uri: vscode.Uri): Promise<DropboxConnection> {
        // format:
        //
        // dropbox://token[/path/to/file/or/folder]

        const PARAMS = vscrw.uriParamsToObject(uri);

        let accessToken: string | false = false;
        {
            // external auth file?
            let authFile = vscode_helpers.toStringSafe( PARAMS['auth'] );
            if (!vscode_helpers.isEmptyString(authFile)) {
                authFile = vscrw.mapToUsersHome( authFile );

                if (await vscode_helpers.isFile(authFile)) {
                    accessToken = (await FSExtra.readFile(authFile, 'utf8')).trim();
                }
            }
        }

        if (false === accessToken) {
            accessToken = vscode_helpers.toStringSafe(
                uri.authority
            ).trim();
        }

        if (vscode_helpers.isEmptyString(accessToken)) {
            accessToken = undefined;
        }

        return {
            client: new Dropbox.Dropbox({
                accessToken: <string>accessToken
            }),
        };
    }

    /**
     * @inheritdoc
     */
    public async readDirectory(uri: vscode.Uri): Promise<vscrw_fs.DirectoryEntry[]> {
        const ENTRIES: vscrw_fs.DirectoryEntry[] = [];

        const LIST = await this.list( uri );
        for (const ITEM of LIST) {
            if (vscode_helpers.isEmptyString(ITEM.name)) {
                continue;
            }

            let type: vscode.FileType = vscode.FileType.Unknown;

            const TAG = vscode_helpers.normalizeString(ITEM['.tag']);
            if ('file' === TAG) {
                type = vscode.FileType.File;
            } else if ('folder' === TAG) {
                type = vscode.FileType.Directory;
            }

            ENTRIES.push([
                vscode_helpers.toStringSafe(ITEM.name), type
            ]);
        }

        return ENTRIES;
    }

    /**
     * @inheritdoc
     */
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.forConnection(uri, async (conn) => {
            try {
                const DATA = await conn.client.filesDownload({
                    path: toDropboxPath(uri.path)
                });

                return vscrw.toUInt8Array( DATA['fileBinary'] );
            } catch {
                throw vscode.FileSystemError.FileNotFound( uri );
            }
        });
    }

    /**
     * Register file system to extension.
     *
     * @param {vscode.ExtensionContext} context The extension context.
     */
    public static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('dropbox',
                                                        new DropboxFileSystem(),
                                                        { isCaseSensitive: false })
        );
    }

    /**
     * @inheritdoc
     */
    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }) {
        await this.forConnection(oldUri, async (conn) => {
            const STAT = await this.tryGetStat(newUri);
            if (false !== STAT) {
                if (options.overwrite) {
                    await conn.client.filesDeleteV2({
                        path: toDropboxPath(newUri.path),
                    });
                } else {
                    throw vscode.FileSystemError.FileExists( newUri );
                }
            }

            await conn.client.filesMoveV2({
                from_path: toDropboxPath(oldUri.path),
                to_path: toDropboxPath(newUri.path),
            });
        });
    }

    /**
     * @inheritdoc
     */
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this.statInner( uri );
    }

    private async statInner(uri: vscode.Uri): Promise<DropboxFileStat> {
        if ('/' === vscrw.normalizePath(uri.path)) {
            return {
                type: vscode.FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0,
            };
        }

        return this.forConnection(uri, async (conn) => {
            try {
                const META = await conn.client.filesGetMetadata({
                    include_media_info: false,
                    path: toDropboxPath(uri.path)
                });

                const STAT: DropboxFileStat = {
                    ctime: undefined,
                    mtime: undefined,
                    size: undefined,
                    type: vscode.FileType.Unknown,
                };

                const TAG = vscode_helpers.normalizeString(META['.tag']);
                if ('file' === TAG) {
                    const FILE_META = <Dropbox.files.FileMetadataReference>META;

                    STAT.type = vscode.FileType.File;
                    STAT.size = parseInt( vscode_helpers.toStringSafe(FILE_META.size).trim() );

                    if (!vscode_helpers.isEmptyString(FILE_META.server_modified)) {
                        let mtime = Moment(FILE_META.server_modified);
                        if (mtime.isValid()) {
                            mtime = vscode_helpers.asUTC( mtime );

                            STAT.mtime = mtime.unix();
                        }
                    }
                } else if ('folder' === TAG) {
                    const FOLDER_META = <Dropbox.files.FolderMetadataReference>META;

                    STAT.type = vscode.FileType.Directory;
                }

                if (isNaN(STAT.mtime)) {
                    STAT.mtime = 0;
                }
                STAT.ctime = STAT.mtime;

                if (isNaN(STAT.size)) {
                    STAT.size = 0;
                }

                return STAT;
            } catch (e) {
                throw vscode.FileSystemError.FileNotFound( uri );
            }
        });
    }

    private async tryGetStat(uri: vscode.Uri): Promise<DropboxFileStat | false> {
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
    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }) {
        await this.forConnection(uri, async (conn) => {
            const STAT = await this.tryGetStat(uri);
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

            await conn.client.filesUpload({
                autorename: false,
                contents: new Buffer(content),
                mode: {
                    '.tag': 'overwrite'
                },
                mute: false,
                path: toDropboxPath(uri.path),
            });
        });
    }
}

function toDropboxPath(p: string) {
    p = vscrw.normalizePath(p);
    if ('/' === p) {
        p = '';
    }

    return p;
}
