// List all open tabs of the current browser context, two lines per tab:
//   - <index> [ACTIVE] <url>
//             <title>

export default async ({ context, activePage }) => {
  const lines = [];
  for (const [index, page] of context.pages().entries()) {
    let title = "";
    let url = "";
    let closed = false;
    try {
      title = await page.title();
      url = page.url();
    } catch {
      // A page may close while we iterate; report it instead of failing the
      // whole command.
      closed = true;
    }

    const marker = activePage !== null && page === activePage ? " (ACTIVE)" : "";
    if (closed) {
      lines.push(`- ${index + 1} [closed]`);
    } else {
      lines.push(`- ${index + 1}${marker} ${url}`);
      lines.push(`    ${title || "(no title)"}`);
    }
  }
  return lines.join("\n");
};
