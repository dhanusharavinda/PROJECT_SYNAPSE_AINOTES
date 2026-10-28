import { useEffect, useState } from "react";
import { Image, FileText, Link2 } from "lucide-react";
import type { Source } from "./types";
import { api, fileUrl } from "./api";
import { youtubeLink } from "./youtube";
export default function ResourceThumbnail({ source }: { source: Source }) {
  const direct =
    source.kind === "image" && source.file
      ? fileUrl("attachments", source.file)
      : source.url
        ? youtubeLink(source.url)?.thumbnail
        : undefined;
  const [image, setImage] = useState(direct || ""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    setImage(direct || "");
    if (!direct && source.url)
      void api<{ image: string | null }>(`/sources/${source.id}/thumbnail`)
        .then((p) => {
          if (live) setImage(p.image || "");
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [source.id, source.url, direct]);
  if (image && !failed)
    return (
      <img
        className="resource-thumbnail"
        src={image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  const Icon = source.kind === "image" ? Image : source.url ? Link2 : FileText;
  let host = "";
  try {
    host = source.url ? new URL(source.url).hostname.replace(/^www\./, "") : "";
  } catch {}
  return (
    <div className="resource-thumbnail thumbnail-fallback">
      <Icon size={26} strokeWidth={1.3} />
      <span>
        {host ||
          (source.file?.toLowerCase().endsWith(".pdf") ? "PDF" : "Saved file")}
      </span>
    </div>
  );
}
