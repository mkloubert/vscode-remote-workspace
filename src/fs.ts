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
 * An directory item.
 */
export type DirectoryEntry = [ string, vscode.FileType ];

/**
 * Options for 'writeFile()' method of a 'vscode.FileSystemProvider'.
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

/**
 * SFTP file system.
 */
export abstract class FileSystemBase extends vscode_helpers.DisposableBase implements vscode.FileSystemProvider {
    private readonly _EVENT_EMITTER;

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
    public abstract watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable;

    /**
     * @inheritdoc
     */
    public abstract async writeFile(uri: vscode.Uri, content: Uint8Array, options: WriteFileOptions): Promise<void>;
}
