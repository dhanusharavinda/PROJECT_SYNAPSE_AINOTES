export function youtubeLink(input: string) {
  try {
    const url = new URL(input.trim());
    if (!["https:", "http:"].includes(url.protocol)) return;
    const host = url.hostname.toLowerCase();
    if (url.username || url.password) return;
    if (["instagram.com", "www.instagram.com"].includes(host)) {
      const code = url.pathname.match(
        /^\/(?:p|reel|reels|tv)\/([\w-]+)\/?$/,
      )?.[1];
      if (code)
        return {
          id: code,
          url: url.href,
          thumbnail: "",
          platform: "Instagram",
        };
    }
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
