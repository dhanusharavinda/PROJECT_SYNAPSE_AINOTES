export function youtubeLink(input: string) {
  try {
    const url = new URL(input.trim());
    if (!["https:", "http:"].includes(url.protocol)) return;
    const host = url.hostname.toLowerCase();
    let id = "";
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(host)
    ) {
      id =
        url.pathname === "/watch"
          ? url.searchParams.get("v") || ""
          : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] || "";
    }
    if (!/^[\w-]{11}$/.test(id)) return;
    return {
      id,
      url: url.href,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  } catch {
    return;
  }
}
