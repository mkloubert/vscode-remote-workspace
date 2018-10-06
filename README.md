# vscode-remote-workspace

[![Share via Facebook](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Facebook.png)](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace) [![Share via Twitter](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Twitter.png)](https://twitter.com/intent/tweet?source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&text=Remote%20Workspace:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&via=mjkloubert) [![Share via Google+](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Google+.png)](https://plus.google.com/share?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Pinterest](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Pinterest.png)](http://pinterest.com/pin/create/button/?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&description=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Reddit](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Reddit.png)](http://www.reddit.com/submit?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace) [![Share via LinkedIn](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/LinkedIn.png)](http://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace&summary=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.&source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Wordpress](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Wordpress.png)](http://wordpress.com/press-this.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace&s=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Email](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Email.png)](mailto:?subject=Remote%20Workspace&body=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace)


[![Latest Release](https://vsmarketplacebadge.apphb.com/version-short/mkloubert.vscode-remote-workspace.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-remote-workspace)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/mkloubert.vscode-remote-workspace.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-remote-workspace)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/mkloubert.vscode-remote-workspace.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-remote-workspace#review-details)

Multi protocol support of new [Visual Studio Code](https://code.visualstudio.com) [FileSystem API](https://code.visualstudio.com/docs/extensionAPI/vscode-api#FileSystemProvider), especially for handling remote files like local ones.

![Demo 1](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/demo1.gif)

## Table of contents

1. [Install](#install-)
2. [How to use](#how-to-use-)
   * [About parameters](#about-parameters-)
     * [Import parameters](#import-parameters-)
     * [Placeholders](#placeholders-)
       * [Code](#code-)
       * [Environment variables](#environment-variables-)
       * [Static](#static-)
   * [Azure](#azure-)
     * [Parameters](#parameters-)
     * [Remarks](#remarks-)
   * [Dropbox](#dropbox-)
     * [Parameters](#parameters--1)
   * [FTP](#ftp-)
     * [Parameters](#parameters--2)
   * [FTPs](#ftps-)
     * [Parameters](#parameters--3)
   * [S3 Buckets](#s3-buckets-)
     * [credential_type](#credential_type-)
     * [Parameters](#parameters--4)
   * [SFTP](#sftp-)
     * [Parameters](#parameters--5)
       * [mode](#mode-)
   * [Slack](#slack-)
     * [Parameters](#parameters--6)
     * [Remarks](#remarks--1)
   * [WebDAV](#webdav-)
     * [Parameters](#parameters--7)
       * [authType](#authtype-)
3. [Commands](#commands-)
4. [Logs](#logs-)
5. [Support and contribute](#support-and-contribute-)
   * [Contributors](#contributors-)
6. [Related projects](#related-projects-)
   * [node-simple-socket](#node-simple-socket-)
   * [vscode-helpers](#vscode-helpers-)

## Install [[&uarr;](#table-of-contents)]

Launch VS Code Quick Open (`Ctrl + P`), paste the following command, and press enter:

```bash
ext install vscode-remote-workspace
```

Or search for things like `vscode-remote-workspace` in your editor.

## How to use [[&uarr;](#table-of-contents)]

Create (or update) a `.code-workspace` file and open it by using `File >> Open Workspace...` in the GUI:

```json
{
    "folders": [{
        "uri": "sftp://my-user:my-password@example.com?debug=1",
        "name": "My SFTP folder"
    }]
}
```

### About parameters [[&uarr;](#how-to-use-)]

A parameter is a key-value-pair, which has to be setup in the URI and NOT in the `settings` section of a `.code-workspace` file.

If you want to set the `debug` parameter to `1` for a [SFTP connection](#sftp-), e.g.:

```json
{
    "folders": [{
        "uri": "sftp://myUser:myPass@example.com?debug=1",
        "name": "My SFTP folder"
    }]
}
```

#### Import parameters [[&uarr;](#about-parameters-)]

Any URI / protocol supports a general parameter, called `params`, which can load / import parameters from an external file, that contains a JSON object.

For example, you can create a file, lets say `sftp_server1_uri_params.json`, inside your home directory with the following content:

```json
{
    "debug": 1,
    "mode": 664,
    "key": "id_rsa",
    "passphrase": "My Key Passphrase",
    "noPhraseFile": 1
}
```

In the URI, inside your `.code-workspace` file, you have to define the `params` parameter and set it to the path / name of that JSON file:

```json
{
    "folders": [{
        "uri": "sftp://myUser:myPass@example.com?params=sftp_server1_uri_params.json",
        "name": "My SFTP folder"
    }]
}
```

Relative paths will be mapped to the user's home directory.

Explicit URI parameters, which are also defined in such an external file, will be overwritten by the values of the file.

#### Placeholders [[&uarr;](#about-parameters-)]

An URI parameter can store placeholders, which are replaced by the values of an external file.

For example, you can create a file, like `my_values.json`, inside your home directory with the following content:

```json
{
    "importEnvVars": true,
    "exclude": [
        "fooParam"
    ],
    "values": {
        "ENC": {
            "code": " ('UTF' + '8').toLowerCase() ",
            "type": "code"
        },
        "FOO": "bar",
        "SSL": {
            "value": 1
        }
    }
}
```

You can now place them into the values of parameters, by using the format `${VAR_NAME}`:

```json
{
    "folders": [{
        "uri": "webdav://myUser:myPassword@webdav.example.com/?values=my_values.json&ssl=${SSL}&encoding=${ENC}&binEncoding=${ENC}&fooParam=${FOO}",
        "name": "My WebDAV folder"
    }]
}
```

If `importEnvVars` is set to `(true)`, all [environment variables of the current process](https://nodejs.org/api/process.html#process_process_env) will be imported automatically. The default value is `(false)`.

Parameters, where placeholders DO NOT work:

* `params`
* `values`

##### Code [[&uarr;](#placeholders-)]

```json
{
    "values": {
        "FOO": {
            "code": " $h.normalizeString('b' + 'AR') ",
            "type": "code"
        }
    }
}
```

Code execution allows you to access the following constants, which contain modules, functions and special values:

| Name | Description |
| ---- | --------- |
| `_` | [lodash](https://lodash.com/) module |
| `$fs` | [fs-extra](https://github.com/jprichardson/node-fs-extra) module |
| `$h` | [vscode-helpers](https://github.com/mkloubert/vscode-helpers) module |
| `$l` | [Logger](https://mkloubert.github.io/vscode-helpers/modules/_logging_index_.html) object (s. [Logs](#logs-)) |
| `$m` | [Moment.js](https://momentjs.com/) module, with [timezone](https://momentjs.com/timezone/) support |
| `$os` | [os](https://nodejs.org/api/os.html) module |
| `$p` | [path](https://nodejs.org/api/path.html) module |
| `$r` | Extened `require()` function, which also allows to use [the modules of that extension](https://github.com/mkloubert/vscode-remote-workspace/blob/master/package.json). |
| `$v` | An object with variables, like `$v['cache']`, which stores an object for caching values for later executions. |

**Keep in mind**: Code is always executed synchronous and NOT via things like [promises](https://developers.google.com/web/fundamentals/primers/promises)!

##### Environment variables [[&uarr;](#placeholders-)]

```json
{
    "values": {
        "FOO": {
            "name": "SSH_AUTH_SOCK",
            "type": "env"
        }
    }
}
```

##### Static [[&uarr;](#placeholders-)]

```json
{
    "values": {
        "foo1": "bar1",
        "Foo2": {
            "value": 2
        }
    }
}
```

### Azure [[&uarr;](#how-to-use-)]

URL Format: `azure://[account:key@][container][/path/to/file/or/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "azure://my-account:my-storage-key@my-container/",
        "name": "My Azure folder"
    }]
}
```

For accessing local storage emulator, use something like that:

```json
{
    "folders": [{
        "uri": "azure://mycontainer/",
        "name": "My local Azure folder"
    }]
}
```

#### Parameters [[&uarr;](#azure-)]

| Name | Description | Example | 
| ---- | --------- | --------- |
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=my_azure_account` |
| `host` | The custom host address. | `host=azure.example.com` | 
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=azure_uri_params.json` | 
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

#### Remarks [[&uarr;](#azure-)]

If you create a new folder, a file called `.vscode-remote-workspace` with 0 size is created there, to keep sure to detect that new folder later.
Before you delete that file, you should store another file there, otherwise the directory will disappear.

### Dropbox [[&uarr;](#how-to-use-)]

URL Format: `dropbox://token[/path/to/file/or/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "dropbox://<API-TOKEN>/",
        "name": "My Dropbox folder"
    }]
}
```

#### Parameters [[&uarr;](#dropbox-)]

| Name | Description | Example | 
| ---- | --------- | --------- |
| `auth` | A path to a file, that contains the part left to `@` (the API token). Relative paths will be mapped to the user's home directory. | `auth=dropbox_token` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=dropbox_uri_params.json` | 
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

### FTP [[&uarr;](#how-to-use-)]

URL Format: `ftp://[user:password@]host[:port][/path/to/a/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "ftp://my-user:my-password@ftp.example.com/",
        "name": "My FTP folder"
    }]
}
```

#### Parameters [[&uarr;](#ftp-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=ftp_server1` |
| `follow` | Follow symbolic links or not. Default: `1` | `follow=0` |
| `keepAlive` | Defines a time interval, in seconds, that sends a `NOOP` command automatically to keep the connection alive. | `keepAlive=15` |
| `noop` | The custom [FTP command](https://en.wikipedia.org/wiki/List_of_FTP_commands) to execute to check if connection is still alive. Default: `NOOP` | `noop=SYST` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=ftp_uri_params.json` | 
| `queue` | Use a queue for each action inside the connection. Default: `1` | `queue=0` |
| `queueSize` | Maximum number of actions to execute at once inside a connection. Default: `1` | `queueSize=3` |
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

### FTPs [[&uarr;](#how-to-use-)]

URL Format: `ftps://[user:password@]host[:port][/path/to/a/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "ftps://my-user:my-password@ftps.example.com/",
        "name": "My (secure) FTP folder"
    }]
}
```

#### Parameters [[&uarr;](#ftps-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=ftps_server1` |
| `follow` | Follow symbolic links or not. Default: `1` | `follow=0` |
| `keepAlive` | Defines a time interval, in seconds, that sends a `NOOP` command automatically to keep the connection alive. Default `10` | `keepAlive=45` |
| `legacy` | Use [ftp](https://www.npmjs.com/package/ftp) module instead of forked [@icetee/ftp](https://www.npmjs.com/package/@icetee/ftp), if you have problems. Default: `0` | `legacy=1` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=ftps_uri_params.json` | 
| `rejectUnauthorized` | Reject unauthorized server certificates or not. Default: `0` | `rejectUnauthorized=1` |
| `secure` | Use secure (`1`) or plain (`0`) FTP connection. Default: `1` | `secure=0` |
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

### S3 Buckets [[&uarr;](#how-to-use-)]

URL Format: `s3://[credential_type@]bucket[/path/to/file/or/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "s3://my-bucket/?acl=public-read",
        "name": "My S3 Bucket"
    }]
}
```

#### credential_type [[&uarr;](#s3-buckets-)]

Default value: `shared`

| Name | Description | Class in [AWS SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/index.html) |
| ---- | --------- | --------- |
| `environment` | Represents credentials from the environment. | [EnvironmentCredentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EnvironmentCredentials.html) |
| `file` | Represents credentials from a JSON file on disk. | [FileSystemCredentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/FileSystemCredentials.html) |
| `shared` | Represents credentials loaded from shared credentials file. | [SharedIniFileCredentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SharedIniFileCredentials.html) |
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

#### Parameters [[&uarr;](#s3-buckets-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `api` | A string in `YYYY-MM-DD` format that represents the latest possible API version that can be used in this service. Specify `latest` to use the latest possible version. | `api=latest` | 
| `acl` | The [ACL](https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html) for new or updated files to use. Default: `private` | `acl=public-read` | 
| `debug` | Set to `1`, to debug a connection, by writing all messages to [log files](#logs-). Default: `0` | `debug=1` |
| `endpoint` | The endpoint URI to send requests to. The default endpoint is built from the configured region. The endpoint should be a string like `https://{service}.{region}.amazonaws.com`. | `endpoint=https%3A%2F%2Ffoo.bar.amazonaws.com` | 
| `file` | If credential type is set to `file`, this defines the path to the `.json` file, which should be used. Relative paths will be mapped to the `.aws` sub folder inside the user's home directory. | `file=aws.json` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=s3_uri_params.json` | 
| `profile` | If credential type is set to `shared`, this defines the name of the section inside the `.ini` file, which should be used. Default: `default` | `profile=mkloubert` |
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |
| `varPrefix` | If credential type is set to `environment`, this defines the custom prefix for the environment variables (without `_` suffix!), which contain the credentials. Default: `AWS` | `varPrefix=MY_AWS_PREFIX` |

### SFTP [[&uarr;](#how-to-use-)]

URL Format: `sftp://[user:password@]host[:port][/path/to/a/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "sftp://my-user:my-password@sftp.example.com/",
        "name": "My SFTP folder"
    }]
}
```

#### Parameters [[&uarr;](#sftp-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `agent` | Name or path to ssh-agent for ssh-agent-based user authentication. | `agent=myAgent` |
| `agentForward` | Set to `1`, to use OpenSSH agent forwarding (`auth-agent@openssh.com`) for the life of the connection. Default: `0` | `agentForward=1` |
| `allowedHashes` | Comma-separated list of hashes to verify. | `allowedHashes=md5,sha-1` |
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=ftp_server1` |
| `debug` | Set to `1`, to debug a connection, by writing all messages to [log files](#logs-). Default: `0` | `debug=1` |
| `dirMode` | Defines a special [chmod](https://en.wikipedia.org/wiki/Chmod) access permission value for the folders on server. This can be an octal number or the path to a JSON file, that contains a "mapper" object. If not defined, the value of `mode` parameter is used. s. [mode](#mode-) for more information. | `dirMode=755` |
| `follow` | Follow symbolic links or not. Default: `1` | `follow=0` |
| `hash` | The algorithm to use to verify the fingerprint of a host. Possible values are `md5` and `sha-1` Default: `md5` | `hash=sha-1` |
| `keepAlive` | Defines a time interval, in seconds, that sends "keep alive packages" automatically. | `keepAlive=15` |
| `keepMode` | Tries to detect the current [chmod](https://en.wikipedia.org/wiki/Chmod) access permission value of an existing file on server and tries to apply it when saving. Default: `1` | `keepMode=0` |
| `key` | The path to the key file or the [Base64](https://en.wikipedia.org/wiki/Base64) string with its content. Relative paths will be mapped to the sub folder `.ssh` inside the user's home directory. | `key=id_rsa` |
| `mode` | Defines the [chmod](https://en.wikipedia.org/wiki/Chmod) access permission value for the files / folders on server. This can be an octal number or the path to a JSON file, that contains a "mapper" object. s. [mode](#mode-) for more information. | `mode=644` |
| `noop` | By default, a list operation is done for the root directory of the server, to check if a connection is alive. You can change this by executing a fast command on the server, which does not produce much response, e.g. | `noop=uname` |
| `noPhraseFile` | `1` indicates, that `phrase` parameter will NEVER handled as file path. Default: `0` | `noPhraseFile=1` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=sftp_uri_params.json` | 
| `phrase` | The passphrase (or path to a file with it) for the key file, if needed. To prevent conflicts, you should additionally set `noPhraseFile` to `1`, if that value is explicitly a passphrase value and NO path to an external file. Relative file paths will be mapped to the user's home directory. | `phrase=myPassphrase` |
| `timeout` | How long (in milliseconds) to wait for the SSH handshake to complete. Default: `20000` | `timeout=60000` |
| `tryKeyboard` | Try keyboard-interactive user authentication if primary user authentication method fails. Can be `0` or `1`. Default: `0` | `tryKeyboard=1` |
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

##### mode [[&uarr;](#parameters--4)]

For the parameters `dirMode` and `mode`, you can define an octal number, which will be applied to all files and folders, which are created or changed.

You also can define a path to a JSON file, which contains a mapper object:

```json
{
    "644": [
        "**/*.php",
        "**/*.phtml"
    ],
    "777": "/*.txt"
}
```

Save the content to a file, like `sftp_modes.json`, inside your user directory, e.g., and save your mapping in the format as described by the upper JSON snippet.

To use the mappings, setup the `mode` parameter with the path of that file (in that example to `sftp_modes.json`). Relative paths will be mapped to the user's home directory.

Glob patterns are handled by [minimatch](https://github.com/isaacs/minimatch).

### Slack [[&uarr;](#how-to-use-)]

URL Format: `slack://token@channel[/][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "slack://<API-TOKEN>@<CHANNEL-ID>",
        "name": "My Slack channel"
    }]
}
```

#### Parameters [[&uarr;](#slack-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `auth` | A path to a file, that contains the part left to `@` (the API token). Relative paths will be mapped to the user's home directory. | `auth=slack_token` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=slack_uri_params.json` | 
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

#### Remarks [[&uarr;](#slack-)]

The protocol only supports read and list operations.

### WebDAV [[&uarr;](#how-to-use-)]

URL Format: `webdav://[user:password@]host[:port][/path/to/file/or/folder][?param1=value1&param2=value2]`

```json
{
    "folders": [{
        "uri": "webdav://myUser:myPassword@webdav.example.com/?ssl=1",
        "name": "My WebDAV server"
    }]
}
```

#### Parameters [[&uarr;](#webdav-)]

| Name | Description | Example | 
| ---- | --------- | --------- |
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=webdav_server1` |
| `base` | The base path, that is used as prefix for all requests. | `base=nextcloud/remote.php/webdav/` |
| `binEncoding` | The [encoding](https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end) for reading and writing binary files to use. Default: `binary` | `binEncoding=utf8` |
| `encoding` | The [encoding](https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end) for reading and writing text files to use. Default: `binary` | `encoding=utf8` |
| `authType` | Kind of authentication to use if at least a username and/or password is defined (s. [authType](#authtype-). Default: `basic` | `authType=digest` |
| `params` | The name of an external file, which contains other parameters for the URI. s. [Import parameters](#import-parameters-) | `params=webdav_uri_params.json` |
| `ssl` | Use secure HTTP or not. Can be `0` or `1`. Default: `0` | `ssl=1` |
| `values` | The name of an external file, which contains [placeholders](#placeholders-) | `values=my_values.json` |

#### authType [[&uarr;](#parameters--7)]

Defines, what type of authentication should be used, if at least a username and/or password is defined. Possible values are:

| Name | Alternatives | Description |
| ---- | ------------ | ----------- |
| `basic` | `b` | [Basic access authentication](https://en.wikipedia.org/wiki/Basic_access_authentication) |
| `digest` | `d` | [Digest access authentication](https://en.wikipedia.org/wiki/Digest_access_authentication) |

## Commands [[&uarr;](#table-of-contents)]

Press `F1` and enter one of the following commands:

| Name | Description | ID |
| ---- | ----------- | -- |
| `Remote Workspace: Execute 'git' Command ...` | Executes `git` CLI tool on a remote workspace. | `extension.remote.workspace.executeGit` |
| `Remote Workspace: Execute Remote Command ...` | Executes a command on a remote workspace. | `extension.remote.workspace.executeRemoteCommmand` |
| `Remote Workspace: Open URI ...` | Adds / opens a new workspace folder with a [supported URI](#how-to-use-). | `extension.remote.workspace.openURI` |
| `Remote Workspace: Receive Remote URI ...` | Receives a remote URI from another editor. | `extension.remote.workspace.receiveWorkspaceURI` |
| `Remote Workspace: Reset Remote Command History ...` | Resets all values of last executed remote commands. | `extension.remote.workspace.resetRemoteCommandHistory` |
| `Remote Workspace: Share Remote URI ...` | Shares a remote URI with another editor. | `extension.remote.workspace.sendWorkspaceURI` |

If you want to define shortcuts for one or more command(s), have a look at the article [Key Bindings for Visual Studio Code](https://code.visualstudio.com/docs/getstarted/keybindings).

## Logs [[&uarr;](#table-of-contents)]

Log files are stored inside the `.vscode-remote-workspace/.logs` subfolder of the user's home directory, separated by day.

## Support and contribute [[&uarr;](#table-of-contents)]

If you like the extension, you can support the project by sending a [donation via PayPal](https://paypal.me/MarcelKloubert) to [me](https://github.com/mkloubert).

To contribute, you can [open an issue](https://github.com/mkloubert/vscode-remote-workspace/issues) and/or fork this repository.

To work with the code:

* clone [this repository](https://github.com/mkloubert/vscode-remote-workspace)
* create and change to a new branch, like `git checkout -b my_new_feature`
* run `npm install` from your project folder
* open that project folder in Visual Studio Code
* now you can edit and debug there
* commit your changes to your new branch and sync it with your forked GitHub repo
* make a [pull request](https://github.com/mkloubert/vscode-remote-workspace/pulls)

### Contributors [[&uarr;](#support-and-contribute-)]

* [drpark](https://github.com/drpark)

## Related projects [[&uarr;](#table-of-contents)]

### node-simple-socket [[&uarr;](#related-projects-)]

[node-simple-socket](https://github.com/mkloubert/node-simple-socket) is a simple socket class, which supports automatic [RSA](https://en.wikipedia.org/wiki/RSA_(cryptosystem)) encryption and compression for two connected endpoints and runs in [Node.js](https://nodejs.org/).

### vscode-helpers [[&uarr;](#related-projects-)]

[vscode-helpers](https://github.com/mkloubert/vscode-helpers) is a NPM module, which you can use in your own [VSCode extension](https://code.visualstudio.com/docs/extensions/overview) and contains a lot of helpful classes and functions.
