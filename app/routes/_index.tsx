import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { patchBlob } from "~/lib/utils/blob";
import {
  ActionFunctionArgs,
  json,
  redirect,
  unstable_parseMultipartFormData,
} from "@remix-run/cloudflare";
import { uploadToR2 } from "~/lib/utils/r2.server";
import { useLoaderData, useSubmit } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Simple Loom" },
    {
      name: "description",
      content: "Share your screen and webcam with a simple link",
    },
  ];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;

  return json({ uploadToR2: env.UPLOAD_TO_R2 === "true" });
}

let mediaRecorder: MediaRecorder | null = null;
let recordingStartedAt: number | null = null;

export default function Index() {
  const { uploadToR2 } = useLoaderData<typeof loader>();
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingFrame, setIsDrawingFrame] = useState(false);
  const [isRecordingStopped, setIsRecordingStopped] = useState(true);
  const submit = useSubmit();
  const workerRef = useRef<Worker | null>(null);

  async function onStartRecording() {
    const worker = new Worker(
      new URL("../workers/timer.ts", import.meta.url).toString()
    );

    workerRef.current = worker;

    worker.onmessage = function(e) {
      if (e.data === "tick") {
        console.log({ isRecordingStopped });
        drawFrameByFrame();
        console.log("Tcik");
      } else {
        console.log(e);
      }
    };

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

    setIsRecordingStopped(false);
    console.log("After settings recording");
    console.log({ isRecordingStopped });
    recordingStartedAt = Date.now();
    mediaRecorder.start();
    worker.postMessage({ command: "start" });
  }

  async function onRecordingAvaliable(e: BlobEvent) {
    console.log("Running on Recording Avaliable");
    if (!mediaRecorder || !recordingStartedAt) {
      return;
    }

    const recording = e.data;
    const patchedBlob = await patchBlob(
      recording,
      Date.now() - recordingStartedAt
    );

    if (uploadToR2) {
      const formData = new FormData();
      formData.set("video", patchedBlob);

      submit(formData, { method: "POST", encType: "multipart/form-data" });
    } else {
      const url = URL.createObjectURL(patchedBlob);
      window.open(url);
    }
    recordingStartedAt = null;
  }

  function onStopRecording() {
    console.log("Running onStop Recording");
    if (!mediaRecorder) {
      console.log("Media Recorder is null");
      return;
    }

    mediaRecorder.stop();
    workerRef.current?.postMessage({ command: "stop" });

    console.log("calling Media Recorder is stopped");
    setIsRecordingStopped(true);
    setIsDrawingFrame(false);
  }

  function drawFrameByFrame() {
    if (
      !canvasRef.current ||
      !screenShareVideoRef.current ||
      !webcamVideoRef.current
    ) {
      console.log("Canvas or Video or webcam is null");
      return;
    }

    const screenShareVideoEle = screenShareVideoRef.current;
    const canvasEle = canvasRef.current;
    const webcamVideoEle = webcamVideoRef.current;

    const ctx = canvasEle.getContext("2d");
    if (!ctx) {
      console.log("Canvas context is null");
      return;
    }

    console.log("Drawing Screenshare");
    drawScreenShare({ videoEle: screenShareVideoEle, ctx });
    drawWebcam({ ctx, canvasEle, videoEle: webcamVideoEle });
    console.log("Finished Drawing Screenshare");
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

const FPS = 30;

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await unstable_parseMultipartFormData(
    request,
    uploadToR2(context.cloudflare.env)
  );

  const url = formData.get("video");

  if (url && typeof url === "string") {
    return redirect(url);
  }

  return null;
}
