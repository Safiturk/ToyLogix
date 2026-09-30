import { ChecksumException, FormatException, NotFoundException } from "@zxing/library";

interface FrameReader {
  decode(video: HTMLVideoElement): { getText(): string };
  reset(): void;
}

export function startBarcodeCamera(
  video: HTMLVideoElement,
  reader: FrameReader,
  onSuccess: (code: string) => void,
  onError: (error: unknown) => void,
  getUserMedia = (constraints: MediaStreamConstraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
) {
  let stopped = false;
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let width = 0;
  let height = 0;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    reader.reset();
    stream?.getTracks().forEach((track) => track.stop());
    // A previous session must never detach a newer session's camera.
    if (stream && video.srcObject === stream) video.srcObject = null;
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    stop();
    onError(error);
  };
  const scan = () => {
    if (stopped) return;
    let code: string | undefined;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        // ZXing caches its capture canvas; recreate it if the camera resizes.
        if (width !== video.videoWidth || height !== video.videoHeight) {
          reader.reset();
          width = video.videoWidth;
          height = video.videoHeight;
        }
        code = reader.decode(video).getText();
      } catch (error) {
        if (error instanceof DOMException &&
            (error.name === "IndexSizeError" || error.name === "InvalidStateError")) {
          reader.reset();
        } else if (!(error instanceof NotFoundException ||
                     error instanceof ChecksumException || error instanceof FormatException)) {
          fail(error);
          return;
        }
      }
    }
    if (code !== undefined) {
      stop();
      onSuccess(code);
      return;
    }
    timer = setTimeout(scan, 150);
  };

  async function start() {
    try {
      const acquired = await getUserMedia({ audio: false, video: { facingMode: "environment" } });
      if (stopped) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = stream;
      await video.play();
    } catch (error) {
      fail(error);
      return;
    }
    scan();
  }
  void start();
  return stop;
}
