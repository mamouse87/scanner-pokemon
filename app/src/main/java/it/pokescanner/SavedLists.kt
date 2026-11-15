package it.pokescanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

/**
 * Liste salvate: ogni lista contiene le carte di UN set, ha un nome progressivo per set
 * (es. DLR-DominioDelta001, DLR-DominioDelta002, ASC-AscesaEroica001) e si manda al gestionale come file .txt.
 */
data class SavedList(
    val id: String,          // es. DLR-DominioDelta001 (= nome del file senza .txt)
    val lang: String,
    val setId: String,
    val setName: String,
    val code: String,
    val n: Int,
    val created: Long,
    val copies: Int,
    val rows: Int,
    val text: String,
    var sent: Long = 0L      // quando è stata inviata l'ultima volta (0 = mai)
)

object SavedLists {
    val lists = ArrayList<SavedList>()
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("lists", Context.MODE_PRIVATE)

    fun load(ctx: Context) {
        lists.clear()
        val s = prefs(ctx).getString("data", null) ?: return
        try {
            val a = JSONArray(s)
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                lists.add(SavedList(o.getString("id"), o.optString("lang"), o.optString("setId"), o.optString("setName"), o.optString("code"),
                    o.optInt("n"), o.optLong("created"), o.optInt("copies"), o.optInt("rows"), o.optString("text"), o.optLong("sent")))
            }
        } catch (_: Exception) {}
    }

    fun save(ctx: Context) {
        val a = JSONArray()
        for (l in lists) a.put(JSONObject().put("id", l.id).put("lang", l.lang).put("setId", l.setId).put("setName", l.setName)
            .put("code", l.code).put("n", l.n).put("created", l.created).put("copies", l.copies).put("rows", l.rows)
            .put("text", l.text).put("sent", l.sent))
        prefs(ctx).edit().putString("data", a.toString()).apply()
    }

    /** "Dominio Delta" -> "DominioDelta" (senza spazi, accenti e simboli) */
    fun compact(name: String): String =
        Normalizer.normalize(name, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
            .split(Regex("[^A-Za-z0-9]+")).filter { it.isNotEmpty() }
            .joinToString("") { it.replaceFirstChar { c -> c.uppercase() } }.ifEmpty { "Set" }

    /** Prossimo numero per il set (non riusa mai un numero, anche se una lista è stata cancellata). */
    private fun nextN(ctx: Context, lang: String, setId: String): Int {
        val p = prefs(ctx)
        val key = "n_${lang}_$setId"
        val n = maxOf(p.getInt(key, 0), lists.filter { it.lang == lang && it.setId == setId }.maxOfOrNull { it.n } ?: 0) + 1
        p.edit().putInt(key, n).apply()
        return n
    }

    /** Chiude le carte attuali di un set in una nuova lista numerata e le toglie dalla lista in corso. */
    fun closeGroup(ctx: Context, g: Group, code: String, comment: String): SavedList {
        val first = g.items.first().second
        val n = nextN(ctx, g.lang, first.setId)
        val sigla = code.ifEmpty { first.setId.uppercase().replace(Regex("[^A-Z0-9]"), "") }
        val id = "$sigla-${compact(g.setName)}${n.toString().padStart(3, '0')}"
        val sb = StringBuilder("CARDSCANNER 2\n# LISTA $id\nSET ${g.setName} | ${g.lang} | ${first.setId}\n")
        if (comment.isNotBlank()) sb.append("COMMENTO ${comment.trim()}\n")
        for ((_, i) in g.items) sb.append("${CardRepo.pad(i.num)} | x${i.qty} | ${if (i.variant == "R") "R" else "N"} | ${i.name} | ${i.rarity}\n")
        val l = SavedList(id, g.lang, first.setId, g.setName, sigla, n, System.currentTimeMillis(),
            g.items.sumOf { it.second.qty }, g.items.size, sb.toString())
        lists.add(l)
        save(ctx)
        g.items.forEach { (k, _) -> Inventory.items.remove(k) }
        Inventory.save(ctx)
        return l
    }

    fun unsent() = lists.filter { it.sent == 0L }

    fun markSent(ctx: Context, ls: List<SavedList>) {
        val now = System.currentTimeMillis()
        ls.forEach { it.sent = now }
        save(ctx)
    }

    fun delete(ctx: Context, l: SavedList) { lists.remove(l); save(ctx) }
}
