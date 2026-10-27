import { Play } from "lucide-react";
import { youtubeLink } from "./youtube";
import { useState, useEffect } from "react";
import { api } from "./api";
export default function VideoCard({
  url,
  title = "YouTube video",
  editable = false,
}: {
  url: string;
  title?: string;
  editable?: boolean;
}) {
  const video = youtubeLink(url);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    let live = true;
    setPreview("");
    if (video && !video.thumbnail)
      void api<any>("/social-preview", { url: video.url })
        .then((r) => {
          if (live) setPreview(r.image || "");
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  if (!video) return null;
  return (
    <a
      className="note-video"
      href={video.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (editable) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      title={editable ? "Right-click to open or resize this video" : title}
    >
      <div className="video-picture">
        {video.thumbnail || preview ? (
          <img
            src={video.thumbnail || preview}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="preview-unavailable">
            Instagram preview unavailable. Open the original post.
          </span>
        )}
        <Play size={26} aria-hidden="true" />
      </div>
      <span>{title || "YouTube video"}</span>
    </a>
  );
}
