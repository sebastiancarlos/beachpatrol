// Peform the classic Selenium smoke test, as described in:
// https://github.com/SeleniumHQ/seleniumhq.github.io/blob/trunk/examples/javascript/test/getting_started/firstScript.spec.js

// Counteracts some websites, for example bootstrap ones, which have smooth scrolling
const forceInstantScroll = async (page) => {
  await page.addStyleTag({
    content: "html { scroll-behavior: initial !important; }",
  });
};

// As a reminder, every beachpatrol command must export a single function which takes
// the Plawright context as its first argument. Everything else are the arguments
// passed to the command.

// export as default
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

  const message = await page.$("#message");
  console.log(`Message is: ${await message.innerText()}`);
};
