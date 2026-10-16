import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Funzioni da server (job con la secret key). Una sola app le deve far girare (oggi Finance, nel
 * cron delle notifiche): il cestino è unico per tutte.
 */

/** Cancella per sempre le attività nel cestino da più di un anno: prima i file, poi le righe. */
export async function pulisciCestino(admin: SupabaseClient<any, any, any>, giorni = 365): Promise<{ attivita: number; file: number }> {
  const db = admin.schema("tasks")
  const { data, error } = await db.rpc("da_eliminare_definitivamente", { p_giorni: giorni })
  if (error) throw new Error(`Cestino attività: ${error.message}`)
  const righe = (data ?? []) as { task_id: string; percorsi: string[] }[]
  if (!righe.length) return { attivita: 0, file: 0 }
  let file = 0
  const percorsi = righe.flatMap((r) => r.percorsi ?? [])
  for (let i = 0; i < percorsi.length; i += 100) {
    const pezzo = percorsi.slice(i, i + 100)
    const r = await admin.storage.from("tasks").remove(pezzo)
    if (r.error) throw new Error(`Cestino attività (file): ${r.error.message}`)
    file += pezzo.length
  }
  const { data: n, error: e2 } = await db.rpc("elimina_definitivamente", { p_ids: righe.map((r) => r.task_id) })
  if (e2) throw new Error(`Cestino attività: ${e2.message}`)
  return { attivita: Number(n ?? 0), file }
}
