import { Play } from "lucide-react";
import { youtubeLink } from "./youtube";
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
        <img
          src={video.thumbnail}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
        />
        <Play size={26} aria-hidden="true" />
      </div>
      <span>{title || "YouTube video"}</span>
    </a>
  );
}
