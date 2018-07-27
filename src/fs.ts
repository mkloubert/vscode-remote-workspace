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

import * as vscrw from './extension';
import * as vscode from 'vscode';
import * as vscode_helpers from 'vscode-helpers';

/**
 * Options for 'copy()' method of a 'vscode.FileSystemProvider' object.
 */
export type CopyOptions = { overwrite: boolean };

/**
 * Options for a 'createTerminal()' method of a file system provider.
 */
export interface CreateRemoteTerminalOptions {
    /**
     * Is invoked if a line (with a command) should be handled.
     *
     * @param {string} line The line (with the command).
     */
    onLine: (line: string) => any;
    /**
     * Is invoked if a new line is requested.
     */
    onNewLine: () => any;
    /**
     * The underlying URI, the terminal is for.
     */
    uri: vscode.Uri;
}

/**
 * An directory item.
 */
export type DirectoryEntry = [ string, vscode.FileType ];

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

const KEY_BACKSPACE = String.fromCharCode(127);
const KEY_DOWN = String.fromCharCode(27, 91, 66);
const KEY_LEFT = String.fromCharCode(27, 91, 68);
const KEY_RIGHT = String.fromCharCode(27, 91, 67);
const KEY_UP = String.fromCharCode(27, 91, 65);

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
     * Creates a remote terminal for an URI.
     *
     * @param {vscode.Uri} uri The URI.
     *
     * @return {vscode.TerminalRenderer} The created terminal.
     */
    public createTerminal(uri: vscode.Uri): vscode.TerminalRenderer {
        throw new Error('Not implemented');
    }

    /**
     * @inheritdoc
     */
    public abstract async delete(uri: vscode.Uri, options: { recursive: boolean });

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
     * Gets if the provider supports an terminal or not.
     */
    public get supportsTerminal() {
        return false;
    }

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
    public abstract watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable;

    /**
     * @inheritdoc
     */
    public abstract async writeFile(uri: vscode.Uri, content: Uint8Array, options: WriteFileOptions): Promise<void>;
}

/**
 * Creates a new virtual terminal instance with a common behavior.
 *
 * @param {CreateRemoteTerminalOptions} opts The options for the new terminal.
 *
 * @return {vscode.TerminalRenderer} The new terminal instance.
 */
export function createRemoteTerminal(opts: CreateRemoteTerminalOptions): vscode.TerminalRenderer {
    const SHELL = vscode.window.createTerminalRenderer(
        `${ vscrw.uriWithoutAuthority(opts.uri) }`
    );

    let line = '';

    const ON_NEW_LINE = () => {
        try {
            Promise.resolve( opts.onNewLine() ).then(() => {
            }, (err) => {
                vscrw.showError(err);
            });
        } catch (e) {
            vscrw.showError(e);
        }
    };

    SHELL.onDidAcceptInput((data) => {
        try {
            data = vscode_helpers.toStringSafe(data);
            if ('' === data) {
                return;
            }

            if (KEY_BACKSPACE === data) {
                SHELL.write("\r");

                ON_NEW_LINE();
                if (line.length > 0) {
                    SHELL.write( vscode_helpers.repeat(' ', line.length)
                                               .joinToString() );

                    line = line.substr(0, line.length - 1);
                }

                SHELL.write("\r");

                ON_NEW_LINE();
                SHELL.write(line);

                return;
            }

            if ([ KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_UP ].indexOf(data) > -1) {
                return;
            }

            if ('\r' === data) {
                if ('' !== line.trim()) {
                    Promise.resolve( opts.onLine(line) ).then(() => {
                        ON_NEW_LINE();
                    }, (err) => {
                        vscrw.showError(err);
                    });
                }

                line = '';
            } else {
                line += data;
                SHELL.write(data);
            }
        } catch (e) {
            vscrw.showError(e);
        }
    });

    return SHELL;
}
