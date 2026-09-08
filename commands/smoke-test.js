// Perform the classic Selenium smoke test, as described in:
// https://github.com/SeleniumHQ/seleniumhq.github.io/blob/trunk/examples/javascript/test/getting_started/firstScript.spec.js

// Counteracts some websites, for example bootstrap ones, which have smooth scrolling.
// - This is useful to simplify automation code sometimes.
const forceInstantScroll = async (page) => {
  await page.addStyleTag({
    content: "html { scroll-behavior: initial !important; }",
  });
};

// Every beachpatrol command must export a default async function which takes:
//   - An object with { context, activePage } as its first argument, and
//   - the arguments to the command.
//
// Then, you simply automate the browser by interacting with the BrowserContext API.
//   - Docs: https://playwright.dev/docs/api/class-browsercontext
//
// The function returned can also be a "generator function" (or anything returning
// an iterator or an async iterator), as is the case here. Each yield is relayed
// to the client as one output line.
export default async function* ({ context, activePage }, ...args) {
  const page = await context.newPage();
  await page.goto("https://www.selenium.dev/selenium/web/web-form.html");

  await forceInstantScroll(page);

  const title = await page.title();
  yield `Title is: ${title}`;

  const textBox = await page.locator("input[name=my-text]");
  const submitButton = await page.locator("button");

  await textBox.fill("Playwright");
  await submitButton.scrollIntoViewIfNeeded();
  await submitButton.click();

  const message = await page.locator("#message");
  yield `Message is: ${await message.innerText()}`;
};
