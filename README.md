# Beachpatrol: Browser's End-user Automation CLI Hub. Potentialize All Tasks Regarding Online Life.

<p align="center">
  <img src="https://github.com/sebastiancarlos/beachpatrol/assets/88276600/49fbdf4f-eeec-42f8-a0aa-dd1c1c6c1617">
</p>

_Essential software should be automatable. Web browsers aren't. Let's change that._

## Introduction

Beachpatrol is a CLI tool meant to replace and automate your everyday web browser.

Run `beachpatrol` to launch a Chromium browser which can be controlled
externally through [Playwright](https://playwright.dev/). You can use it as your daily driver; it works
like a regular Chromium browser. 

Use also `beachpatrol --profile <profile-name>` to launch a specific profile,
or `beachpatrol --incognito`.

To automate it, create a custom Playwright script in the `beachpatrol/commands`
folder. Then, run `beachmsg <script-name> [<argument>...]`. It will run your
script by default on the currently focused tab, but you can use the Playwright
API to move to an existing tab, open a new one, or use a headless tab instead.

If you don't want to go back to the CLI to automate your browser, you can
install the `beachpatrol-browser-extension`. Its UI allows you to select a
command and call it with arguments. It will call `beachmsg` itself through the
web extension's Native Messaging feature. Also, the UI will highlight commands
which are meant to run on the current URL.

### What can you automate with Beachpatrol? The sky is the limit:
- Check your email.
- Login to your bank account.
- Download a file from a website.
- Dump the text from the current tab into a file.
- Fill an online form.
- Check for messages in your social media or work communication platform.
- Integrate with your OS: Add browser task to your Bash/Python scripts.
- **All of this right there on your everyday browser!**

## Requirements

- Linux (Wayland or X11)
- Node.js and NPM
- Chromium

## Installation

- Clone the repo: `git clone https://github.com/sebastiancarlos/beachpatrol`
- Move to the folder: `cd beachpatrol`
- Run `npm install` to install dependencies.
- Run `make` to install symlinks to the executables (in `/usr/local/bin` by
  default, which should be in your `PATH`)

## Example

- Launch a browser with `beachpatrol`
  - Optionally launch it in the background with `beachpatrol &`
- Use it as your regular browser. 
  - Install browser extensions if you want.
  - If you close it. Run `beachpatrol` again and you should still be logged-in
    to all your sites.
  - If you want a different profile, use `beachpatrol --profile
    new-profile-name`
    - Note: Due to Chromium's limitation, it is not possible to use the
      in-browser's profile features to switch profiles. However, this might be
      fixed in the future.
- Run `beachmsg smoke-test` to run the pre-installed test command, which
  performs the classic [Selenium smoke test](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/).
- If it reads "Form submitted", it worked correctly.
- Now create your own automation scripts!

## Technical details 

First and foremost, `beachpatrol` contains a customized Playwright script to
launch your browser. It passes arguments which closely recreate the experience
of using a non-automated browser. For example, it does not set a fixed viewport
(which is, otherwise, a sensible default for Playwright's main use-case of
automated testing.)

Beachpatrol also installs and loads the packages `playwright-extra` and
`puppeteer-extra-plugin-stealth`. This is needed to hide the fact that the
browser is automated, which in turn is needed for basic features such as Google
Sign-in. 

Naturally, the above package is tangentially related to a cat-and-mouse game
between web-scrapers and web-masters. As such, it might stop working at any
time. Beachpatrol guarantees to find new automation-hiding techniques if that
happens. Beachpatrol also encourages users to respect every website's terms and
conditions.

After the browser is launched, it listens on a UNIX socket created on
`/tmp/beachpatrol.sock` for messages by `beachmsg`.

## Usage

```bash
Usage: beachpatrol [--profile <profile_name>] [--incognito] [--headless]

Launches a Chromium browser with the specified profile.
Opens a socket to listen for commands. Commands can be sent with
the 'beachmsg' command.

Options:
  --profile <profile_name>  Use the specified profile. Default: default
  --incognito               Launch browser in incognito mode
  --headless                Launch browser in headless mode
```

```bash
Usage: beachmsg <command> [<arg>...]

Send commands to beachpatrol. The provided command must exist
in the commands directory of beachpatrol.
```

## F.A.Q.

### Why Playwright instead of Selenium? Why Chromium instead of Firefox?

Initial browser launch benchmarks suggested us to prioritize the current selection:

| Browser                  | Launch time |
|--------------------------|-------------|
| Selenium Node Chrome     |       1.8s  |
| Playwright Chrome        |       1.8s  |
| Selenium Java Chrome     |       4s    |
| Playwright Firefox       |       4.3s  |
| Selenium Java Firefox    |       6s    |
| Selenium Node Firefox    |       9s    |

However, Firefox support is to be added soon.

### Why JavaScript/Node.js instead of Python?

While Python is a popular language for web automation, we decided for JavaScript 
to enable code sharing with the web extension.

## Project Status

This project is in alpha. 
- The API is subject to change.
- Currently only Linux is supported. MacOS support to be added soon.
- Currently only Chromium is supported. Other Chromium-based browsers and
  Firefox support to be added soon.
- The `beachpatrol-browser-extension` is in early-testing and not publicly
  released. It is expected to launch in a fully-functional state by the next
  release.
