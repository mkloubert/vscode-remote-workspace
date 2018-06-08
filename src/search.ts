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

import * as Path from 'path';
import * as vscode_helpers from 'vscode-helpers';
import * as vscode from 'vscode';
import * as vscrw from './extension';
import * as vscrw_fs from './fs';

interface SearchFilesAndFoldersOptions {
    readonly checkIfPathMatches: (path: string, report?: boolean) => boolean;
    folder: vscode.Uri;
    readonly isCancellationRequested: boolean;
    readonly rootFolder: vscode.Uri;
}

interface SearchFolderForTextOptions {
    readonly doesPathMatch: (path: string) => boolean;
    readonly encoding: string;
    folder: vscode.Uri;
    readonly isCancellationRequested: boolean;
    readonly isCaseSensitive: boolean;
    readonly pattern: string;
    readonly rootFolder: vscode.Uri;
    readonly searchLine: (line: string, path: string, lineNr: number, report?: boolean) => number[];
}

/**
 * A generic search provider for a file system.
 */
export class FileSystemSearchProvider extends vscode_helpers.DisposableBase implements vscode.SearchProvider {
    /**
     * Initializes a new instance of that class.
     *
     * @param {vscrw_fs.FileSystemBase} provider The underlying provider to use.
     */
    constructor(public readonly provider: vscrw_fs.FileSystemBase) {
        super();
    }

    /**
     * Gets the underlying logger.
     */
    public get logger() {
        return this.provider.logger;
    }

    /** @inheritdoc */
    public async provideFileSearchResults(
        options: vscode.FileSearchOptions,
        progress: vscode.Progress<string>,
        token: vscode.CancellationToken,
    ) {
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
            folder: options.folder,
            isCancellationRequested: undefined,
            rootFolder: options.folder,
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
            folder: options.folder,
            isCancellationRequested: undefined,
            isCaseSensitive: undefined,
            pattern: vscode_helpers.toStringSafe(query.pattern),
            rootFolder: options.folder,
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

        const LIST = vscode_helpers.from( await this.provider.readDirectory(FOLDER) ).select(x => {
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

        for (const ITEM of LIST) {
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

        const LIST = vscode_helpers.from( await this.provider.readDirectory(FOLDER) ).select(x => {
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

        for (const ITEM of LIST) {
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

                    const STAT = await this.provider.stat( ITEM_URI );

                    if (STAT.size > 0 && STAT.size <= (1024 * 1024)) {
                        const FILE_DATA = vscrw.asBuffer(
                            await this.provider.readFile( ITEM_URI )
                        );

                        if (!(await vscode_helpers.isBinaryContent(FILE_DATA))) {
                            const TXT = FILE_DATA.toString(opts.encoding);
                            const TXT_LINES = TXT.split("\n");

                            for (let i = 0; i < TXT_LINES.length; i++) {
                                opts.searchLine(TXT_LINES[i],
                                                ITEM_PATH, i,
                                                true);
                            }
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
