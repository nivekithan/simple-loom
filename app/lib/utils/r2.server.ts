import { UploadHandler, UploadHandlerPart } from "@remix-run/cloudflare";

export const uploadToR2 = (env: Env): UploadHandler => {
  return async (part: UploadHandlerPart) => {
    console.log("Runnning UploadToR2");

    const data = await toArrayBuffer(part.data);

    const r2Object = await env.BUCKET.put(`${crypto.randomUUID()}.webm`, data, {
      httpMetadata: { contentType: "video/webm" },
    });

    if (!r2Object) {
      throw new Error("There is no r2Object");
    }

    const customUrl = `https://loom-storage.nivekithan.com/${r2Object.key}`;

    return customUrl;
  };
};

export async function toArrayBuffer(iter: AsyncIterable<Uint8Array>) {
  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of iter) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(readableStream).arrayBuffer();
}
