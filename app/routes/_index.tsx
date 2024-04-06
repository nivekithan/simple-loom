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

let mediaRecorder: MediaRecorder | null = null;
let drawnFrame: number | null = null;
let recordingStartedAt: number | null = null;

export default function Index() {
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingFrame, setIsDrawingFrame] = useState(false);
  const [isRecordingStopped, setIsRecordingStopped] = useState(true);

  async function onStartRecording() {
    if (
      !canvasRef.current ||
      !screenShareVideoRef.current ||
      !webcamVideoRef.current
    ) {
      return;
    }

    const screenShareStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });

    const webcamStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    screenShareVideoRef.current.srcObject = screenShareStream;
    webcamVideoRef.current.srcObject = webcamStream;

    const stream = canvasRef.current.captureStream(FPS);

    const recordingStream = new MediaStream([
      ...stream.getTracks(),
      ...webcamStream.getTracks(),
    ]);

    mediaRecorder = new MediaRecorder(recordingStream, {
      mimeType: "video/webm",
    });

    mediaRecorder.ondataavailable = onRecordingAvaliable;

    mediaRecorder.start();
    recordingStartedAt = Date.now();

    setIsRecordingStopped(false);
  }

  async function onRecordingAvaliable(e: BlobEvent) {
    console.log("Running on Recording Avaliable");
    if (!mediaRecorder || !recordingStartedAt) {
      return;
    }

    const recording = e.data;

    await uploadBlob(recording);

    drawnFrame = null;
    recordingStartedAt = null;
  }

  function onStopRecording() {
    console.log("Running onStop Recording");
    if (!mediaRecorder) {
      console.log("Media Recorder is null");
      return;
    }

    mediaRecorder.stop();

    console.log("calling Media Recorder is stopped");
    setIsRecordingStopped(true);
    setIsDrawingFrame(false);
  }

  function drawFrameByFrame() {
    // If recording stopped then stop drawing
    if (isRecordingStopped) {
      return;
    }

    if (
      !canvasRef.current ||
      !screenShareVideoRef.current ||
      !webcamVideoRef.current
    ) {
      return;
    }

    const desiredFrameTime = 1000 / FPS;

    const elapsedTime = Date.now() - (drawnFrame ?? Date.now());

    const isTimeForNextFrame =
      elapsedTime >= desiredFrameTime || drawnFrame === null;

    if (!isTimeForNextFrame) {
      requestAnimationFrame(drawFrameByFrame);
      return;
    }

    const screenShareVideoEle = screenShareVideoRef.current;
    const canvasEle = canvasRef.current;
    const webcamVideoEle = webcamVideoRef.current;

    const ctx = canvasEle.getContext("2d");
    if (!ctx) {
      return;
    }

    drawScreenShare({ videoEle: screenShareVideoEle, ctx });
    drawWebcam({ ctx, canvasEle, videoEle: webcamVideoEle });
    drawnFrame = Date.now();
    requestAnimationFrame(drawFrameByFrame);
  }

  function onScreenShareStreamPlay() {
    if (!screenShareVideoRef.current || !canvasRef.current) {
      return;
    }

    const videoEle = screenShareVideoRef.current;
    const canvasEle = canvasRef.current;

    canvasEle.height = videoEle.videoHeight;
    canvasEle.width = videoEle.videoWidth;

    const scale = calculateScale(CanvasContainerSize, canvasEle);

    canvasEle.style.scale = `${scale}`;

    if (!isDrawingFrame) {
      setIsDrawingFrame(true);
      requestAnimationFrame(drawFrameByFrame);
    }
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
          onPlay={onScreenShareStreamPlay}
        />
        <video
          ref={webcamVideoRef}
          className="invisible absolute top-0 left-0"
          autoPlay
          playsInline
          muted
          id="webcam-video"
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
        <Button onClick={onStopRecording} type="button">
          Stop Recording
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

function drawScreenShare({
  videoEle,
  ctx,
}: {
  ctx: CanvasRenderingContext2D;
  videoEle: HTMLVideoElement;
}) {
  const width = videoEle.videoWidth;
  const height = videoEle.videoHeight;

  drawRoundedRec(
    {
      ctx,
      w: width,
      h: height,
      x: 0,
      y: 0,
      r: 10,
    },
    () => {
      ctx.drawImage(videoEle, 0, 0, width, height);
    }
  );
}

function drawWebcam({
  ctx,
  videoEle,
  canvasEle,
}: {
  videoEle: HTMLVideoElement;
  ctx: CanvasRenderingContext2D;
  canvasEle: HTMLCanvasElement;
}) {
  const height = canvasEle.height * 0.25;
  const radius = height / 2;

  // X is the center of the circle
  const x = canvasEle.width - WEBCAM_PADDING - radius;
  const y = canvasEle.height - WEBCAM_PADDING - radius;

  drawCircle({ ctx, x, y, r: radius }, () => {
    ctx.drawImage(videoEle, x - radius, y - radius, height, height);
  });
}

function drawRoundedRec(
  {
    ctx,
    w,
    h,
    x,
    y,
    r,
  }: {
    ctx: CanvasRenderingContext2D;
    w: number;
    h: number;
    x: number;
    y: number;
    r: number;
  },
  cb: () => void
) {
  ctx.save();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  cb();
  ctx.restore();
}

function drawCircle(
  {
    ctx,
    y,
    x,
    r,
  }: {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    r: number;
  },
  cb: () => void
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  cb();
  ctx.restore();
}

const WEBCAM_PADDING = 24;

async function uploadBlob(blob: Blob) { }

const FPS = 30;
