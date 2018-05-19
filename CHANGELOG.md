# Change Log (vscode-remote-workspace)

[![Share via Facebook](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Facebook.png)](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace) [![Share via Twitter](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Twitter.png)](https://twitter.com/intent/tweet?source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&text=Remote%20Workspace:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&via=mjkloubert) [![Share via Google+](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Google+.png)](https://plus.google.com/share?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Pinterest](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Pinterest.png)](http://pinterest.com/pin/create/button/?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&description=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Reddit](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Reddit.png)](http://www.reddit.com/submit?url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace) [![Share via LinkedIn](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/LinkedIn.png)](http://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&title=Remote%20Workspace&summary=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.&source=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace) [![Share via Wordpress](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Wordpress.png)](http://wordpress.com/press-this.php?u=https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace&quote=Remote%20Workspace&s=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.) [![Share via Email](https://raw.githubusercontent.com/mkloubert/vscode-remote-workspace/master/img/share/Email.png)](mailto:?subject=Remote%20Workspace&body=Visual%20Studio%20Code%20extension%2C%20which%20receives%20and%20shows%20git%20events%20from%20webhooks.:%20https%3A%2F%2Fmarketplace.visualstudio.com%2Fitems%3FitemName%3Dmkloubert.vscode-remote-workspace)

## 0.15.4 (May 19th, 2018; symbolic links and NOOP commands)

* according to [issue #1](https://github.com/mkloubert/vscode-remote-workspace/issues/1):
  * added symbolic link support for FTP and SFTP connections, which can be controlled by `follow` URL parameter
  * added `auth` URL parameter for FTP and SFTP connections, which can define a path to a text file, that contains the credentials (the part left to `@`)
  * can define custom "NOOP" commands for FTP and SFTP connections now, which are used to check if a connection is alive, by using `noop` URL parameter
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
