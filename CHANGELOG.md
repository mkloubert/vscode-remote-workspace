# Change Log (vscode-remote-workspace)

[![Share via Facebook](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Facebook.png)](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace) [![Share via Twitter](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Twitter.png)](https://twitter.com/intent/tweet?source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&text=Remote%20Workspace:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&via=mjkloubert) [![Share via Google+](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Google+.png)](https://plus.google.com/share?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Pinterest](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Pinterest.png)](http://pinterest.com/pin/create/button/?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&description=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Reddit](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Reddit.png)](http://www.reddit.com/submit?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace) [![Share via LinkedIn](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/LinkedIn.png)](http://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace&summary=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.&source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Wordpress](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Wordpress.png)](http://wordpress.com/press-this.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace&s=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Email](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Email.png)](mailto:?subject=Remote%20Workspace&body=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace)

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
