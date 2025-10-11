"use client"

import { Github, Twitter } from "lucide-react"

export function Footer() {
  return (
    <footer className="mx-auto mt-20 w-full max-w-6xl px-4 pb-10 pt-10">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 text-center backdrop-blur">
        <p className="text-sm">{"Made with ❤️ by Arsalan Aftab"}</p>
        <div className="mt-3 flex items-center justify-center gap-4">
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Github className="h-4 w-4" aria-hidden />
          </a>
          <a
            href="https://x.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="X"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Twitter className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
      <div className="pt-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Pixify Convert</div>
    </footer>
  )
}
