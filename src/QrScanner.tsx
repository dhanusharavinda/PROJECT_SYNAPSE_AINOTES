import { useEffect, useRef, useState } from "react";
export default function QrScanner({
  onRead,
  onClose,
}: {
  onRead: (value: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      stream: MediaStream | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
          },
          audio: false,
        });
        if (!live) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.current!.srcObject = stream;
        await video.current!.play();
        const canvas = document.createElement("canvas"),
          ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const scan = () => {
          if (!live || !video.current) return;
          const v = video.current;
          if (v.readyState >= 2 && v.videoWidth) {
            canvas.width = 480;
            canvas.height = Math.round((v.videoHeight / v.videoWidth) * 480);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const found = jsQR(
              ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width,
              canvas.height,
              { inversionAttempts: "dontInvert" },
            );
            if (found) {
              onRead(found.data);
              return;
            }
          }
          timer = setTimeout(scan, 180);
        };
        scan();
      } catch {
        if (live)
          setError(
            "Camera unavailable. You can paste the pairing link instead.",
          );
      }
    })();
    return () => {
      live = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <section className="qr-scanner" aria-label="Scan PC pairing code">
      <p>Point your camera at the QR code in Windows Synapse.</p>
      <video ref={video} muted autoPlay playsInline />
      {error && <p role="alert">{error}</p>}
      <button onClick={onClose}>Close camera</button>
    </section>
  );
}
