"use client"

import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"
import { Camera, Layers } from "lucide-react"
import { motion } from "framer-motion"

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="group inline-flex items-center gap-2">
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md">
            <span className="absolute inset-0 -z-10 rounded-md bg-primary/25 blur-sm" />
            <Camera className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight">Pixify Convert</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          <Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="#home">
            Home
          </Link>
          <Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="#features">
            Features
          </Link>
          <Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="#contact">
            Contact
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <motion.div whileHover={{ rotate: 10 }}>
            <Layers className="hidden h-4 w-4 text-muted-foreground md:inline" aria-hidden />
          </motion.div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
