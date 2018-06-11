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
import * as vscode_helpers from 'vscode-helpers';
import * as vscode from 'vscode';
import * as vscrw from './extension';
import * as vscrw_fs from './fs';

type FileSearchCache = { [rootFolderUri: string]: FileSearchCachePatterns; };
type FileSearchCachePatterns = { [pattern: string]: FileSearchCachePatternResults; };
type FileSearchCachePatternResults = { [folderUri: string]: FileSearchItem[]; };

type FileTextSearchCache = { [rootFolderUri: string]: FileTextSearchCachePatterns; };
type FileTextSearchCachePatterns = { [pattern: string]: FileTextSearchCachePatternResults; };
type FileTextSearchCachePatternResults = { [folderUri: string]: FileTextSearchItem[]; };

interface FileSearchItem {
    name: string;
    type: vscode.FileType;
}

interface FileTextSearchItem {
    cache: { [ uri: string ]: FileTextSearchItemCacheItem; };
    name: string;
    type: vscode.FileType;
}

interface FileTextSearchItemCacheItem {
    data: Buffer;
    stat: vscode.FileStat;
}

interface SearchFilesAndFoldersOptions extends WithGlobPatterns {
    readonly checkIfPathMatches: (path: string, report?: boolean) => boolean;
    folder: vscode.Uri;
    readonly isCancellationRequested: boolean;
    readonly rootFolder: vscode.Uri;
    readonly searchCache: FileSearchCachePatterns;
}

interface SearchFolderForTextOptions extends WithGlobPatterns {
    readonly doesPathMatch: (path: string) => boolean;
    readonly encoding: string;
    folder: vscode.Uri;
    readonly isCancellationRequested: boolean;
    readonly isCaseSensitive: boolean;
    readonly pattern: string;
    readonly rootFolder: vscode.Uri;
    readonly searchCache: FileTextSearchCachePatterns;
    readonly searchLine: (line: string, path: string, lineNr: number, report?: boolean) => number[];
}

interface WithGlobPatterns {
    readonly excludePatterns: string[];
    readonly includePatterns: string[];
}

const MAX_FILE_SIZE = 1024 * 1024;

/**
 * A generic search provider for a file system.
 */
export class FileSystemSearchProvider extends vscode_helpers.DisposableBase implements vscode.SearchProvider {
    private readonly _CLEAR_FILE_SEARCH_CACHE_LISTENER: Function;
    private readonly _CLEAR_SEARCH_CACHE_LISTENER: Function;
    private readonly _CLEAR_TEXT_SEARCH_CACHE_LISTENER: Function;
    private _fileSearchCache: FileSearchCache;
    private _fileTextSearchCache: FileTextSearchCache;

    /**
     * Initializes a new instance of that class.
     *
     * @param {vscrw_fs.FileSystemBase} provider The underlying provider to use.
     */
    constructor(public readonly provider: vscrw_fs.FileSystemBase) {
        super();

        this.clearSearchCache();

        this._CLEAR_FILE_SEARCH_CACHE_LISTENER = () => {
            this.clearFileSearchCache();
        };
        this._CLEAR_SEARCH_CACHE_LISTENER = () => {
            this.clearSearchCache();
        };
        this._CLEAR_TEXT_SEARCH_CACHE_LISTENER = () => {
            this.clearFileTextSearchCache();
        };

        vscode_helpers.EVENTS.addListener(vscrw.EVENT_CLEAR_FILE_SEARCH_CACHE,
                                          this._CLEAR_FILE_SEARCH_CACHE_LISTENER);
        vscode_helpers.EVENTS.addListener(vscrw.EVENT_CLEAR_SEARCH_CACHE,
                                          this._CLEAR_SEARCH_CACHE_LISTENER);
        vscode_helpers.EVENTS.addListener(vscrw.EVENT_CLEAR_TEXT_SEARCH_CACHE,
                                          this._CLEAR_SEARCH_CACHE_LISTENER);
    }

    private clearFileSearchCache() {
        this._fileSearchCache = {};
    }

    private clearFileTextSearchCache() {
        this._fileTextSearchCache = {};
    }

    private clearSearchCache() {
        this.clearFileSearchCache();
        this.clearFileTextSearchCache();
    }

    /**
     * Gets the underlying logger.
     */
    public get logger() {
        return this.provider.logger;
    }

    /** @inheritdoc */
    protected onDispose() {
        vscode_helpers.EVENTS
                      .removeListener(vscrw.EVENT_CLEAR_FILE_SEARCH_CACHE,
                                      this._CLEAR_FILE_SEARCH_CACHE_LISTENER);

        vscode_helpers.EVENTS
                      .removeListener(vscrw.EVENT_CLEAR_SEARCH_CACHE,
                                      this._CLEAR_SEARCH_CACHE_LISTENER);

        vscode_helpers.EVENTS
                      .removeListener(vscrw.EVENT_CLEAR_TEXT_SEARCH_CACHE,
                                      this._CLEAR_TEXT_SEARCH_CACHE_LISTENER);
    }

    /** @inheritdoc */
    public async provideFileSearchResults(
        options: vscode.FileSearchOptions,
        progress: vscode.Progress<string>,
        token: vscode.CancellationToken,
    ) {
        const SEARCH_CACHE_KEY = `${ options.folder }`;

        let searchCache = this._fileSearchCache[ SEARCH_CACHE_KEY ];
        if (_.isNil(searchCache)) {
            this._fileSearchCache[ SEARCH_CACHE_KEY ] = searchCache = {};
        }

        const FILES_TO_INCLUDE = vscode_helpers.asArray(options.includes).map(x => {
            return vscode_helpers.toStringSafe(x);
        }).filter(x => {
            return !vscode_helpers.isEmptyString(x);
        });

        const FILES_TO_EXCLUDE = vscode_helpers.asArray(options.excludes).map(x => {
            return vscode_helpers.toStringSafe(x);
        }).filter(x => {
            return !vscode_helpers.isEmptyString(x);
        });

        const OPTS: SearchFilesAndFoldersOptions = {
            checkIfPathMatches: function (path, report?) {
                report = vscode_helpers.toBooleanSafe(report, true);

                const ROOT_PATH = vscrw.normalizePath(
                    this.rootFolder.path
                );

                if (doesPathMatch(path, FILES_TO_INCLUDE, FILES_TO_EXCLUDE)) {
                    if (report) {
                        progress.report(
                            vscrw.normalizePath(
                                path.substr(ROOT_PATH.length)
                            )
                        );
                    }

                    return true;
                }

                return false;
            },
            excludePatterns: FILES_TO_EXCLUDE,
            folder: options.folder,
            includePatterns: FILES_TO_INCLUDE,
            isCancellationRequested: undefined,
            rootFolder: options.folder,
            searchCache: searchCache,
        };

        // OPTS.isCancellationRequested
        Object.defineProperty(OPTS, 'isCancellationRequested', {
            get: () => {
                return token.isCancellationRequested;
            }
        });

        try {
            await this.searchFilesAndFolders( OPTS );
        } catch (e) {
            vscrw.showError(e);
        }
    }

    /** @inheritdoc */
    public async provideTextSearchResults(
        query: vscode.TextSearchQuery,
        options: vscode.TextSearchOptions,
        progress: vscode.Progress<vscode.TextSearchResult>,
        token: vscode.CancellationToken
    ) {
        const SEARCH_CACHE_KEY = `${ options.folder }`;

        let searchCache = this._fileTextSearchCache[ SEARCH_CACHE_KEY ];
        if (_.isNil(searchCache)) {
            this._fileTextSearchCache[ SEARCH_CACHE_KEY ] = searchCache = {};
        }

        let enc = vscode_helpers.normalizeString(options.encoding);
        if ('' === enc) {
            enc = 'utf8';
        }

        const FILES_TO_INCLUDE = vscode_helpers.asArray(options.includes).map(x => {
            return vscode_helpers.toStringSafe(x);
        }).filter(x => {
            return !vscode_helpers.isEmptyString(x);
        });

        const FILES_TO_EXCLUDE = vscode_helpers.asArray(options.excludes).map(x => {
            return vscode_helpers.toStringSafe(x);
        }).filter(x => {
            return !vscode_helpers.isEmptyString(x);
        });

        const OPTS: SearchFolderForTextOptions = {
            doesPathMatch: (path: string) => {
                return doesPathMatch(
                    path,
                    FILES_TO_INCLUDE, FILES_TO_EXCLUDE,
                );
            },
            encoding: enc,
            excludePatterns: FILES_TO_EXCLUDE,
            folder: options.folder,
            includePatterns: FILES_TO_INCLUDE,
            isCancellationRequested: undefined,
            isCaseSensitive: undefined,
            pattern: vscode_helpers.toStringSafe(query.pattern),
            rootFolder: options.folder,
            searchCache: searchCache,
            searchLine: function(line, path, lineNr, report?) {
                report = vscode_helpers.toBooleanSafe(report, true);

                const ROOT_PATH = vscrw.normalizePath(
                    this.rootFolder.path
                );

                const IS_CASE: boolean = this.isCaseSensitive;

                line = vscode_helpers.toStringSafe(line);
                if (!IS_CASE) {
                    line = line.toLowerCase();
                }

                let searchPattern: string = this.pattern;
                if (!IS_CASE) {
                    searchPattern = searchPattern.toLowerCase();
                }

                const COLUMNS: number[] = [];

                const REPORT_MATCH = (column: number) => {
                    if (!report) {
                        return;
                    }

                    progress.report({
                        path: vscrw.normalizePath(
                            path.substr(ROOT_PATH.length)
                        ),
                        range: new vscode.Range(new vscode.Position(lineNr, foundAt),
                                                new vscode.Position(lineNr, foundAt + this.pattern.length)),

                        preview: {
                            text: line,
                            match: new vscode.Range(new vscode.Position(0, foundAt),
                                                    new vscode.Position(0, foundAt + this.pattern.length)),
                        }
                    });
                };

                let startAtColumn = 0;
                let foundAt = -1;
                while ((foundAt = line.indexOf(searchPattern, startAtColumn)) > -1) {
                    COLUMNS.push(foundAt);
                    REPORT_MATCH(foundAt);

                    startAtColumn = foundAt + 1;
                }

                return COLUMNS;
            }
        };

        // OPTS.isCancellationRequested
        Object.defineProperty(OPTS, 'isCancellationRequested', {
            get: () => {
                return token.isCancellationRequested;
            }
        });

        // OPTS.isCaseSensitive
        Object.defineProperty(OPTS, 'isCaseSensitive', {
            get: () => {
                return vscode_helpers.toBooleanSafe(query.isCaseSensitive);
            }
        });

        try {
            await this.searchFolderForText(OPTS);
        } catch (e) {
            vscrw.showError(e);
        }
    }

    private async searchFilesAndFolders(opts: SearchFilesAndFoldersOptions) {
        if (opts.isCancellationRequested) {
            return;
        }

        const FOLDER = opts.folder;
        const FOLDER_PATH = vscrw.normalizePath(FOLDER.path);

        const SEARCH_PATTERN_KEY = generateCacheKeyForPatterns(opts);
        const SEARCH_PATTERN_FOLDER_KEY = `${ FOLDER }`;

        let searchPatterns = opts.searchCache[ SEARCH_PATTERN_KEY ];
        if (_.isNil(searchPatterns)) {
            opts.searchCache[ SEARCH_PATTERN_KEY ] = searchPatterns = {};
        }

        let list = searchPatterns[ SEARCH_PATTERN_FOLDER_KEY ];
        if (_.isNil(list)) {
            searchPatterns[ SEARCH_PATTERN_FOLDER_KEY ] = list = vscode_helpers.from( await this.provider.readDirectory(FOLDER) ).select(x => {
                return {
                    name: x[0],
                    type: x[1],
                };
            }).orderBy(x => {
                switch (x.type) {
                    case vscode.FileType.File:
                        return -2;

                    case vscode.FileType.Directory:
                        return -1;
                }

                return 0;
            }).toArray();
        }

        for (const ITEM of list) {
            if (opts.isCancellationRequested) {
                break;
            }

            try {
                const ITEM_PATH = vscrw.normalizePath(
                    Path.join(
                        FOLDER_PATH, ITEM.name
                    )
                );

                const ITEM_URI = uriWithNewPath(FOLDER, ITEM_PATH);

                if (ITEM.type === vscode.FileType.Directory) {
                    opts.folder = ITEM_URI;

                    await this.searchFilesAndFolders( opts );
                } else {
                    opts.checkIfPathMatches( ITEM_PATH, true );
                }
            } catch (e) {
                this.logger
                    .trace(e, 'search.FileSystemSearchProvider.searchFilesAndFolders(1)');
            }
        }
    }

    private async searchFolderForText(opts: SearchFolderForTextOptions) {
        if (opts.isCancellationRequested) {
            return;
        }

        const ROOT_FOLDER = opts.rootFolder;
        const ROOT_FOLDER_PATH = vscrw.normalizePath(ROOT_FOLDER.path);

        const FOLDER = opts.folder;
        const FOLDER_PATH = vscrw.normalizePath(FOLDER.path);

        const SEARCH_PATTERN_KEY = generateCacheKeyForPatterns(opts);
        const SEARCH_PATTERN_FOLDER_KEY = `${ FOLDER }`;

        let searchPatterns = opts.searchCache[ SEARCH_PATTERN_KEY ];
        if (_.isNil(searchPatterns)) {
            opts.searchCache[ SEARCH_PATTERN_KEY ] = searchPatterns = {};
        }

        let list = searchPatterns[ SEARCH_PATTERN_FOLDER_KEY ];
        if (_.isNil(list)) {
            searchPatterns[ SEARCH_PATTERN_FOLDER_KEY ] = list = vscode_helpers.from( await this.provider.readDirectory(FOLDER) ).select(x => {
                return {
                    cache: {},
                    name: x[0],
                    type: x[1],
                };
            }).orderBy(x => {
                switch (x.type) {
                    case vscode.FileType.File:
                        return -2;

                    case vscode.FileType.Directory:
                        return -1;
                }

                return 0;
            }).toArray();
        }

        for (const ITEM of list) {
            if (opts.isCancellationRequested) {
                break;
            }

            try {
                const ITEM_PATH = vscrw.normalizePath(
                    Path.join(
                        FOLDER_PATH, ITEM.name
                    )
                );

                const ITEM_URI = uriWithNewPath(FOLDER, ITEM_PATH);

                if (ITEM.type === vscode.FileType.File) {
                    if (!opts.doesPathMatch( ITEM_PATH.substr(ROOT_FOLDER_PATH.length) )) {
                        continue;
                    }

                    const FILE_ITEM_CACHE_KEY = `${ ITEM_URI }`;

                    let cacheItem = ITEM.cache[ FILE_ITEM_CACHE_KEY ];
                    if (_.isNil(cacheItem)) {
                        ITEM.cache[ FILE_ITEM_CACHE_KEY ] = cacheItem = {
                            data: undefined,
                            stat: await this.provider.stat( ITEM_URI ),
                        };
                    }

                    if (_.isNil(cacheItem.data)) {
                        if (cacheItem.stat.size < 1) {
                            cacheItem.data = Buffer.alloc(0);
                        } else if (cacheItem.stat.size <= MAX_FILE_SIZE) {
                            cacheItem.data = vscrw.asBuffer(
                                await this.provider.readFile( ITEM_URI )
                            );
                        }
                    }

                    if (_.isNil(cacheItem.data)) {
                        continue;
                    }

                    if (!(await vscode_helpers.isBinaryContent(cacheItem.data))) {
                        const TXT = cacheItem.data.toString(opts.encoding);
                        const TXT_LINES = TXT.split("\n");

                        for (let i = 0; i < TXT_LINES.length; i++) {
                            opts.searchLine(TXT_LINES[i],
                                            ITEM_PATH, i,
                                            true);
                        }
                    }
                } else if (ITEM.type === vscode.FileType.Directory) {
                    opts.folder = ITEM_URI;

                    await this.searchFolderForText(opts);
                }
            } catch (e) {
                this.logger
                    .trace(e, 'search.FileSystemSearchProvider.searchFolderForText(1)');
            }
        }
    }
}

function generateCacheKeyForPatterns(obj: WithGlobPatterns) {
    return `${ obj.includePatterns
                  .map(x => 'INC: ' + x)
                  .join("\n") }\r\n\r\n${
               obj.excludePatterns
                  .map(x => 'EXC: ' + x)
                  .join("\n") }`;
}

function doesPathMatch(path: any, filesToInclude: string[], filesToExclude: string[]) {
    const MIMIMATCH_OPTS = {
        dot: true,
        nocase: true,
        nonull: false,
    };

    let includePatterns = filesToInclude.map(x => toMiniMatchP(x));
    if (includePatterns.length < 1) {
        includePatterns = [ '/**' ];
    }

    const EXCLUDE_PATTERNS = filesToExclude.map(x => toMiniMatchP(x));
    if (EXCLUDE_PATTERNS.length > 0) {
        if (vscode_helpers.doesMatch(path, EXCLUDE_PATTERNS, MIMIMATCH_OPTS)) {
            return false;
        }
    }

    return vscode_helpers.doesMatch(path,
                                    includePatterns, MIMIMATCH_OPTS);
}

function toMiniMatchP(p: string) {
    p = vscode_helpers.toStringSafe(p);
    if (!p.trim().startsWith('/')) {
        p = '/' + p;
    }

    return p;
}

function uriWithNewPath(uri: vscode.Uri, newPath: string): vscode.Uri {
    if (uri) {
        return vscode.Uri.parse(`${ uri.scheme }://${ uri.authority }${ vscode_helpers.toStringSafe(newPath) }${ vscode_helpers.isEmptyString(uri.query) ? '' : ('?' + uri.query) }`);
    }
}
