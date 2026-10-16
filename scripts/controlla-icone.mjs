// Controlla che le icone lucide usate dal modulo esistano in tutte le versioni installate nelle app
// (es. Finance ha lucide-react 0.454, Inventory 1.x, che ha tolto alcuni nomi vecchi).
// Uso: node modules/attivita/scripts/controlla-icone.mjs <percorso/lucide-react.d.ts> [...altri]
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const radice = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")
const usate = new Set()
const giro = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) giro(p)
    else if (/\.tsx?$/.test(f)) {
      const s = readFileSync(p, "utf8")
      for (const m of s.matchAll(/import\s*\{([^}]+)\}\s*from\s*"lucide-react"/g))
        for (const n of m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean))
          if (n !== "LucideIcon" && n !== "LucideProps") usate.add(n)
    }
  }
}
giro(radice)

let mancano = 0
for (const dts of process.argv.slice(2)) {
  const s = readFileSync(dts, "utf8")
  const presenti = new Set([...s.matchAll(/declare const (\w+): /g)].map((m) => m[1]))
  for (const m of s.matchAll(/(\w+) as (\w+)/g)) presenti.add(m[2])
  const no = [...usate].filter((n) => !presenti.has(n))
  console.log(`${dts}: ${usate.size} icone, mancano ${no.length}${no.length ? ": " + no.join(", ") : ""}`)
  mancano += no.length
}
process.exit(mancano ? 1 : 0)
