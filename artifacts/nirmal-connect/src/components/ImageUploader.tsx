import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2 } from "lucide-react";
import { getToken } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api") as string;

type PasteHandler = (file: File) => void;
const pasteRegistry: { id: string; handler: PasteHandler }[] = [];
let activePasteId: string | null = null;
let globalListenerAttached = false;

function ensureGlobalPasteListener() {
  if (globalListenerAttached || typeof window === "undefined") return;
  globalListenerAttached = true;
  window.addEventListener("paste", (e: ClipboardEvent) => {
    if (pasteRegistry.length === 0) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    let imageFile: File | null = null;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        imageFile = item.getAsFile();
        if (imageFile) break;
      }
    }
    if (!imageFile) return;
    const target =
      pasteRegistry.find((r) => r.id === activePasteId) ??
      pasteRegistry[pasteRegistry.length - 1];
    if (!target) return;
    e.preventDefault();
    target.handler(imageFile);
  });
}

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  /**
   * Called with the small (~400px) WebP thumbnail URL produced by the upload
   * endpoint. Receives an empty string when the image is cleared or when the
   * server didn't generate a thumbnail (e.g. SVG/GIF).
   */
  onThumbnailChange?: (thumbnailUrl: string) => void;
  label?: string;
  placeholder?: string;
  accept?: string;
  className?: string;
}

export default function ImageUploader({
  value,
  onChange,
  onThumbnailChange,
  label = "Image",
  placeholder = "https://… or upload below",
  accept = "image/*",
  className = "",
}: ImageUploaderProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const instanceId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const handleFileRef = useRef<(file: File) => void>(() => {});

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Only image files are supported");
      return;
    }
    setUploading(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/admin/upload`, {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      onChange(data.url as string);
      onThumbnailChange?.((data.thumbnailUrl as string | null) ?? "");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  handleFileRef.current = handleFile;

  useEffect(() => {
    ensureGlobalPasteListener();
    const entry = { id: instanceId, handler: (f: File) => handleFileRef.current(f) };
    pasteRegistry.push(entry);
    return () => {
      const idx = pasteRegistry.findIndex((r) => r.id === instanceId);
      if (idx >= 0) pasteRegistry.splice(idx, 1);
      if (activePasteId === instanceId) activePasteId = null;
    };
  }, [instanceId]);

  function claimPasteTarget() {
    activePasteId = instanceId;
  }
  function releasePasteTarget() {
    if (activePasteId === instanceId) activePasteId = null;
  }

  const previewSrc = value
    ? value.startsWith("http") ||
      value.startsWith("/uploads/") ||
      value.startsWith("/api/uploads/")
      ? value
      : null
    : null;

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    }
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget === e.target) setIsDragging(false);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs">{label}</Label>
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onMouseEnter={claimPasteTarget}
        onMouseLeave={releasePasteTarget}
        onFocusCapture={claimPasteTarget}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            releasePasteTarget();
          }
        }}
        className={`flex items-start gap-2 rounded-md border border-dashed p-2 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
            : "border-transparent"
        }`}
      >
        {previewSrc && (
          <div className="relative shrink-0">
            <img
              src={previewSrc}
              alt="preview"
              className="w-16 h-16 rounded-md object-cover border bg-muted"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
            />
            <button
              type="button"
              onClick={() => { onChange(""); onThumbnailChange?.(""); }}
              className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 shadow hover:bg-red-50"
              title="Remove image"
            >
              <X className="w-3 h-3 text-red-500" />
            </button>
          </div>
        )}
        <div className="flex-1 space-y-1.5">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="text-sm"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="gap-1.5 h-8 text-xs"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading…" : "Upload from device"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {isDragging ? "Drop image to upload" : "Drop, paste (Ctrl+V) or pick — PNG/JPG/GIF/WebP up to 8 MB"}
            </span>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
