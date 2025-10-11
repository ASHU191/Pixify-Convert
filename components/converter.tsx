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

type Item = {
  id: string
  file: File
  name: string
  size: number
  previewUrl: string
  webpUrl?: string
  webpSize?: number
  usedQualityPct?: number
  status: "idle" | "converting" | "done" | "error"
  error?: string
}

export function Converter() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [quality, setQuality] = useState<number>(0.9)
  const [selectedFormat, setSelectedFormat] = useState<string>("webp")
  const [mode, setMode] = useState<"auto" | "quality" | "size">("auto")
  const [qualityPct, setQualityPct] = useState<number>(90) // 0-100
  const [maxSizeKB, setMaxSizeKB] = useState<number>(300)

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

  const toWebpBlob = useCallback(
    (canvas: HTMLCanvasElement, q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", q)),
    [],
  )

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
        let blob: Blob | null = null

        if (mode === "auto") {
          chosenQ = 0.9
          blob = await toWebpBlob(canvas, chosenQ)
        } else if (mode === "quality") {
          chosenQ = Math.min(Math.max(qualityPct / 100, 0.01), 1)
          blob = await toWebpBlob(canvas, chosenQ)
        } else {
          // mode === "size" -> binary search quality for target size
          const target = Math.max(1, maxSizeKB) // KB
          let low = 0.1
          let high = 0.95
          let best: { blob: Blob; q: number } | null = null

          for (let i = 0; i < 9; i++) {
            const mid = (low + high) / 2
            const test = await toWebpBlob(canvas, mid)
            if (!test) break
            const kb = test.size / 1024
            if (kb <= target) {
              best = { blob: test, q: mid }
              // try higher quality while staying under target
              low = mid + 0.02
              if (low > 0.98) break
            } else {
              high = mid - 0.02
              if (high < 0.05) break
            }
          }

          if (best) {
            blob = best.blob
            chosenQ = best.q
          } else {
            // fallback: try a conservative low quality
            chosenQ = 0.5
            blob = await toWebpBlob(canvas, chosenQ)
          }
        }

        if (!blob) throw new Error("Failed to convert to WEBP")

        const nextUrl = URL.createObjectURL(blob)
        // revoke any previous url to avoid leaks
        setItems((prev) =>
          prev.map((p) => {
            if (p.id !== item.id) return p
            if (p.webpUrl && p.webpUrl !== nextUrl) URL.revokeObjectURL(p.webpUrl)
            return {
              ...p,
              webpUrl: nextUrl,
              webpSize: blob!.size,
              usedQualityPct: Math.round(chosenQ * 100),
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
    [mode, qualityPct, maxSizeKB, toWebpBlob],
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
            onClick={() => inputRef.current?.click()}
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
              <div className="flex items-center gap-2">
                <Label htmlFor="maxkb" className="text-xs text-muted-foreground">
                  Max Size
                </Label>
                <div className="flex items-center gap-2">
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
              <Button variant="outline" onClick={() => setItems([])}>
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

                {/* Show result info: size + used quality */}
                {item.status === "done" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    WEBP size: {((item.webpSize || 0) / 1024).toFixed(1)} KB
                    {typeof item.usedQualityPct === "number" ? ` • Quality: ${item.usedQualityPct}%` : null}
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
