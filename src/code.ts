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

/**
 * Options for the 'exec()' function.
 */
export interface ExecOptions {
    /**
     * The code to execute.
     */
    code: string;
    /**
     * Additional values.
     */
    values?: { [name: string]: any };
}

/**
 * Executes code.
 *
 * @param {ExecOptions} _13ce0f874dea43478cb76f552fbe2069_tmmk_0509_2309_1979 Options for the execution.
 *
 * @return {any} The result of the exeuction.
 */
export function exec(_13ce0f874dea43478cb76f552fbe2069_tmmk_0509_2309_1979: ExecOptions): any {
    // s. https://lodash.com/
    const _ = require('lodash');
    // s. https://github.com/jprichardson/node-fs-extra
    const $fs = require('fs-extra');
    // s. https://github.com/mkloubert/vscode-helpers
    const $h = require('vscode-helpers');

    // s. https://mkloubert.github.io/vscode-helpers/modules/_logging_index_.html
    const $l = require('./extension').getLogger();

    // s. https://momentjs.com/
    //    https://momentjs.com/timezone/
    const $m = require('moment');
    require('moment-timezone');

    // https://nodejs.org/api/os.html
    const $os = require('os');

    // s. https://nodejs.org/api/path.html
    const $p = require('path');

    const $r = (id: string) => {
        return require(
            $h.toStringSafe(id)
        );
    };

    const $v: any = {};
    if (!_.isNil(_13ce0f874dea43478cb76f552fbe2069_tmmk_0509_2309_1979.values)) {
        // additional values, which should
        // be written to $v

        _.forIn(_13ce0f874dea43478cb76f552fbe2069_tmmk_0509_2309_1979.values, (v: any, k: string) => {
            $v[ $h.normalizeString(k) ] = v;
        });
    }

    return eval(
        $h.toStringSafe(
            _13ce0f874dea43478cb76f552fbe2069_tmmk_0509_2309_1979.code
        )
    );
}
