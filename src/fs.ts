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
import * as Path from 'path';
import * as vscrw from './extension';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';

/**
 * Options for 'copy()' method of a 'vscode.FileSystemProvider' object.
 */
export type CopyOptions = { overwrite: boolean };

/**
 * An directory item.
 */
export type DirectoryEntry = [ string, vscode.FileType ];

export interface FileSystemWatcher extends vscode.Disposable {
}

type WatchCallback = () => Promise<void>;

interface WatchCallbackOptions {
    readonly fileSystem: FileSystemBase;
    readonly isActive: () => boolean;
    readonly isExcluded: (uri: vscode.Uri) => boolean;
    readonly lastKnownStats: any;
    readonly uri: vscode.Uri;
}

/**
 * Options for 'watch()' method of a 'vscode.FileSystemProvider' object.
 */
export interface WatchOptions {
    /**
     * Recursive or not.
     */
    recursive: boolean;
    /**
     * Exclude files.
     */
    excludes: string[];
}

/**
 * Options for 'writeFile()' method of a 'vscode.FileSystemProvider' object.
 */
export interface WriteFileOptions {
    /**
     * Create file if not exist.
     */
    create: boolean;
    /**
     * Overwrite file if exist.
     */
    overwrite: boolean;
}

export const EVENT_FILE_CREATED = 'file.created';
export const EVENT_FILE_DELETED = 'file.deleted';
export const EVENT_FILE_WRITE = 'file.write';

/**
 * SFTP file system.
 */
export abstract class FileSystemBase extends vscode_helpers.DisposableBase implements vscode.FileSystemProvider {
    private readonly _EVENT_EMITTER: vscode.EventEmitter<vscode.FileChangeEvent[]>;

    /**
     * Initializes a new instance of that class.
     */
    public constructor() {
        super();

        this._EVENT_EMITTER = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
        this.onDidChangeFile = this._EVENT_EMITTER.event;
    }

    /**
     * @inheritdoc
     */
    public abstract async createDirectory(uri: vscode.Uri);

    /**
     * @inheritdoc
     */
    public abstract async delete(uri: vscode.Uri, options: { recursive: boolean });

    /**
     * Emitts a file change.
     *
     * @param {vscode.FileChangeEvent|vscode.FileChangeEvent[]} data The data to submit.
     */
    public emitFileChange(data: vscode.FileChangeEvent | vscode.FileChangeEvent[]) {
        this._EVENT_EMITTER.fire(
            vscode_helpers.asArray(data),
        );
    }

    /**
     * Emits the event for a file that has been created.
     *
     * @param {vscode.Uri} uri The URI of the file.
     */
    protected emitFileCreated(uri: vscode.Uri) {
        this.emit(EVENT_FILE_CREATED,
                  uri);
    }

    /**
     * Emits the event for a file that has been deleted.
     *
     * @param {vscode.Uri} uri The URI of the file.
     */
    protected emitFileDeleted(uri: vscode.Uri) {
        this.emit(EVENT_FILE_DELETED,
                  uri);
    }

    /**
     * Emits the event for a file that has been renamed.
     *
     * @param {vscode.Uri} oldUri The old URI of the file.
     * @param {vscode.Uri} newUri The new URI of the file.
     */
    protected emitFileRenamed(oldUri: vscode.Uri, newUri: vscode.Uri) {
        this.emitFileCreated( newUri );
        this.emitFileDeleted( oldUri );
    }

    /**
     * Emits the event for a file that has been written.
     *
     * @param {vscode.Uri} uri The URI of the file.
     */
    protected emitFileWrite(uri: vscode.Uri) {
        this.emit(EVENT_FILE_WRITE,
                  uri);
    }

    /**
     * Gets the logger for that file system provider.
     *
     * @return {vscode_helpers.Logger} The provider's logger.
     */
    public get logger() {
        return vscrw.getLogger();
    }

    /**
     * @inheritdoc
     */
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

    /**
     * @inheritdoc
     */
    public abstract async readDirectory(uri: vscode.Uri): Promise<DirectoryEntry[]>;

    /**
     * @inheritdoc
     */
    public abstract async readFile(uri: vscode.Uri): Promise<Uint8Array>;

    /**
     * @inheritdoc
     */
    public abstract async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void>;

    /**
     * @inheritdoc
     */
    public abstract async stat(uri: vscode.Uri): Promise<vscode.FileStat>;

    /**
     * Throw an exception if writing a file is not allowed.
     *
     * @param {vscode.FileStat|false} stat The file information.
     * @param {WriteFileOptions} options The options.
     * @param {vscode.Uri} [uri] The optional URI.
     */
    protected throwIfWriteFileIsNotAllowed(stat: vscode.FileStat | false, options: WriteFileOptions, uri?: vscode.Uri) {
        if (false === stat) {
            if (!options.create) {
                throw vscode.FileSystemError.FileNotFound( uri );
            }
        } else {
            if (vscode.FileType.Directory === stat.type) {
                throw vscode.FileSystemError.FileIsADirectory( uri );
            }

            if (!options.overwrite) {
                throw vscode.FileSystemError.FileExists( uri );
            }
        }
    }

    /**
     * @inheritdoc
     */
    public watch(uri: vscode.Uri, options: WatchOptions): vscode.Disposable {
        return createFileSystemWatcher(
            this,
            uri, options,
        );
    }

    /**
     * Stores the queue for watch operations.
     */
    public readonly watchQueue = vscode_helpers.createQueue();

    /**
     * @inheritdoc
     */
    public abstract async writeFile(uri: vscode.Uri, content: Uint8Array, options: WriteFileOptions): Promise<void>;
}

export function createFileSystemWatcher(
    fs: FileSystemBase,
    uri: vscode.Uri, options: WatchOptions
): FileSystemWatcher {
    let watcher: FileSystemWatcher | false = false;

    const EXCLUDE_PATTERNS = vscode_helpers.from(
        vscode_helpers.asArray(
            options.excludes
        )
    ).select(x => {
        return vscode_helpers.toStringSafe(x);
    }).where(x => {
        return '' !== x.trim();
    }).select(x => {
        if (!x.trim().startsWith('/')) {
            x = '/' + x;
        }

        return x;
    }).distinct()
      .toArray();

    let isActive = false;
    let lastKnownStats: any = {};

    const ON_FILE_CREATED = (uri: vscode.Uri) => {
        const KEY = `${ uri }`;

        delete lastKnownStats[KEY];
    };

    const ON_FILE_DELETED = (uri: vscode.Uri) => {
        const KEY = `${ uri }`;

        lastKnownStats[KEY] = false;
    };

    const ON_FILE_WRITE = (uri: vscode.Uri) => {
        const KEY = `${ uri }`;

        delete lastKnownStats[KEY];
    };

    const DISPOSE_WATCHER = () => {
        isActive = false;

        vscode_helpers.tryRemoveListener(fs,
                                         EVENT_FILE_CREATED, ON_FILE_CREATED);
        vscode_helpers.tryRemoveListener(fs,
                                         EVENT_FILE_WRITE, ON_FILE_WRITE);
        vscode_helpers.tryRemoveListener(fs,
                                         EVENT_FILE_WRITE, ON_FILE_WRITE);
    };

    const WATCH_CALLBACK_OPTS: WatchCallbackOptions = {
        fileSystem: fs,
        isActive: () => isActive,
        isExcluded: (uri) => {
            if (_.isNil(uri)) {
                return true;
            }

            return vscode_helpers.doesMatch(
                vscrw.normalizePath(uri.path),
                EXCLUDE_PATTERNS,
                {
                    dot: true,
                    nocase: true,
                }
            );
        },
        lastKnownStats: undefined,
        uri: uri,
    };

    // WATCH_CALLBACK_OPTS.lastKnownStats
    Object.defineProperty(WATCH_CALLBACK_OPTS, 'lastKnownStats', {
        get: () => {
            return lastKnownStats;
        }
    });

    const WATCH_CALLBACK: WatchCallback =
        options.recursive ? createRecursiveWatchCallback(WATCH_CALLBACK_OPTS)
                          : createNonRecursiveWatchCallback(WATCH_CALLBACK_OPTS);

    try {
        const PARAMS = vscrw.getUriParams(uri);

        let watch = parseFloat(
            vscode_helpers.toStringSafe(PARAMS['watch']).trim()
        );
        if (!isNaN(watch)) {
            watch = Math.floor(watch * 1000.0);
            if (watch > 0.0) {
                let watchInterval: vscode.Disposable;
                try {
                    watchInterval = vscode_helpers.createInterval(
                        WATCH_CALLBACK, watch
                    );
                } catch (e) {
                    vscode_helpers.tryDispose( watchInterval );

                    throw e;
                }

                watcher = {
                    dispose: () => {
                        DISPOSE_WATCHER();

                        vscode_helpers.tryDispose( watchInterval );
                    }
                };
            }
        }
    } catch (e) {
        fs.logger
          .trace(e, 'fs.createFileSystemWatcher()');
    }

    if (false === watcher) {
        watcher = {
            dispose: () => {
                DISPOSE_WATCHER();
            }
        };
    }

    fs.on(EVENT_FILE_CREATED, ON_FILE_CREATED);
    fs.on(EVENT_FILE_DELETED, ON_FILE_DELETED);
    fs.on(EVENT_FILE_WRITE, ON_FILE_WRITE);

    isActive = true;

    return watcher;
}

function createNonRecursiveWatchCallback(
    opts: WatchCallbackOptions
): WatchCallback {
    let lastFileList: any = {};

    return async () => {
        await opts.fileSystem.watchQueue.add(async () => {
            let currentList = lastFileList;
            if (_.isNil(currentList)) {
                currentList = {};
            }

            if (!opts.isActive()) {
                return;
            }

            const ON_FILE_CHANGED = opts.fileSystem.onDidChangeFile;
            if (_.isNil(ON_FILE_CHANGED)) {
                return;
            }

            const NEW_LIST: any = {};
            const UPDATE_LAST_FILE_LIST = () => {
                lastFileList = NEW_LIST;
            };

            try {
                const STAT_OF_URI = await tryGetStat(opts.fileSystem, opts.uri);
                if (false === STAT_OF_URI) {
                    opts.fileSystem.emitFileChange({
                        type: vscode.FileChangeType.Deleted,
                        uri: opts.uri,
                    });

                    UPDATE_LAST_FILE_LIST();
                    return;
                }

                if (_.isNil(STAT_OF_URI)) {
                    return;
                }

                const CHECK_CURRENT_LIST_ITEM = (u: vscode.Uri, stat: vscode.FileStat) => {
                    const ITEM_KEY = toUriKey( u );
                    NEW_LIST[ ITEM_KEY ] = stat;

                    const EXISTING_ITEM: vscode.FileStat = currentList[ITEM_KEY];
                    if (!_.isNil(EXISTING_ITEM)) {
                        if (!statsAreEqual(EXISTING_ITEM, stat)) {
                            opts.fileSystem.emitFileChange({
                                type: vscode.FileChangeType.Changed,
                                uri: u,
                            });
                        } else {
                            if (EXISTING_ITEM.type !== stat.type) {
                                opts.fileSystem.emitFileChange({
                                    type: vscode.FileChangeType.Created,
                                    uri: u,
                                });
                            }
                        }
                    }
                };

                if (vscode.FileType.Directory === STAT_OF_URI.type) {
                    const LIST = await opts.fileSystem.readDirectory( opts.uri );

                    for (const KEY in currentList) {
                        const ITEM_URI = vscode.Uri.parse(KEY);
                        const ITEM_NAME = Path.basename( ITEM_URI.path );

                        const HAS_MATCHING_ENTRY = vscode_helpers.from(LIST).any(e => {
                            return e[0] === ITEM_NAME;
                        });
                        if (!HAS_MATCHING_ENTRY) {
                            opts.fileSystem.emitFileChange({
                                type: vscode.FileChangeType.Deleted,
                                uri: ITEM_URI,
                            });
                        }
                    }

                    for (const ITEM of LIST) {
                        try {
                            const ITEM_URI = vscrw.uriWithNewPath(
                                opts.uri,
                                Path.join(opts.uri.path, ITEM[0]),
                            );

                            CHECK_CURRENT_LIST_ITEM(
                                ITEM_URI,
                                await opts.fileSystem.stat(ITEM_URI),
                            );
                        } catch (e) {
                            opts.fileSystem.logger
                                        .trace(e, 'fs.createNonRecursiveWatchCallback(2)');
                        }
                    }
                } else if (vscode.FileType.File === STAT_OF_URI.type) {
                    CHECK_CURRENT_LIST_ITEM(
                        opts.uri,
                        STAT_OF_URI,
                    );
                }

                UPDATE_LAST_FILE_LIST();
            } catch (e) {
                opts.fileSystem.logger
                               .trace(e, 'fs.createNonRecursiveWatchCallback(1)');
            }
        });
    };
}

function createRecursiveWatchCallback(
    opts: WatchCallbackOptions
): WatchCallback {
    return async () => {
        await opts.fileSystem.watchQueue.add(async () => {
            if (!opts.isActive()) {
                return;
            }

            const ON_FILE_CHANGED = opts.fileSystem.onDidChangeFile;
            if (_.isNil(ON_FILE_CHANGED)) {
                return;
            }

            try {
                const MATCHING_EDITORS = vscode_helpers.asArray(
                    vscode.window.visibleTextEditors
                ).filter(e => {
                    const DOC = e.document;
                    if (DOC) {
                        const DOC_URI = DOC.uri;
                        if (DOC_URI) {
                            return !opts.isExcluded(DOC_URI) &&
                                   (`${ vscrw.uriWithNewPath(DOC_URI, opts.uri.path) }` === `${ opts.uri }`);
                        }
                    }

                    return false;
                });

                for (const EDITOR of MATCHING_EDITORS) {
                    await updateLastKnown(
                        opts, EDITOR.document.uri,
                    );
                }
            } catch (e) {
                opts.fileSystem.logger
                               .trace(e, 'fs.createRecursiveWatchCallback()');
            }
        });
    };
}

function statsAreEqual(x: vscode.FileStat, y: vscode.FileStat) {
    if (x !== y) {
        if (!_.isNil(x) && !_.isNil(y)) {
            return x.size === y.size &&
                   x.mtime === y.mtime &&
                   x.ctime === y.ctime;
        }

        return false;
    }

    return true;
}

function toUriKey(uri: vscode.Uri): string {
    if (!_.isNil(uri)) {
        return `${ uri }`;
    }

    return <any>uri;
}

async function tryGetStat(fs: FileSystemBase, uri: vscode.Uri): Promise<vscode.FileStat | false> {
    try {
        return await fs.stat(uri);
    } catch (e) {
        if ('EntryNotFound (FileSystemError)' === e.name) {
            return false;
        }

        return null;
    }
}

async function updateLastKnown(opts: WatchCallbackOptions, uri: vscode.Uri) {
    if (_.isNil(uri)) {
        return;
    }

    const KEY = toUriKey(uri);

    let currentStat: false | vscode.FileStat;
    const UPDATE = () => {
        opts.lastKnownStats[KEY] = currentStat;
    };

    const LAST_KNOWN: vscode.FileStat | false = opts.lastKnownStats[KEY];

    currentStat = await tryGetStat(opts.fileSystem, uri);
    if (_.isNil(currentStat)) {
        return;
    }

    if (false !== currentStat) {
        if (currentStat.type === vscode.FileType.File) {
            if (!_.isNil(LAST_KNOWN)) {
                if (false !== LAST_KNOWN) {
                    if (!statsAreEqual(LAST_KNOWN, currentStat)) {
                        opts.fileSystem.emitFileChange({
                            type: vscode.FileChangeType.Changed,
                            uri: uri,
                        });
                    } else {
                        if (LAST_KNOWN.type !== currentStat.type) {
                            opts.fileSystem.emitFileChange({
                                type: vscode.FileChangeType.Created,
                                uri: uri,
                            });
                        }
                    }
                } else {
                    opts.fileSystem.emitFileChange({
                        type: vscode.FileChangeType.Created,
                        uri: uri,
                    });
                }
            }
        }
    }

    if (currentStat === LAST_KNOWN) {
        return;
    }

    if (false === currentStat) {
        opts.fileSystem.emitFileChange({
            type: vscode.FileChangeType.Deleted,
            uri: uri,
        });
    }

    UPDATE();
}
