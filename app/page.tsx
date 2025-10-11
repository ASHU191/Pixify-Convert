"use client"

import { motion } from "framer-motion"
import { Navbar } from "@/components/navbar"
import { Converter } from "@/components/converter"
import { FeatureCards } from "@/components/feature-cards"
import { Footer } from "@/components/footer"

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Subtle gradient background using tokens */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, var(--color-primary) 30%, transparent), transparent), radial-gradient(800px 400px at 80% 10%, color-mix(in oklab, var(--color-accent) 20%, transparent), transparent)",
        }}
      />
      <Navbar />

      <section id="home" className="relative">
        <div className="mx-auto max-w-6xl px-4 pt-16 md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center"
          >
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              {"Convert PNGs to WEBP Instantly ⚡"}
            </h1>
            <p className="text-pretty mx-auto mt-4 max-w-2xl text-muted-foreground md:text-lg">
              {"Fast, free, and 100% browser-based. No uploads, no limits."}
            </p>

            <div className="mt-8 flex items-center justify-center">
              <a
                href="#converter"
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground shadow-md ring-1 ring-primary/20 transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative">
                  <span className="absolute inset-0 -z-10 rounded-full bg-primary/30 blur-sm transition-opacity group-hover:opacity-100" />
                  {"Upload PNGs"}
                </span>
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
            className="mt-12"
          >
            <Converter />
          </motion.div>
        </div>
      </section>

      <section id="features" className="mx-auto mt-20 max-w-6xl px-4">
        <FeatureCards />
      </section>

      <section id="contact" className="mx-auto mt-20 max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border/60 bg-card/70 p-8 backdrop-blur"
        >
          <h3 className="text-xl font-medium">Contact</h3>
          <p className="mt-2 text-muted-foreground">
            {"Have questions or feedback? Reach out at "}
            <a className="underline underline-offset-4" href="mailto:hello@pixifyconvert.app">
              hello@pixifyconvert.app
            </a>
            {"."}
          </p>
        </motion.div>
      </section>

      <Footer />
    </main>
  )
}
