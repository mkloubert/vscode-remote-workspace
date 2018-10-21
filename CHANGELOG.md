# Change Log (vscode-remote-workspace)

[![Share via Facebook](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Facebook.png)](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace) [![Share via Twitter](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Twitter.png)](https://twitter.com/intent/tweet?source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&text=Remote%20Workspace:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&via=mjkloubert) [![Share via Google+](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Google+.png)](https://plus.google.com/share?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Pinterest](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Pinterest.png)](http://pinterest.com/pin/create/button/?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&description=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Reddit](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Reddit.png)](http://www.reddit.com/submit?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace) [![Share via LinkedIn](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/LinkedIn.png)](http://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace&summary=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.&source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Wordpress](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Wordpress.png)](http://wordpress.com/press-this.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace&s=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Email](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Email.png)](mailto:?subject=Remote%20Workspace&body=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace)

## 0.36.0 (October 21st, 2018; ssh-agent)

* [mlibbey](https://github.com/mlibbey) documented, how to use [ssh-agent](https://github.com/mkloubert/vscode-remote-workspace##using-ssh-agent-) with [SFTP protocol](https://github.com/mkloubert/vscode-remote-workspace#sftp-)
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.339.0`
  * [azure-storage](https://www.npmjs.com/package/azure-storage) `^2.10.2`
  * [mime-types](https://www.npmjs.com/package/mime-types) `^2.1.21`

## 0.35.1 (October 14th, 2018; fixed saving files via SFTP)

* [Cant save files after update](https://github.com/mkloubert/vscode-remote-workspace/issues/66)

## 0.35.0 (October 13th, 2018; queues)

* implemented same queue system for [FTPs](https://github.com/mkloubert/vscode-remote-workspace#ftps-) and [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) protocols, as used in [FTP](https://github.com/mkloubert/vscode-remote-workspace#ftp-) (`queue` and `queueSize` parameters)
* extension requires at least [Visual Studio Code 1.28](https://code.visualstudio.com/updates/v1_28) now
* fixed typos ... s. (issue #63)(https://github.com/mkloubert/vscode-remote-workspace/issues/63)
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.334.0`

## 0.34.0 (October 6th, 2018; FTP problems)

* fixed the problem of handling many [FTP](https://github.com/mkloubert/vscode-remote-workspace#ftp-) connections at the same time ... s. [issue #59](https://github.com/mkloubert/vscode-remote-workspace/issues/59) ... thanks a lot to [drpark](https://github.com/drpark) for the help!
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.329.0`

## 0.33.0 (October 3rd, 2018; placeholders)

* implemented [placeholders](https://github.com/mkloubert/vscode-remote-workspace#placeholders-) ... s. [issue #60](https://github.com/mkloubert/vscode-remote-workspace/issues/60)
* extension requires at least [Visual Studio Code 1.27](https://code.visualstudio.com/updates/v1_27) now
* updated the following [npm](https://www.npmjs.com/) modules:
  * [@slack/client](https://www.npmjs.com/package/@slack/client) `^4.8.0`
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.327.0`
  * [azure-storage](https://www.npmjs.com/package/azure-storage) `^2.10.1`
  * [lodash](https://www.npmjs.com/package/lodash) `^4.17.11`  
  * [mime-types](https://www.npmjs.com/package/mime-types) `^2.1.20`

## 0.32.1 (July 28th, 2018; WebDAV)

* added `authType` parameter for [WebDAV uris](https://github.com/mkloubert/vscode-remote-workspace#parameters--7), which sets up, what kind of authentification to use (`basic` or `digest`, e.g.)
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.282.1`
  * [mime-types](https://www.npmjs.com/package/mime-types) `^2.1.19`

## 0.31.0 (July 8th, 2018; slack)

* [slack](https://github.com/mkloubert/vscode-remote-workspace#slack-) is now marked as [read-only filesystem](https://code.visualstudio.com/updates/v1_25#_readonly-file-system-provider)
* extension requires at least [Visual Studio Code 1.25](https://code.visualstudio.com/updates/v1_25) now
* code cleanups and improvements
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.270.1`
  * [vscode-helpers](https://www.npmjs.com/package/vscode-helpers) `^2.12.0`

## 0.30.2 (July 6th, 2018; bug fixes)

* fixed bug in [FTP provider](https://github.com/mkloubert/vscode-remote-workspace#ftp-), that occurres, when deleting a file or folder

## 0.30.1 (July 3rd, 2018; bug fixes)

* fixed bug, which freezes the extension, when opening a 0 byte file on a [SFTP server](https://github.com/mkloubert/vscode-remote-workspace#sftp-)

## 0.30.0 (July 2nd, 2018; updates)

* added `api`, `debug` and `endpoint` [parameters](https://github.com/mkloubert/vscode-remote-workspace#parameters--4) for [S3 bucket](https://github.com/mkloubert/vscode-remote-workspace#s3-buckets-) connections ... s. [issue #27](https://github.com/mkloubert/vscode-remote-workspace/issues/27)
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.267.1`
  * [azure-storage](https://www.npmjs.com/package/azure-storage) `^2.10.0`
  * [ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client) `^2.3.0`
  * [uuid](https://www.npmjs.com/package/uuid) `^3.3.2`
  * [vscode-helpers](https://www.npmjs.com/package/vscode-helpers) `^2.10.3`

## 0.29.0 (June 26th, 2018; import URI parameters)

* added `params` parameter for all URIs / protocols, which can import / load URI parameters from an external JSON file ... s. [Import parameters](https://github.com/mkloubert/vscode-remote-workspace#import-parameters-)
* added `binEncoding` parameter for [WebDAV](https://github.com/mkloubert/vscode-remote-workspace#webdav-) ... s. [issue #17](https://github.com/mkloubert/vscode-remote-workspace/issues/17)
* code cleanups and improvements
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.263.1`
  * [moment-timezone](https://www.npmjs.com/package/moment-timezone) `^0.5.21`
  * [uuid](https://www.npmjs.com/package/uuid) `^3.3.0`

## 0.28.0 (June 21st, 2018; npm and README updates)

* updated the following [npm](https://www.npmjs.com/) modules:
  * [@icetee/ftp](https://www.npmjs.com/package/@icetee/ftp) `^1.0.3`
  * [@slack/client](https://www.npmjs.com/package/@slack/client) `^4.3.1`
  * [azure-storage](https://www.npmjs.com/package/azure-storage) `^2.8.3`
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.260.1`
  * [moment](https://www.npmjs.com/package/moment) `^2.22.2`
  * [moment-timezone](https://www.npmjs.com/package/moment-timezone) `^0.5.20`
  * [vscode-helpers](https://www.npmjs.com/package/vscode-helpers) `^2.7.0`
  * [webdav-client](https://www.npmjs.com/package/webdav-client) `^1.4.2`
* updated [README](https://github.com/mkloubert/vscode-remote-workspace/blob/master/README.md) file, because the word `parameter` produces misunderstandings ... parameters have to be set in an URI and not in the `settings` section of a workspace file (read more in [About parameters](https://github.com/mkloubert/vscode-remote-workspace#about-parameters-))

## 0.27.0 (June 14th, 2018; encoding for WebDAV files)

* added `encoding` parameter for [WebDAV](https://github.com/mkloubert/vscode-remote-workspace#webdav-) ... s. [issue #17](https://github.com/mkloubert/vscode-remote-workspace/issues/17)
* code cleanups and improvements
* bug fixes

## 0.26.1 (June 14th, 2018; remote command execution fixes)

* fixed bug, when executing a remote command and work with files later ... s. [issue #16](https://github.com/mkloubert/vscode-remote-workspace/issues/16)
* that [CHANGELOG](https://github.com/mkloubert/vscode-remote-workspace/blob/master/CHANGELOG.md) is shown automatically on startup now (once after each update)

## 0.26.0 (June 13th, 2018; execute commands like 'git' on remote)

* added `Execute 'git' Command ...` (`extension.remote.workspace.executeGit`) command, which can execute `git` command on [SFTP servers](https://github.com/mkloubert/vscode-remote-workspace#sftp-) ... s. [issue #11](https://github.com/mkloubert/vscode-remote-workspace/issues/11)

![Demo 2](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/demo2.gif)

* added `Execute Remote Command ...` (`extension.remote.workspace.executeRemoteCommmand`) command, which can run any command on [FTP servers](https://github.com/mkloubert/vscode-remote-workspace#ftp-), [secure FTPS servers](https://github.com/mkloubert/vscode-remote-workspace#sftps-) and [SFTP servers](https://github.com/mkloubert/vscode-remote-workspace#sftp-) ... s. [issue #11](https://github.com/mkloubert/vscode-remote-workspace/issues/11)
* added documentation about [log files]((https://github.com/mkloubert/vscode-remote-workspace#logs-))
* bugfixes
* code cleanups and improvements

## 0.25.0 (June 9th, 2018; special modes for folders)

* added `dirMode` parameter for [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, which can setup custom [chmod](https://en.wikipedia.org/wiki/Chmod) access permission values for folders, the same way as `mode` does ... s. [issue #9](https://github.com/mkloubert/vscode-remote-workspace/issues/9)

## 0.24.2 (June 6th, 2018; FTPS connections)

* implemented support for secure `ftps` protocol ... s. [issue #6](https://github.com/mkloubert/vscode-remote-workspace/issues/6)
* bugfixes

## 0.23.0 (May 30th, 2018; keep file permissions for SFTP files)

* existing permissions will tried to be kept, when saving a [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) file now ... that behavior can be controlled by new `keepMode` [parameter](https://github.com/mkloubert/vscode-remote-workspace#parameters--4) ... s. [issue #4](https://github.com/mkloubert/vscode-remote-workspace/issues/4)

## 0.22.1 (May 28th, 2018; bugfixes)

* fixed bug, when using custom TCP ports in URIs

## 0.22.0 (May 26th, 2018; SFTP file and folder modes)

* added `mode` parameter for [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, which can define the [chmod](https://en.wikipedia.org/wiki/Chmod) access permission values for files and folders, after they have been created or changed ... s. [issue #4](https://github.com/mkloubert/vscode-remote-workspace/issues/4)

## 0.21.1 (May 25th, 2018; external SFTP key passphrase)

* `phrase` now allows to use its value as path to an external file, where passphrase for a key file is stored ... if that value is explicitly a passphrase value and NO file path, you should also set the new `noPhraseFile` parameter to `1` to prevent conflicts ... s. [issue #3](https://github.com/mkloubert/vscode-remote-workspace/issues/3)
* bugfixes

## 0.20.0 (May 24th, 2018; commands and fixes)

* fixed bug of using `@` as password character(s) in URIs, s. [review](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-remote-workspace#review-details)
* added `Remote Workspace: Open URI ...` command
* added `Remote Workspace: Receive Remote URI ...` and `Remote Workspace: Share Remote URI ...` commands for sharing remote URI with others
* code cleanups and improvements

## 0.19.0 (May 23rd, 2018; copy support and logging)

* implemented [copy](https://code.visualstudio.com/docs/extensionAPI/vscode-api#FileSystemProvider) support for [WebDAV](https://github.com/mkloubert/vscode-remote-workspace#webdav-) connections
* improved error logging, which will now log any errors to files inside `.vscode-remote-workspace/.logs` sub folder of user's home directory autmatically
* added `keepAlive` parameter for [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, which defines a time interval in seconds to automatically send packages to keep the connection alive
* bugfixes

## 0.18.2 (May 20th, 2018; improvements)

* code cleanups and improvements
* bugfixes

## 0.17.0 (May 20th, 2018; parameters)

* added `debug` parameter for [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, which can be set to `1` to log to get more information about an open connection, handled by [ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client) module
* added `keepAlive` parameter for [FTP](https://github.com/mkloubert/vscode-remote-workspace#ftp-) connections, which defines a time interval in seconds to automatically send a `NOOP` command to keep the connection alive
* fixed use of `tryKeyboard` parameter for [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, s. [issue #1](https://github.com/mkloubert/vscode-remote-workspace/issues/1)
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.243.1`

## 0.16.0 (May 20th, 2018; auth parameter)

* added `auth` URL parameter for [Azure](https://github.com/mkloubert/vscode-remote-workspace#azure-), [Dropbox](https://github.com/mkloubert/vscode-remote-workspace#dropbox-), [Slack](https://github.com/mkloubert/vscode-remote-workspace#slack-) and [WebDAV](https://github.com/mkloubert/vscode-remote-workspace#webdav-) connections, which can define a path to a text file, that contains the credentials (the part left to `@`)
* code cleanups and improvements

## 0.15.4 (May 19th, 2018; symbolic links and NOOP commands)

* according to [issue #1](https://github.com/mkloubert/vscode-remote-workspace/issues/1):
  * added symbolic link support for [FTP](https://github.com/mkloubert/vscode-remote-workspace#ftp-) and [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, which can be controlled by `follow` URL parameter
  * added `auth` URL parameter for [FTP](https://github.com/mkloubert/vscode-remote-workspace#ftp-) and [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections, which can define a path to a text file, that contains the credentials (the part left to `@`)
  * can define custom "NOOP" commands for [FTP](https://github.com/mkloubert/vscode-remote-workspace#ftp-) and [SFTP](https://github.com/mkloubert/vscode-remote-workspace#sftp-) connections now, which are used to check if a connection is alive, by using `noop` URL parameter
* bugfixes and improvements

## 0.14.0 (May 17th, 2018; improvements)

* improvements and fixes

## 0.13.0 (May 16th, 2018; WebDAV)

* added support for [WebDAV](https://en.wikipedia.org/wiki/WebDAV), which can be used with [Nextcloud](https://nextcloud.com/), e.g.
* updated the following [npm](https://www.npmjs.com/) modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk) `^2.240.1`

## 0.12.2 (May 15th, 2018; speed optimizations)

* increased speed of FTP and SFTP connections
* bugfixes

## 0.10.2 (May 15th, 2018; bug fixes)

* bug fixes

## 0.10.1 (May 14th, 2018; initial release)

For more information about the extension, that a look at the [project page](https://github.com/mkloubert/vscode-remote-workspace).
