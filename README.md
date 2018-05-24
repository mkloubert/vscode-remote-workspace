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
   * [Azure](#azure-)
     * [Parameters](#parameters-)
     * [Remarks](#remarks-)
   * [Dropbox](#dropbox-)
     * [Parameters](#parameters--1)
   * [FTP](#ftp-)
     * [Parameters](#parameters--2)
   * [S3 Buckets](#s3-buckets-)
     * [credential_type](#credential_type-)
     * [Parameters](#parameters--3)
   * [SFTP](#sftp-)
     * [Parameters](#parameters--4)
   * [Slack](#slack-)
     * [Parameters](#parameters--5)
     * [Remarks](#remarks--1)
   * [WebDAV](#webdav-)
     * [Parameters](#parameters--6)
3. [Commands](#commands-)
4. [Support and contribute](#support-and-contribute-)
5. [Related projects](#related-projects-)
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
        "uri": "sftp://my-user:my-password@example.com",
        "name": "My SFTP folder"
    }],
    "settings": {}
}
```

### Azure [[&uarr;](#how-to-use-)]

URL Format: `azure://[account:key@][container][/path/to/file/or/folder][?option1=value1&option2=value2]`

```json
{
    "folders": [{
        "uri": "azure://my-account:my-storage-key@my-container/",
        "name": "My Azure folder"
    }],
    "settings": {}
}
```

For accessing local storage emulator, use something like that:

```json
{
    "folders": [{
        "uri": "azure://mycontainer/",
        "name": "My local Azure folder"
    }],
    "settings": {}
}
```

#### Parameters [[&uarr;](#azure-)]

| Name | Description | Example | 
| ---- | --------- | --------- |
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=my_azure_account` |
| `host` | The custom host address. | `host=azure.example.com` | 

#### Remarks [[&uarr;](#azure-)]

If you create a new folder, a file called `.vscode-remote-workspace` with 0 size is created there, to keep sure to detect that new folder later.
Before you delete that file, you should store another file there, otherwise the directory will disappear.

### Dropbox [[&uarr;](#how-to-use-)]

URL Format: `dropbox://token[/path/to/file/or/folder]`

```json
{
    "folders": [{
        "uri": "dropbox://<API-TOKEN>/",
        "name": "My Dropbox folder"
    }],
    "settings": {}
}
```

#### Parameters [[&uarr;](#dropbox-)]

| Name | Description | Example | 
| ---- | --------- | --------- |
| `auth` | A path to a file, that contains the part left to `@` (the API token). Relative paths will be mapped to the user's home directory. | `auth=dropbox_token` |

### FTP [[&uarr;](#how-to-use-)]

URL Format: `ftp://[user:password@]host[:port][/path/to/a/folder]`

```json
{
    "folders": [{
        "uri": "ftp://my-user:my-password@ftp.example.com/",
        "name": "My FTP folder"
    }],
    "settings": {}
}
```

#### Parameters [[&uarr;](#ftp-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=ftp_server1` |
| `follow` | Follow symbolic links or not. Default: `1` | `follow=0` |
| `keepAlive` | Defines a time interval, in seconds, that sends a `NOOP` command automatically to keep the connection alive. | `keepAlive=15` |
| `noop` | The custom [FTP command](https://en.wikipedia.org/wiki/List_of_FTP_commands) to execute to check if connection is still alive. Default: `NOOP` | `noop=SYST` |

### S3 Buckets [[&uarr;](#how-to-use-)]

URL Format: `s3://[credential_type@]bucket[/path/to/file/or/folder][?option1=value1&option2=value2]`

```json
{
    "folders": [{
        "uri": "s3://my-bucket/?acl=public-read",
        "name": "My S3 Bucket"
    }],
    "settings": {}
}
```

#### credential_type [[&uarr;](#s3-buckets-)]

Default value: `shared`

| Name | Description | Class in [AWS SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/index.html) |
| ---- | --------- | --------- |
| `environment` | Represents credentials from the environment. | [EnvironmentCredentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EnvironmentCredentials.html) |
| `file` | Represents credentials from a JSON file on disk. | [FileSystemCredentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/FileSystemCredentials.html) |
| `shared` | Represents credentials loaded from shared credentials file. | [SharedIniFileCredentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SharedIniFileCredentials.html) |

#### Parameters [[&uarr;](#s3-buckets-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `acl` | The [ACL](https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html) for new or updated files to use. Default: `private` | `acl=public-read` | 
| `file` | If credential type is set to `file`, this defines the path to the `.json` file, which should be used. Relative paths will be mapped to the `.aws` sub folder inside the user's home directory. | `file=aws.json` |
| `profile` | If credential type is set to `shared`, this defines the name of the section inside the `.ini` file, which should be used. Default: `default` | `profile=mkloubert` |
| `varPrefix` | If credential type is set to `environment`, this defines the custom prefix for the environment variables (without `_` suffix!), which contain the credentials. Default: `AWS` | `varPrefix=MY_AWS_PREFIX` |

### SFTP [[&uarr;](#how-to-use-)]

URL Format: `sftp://[user:password@]host[:port][/path/to/a/folder][?option1=value1&option2=value2]`

```json
{
    "folders": [{
        "uri": "sftp://my-user:my-password@sftp.example.com/",
        "name": "My SFTP folder"
    }],
    "settings": {}
}
```

#### Parameters [[&uarr;](#sftp-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `agent` | Name or path to ssh-agent for ssh-agent-based user authentication. | `agent=myAgent` |
| `agentForward` | Set to `1`, to use OpenSSH agent forwarding (`auth-agent@openssh.com`) for the life of the connection. Default: `0` | `agentForward=1` |
| `allowedHashes` | Comma-separated list of hashes to verify. | `allowedHashes=md5,sha-1` |
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=ftp_server1` |
| `debug` | Set to `1`, to debug a connection. The logs will be written to `.vscode-remote-workspace/.logs` sub folder inside the user's home directory. Default: `0` | `debug=1` |
| `follow` | Follow symbolic links or not. Default: `1` | `follow=0` |
| `hash` | The algorithm to use to verify the fingerprint of a host. Possible values are `md5` and `sha-1` Default: `md5` | `hash=sha-1` |
| `keepAlive` | Defines a time interval, in seconds, that sends "keep alive packages" automatically. | `keepAlive=15` |
| `key` | The path to the key file or the [Base64](https://en.wikipedia.org/wiki/Base64) string with its content. Relative paths will be mapped to the sub folder `.ssh` inside the user's home directory. | `key=id_rsa` |
| `noop` | By default, a list operation is done for the root directory of the server, to check if a connection is alive. You can change this by executing a fast command on the server, which does not produce much response, e.g. | `noop=uname` |
| `phrase` | The passphrase for the key file, if needed. | `phrase=myPassphrase` |
| `timeout` | How long (in milliseconds) to wait for the SSH handshake to complete. Default: `20000` | `timeout=60000` |
| `tryKeyboard` | Try keyboard-interactive user authentication if primary user authentication method fails. Can be `0` or `1`. Default: `0` | `tryKeyboard=1` |

### Slack [[&uarr;](#how-to-use-)]

URL Format: `slack://token@channel[/]`

```json
{
    "folders": [{
        "uri": "slack://<API-TOKEN>@<CHANNEL-ID>",
        "name": "My Slack channel"
    }],
    "settings": {}
}
```

#### Parameters [[&uarr;](#slack-)]

| Name | Description | Example | 
| ---- | --------- | --------- | 
| `auth` | A path to a file, that contains the part left to `@` (the API token). Relative paths will be mapped to the user's home directory. | `auth=slack_token` |

#### Remarks [[&uarr;](#slack-)]

The protocol only supports read and list operations.

### WebDAV [[&uarr;](#how-to-use-)]

URL Format: `webdav://[user:password@]host[:port][/path/to/file/or/folder][?option1=value1&option2=value2]`

```json
{
    "folders": [{
        "uri": "webdav://myUser:myPassword@webdav.example.com/?ssl=1",
        "name": "My WebDAV server"
    }],
    "settings": {}
}
```

#### Parameters [[&uarr;](#webdav-)]

| Name | Description | Example | 
| ---- | --------- | --------- |
| `auth` | A path to a file, that contains the part left to `@` (the credentials). Relative paths will be mapped to the user's home directory. | `auth=webdav_server1` |
| `base` | The base path, that is used as prefix for all requests. | `base=nextcloud/remote.php/webdav/` |
| `ssl` | Use secure HTTP or not. Can be `0` or `1`. Default: `0` | `ssl=1` |

## Commands [[&uarr;](#table-of-contents)]

Press `F1` and enter one of the following commands:

| Name | Description |
| ---- | --------- |
| `Remote Workspace: Open URI ...` | Adds / opens a new workspace folder with a [supported URI](#how-to-use-). |
| `Remote Workspace: Receive Remote URI ...` | Receives a remote URI from another editor. |
| `Remote Workspace: Share Remote URI ...` | Shares a remote URI with another editor. |

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

## Related projects [[&uarr;](#table-of-contents)]

### node-simple-socket [[&uarr;](#related-projects-)]

[node-simple-socket](https://github.com/mkloubert/node-simple-socket) is a simple socket class, which supports automatic [RSA](https://en.wikipedia.org/wiki/RSA_(cryptosystem)) encryption and compression for two connected endpoints and runs in [Node.js](https://nodejs.org/).

### vscode-helpers [[&uarr;](#related-projects-)]

[vscode-helpers](https://github.com/mkloubert/vscode-helpers) is a NPM module, which you can use in your own [VSCode extension](https://code.visualstudio.com/docs/extensions/overview) and contains a lot of helpful classes and functions.
