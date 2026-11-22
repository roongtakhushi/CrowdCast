import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { config, E } from "../core";

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageMime = (typeof IMAGE_MIMES)[number];

const EXT: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  mime: ImageMime;
  ext: string;
}

/** Validate by magic bytes (never extension/MIME header), strip EXIF, re-encode, thumbnail. */
export async function processImage(buf: Buffer): Promise<ProcessedImage> {
  if (buf.length > config.maxImageBytes) throw E.tooLarge("Images can be at most 10 MB");
  const ft = await fileTypeFromBuffer(buf);
  if (!ft || !(IMAGE_MIMES as readonly string[]).includes(ft.mime)) {
    throw E.invalid("File is not a valid JPEG, PNG, WebP or GIF image");
  }
  const mime = ft.mime as ImageMime;
  try {
    const base = () => sharp(buf, { animated: mime === "image/gif", limitInputPixels: 80_000_000, failOn: "error" }).rotate();
    let pipeline = base().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
    // sharp drops all metadata (EXIF/GPS/ICC text) unless withMetadata() is called.
    if (mime === "image/jpeg") pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    else if (mime === "image/png") pipeline = pipeline.png({ compressionLevel: 9 });
    else if (mime === "image/webp") pipeline = pipeline.webp({ quality: 85 });
    else pipeline = pipeline.gif();
    const full = await pipeline.toBuffer();
    const thumb = await sharp(buf, { limitInputPixels: 80_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { full, thumb, mime, ext: EXT[mime] };
  } catch {
    throw E.invalid("Image is corrupt or cannot be decoded");
  }
}

/** Magic-byte validation + server-side page count. */
export async function processPdf(buf: Buffer): Promise<{ pageCount: number }> {
  if (buf.length > config.maxPdfBytes) throw E.tooLarge("PDFs can be at most 30 MB");
  const ft = await fileTypeFromBuffer(buf);
  if (ft?.mime !== "application/pdf" || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw E.invalid("File is not a real PDF (magic bytes mismatch)");
  }
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const pageCount = doc.getPageCount();
    if (pageCount < 1) throw new Error("empty");
    return { pageCount };
  } catch {
    throw E.invalid("PDF is corrupt or has no pages");
  }
}

export function roomDir(roomId: string): string {
  return path.join(/*turbopackIgnore: true*/ config.uploadDir, roomId);
}

export async function saveFile(roomId: string, ext: string, data: Buffer, suffix = ""): Promise<string> {
  const dir = roomDir(roomId);
  await mkdir(dir, { recursive: true });
  // Random server-generated name: user-supplied names are never used on disk.
  const name = `${nanoid(18)}${suffix}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), data, { mode: 0o640 });
  return name;
}

export async function deleteRoomFiles(roomId: string) {
  await rm(roomDir(roomId), { recursive: true, force: true });
}

export async function dirSize(roomId: string): Promise<number> {
  try {
    const names = await readdir(roomDir(roomId));
    let n = 0;
    for (const f of names) n += (await stat(path.join(/*turbopackIgnore: true*/ roomDir(roomId), f))).size;
    return n;
  } catch {
    return 0;
  }
}

const SAFE_NAME = /^[A-Za-z0-9_-]{6,40}\.(jpg|png|webp|gif|pdf)$/;
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export interface FileResponseOpts {
  roomId: string;
  name: string;
  range: string | null;
  download: boolean;
  downloadName: string;
}

/** Protected static serving: name whitelist (no traversal), Range support, immutable caching. */
export async function serveFile(o: FileResponseOpts): Promise<Response> {
  if (!SAFE_NAME.test(o.name) || !/^[A-Za-z0-9_-]{8,32}$/.test(o.roomId)) throw E.notFound("File not found");
  const dir = roomDir(o.roomId);
  const full = path.join(/*turbopackIgnore: true*/ dir, o.name);
  if (path.dirname(full) !== dir) throw E.notFound("File not found");
  let st;
  try {
    st = await stat(full);
  } catch {
    throw E.notFound("File not found");
  }
  const ext = o.name.split(".").pop() ?? "";
  const headers = new Headers({
    "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    ETag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`,
  });
  const safeName = o.downloadName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 100) || "download";
  headers.set(
    "Content-Disposition",
    `${o.download ? "attachment" : "inline"}; filename="${safeName}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${ext}`,
  );

  let start = 0;
  let end = st.size - 1;
  let status = 200;
  if (o.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(o.range);
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    }
    if (m[1] === "") {
      start = Math.max(0, st.size - Number(m[2]));
    } else {
      start = Number(m[1]);
      if (m[2] !== "") end = Math.min(end, Number(m[2]));
    }
    if (start > end || start >= st.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${st.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  const body = Readable.toWeb(createReadStream(full, { start, end })) as unknown as ReadableStream;
  return new Response(body, { status, headers });
}
