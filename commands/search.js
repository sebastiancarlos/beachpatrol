export default async (context, ...searchTerms) => {
  const page = await context.newPage();
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(searchTerms.join(" "))}`,
  );
};
