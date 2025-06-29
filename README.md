# Beachpatrol: Browser's End-user Automation CLI Hub. Potentialize All Tasks Regarding Online Life.

<p align="center">
  <img src="https://github.com/sebastiancarlos/beachpatrol/assets/88276600/49fbdf4f-eeec-42f8-a0aa-dd1c1c6c1617">
</p>

_Essential software should be fully automatable. Web browsers aren't. Let's change that._

## Introduction

Beachpatrol is a CLI tool to replace and automate your everyday web browser.

https://github.com/sebastiancarlos/beachpatrol/assets/88276600/bc3bf9e8-28e2-48ef-a1f4-8754b4918916

![beachpatrol](https://github.com/sebastiancarlos/beachpatrol/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/License-MIT-green)

Run `beachpatrol` to launch a Chromium or Firefox browser which can be
controlled externally through [Playwright](https://playwright.dev/) scripts.
You can use it as your daily driver; it works like a regular browser.

Use also `beachpatrol --profile <profile-name>` to launch a specific profile,
or `beachpatrol --incognito`.

To automate it, create a custom Playwright script in the `beachpatrol/commands`
folder. Then, run `beachmsg <script-name> [<argument>...]`, and it will run it.
You can use the Playwright API to work on the currently focused tab, move to an
existing tab, open a new one, or use a headless tab instead.

If you don't want to go back and forth to the CLI to automate your browser, you can
install the `beachpatrol-browser-extension`. Its UI allows you to select a
command and call it with arguments. It will call `beachmsg` itself through the
browser extension's Native Messaging feature. Also, the UI will highlight commands
which are meant to run on the current URL, will provide GUI elements for common
situations (such as pagination and dropdowns), and will support hotkeys:

![image](https://github.com/sebastiancarlos/beachpatrol/assets/88276600/751aec3f-284d-4563-ac0f-09bfa52034e2)

### What can you automate with Beachpatrol? The sky is the limit:

- Check your email.
- Check your bank transactions.
- Download a file from a website.
- Dump the text from the current tab into a file.
- Fill an online form.
- Check for messages in your social media or work communication platform.
- Integrate with your OS: Add browser task to your Bash/Python scripts.
- **All of this right there on your everyday browser!**

## Requirements

- Linux (Wayland or X11), macOS or Windows
- Node.js LTS (v22)
- Chromium or Firefox (installed automatically by Playwright)

## Installation

- Clone the repo: `git clone https://github.com/sebastiancarlos/beachpatrol`
- Move to the folder: `cd beachpatrol`
- Run `npm install` to install dependencies.
- Run `make` to install symlinks to the executables (in `/usr/local/bin` by
  default, which should be in your `PATH`)
  - On Windows, you can instead run `npm install -g .` to install it globally.

## Example

- Launch a browser with `beachpatrol`
  - Optionally launch it in the background with `beachpatrol &`
- Use it as your regular browser.
  - Install browser extensions if you want.
  - If you close it. Run `beachpatrol` again and you should still be logged-in
    to all your sites.
  - If you want a different profile, use `beachpatrol --profile
    new-profile-name`
    - Note: Due to a Chromium's limitation, it is not possible to use the
      in-browser's profile features to switch profiles. However, this might be
      fixed in the future.
- Run `beachmsg smoke-test` to run the pre-installed test command, which
  performs the classic [Selenium smoke
  test](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/).
- If it reads "Form submitted", it worked correctly.
- Now create your own automation commands!

### Writing Your First Command

Suppose you want to automate web search. You can create a `commands/search.js`
file (relative to the cloned repo directory) with the following content:

```javascript
export default async (context, ...searchTerms) => {
  const page = await context.newPage();
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(searchTerms.join(" "))}`,
  );
};
```

Every Beachpatrol command must export a default async function, which is the
entry point of your command.

The function should take:
- The Playwright browser context as its first argument, and
- the arguments to the command, if any.

Then, you simply automate the browser by interacting with the [BrowserContext
API](https://playwright.dev/docs/api/class-browsercontext).

The `search.js` command above opens a new tab (`context.newPage()`), performs
the task, and leaves it focused. Other possible commands might work on the
currently focused tab, or expect one or more particular tabs to be already
open. All of this depends on your use-case; you are free to implement commands
as you see fit.

To run your new command, execute the following from your terminal:

```bash
beachmsg search "your search terms here"
```

**Tip**: You can edit your command files and re-run them without needing to
restart the `beachpatrol` server! Your changes will be picked up automatically.

You can always look at the built-in
[`commands/smoke-test.js`](https://github.com/sebastiancarlos/beachpatrol/blob/main/commands/smoke-test.js)
command for inspiration.

## Available Commands

Beachpatrol comes with built-in commands and supports custom commands you create:

### Built-in Commands

- `beachmsg smoke-test` - Runs the classic Selenium smoke test (fills out a form at selenium.dev)

### Command Ideas and Examples

Here are examples of commands you can create in the `commands/` directory:

**Web Search (`commands/search.js`):**
```bash
beachmsg search "playwright documentation"
```

**Save Page Content (`commands/save-text.js`):**
```bash
beachmsg save-text filename.txt
```

**Fill Forms (`commands/fill-form.js`):**
```bash
beachmsg fill-form "name:John Doe" "email:john@example.com"
```

**Take Screenshot (`commands/screenshot.js`):**
```bash
beachmsg screenshot page-capture.png
```

**Extract Data (`commands/extract-prices.js`):**
```bash
beachmsg extract-prices ecommerce-url.com
```

**Social Media Automation (`commands/post-update.js`):**
```bash
beachmsg post-update "Hello from automation!"
```

**Download Files (`commands/download-report.js`):**
```bash
beachmsg download-report quarterly-report
```

**Navigation Automation (`commands/navigate-workflow.js`):**
```bash
beachmsg navigate-workflow dashboard login-check
```

### Command Structure

All commands follow this pattern:
```javascript
// commands/your-command.js
export default async (context, ...args) => {
  // context = Playwright BrowserContext
  // args = command-line arguments passed to beachmsg
  
  // Example: Work with current tab
  const pages = context.pages();
  const currentPage = pages[0];
  
  // Example: Create new tab
  const newPage = await context.newPage();
  await newPage.goto('https://example.com');
};
```

Commands are automatically discovered from the `commands/` directory and can be executed immediately without restarting the browser server.

## Technical details

First and foremost, `beachpatrol` contains a customized Playwright script to
launch your browser. It passes arguments which closely recreate the experience
of using a non-automated browser. For example, it does not set a fixed viewport
(which is, otherwise, a sensible default for Playwright's main use-case of
automated testing.)

Beachpatrol also installs and loads the packages `patchright`,
`playwright-extra` and `puppeteer-extra-plugin-stealth`. This is needed to hide
the fact that the browser is automated, which in turn is needed for basic
features such as Google Sign-in.

Naturally, the above packages are tangentially related to a cat-and-mouse game
between web-scrapers and web-masters. As such, they might stop working at any
time. Beachpatrol guarantees to find new automation-hiding techniques if that
happens. Beachpatrol also encourages users to respect every website's terms and
conditions.

`patchright` is currently one of the best tools for this task. However, it
doesn't support Firefox. We use `puppeteer-extra-plugin-stealth` for Firefox,
which might encounter some issues such as Cloudflare's false positives, and
extra Google captchas.

After the browser is launched, it listens on a UNIX socket, `beachpatrol.sock`,
for messages by `beachmsg`.

## Usage

```
Usage: beachpatrol [--profile <profile_name>] [--incognito] [--headless]

- Launches a browser with the specified profile.
- Opens a socket to listen for commands. Commands can be sent with the
  'beachmsg' command.

Options:
  --profile <profile_name>  Use the specified profile. Default: default
  --browser <browser_name>  Use the specified browser. Default: chromium
      Supported browsers: chromium, firefox
  --incognito               Launch browser in incognito mode.
  --headless                Launch browser in headless mode.
  --help                    Show this help message.
```

```
Usage: beachmsg <command> [args...]

 - Sends a command to the beachpatrol server controlling the browser.
 - The provided command must exist in the "commands" directory of beachpatrol.

Options:
  --help                    Show this help message.
```

## F.A.Q.

### Isn't the claim that web browsers aren't automatable a bit far-fetched?

When we say that web browsers aren't automatable, we're thinking more along the
lines of the depth of automation available with tools like Bash, Vim or Emacs
(where virtually every interaction can be scripted and interwoven into custom
workflows without much resistance.)

Yes, we acknowledge there are existing ways to automate browser tasks like
autofill, mouse and keyboard macros, bookmarklets, extensions, and of course
various tools like Playwright.

Beachpatrol aspires to bring a new spin to the state-of-the-art, re-imagining
automation tools not as a one-time task, but integrated into your daily
browser. Just as your favorite shell or extendable text editor.

In short, our aim is to take existing automation tools (currently designed for
testing or scraping) and tweak them for everyday browsing, while also providing
a UI which is both simple and power-user friendly.

### But what’s the point? Isn’t Beachpatrol just a wrapper around a Playwright browser?

True, but it offers several value-added features, including:

- **Automation Detection Evasion**: Beachpatrol carefully selects Playwright
  options and plugins to mirror the activity of a regular browser, helping to
  avoid detection mechanisms that websites use to identify and block automated
  browsers.
- **Client/Server Architecture**: `beachpatrol` launches a browser and listens
  on a socket. The separate client `beachmsg` can then be used to transmit
  Playwright commands to the controlled browser. This separation allows for
  greater flexibility and integration with other tools and scripts.
- **Browser Extension**: An accompanying browser extension is designed to also
  communicate with the socket and send commands. The extension provides a
  user-friendly graphical interface and contextual tools.

### Why Playwright instead of Selenium?

Initial browser launch benchmarks suggested us to prioritize Playwright.

| Browser               | Launch time |
| --------------------- | ----------- |
| Playwright Chrome     | 1.7s        |
| Selenium Node Chrome  | 1.8s        |
| Selenium Java Chrome  | 4s          |
| Playwright Firefox    | 4.3s        |
| Selenium Java Firefox | 6s          |
| Selenium Node Firefox | 9s          |

### Why JavaScript/Node.js instead of Python?

While Python is a popular language for web automation, we decided for
JavaScript to enable code sharing with the browser extension.

### Why use an external automation tool (Playwright) instead of a browser extension?

Similar functionality can indeed be achieved with Userscript managers, such as
the [Violentmonkey](https://github.com/violentmonkey/violentmonkey) browser
extension.

But, while Beachpatrol allows us to control the browser from both the OS and a
browser extension, our priority is the OS. Also, there are
[limitations](https://www.sitepoint.com/community/t/tampermonkey-access-local-files-and-commands/299771)
on how much you can interact with the OS from a browser extension. Therefore,
something like Playwright was the natural choice.

Furthermore, while controlling the browser from an extension is possible,
[Manifest v3 removed the ability to execute third-party strings of
code](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security).
Popular automation extensions like Greasemonkey and Tampermonkey could also be
affected by Manifest v3. The alternative is to embed the code into the
extension, but that would require re-bundling the extensions after every
change. Other tricks do exist to make this approach work, and there is some
hope for [future Manifest v3
solutions](https://github.com/w3c/webextensions/issues/279), but this path is
certainly tricky.

It is more likely that Selenium and related tools will continue to work in the
foreseeable future given the business demand for traditional browser testing.

### Why Playwright instead of directly using Chrome DevTools Protocol or WebDriver?

While direct protocol communication is possible, Playwright provides a
well-regarded, higher-level API with built-in features like automatic waiting,
RPC object references (JSHandle), and cross-browser support.

Direct protocol communication would require implementing these features
manually over what is essentially a message-passing interface, significantly
increasing complexity.

### How does Beachpatrol compare to bookmarklets for quick tasks?

Bookmarklets are handy for executing scripts with a click, but they are limited
to user-triggered actions and may not handle complex workflows, such as
automation based on specific timing or interaction with operating system
features.

Plus, there's a personal preference factor. For those who like to have finer
control, keeping automation scripts within their file system feels cleaner and
less bound to a particular browser ecosystem. However, we recognize that
bookmarklets have their place and can be the preferred choice for many users.

### Writing Playwright scripts for every task takes too long.

You can use [Chromium DevDool's Recorder
tab](https://developer.chrome.com/docs/devtools/recorder/reference) to record
actions and export them as Puppeteer scripts, which use the same API as
Playwright. Or, you can use the Playwright
[`codegen`](https://playwright.dev/docs/codegen).

Also, given Playwright's popularity, you can describe your task in natural
language to an AI and ask for it as a Playwright script. With some practice,
this should get you halfway to a working script.

## Project Status

This project is in **alpha**.

- The API is subject to change.
- Currently only Chromium and Firefox are supported.
- The ability to run a command when a new URL matches a pattern will be added
  soon.
- The `beachpatrol-browser-extension` is in early-testing and **not publicly
  released.** It is expected to launch in a fully-functional state by the next
  release.
- Contributions welcome!

## Known Issues

- Due to a [known limitation of
  Playwright](https://github.com/microsoft/playwright/issues/35415), the
  in-browser download manager shows UUIDs for downloaded file names. However,
  the download functionality itself should work as expected: all downloaded
  files should correctly appear in to the expected folder with the originally
  suggested file name.
- Due to a Chromium limitation, it is not possible to use the in-browser's
  profile features to switch profiles. However, this might be fixed in the
  future.
- The state-of-the-art stealth plugins are currently only available for
  Chromium. Firefox has slightly less advanced plugins currently, so users
  might encounter some issues such as Cloudflare's false positives, and extra
  Google captchas.

## You might also like

- [TabFS](https://github.com/osnr/TabFS)
- [Violentmonkey](https://github.com/violentmonkey/violentmonkey)

## License

MIT

## Contributing

We welcome contributions of all kinds. If you have a suggestion or fix, please
feel free to open an issue or pull request.

Formatting with `prettier` (default configuration) isn't enforced but
appreciated.
