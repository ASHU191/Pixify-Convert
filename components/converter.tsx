"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Upload, Download, ImageIcon, CheckCircle2, Trash2, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

type Item = {
  id: string
  file: File
  name: string
  size: number
  previewUrl: string
  webpUrl?: string
  webpSize?: number
  usedQualityPct?: number
  usedScalePct?: number
  status: "idle" | "converting" | "done" | "error"
  error?: string
}

export function Converter() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [quality, setQuality] = useState<number>(0.9)
  const [selectedFormat, setSelectedFormat] = useState<string>("webp")
  const [mode, setMode] = useState<"auto" | "quality" | "size" | "both">("auto")
  const [qualityPct, setQualityPct] = useState<number>(90) // 0-100
  const [maxSizeKB, setMaxSizeKB] = useState<number>(300)
  const [allowUpscale, setAllowUpscale] = useState<boolean>(true) // default 'Aim near cap' ON

  const totalConverted = useMemo(() => items.filter((i) => i.status === "done").length, [items])

  const onFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const list: Item[] = []
    Array.from(files).forEach((f) => {
      if (f.type !== "image/png") return
      const id = `${f.name}-${f.size}-${crypto.randomUUID()}`
      const previewUrl = URL.createObjectURL(f)
      list.push({
        id,
        file: f,
        name: f.name,
        size: f.size,
        previewUrl,
        status: "idle",
      })
    })
    if (list.length) {
      setItems((prev) => [...prev, ...list])
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault()
      setIsDragging(false)
      onFiles(e.dataTransfer.files)
    },
    [onFiles],
  )

  const webpAtQuality = useCallback(
    (canvas: HTMLCanvasElement, q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", q)),
    [],
  )

  // Binary search quality for a target size on a given canvas
  const findQualityForTargetKB = useCallback(
    async (
      canvas: HTMLCanvasElement,
      targetKB: number,
      minQ = 0.01,
      maxQ = 0.999,
      iterations = 12,
    ): Promise<{ blob: Blob; q: number } | null> => {
      let low = minQ
      let high = maxQ
      let best: { blob: Blob; q: number } | null = null

      for (let i = 0; i < iterations; i++) {
        const mid = (low + high) / 2
        const blob = await webpAtQuality(canvas, mid)
        if (!blob) break
        const kb = blob.size / 1024

        if (kb <= targetKB) {
          best = { blob, q: mid }
          // try higher quality while staying under target
          low = Math.min(0.999, mid + 0.02)
        } else {
          high = Math.max(minQ, mid - 0.02)
        }

        if (Math.abs(low - high) < 0.005) break
      }
      return best
    },
    [webpAtQuality],
  )

  // Helper to upscale while keeping a fixed quality and staying under a target size (maximize scale under cap)
  const upscaleToTargetWithFixedQuality = useCallback(
    async (
      srcCanvas: HTMLCanvasElement,
      targetKB: number,
      fixedQ01: number,
      maxScale = 6, // was 2.5; increase so we can approach the cap when enabled
    ): Promise<{ blob: Blob; q: number; scale: number } | null> => {
      const tolKB = 2
      let low = 1
      let high = maxScale
      let best: { blob: Blob; q: number; scale: number } | null = null

      for (let i = 0; i < 12; i++) {
        // a few more iterations for precision
        const mid = (low + high) / 2
        const w = Math.max(1, Math.floor(srcCanvas.width * mid))
        const h = Math.max(1, Math.floor(srcCanvas.height * mid))
        const scaled = document.createElement("canvas")
        scaled.width = w
        scaled.height = h
        const sctx = scaled.getContext("2d")
        if (!sctx) break
        sctx.imageSmoothingEnabled = true
        sctx.imageSmoothingQuality = "high"
        sctx.drawImage(srcCanvas, 0, 0, w, h)

        const blob = await webpAtQuality(scaled, fixedQ01)
        if (!blob) break
        const kb = blob.size / 1024

        if (kb <= targetKB) {
          best = { blob, q: fixedQ01, scale: mid }
          if (Math.abs(targetKB - kb) <= tolKB) break
          low = Math.min(maxScale, mid + 0.05)
        } else {
          high = Math.max(1, mid - 0.05)
        }
        if (high - low < 0.02) break
      }
      return best
    },
    [webpAtQuality],
  )

  // Try to hit target size: first with quality, then progressively downscale if needed
  const convertToTargetSize = useCallback(
    async (
      srcCanvas: HTMLCanvasElement,
      targetKB: number,
      allowUp: boolean,
    ): Promise<{ blob: Blob; q: number; scale: number }> => {
      const tolKB = 2
      const direct = await findQualityForTargetKB(srcCanvas, targetKB)
      if (direct) {
        const underBy = targetKB - direct.blob.size / 1024
        if (allowUp && underBy > tolKB && direct.q >= 0.95) {
          const up = await upscaleToTargetWithFixedQuality(
            srcCanvas,
            targetKB,
            Math.min(0.999, Math.max(0.95, direct.q)),
          )
          if (up) return up
        }
        return { blob: direct.blob, q: direct.q, scale: 1 }
      }

      // 2) Downscale loop if quality-only can't meet target
      let bestOverall: { blob: Blob; q: number; scale: number } | null = null
      const scales = [
        0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1,
      ]
      for (const s of scales) {
        const scaled = document.createElement("canvas")
        const sw = Math.max(1, Math.floor(srcCanvas.width * s))
        const sh = Math.max(1, Math.floor(srcCanvas.height * s))
        scaled.width = sw
        scaled.height = sh
        const sctx = scaled.getContext("2d")
        if (!sctx) continue
        sctx.drawImage(srcCanvas, 0, 0, sw, sh)

        // try to meet the cap at this scale using highest possible quality
        const attempt = await findQualityForTargetKB(scaled, targetKB)
        if (attempt) return { blob: attempt.blob, q: attempt.q, scale: s }

        // track the smallest we can achieve as a graceful fallback
        const fallbackQ = 0.35
        const fbBlob = await webpAtQuality(scaled, fallbackQ)
        if (fbBlob) {
          if (!bestOverall || fbBlob.size < bestOverall.blob.size) {
            bestOverall = { blob: fbBlob, q: fallbackQ, scale: s }
          }
        }
      }

      if (bestOverall) return bestOverall

      // 3) Last resort: original canvas at a modest quality
      const last = await webpAtQuality(srcCanvas, 0.35)
      if (!last) throw new Error("Failed to create WEBP")
      return { blob: last, q: 0.35, scale: 1 }
    },
    [findQualityForTargetKB, upscaleToTargetWithFixedQuality, webpAtQuality],
  )

  // Helper: fit to size while keeping a fixed quality (scale only, binary search on scale)
  const fitToSizeWithFixedQuality = useCallback(
    async (
      srcCanvas: HTMLCanvasElement,
      targetKB: number,
      fixedQ01: number,
      allowUp: boolean,
    ): Promise<{ blob: Blob; q: number; scale: number }> => {
      const first = await webpAtQuality(srcCanvas, fixedQ01)
      if (!first) throw new Error("Failed to create WEBP")

      if (first.size / 1024 <= targetKB) {
        if (allowUp) {
          const up = await upscaleToTargetWithFixedQuality(srcCanvas, targetKB, fixedQ01)
          if (up) return up
        }
        return { blob: first, q: fixedQ01, scale: 1 }
      }

      // Binary search scale between [minScale, 1] to meet target size using fixed quality
      let low = 0.1
      let high = 1
      let best: { blob: Blob; q: number; scale: number } | null = null
      for (let i = 0; i < 8; i++) {
        const mid = (low + high) / 2
        const w = Math.max(1, Math.floor(srcCanvas.width * mid))
        const h = Math.max(1, Math.floor(srcCanvas.height * mid))
        const scaled = document.createElement("canvas")
        scaled.width = w
        scaled.height = h
        const sctx = scaled.getContext("2d")
        if (!sctx) break
        sctx.drawImage(srcCanvas, 0, 0, w, h)
        const blob = await webpAtQuality(scaled, fixedQ01)
        if (!blob) break
        const kb = blob.size / 1024
        if (kb <= targetKB) {
          best = { blob, q: fixedQ01, scale: mid }
          // try larger (higher) scale while staying under cap
          low = Math.min(0.999, mid + 0.05)
        } else {
          // need to scale down further
          high = Math.max(0.1, mid - 0.05)
        }
        if (Math.abs(high - low) < 0.02) break
      }

      if (best) return best

      // Fallback: smallest we can produce with this fixed quality using a coarse scale sweep
      let fallback: { blob: Blob; q: number; scale: number } | null = null
      for (const s of [0.25, 0.2, 0.15, 0.12, 0.1]) {
        const w = Math.max(1, Math.floor(srcCanvas.width * s))
        const h = Math.max(1, Math.floor(srcCanvas.height * s))
        const scaled = document.createElement("canvas")
        scaled.width = w
        scaled.height = h
        const sctx = scaled.getContext("2d")
        if (!sctx) continue
        sctx.drawImage(srcCanvas, 0, 0, w, h)
        const blob = await webpAtQuality(scaled, fixedQ01)
        if (blob && (!fallback || blob.size < fallback.blob.size)) {
          fallback = { blob, q: fixedQ01, scale: s }
        }
      }
      if (fallback) return fallback

      // Last resort: return the original attempt (will exceed target)
      return { blob: first, q: fixedQ01, scale: 1 }
    },
    [webpAtQuality, upscaleToTargetWithFixedQuality],
  )

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => {
        URL.revokeObjectURL(i.previewUrl)
        if (i.webpUrl) URL.revokeObjectURL(i.webpUrl)
      })
      return []
    })
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }, [setItems])

  const convertOne = useCallback(
    async (item: Item) => {
      try {
        setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "converting", error: undefined } : p)))
        const img = await loadImage(item.previewUrl)
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Unable to get canvas context")
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        ctx.drawImage(img, 0, 0)

        let chosenQ = 0.9
        let chosenScale = 1
        let blob: Blob | null = null

        if (mode === "auto") {
          chosenQ = 0.9
          blob = await webpAtQuality(canvas, chosenQ)
        } else if (mode === "quality") {
          chosenQ = Math.min(Math.max(qualityPct / 100, 0.01), 1)
          blob = await webpAtQuality(canvas, chosenQ)
        } else if (mode === "both") {
          const target = Math.max(1, maxSizeKB)
          chosenQ = Math.min(Math.max(qualityPct / 100, 0.01), 1)
          const res = await fitToSizeWithFixedQuality(canvas, target, chosenQ, true /* force upscale to approach cap */)
          blob = res.blob
          chosenScale = res.scale
        } else {
          // mode === "size"
          const target = Math.max(1, maxSizeKB)
          const res = await convertToTargetSize(canvas, target, allowUpscale)
          blob = res.blob
          chosenQ = res.q
          chosenScale = res.scale
        }

        if (!blob) throw new Error("Failed to convert to WEBP")

        const nextUrl = URL.createObjectURL(blob)
        setItems((prev) =>
          prev.map((p) => {
            if (p.id !== item.id) return p
            if (p.webpUrl && p.webpUrl !== nextUrl) URL.revokeObjectURL(p.webpUrl)
            return {
              ...p,
              webpUrl: nextUrl,
              webpSize: blob!.size,
              usedQualityPct: Math.round(chosenQ * 100),
              usedScalePct: Math.round(chosenScale * 100),
              status: "done",
            }
          }),
        )
      } catch (err: any) {
        setItems((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: "error", error: err?.message || "Error" } : p)),
        )
      }
    },
    [mode, qualityPct, maxSizeKB, allowUpscale, webpAtQuality, convertToTargetSize, fitToSizeWithFixedQuality],
  )

  const convertAll = useCallback(async () => {
    for (const it of items) {
      if (it.status !== "done") {
        // eslint-disable-next-line no-await-in-loop
        await convertOne(it)
      }
    }
  }, [items, convertOne])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id)
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl)
      if (it?.webpUrl) URL.revokeObjectURL(it.webpUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  useEffect(() => {
    return () => {
      items.forEach((i) => {
        URL.revokeObjectURL(i.previewUrl)
        if (i.webpUrl) URL.revokeObjectURL(i.webpUrl)
      })
    }
    // we only want cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section id="converter" className="relative">
      <div className="grid gap-6">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            "group relative flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/50 p-8 text-center shadow-sm backdrop-blur transition-all",
            "hover:border-primary/60 hover:shadow-lg",
            isDragging && "border-primary/80 ring-2 ring-primary/20",
          )}
        >
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-gradient-to-b from-primary/10 to-transparent opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
          <input
            ref={inputRef}
            type="file"
            accept="image/png"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Upload aria-hidden className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Drag & drop your PNG files here</p>
          <p className="mt-1 text-sm text-muted-foreground">{"or click to browse"}</p>
          <button
            type="button"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = ""
              inputRef.current?.click()
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow ring-1 ring-primary/20 transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImageIcon className="h-4 w-4" aria-hidden />
            Choose PNGs
          </button>
        </label>

        {/* Compression Settings Toolbar */}
        <Card className="border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">Compression Settings</span>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="mode" className="text-xs text-muted-foreground">
                Mode
              </Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger id="mode" className="h-8">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="quality">By Quality</SelectItem>
                  <SelectItem value="size">By Max Size</SelectItem>
                  <SelectItem value="both">Quality + Max Size</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "quality" && (
              <div className="flex flex-1 items-center gap-3">
                <Label className="text-xs text-muted-foreground">Quality</Label>
                <div className="min-w-[160px] flex-1">
                  <Slider value={[qualityPct]} min={1} max={100} onValueChange={(v) => setQualityPct(v[0] ?? 90)} />
                </div>
                <div className="flex items-center gap-1">
                  {[40, 60, 80, 90].map((q) => (
                    <Button key={q} size="sm" variant="outline" onClick={() => setQualityPct(q)}>
                      {q}%
                    </Button>
                  ))}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">{qualityPct}%</div>
              </div>
            )}

            {mode === "size" && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="maxkb" className="text-xs text-muted-foreground">
                    Max Size
                  </Label>
                  <Input
                    id="maxkb"
                    className="h-8 w-28"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={maxSizeKB}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10)
                      setMaxSizeKB(Number.isFinite(n) ? n : 300)
                    }}
                  />
                  <span className="text-xs text-muted-foreground">KB</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="upscale-size" checked={allowUpscale} onCheckedChange={setAllowUpscale} />
                  <Label htmlFor="upscale-size" className="text-xs text-muted-foreground">
                    Aim near cap (can upscale)
                  </Label>
                </div>
              </div>
            )}

            {mode === "both" && (
              <div className="flex flex-1 flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">Quality</Label>
                  <div className="min-w-[160px]">
                    <Slider value={[qualityPct]} min={1} max={100} onValueChange={(v) => setQualityPct(v[0] ?? 90)} />
                  </div>
                  <div className="flex items-center gap-1">
                    {[40, 60, 80, 90].map((q) => (
                      <Button key={q} size="sm" variant="outline" onClick={() => setQualityPct(q)}>
                        {q}%
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">{qualityPct}%</div>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="maxkb-both" className="text-xs text-muted-foreground">
                    Max Size
                  </Label>
                  <Input
                    id="maxkb-both"
                    className="h-8 w-28"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={maxSizeKB}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10)
                      setMaxSizeKB(Number.isFinite(n) ? n : 300)
                    }}
                  />
                  <span className="text-xs text-muted-foreground">KB</span>
                </div>

                <div className="flex items-center gap-2">
                  <Switch id="upscale-both" checked={allowUpscale} onCheckedChange={setAllowUpscale} />
                  <Label htmlFor="upscale-both" className="text-xs text-muted-foreground">
                    Aim near cap (can upscale)
                  </Label>
                </div>

                <p className="text-xs text-muted-foreground">
                  Keeps your selected quality and automatically resizes to stay close to the max size (never exceeding
                  it).
                </p>
              </div>
            )}
          </div>
        </Card>

        {items.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {items.length} file{items.length > 1 ? "s" : ""} selected • {totalConverted} converted
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={convertAll}>
                Convert All
              </Button>
              <Button variant="outline" onClick={clearAll}>
                Clear All
              </Button>
            </div>
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <Card className="relative overflow-hidden rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 overflow-hidden rounded-md ring-1 ring-border/60">
                    <img
                      src={item.previewUrl || "/placeholder.svg"}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{(item.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    aria-label="Remove"
                    onClick={() => removeItem(item.id)}
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => convertOne(item)}
                    disabled={item.status === "converting" || item.status === "done"}
                    className="relative"
                  >
                    {item.status === "converting" ? "Converting…" : "Convert to WEBP"}
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!item.webpUrl}
                    onClick={() => {
                      if (!item.webpUrl) return
                      const a = document.createElement("a")
                      a.href = item.webpUrl
                      a.download = item.name.replace(/\.png$/i, "") + ".webp"
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                    }}
                    className="inline-flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Download
                  </Button>

                  {item.status === "done" && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 18 }}
                      className="ml-auto text-green-500"
                      aria-label="Conversion complete"
                      role="status"
                    >
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                    </motion.div>
                  )}
                </div>

                {/* Show result info: size + used quality (+ scale if applied) */}
                {item.status === "done" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    WEBP size: {((item.webpSize || 0) / 1024).toFixed(1)} KB
                    {typeof item.usedQualityPct === "number" ? ` • Quality: ${item.usedQualityPct}%` : null}
                    {typeof item.usedScalePct === "number" && item.usedScalePct !== 100
                      ? ` • Scale: ${item.usedScalePct}%`
                      : null}
                    {(mode === "size" || mode === "both") && item.webpSize && item.webpSize / 1024 > maxSizeKB
                      ? " • Note: could not reach target size; returned smallest possible."
                      : null}
                  </p>
                )}

                {item.error && <p className="mt-2 text-sm text-destructive">{item.error}</p>}
              </Card>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous" // avoid CORS issues on canvas
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}
