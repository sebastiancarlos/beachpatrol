// Peform the classic Selenium smoke test, as described in:
// https://github.com/SeleniumHQ/seleniumhq.github.io/blob/trunk/examples/javascript/test/getting_started/firstScript.spec.js

// Counteracts some websites, for example bootstrap ones, which have smooth scrolling.
// - This is useful to simplify automation code sometimes.
const forceInstantScroll = async (page) => {
  await page.addStyleTag({
    content: "html { scroll-behavior: initial !important; }",
  });
};

// Every beachpatrol command must export a default async function which takes:
//   - The Playwright browser context as its first argument, and
//   - the arguments to the command.
// Then, you simply automate the browser by interacting with the BrowserContext API.
//   - Docs: https://playwright.dev/docs/api/class-browsercontext
export default async (context, ...args) => {
  const page = await context.newPage();
  await page.goto("https://www.selenium.dev/selenium/web/web-form.html");

  await forceInstantScroll(page);

  const title = await page.title();
  console.log(`Title is: ${title}`);

  const textBox = await page.$("input[name=my-text]");
  const submitButton = await page.$("button");

  await textBox.type("Playwright");
  await submitButton.scrollIntoViewIfNeeded();
  await submitButton.click();

  await page.waitForSelector("#message");
  const message = await page.$("#message");
  console.log(`Message is: ${await message.innerText()}`);
};
