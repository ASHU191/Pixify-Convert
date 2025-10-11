"use client"

import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"

const features = [
  { title: "🚀 Instant Conversion", desc: "Lightning-fast PNG to WEBP using your browser." },
  { title: "💾 100% Private", desc: "No uploads. Files never leave your device." },
  { title: "🎨 High Quality WEBP", desc: "Great results with adjustable quality under the hood." },
  { title: "📱 Works on All Devices", desc: "Responsive and smooth on phones, tablets, and desktops." },
]

export function FeatureCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((f, i) => (
        <motion.div
          key={f.title}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: i * 0.05, duration: 0.45 }}
        >
          <Card className="group h-full rounded-xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-primary/10 to-transparent opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
