import type { MetaFunction } from "@remix-run/cloudflare";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Simple Loom" },
    {
      name: "description",
      content: "Share your screen and webcam with a simple link",
    },
  ];
};

export default function Index() {
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingFrame, setIsDrawingFrame] = useState(false);

  async function onStartRecording() {
    if (!canvasRef.current || !screenShareVideoRef.current) {
      return;
    }

    const screenShareStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });

    const videoTracks = screenShareStream.getVideoTracks();

    if (videoTracks.length === 0) {
      throw new Error("There is no video track");
    }

    screenShareVideoRef.current.srcObject = screenShareStream;
  }

  function drawFrameByFrame() {
    if (!canvasRef.current || !screenShareVideoRef.current) {
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.roundRect(0, 0, canvasRef.current.width, canvasRef.current.height, 6);
    ctx.clip();
    ctx.drawImage(screenShareVideoRef.current, 0, 0);
    ctx.restore();

    requestAnimationFrame(drawFrameByFrame);
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <div className="flex flex-col gap-y-4 items-center">
        <video
          ref={screenShareVideoRef}
          className="invisible absolute top-0 left-0"
          autoPlay
          playsInline
          muted
          id="screen-share-video"
          onPlay={() => {
            if (!screenShareVideoRef.current || !canvasRef.current) {
              return;
            }

            const videoEle = screenShareVideoRef.current;
            const canvasEle = canvasRef.current;

            canvasEle.height = videoEle.videoHeight;
            canvasEle.width = videoEle.videoWidth;

            const scale = calculateScale(CanvasContainerSize, canvasEle);

            canvasEle.style.scale = `${scale}`;

            setIsDrawingFrame(true);
            requestAnimationFrame(drawFrameByFrame);
          }}
        />
        <div
          className={cn("bg-zinc-900 rounded-md", {
            "bg-transparent": isDrawingFrame,
          })}
          style={{
            width: CanvasContainerSize.width,
            height: CanvasContainerSize.height,
          }}
        >
          <canvas ref={canvasRef} className="origin-top-left" />
        </div>
        <Button onClick={onStartRecording} type="button">
          Start Recording
        </Button>
      </div>
    </main>
  );
}

type Size = {
  width: number;
  height: number;
};

const CanvasContainerSize: Size = {
  width: 960,
  height: 480,
};

function calculateScale(target: Size, source: Size) {
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;

  return Math.min(scaleX, scaleY);
}
