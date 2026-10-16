/**
 * Foto più leggere prima del caricamento: lato lungo max 2000 px, JPEG 0,82. GIF, SVG e file che il
 * browser non sa leggere (es. HEIC fuori da Safari) restano come sono.
 */
const LATO_MAX = 2000

export type FilePronto = { blob: Blob; nome: string; tipo: string; larghezza: number | null; altezza: number | null }

export async function preparaFile(file: File): Promise<FilePronto> {
  const base: FilePronto = { blob: file, nome: file.name || "file", tipo: file.type || "application/octet-stream", larghezza: null, altezza: null }
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return base
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scala = Math.min(1, LATO_MAX / Math.max(width, height))
    if (scala === 1 && file.size < 700_000 && file.type !== "image/heic" && file.type !== "image/heif") {
      bitmap.close()
      return { ...base, larghezza: width, altezza: height }
    }
    const w = Math.round(width * scala)
    const h = Math.round(height * scala)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return base
    // PNG con trasparenza: sfondo bianco, altrimenti il JPEG diventa nero.
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82))
    if (!blob || blob.size >= file.size) return { ...base, larghezza: width, altezza: height }
    return { blob, nome: file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, "") + ".jpg", tipo: "image/jpeg", larghezza: w, altezza: h }
  } catch {
    return base
  }
}

export const eImmagine = (tipo: string | null | undefined) => !!tipo && /^image\//.test(tipo) && !/heic|heif/.test(tipo)
export const eVideo = (tipo: string | null | undefined) => !!tipo && /^video\//.test(tipo)
export const eAudio = (tipo: string | null | undefined) => !!tipo && /^audio\//.test(tipo)
