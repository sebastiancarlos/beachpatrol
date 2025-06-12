import { execSync } from 'child_process';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

if (process.env.CI === 'true') {
  console.log('CI environment detected. Skipping interactive postinstall script.');
  process.exit(0);
}

const SUPPORTED_BROWSERS = ['chromium', 'firefox']

const getInstalledBrowsers = async () => {
  // Parse output of `playwright install --dry-run` to get install path of browsers.
  // The output has the format:
  // ```
  // browser: <browser name> <version info>
  //    Install location: <path>
  //    <more info>
  //    <more info>
  // ```
  const playwRightDryInstallOutput = execSync('playwright install --dry-run').toString();
  const regex = /browser: (\w+)[^\n]*\n\s+Install location:\s+([^\n]*)/gm;
  let match;
  const locations = {};
  while ((match = regex.exec(playwRightDryInstallOutput)) !== null) {
    const browserName = match[1];
    const installPath = match[2];
    if (SUPPORTED_BROWSERS.includes(browserName)) {
      locations[browserName] = installPath;
    }
  }

  // Check which browsers are installed by checking if the install path exists.
  const installedBrowsers = [];
  for (const browserName in locations) {
    const browserPath = locations[browserName];
    try {
      await access(browserPath);
      installedBrowsers.push(browserName);
    } catch (e) {}
  }
  return installedBrowsers;
}

// get browsers to install by prompting user
const getBrowserToInstall = async () => {
  const rl = createInterface({
      input: process.stdin,
      output: process.stdout
  });
  console.log('No browsers are installed. You need to install at least one browser.');
  const answer = await rl.question('Would you like to install Chromium, Firefox, or all of them? (c/f/A): ');
  rl.close();
  let browsersToInstall = [];
  switch (answer.toLowerCase()) {
    case 'c':
      browsersToInstall = ['chromium'];
      break;
    case 'f':
      browsersToInstall = ['firefox'];
      break;
    default:
      browsersToInstall = SUPPORTED_BROWSERS;
  }

  return browsersToInstall;
}

if ((await getInstalledBrowsers()).length === 0) {
  execSync(`playwright install ${(await getBrowserToInstall()).join(' ')}`, { stdio: 'inherit' });
}
