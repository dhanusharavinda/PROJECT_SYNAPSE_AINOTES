import { Play, ExternalLink, X } from "lucide-react";
import { youtubeLink } from "./youtube";
import { useState, useEffect } from "react";
import { api } from "./api";
export default function VideoCard({
  url,
  title = "Video",
  editable = false,
}: {
  url: string;
  title?: string;
  editable?: boolean;
}) {
  const video = youtubeLink(url),
    [preview, setPreview] = useState(""),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    let live = true;
    setPreview("");
    setPlaying(false);
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
  const embed =
    video.platform === "Instagram"
      ? `https://www.instagram.com/p/${video.id}/embed/`
      : `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1`;
  return (
    <div className="note-video" data-platform={video.platform || "YouTube"}>
      <div className="video-picture">
        {playing ? (
          <>
            <iframe
              src={embed}
              title={title}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <button
              className="close-video"
              aria-label="Close video"
              onClick={(e) => {
                e.stopPropagation();
                setPlaying(false);
              }}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            className="preview-video"
            aria-label={"Play " + (video.platform || "YouTube") + ": " + title}
            onClick={(e) => {
              e.stopPropagation();
              setPlaying(true);
            }}
          >
            {video.thumbnail || preview ? (
              <img
                src={video.thumbnail || preview}
                alt={title}
                draggable={false}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="preview-unavailable">
                Preview unavailable. Try opening the post below.
              </span>
            )}
            <span className="play-video" aria-hidden="true">
              <Play size={24} />
            </span>
          </button>
        )}
      </div>
      <a
        href={video.url}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        title="Open original post"
      >
        {title}
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
