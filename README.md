# Beachpatrol - Browser's End-user Automation CLI Hub. Potentialize All Tasks Regarding Online Life.

_All essential software should be automatable. Web browsers aren't. Let's change that._

Add to image: "Improve your web surfing with Beachpatrol"

## Introduction

Beachpatrol is a CLI tool meant to replace and automate your everyday web browser.

Run `beachpatrol` to launch a Chromium browser which can be controlled
externally through Playwright. You can use it as your daily driver; it works
like a regular Chromium browser. 

Use also `beachpatrol --profile <profile-name>` to launch a specific profile,
or `beachpatrol --incognito`.

To automate it, create a custom Playwright script in the `beachpatrol/commands`
folder. Then, run `beachmsg <script-name> [<argument>...]`. It will run your
script by default on the currently focused tab, but you can use the Beachpatrol
API to move to an existing tab, open a new one, or use a headless tab instead.

If you don't want to go back to the CLI to automate your browser, you can
install the `beachpatrol-browser-extension`. It's UI allows you to select a
command and call it with arguments. It will call `beachmsg` itself through the
web extension's Native Messaging feature. Also, the UI will highlight commands
which are meant to run on the current URL.

What can you do with Beachpatrol? The sky is the limit:
- Check your email.
- Login to your bank account.
- Download a file from a website.
- Dump the text from the current tab into a file.
- Fill an online form.
- Check for messages in your social media or work communication platform.
- Integrate with your OS: Add browser task to your Bash/Python OS scripts.

## Requirements

- Linux (Wayland or X11)
- Node.js and NPM
- Chromium

## Installation

- Clone the repo: `git clone XXX`
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
  performs the classic Selenium smoke test.
- If it reads "XXX", it worked correctly.
- Now create your own automation scripts!

## Technical details 

First and foremost, `beachpatrol` contains a customized Playwright script to
launch your browser. It passes arguments which closely recreate the experience
of using a non-automated browser. For example, it does not set a fixed viewport
(wich is, otherwise, a sensible default for Playwright's main use-case of
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
`tmp/beachpatrol.sock` for messages by `beachmsg`.

## F.A.Q.

### Why Playwright instead of Selenium? Why Chromium instead of Firefox?

However, Firefox support is to be added soon.

## Usage

XXX

## Project Status

This project is in alpha. 
- The API is subject to change.
- Currently only Linux is supported. MacOS support to be added soon.
- Currently only Chromium is supported. Other Chromium-based browsers and
  Firefox support to be added soon.
- The `beachpatrol-browser-extension` is in early-testing and not publicly
  released. It is expected to launch in a fully-functional state by the next
  release.
