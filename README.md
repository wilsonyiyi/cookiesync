<p align="center">
  <img src="chrome/icon96.png" width="72" alt="CookieSync logo">
</p>

<h1 align="center">CookieSync</h1>

<p align="center">
  Sync selected cookies from remote domains to <code>http://localhost</code> for local development.
</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

> [!IMPORTANT]
> This repository is a fork of [roelnoten/cookiesync](https://github.com/roelnoten/cookiesync). CookieSync would not exist without the original work by [Roel Noten](https://github.com/roelnoten). Thank you for creating and open-sourcing the project. See [Credits and fork history](#credits-and-fork-history) for details.

## Overview

CookieSync is a Chrome extension for developers whose localhost applications need cookies created by remote services.

A common example is an authentication flow: the production application and its authentication service share a domain, but a frontend running on localhost cannot read the cookies created on that remote domain. CookieSync watches for cookies that match your domain and cookie-name regular expressions, then creates corresponding cookies for <code>http://localhost</code>.

The extension supports both automatic synchronization when matching cookies change and a manual **Sync Now** action.

## Screenshot

<p align="center">
  <img src="chrome/readme-preview-v2.png" width="400" alt="CookieSync Chrome extension popup">
</p>

## Features

- Multiple source-domain regular expressions, one per line.
- Multiple cookie-name regular expressions, one per line.
- Automatic synchronization when a matching cookie is created or updated.
- Manual synchronization of all currently matching cookies.
- Persistent synchronization status with copied and failed counts.
- English and Simplified Chinese interface.
- Local configuration stored with Chrome extension storage.
- Manifest V3 service worker.

## How it works

~~~text
Remote website creates or updates a cookie
                    │
                    ▼
     Source domain regex matches?
                    │
                    ▼
       Cookie name regex matches?
                    │
                    ▼
 Create the cookie for http://localhost
~~~

CookieSync ignores cookies already belonging to <code>localhost</code>, which prevents synchronization loops.

When copying a cookie, the current implementation:

- targets <code>http://localhost</code>;
- preserves its name, value, path, HTTP-only flag, and expiration when available;
- creates a host-only localhost cookie;
- disables the secure flag because the target uses HTTP;
- converts <code>SameSite=None</code> to <code>Lax</code> for localhost compatibility.

## Install from source

CookieSync is currently documented as an unpacked Chrome extension.

1. Clone this repository:

   ~~~bash
   git clone https://github.com/wilsonyiyi/cookiesync.git
   cd cookiesync
   ~~~

2. Open <code>chrome://extensions</code> in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository's <code>chrome</code> directory.
6. Pin CookieSync from Chrome's extensions menu if you want quick access.

After pulling or editing the source, return to <code>chrome://extensions</code> and select **Reload** on the CookieSync card.

## Configure CookieSync

Open the extension popup and configure both filters.

### Cookie Sources

Enter one JavaScript-compatible regular expression per line. A cookie's source domain must match at least one expression.

~~~regex
.*\.example\.com
^auth\.example\.org$
~~~

### Cookie Names

Enter one JavaScript-compatible regular expression per line. A cookie name must match at least one expression.

~~~regex
^session_id$
^access_token$
^refresh_token$
~~~

Changes are saved immediately. Invalid regular expressions can prevent matching, so test complex patterns before relying on them.

### Run a manual sync

Select **Sync Now** to scan all cookies currently available to the extension. The status card reports whether the operation completed successfully and how many cookies were copied.

Automatic synchronization remains active in the background for later matching cookie changes.

## Status reference

| Status | Meaning |
|---|---|
| Ready | No manual synchronization result has been recorded yet. |
| Syncing | CookieSync is scanning and copying matching cookies. |
| Active | The latest manual synchronization completed successfully. |
| Sync failed | At least one matching cookie could not be copied, or the extension encountered an error. |

## Permissions and privacy

CookieSync requests broad cookie access because it must inspect cookies from user-configured source domains.

| Permission | Why it is needed |
|---|---|
| <code>cookies</code> | Read matching cookies and create their localhost copies. |
| <code>storage</code> | Store regular expressions, language preference, and the latest sync status locally. |
| <code>*://*/*</code> host access | Allow user-defined domain patterns instead of hard-coding a fixed site list. |

The current code does not upload cookies or configuration to a remote service. Matching and copying happen inside the Chrome extension. Nevertheless, cookies can contain sensitive authentication data: review the source, keep your patterns as narrow as possible, and only install the extension in a browser profile you trust.

## Troubleshooting

### A cookie is not synchronized

Check the following:

1. The cookie's domain matches at least one **Cookie Sources** expression.
2. The cookie name matches at least one **Cookie Names** expression.
3. Each expression is valid JavaScript regex syntax.
4. CookieSync was reloaded after a source-code update.
5. The extension has access to the source site.

Use **Sync Now** after correcting the filters.

### Inspect service-worker logs

1. Open <code>chrome://extensions</code>.
2. Find CookieSync.
3. Open the **service worker** inspection link.
4. Review the console output for copied and failed cookie counts.

### Localhost still cannot use the cookie

Confirm that your application is running on <code>http://localhost</code>. Cookies scoped to another hostname such as <code>127.0.0.1</code> are not the same as localhost cookies.

Browser cookie policies can also affect behavior. CookieSync intentionally adapts secure and SameSite attributes for its HTTP localhost target rather than reproducing every remote-cookie attribute exactly.

## Development

The Chrome extension is contained in the [<code>chrome</code>](chrome) directory:

| File | Purpose |
|---|---|
| <code>manifest.json</code> | Manifest V3 metadata and permissions. |
| <code>service_worker.js</code> | Cookie matching and synchronization. |
| <code>popup.html</code> | Popup structure. |
| <code>popup.js</code> | Popup state, localization, configuration, and manual sync. |
| <code>tokens.css</code> | Design tokens. |
| <code>popup.css</code> | Popup presentation. |

There is no build step. Load the <code>chrome</code> directory as an unpacked extension and reload it after changes.

The popup footer shows the current version in the bottom-right corner. It is read from <code>chrome/manifest.json</code> at runtime. CI keeps <code>package.json</code>, the manifest, and the popup fallback in sync when a release is published.

### Release

Pushing to <code>main</code> triggers GitHub Actions. <code>semantic-release</code> inspects [Conventional Commits](https://www.conventionalcommits.org/) since the last tag and publishes only when the commits include a releasable change:

| Commit type | Version bump |
|---|---|
| <code>fix:</code> | patch (<code>2.1.0</code> → <code>2.1.1</code>) |
| <code>feat:</code> | minor (<code>2.1.0</code> → <code>2.2.0</code>) |
| <code>BREAKING CHANGE</code> or <code>feat!:</code> | major (<code>2.1.0</code> → <code>3.0.0</code>) |

A release updates <code>CHANGELOG.md</code>, syncs the version into <code>chrome/manifest.json</code> and the popup, creates a git tag, and uploads <code>cookiesync-chrome.zip</code> to the GitHub Release. Commits such as <code>docs:</code> or <code>chore:</code> do not publish a new version.

Preview the next version locally without publishing:

~~~bash
npm install
npm run release:dry
~~~

### Package the extension

Run from the repository root:

~~~bash
npm run package
~~~

## Credits and fork history

This repository preserves and extends the work of the upstream project:

- Original project: [roelnoten/cookiesync](https://github.com/roelnoten/cookiesync)
- Original author: [Roel Noten](https://github.com/roelnoten)
- Manifest V3 upgrade contribution: [Erik Bessegato](https://github.com/erik-bessegato)
- This fork: [wilsonyiyi/cookiesync](https://github.com/wilsonyiyi/cookiesync)

Sincere thanks to Roel Noten for creating CookieSync and sharing it with the community, and to Erik Bessegato for the Manifest V3 upgrade that became part of the upstream project. This fork builds on their work with multi-pattern matching, manual synchronization, status feedback, localization, and a redesigned popup.

## Release history

- **1.4** — Initial published version.
- **2.0** — Migrated to Manifest V3 and replaced the background script with a service worker, with thanks to Erik Bessegato.
- **2.1** — Removed the <code>declarativeNetRequest</code> and <code>declarativeNetRequestFeedback</code> permissions.
- **Fork changes** — Added multiple source-domain patterns, manual sync, bilingual UI, persistent status, and the redesigned popup.

## License

This project is distributed under the terms in [LICENSE](LICENSE).
