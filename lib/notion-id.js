// Accept a Notion page ID or a normal Notion page URL, never an arbitrary URL.
export function pageId(value) {
  const raw = String(value ?? "");
  let id = raw;
  if (/^https:\/\//.test(raw)) {
    const url = new URL(raw);
    if (!/(^|\.)notion\.(so|com)$/.test(url.hostname)) throw new Error("Page must be a Notion URL or page ID");
    id = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    id = id.match(/([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i)?.[1] ?? "";
  }
  id = id.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error(`Invalid Notion page: ${raw}`);
  return id.toLowerCase();
}
