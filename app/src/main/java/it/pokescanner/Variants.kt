package it.pokescanner

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** Una variante speciale della carta: prodotto Cardmarket a parte (es. Reverse Poké Ball, Reverse Energia). */
data class VarOpt(val p: String, val label: String, val cat: String)

/** Varianti di una carta lette da TCGdex (variants_detailed). */
data class CardVars(val base: String, val plainRev: Boolean, val opts: List<VarOpt>)

/**
 * Modalità di scansione per categoria (tappa 3): Normale, Reverse, Energia, Ball, Master Ball, Promo.
 * "Ball" = la Ball della carta (Poké, Love, Scuro, Velox, Friend…) o il Team Rocket: ogni carta ne ha una sola.
 * "Promo" (27/11) = versioni timbrate e Cosmo/Galassia Holo (su Cardmarket la riga con la P): una carta può averne più di una.
 * Jumbo e Non Holo si aggiungono dal gestionale.
 */
object Variants {
    const val N = "N"
    const val R = "R"
    const val ENERGIA = "energia"
    const val BALL = "ball"
    const val MASTER = "master"
    const val PROMO = "promo"
    val SPECIAL = listOf(ENERGIA, BALL, MASTER, PROMO)

    fun modeLabel(m: String) = when (m) {
        R -> "Reverse Holo"
        ENERGIA -> "Reverse Energia"
        BALL -> "Reverse Ball"
        MASTER -> "Reverse Master Ball"
        PROMO -> "Promo"
        else -> "Normale"
    }

    fun isSpecial(m: String) = m in SPECIAL

    private val mem = ConcurrentHashMap<String, CardVars>()
    /** carte già guardate senza elenco di varianti (set vecchi): non rileggo i file ogni volta */
    private val none = ConcurrentHashMap<String, Boolean>()

    private fun cat(type: String, foil: String, stamped: Boolean, jumbo: Boolean): String {
        val t = type.lowercase()
        val f = foil.lowercase()
        if (jumbo) return "altra"
        if (stamped || f.contains("cosm") || f.contains("galax") || f.contains("galass")) return PROMO
        if (!t.startsWith("rev") || f.isEmpty()) return "altra"
        return when {
            f.contains("energ") -> ENERGIA
            f.contains("master") -> MASTER
            f.contains("ball") || f.contains("rocket") -> BALL
            else -> "altra"
        }
    }

    fun parse(o: JSONObject): CardVars? {
        val det = o.optJSONArray("variants_detailed") ?: return null
        if (det.length() == 0) return null
        fun cm(v: JSONObject) = v.optJSONObject("thirdParty")?.optLong("cardmarket", 0L)?.takeIf { it > 0 }?.toString() ?: ""
        fun stamped(v: JSONObject) = (v.optJSONArray("stamp")?.length() ?: 0) > 0 || v.optString("stamp", "").let { it.isNotEmpty() && it != "null" && !it.startsWith("[") }
        fun plain(v: JSONObject) = v.optString("foil", "").isEmpty() && !stamped(v) && !v.optString("size", "").lowercase().contains("jumbo")
        val list = (0 until det.length()).map { det.getJSONObject(it) }
        val baseV = list.firstOrNull { plain(it) && !it.optString("type").lowercase().startsWith("rev") && cm(it).isNotEmpty() }
        val base = o.optJSONObject("pricing")?.optJSONObject("cardmarket")?.optLong("idProduct", 0L)?.takeIf { it > 0 }?.toString()
            ?: baseV?.let { cm(it) } ?: ""
        val revs = list.filter { it.optString("type").lowercase().startsWith("rev") }
        // senza nessuna Reverse nell'elenco i dati sono incompleti: non dico che la Reverse semplice non esiste
        val plainRev = revs.isEmpty() || revs.any { plain(it) || cm(it) == base }
        val seen = HashSet<String>()
        val opts = ArrayList<VarOpt>()
        for (v in list) {
            val p = cm(v)
            if (p.isEmpty() || p == base || !seen.add(p)) continue
            val type = v.optString("type", "")
            val foil = v.optString("foil", "")
            val jumbo = v.optString("size", "").lowercase().contains("jumbo")
            val c = cat(type, foil, stamped(v), jumbo)
            val label = if (c == PROMO) promoLabel(type, foil, stampsOf(v)) else listOf(if (type.lowercase().startsWith("rev")) "Reverse" else type.replaceFirstChar { it.uppercase() }, foil)
                .filter { it.isNotBlank() }.joinToString(" ")
            opts.add(VarOpt(p, label.ifEmpty { "Variante speciale" }, c))
        }
        return CardVars(base, plainRev, opts)
    }

    private fun stampsOf(v: JSONObject): List<String> {
        v.optJSONArray("stamp")?.let { a -> return (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }
        return v.optString("stamp", "").takeIf { it.isNotBlank() && it != "null" }?.let { listOf(it) } ?: emptyList()
    }

    /** nomi italiani dei timbri più comuni (TCGdex non li traduce; stessi nomi del gestionale) */
    private val STAMP_IT = mapOf("set-logo" to "logo del set", "logo set" to "logo del set", "pre-release" to "Pre-release", "pokemon-center" to "Pokémon Center",
        "staff" to "Staff", "gamestop" to "GameStop", "eb-games" to "EB Games", "snowflake" to "fiocco di neve", "player-rewards-program" to "Play! Pokémon",
        "pokemon-day" to "Pokémon Day", "regional-championships" to "Campionati Regionali", "national-championships" to "Campionati Nazionali",
        "winner" to "Vincitore", "horizons" to "Horizons")

    private fun promoLabel(type: String, foil: String, stamps: List<String>): String {
        val f = foil.lowercase()
        val parts = ArrayList<String>()
        if (type.lowercase().startsWith("rev")) parts.add("Reverse")
        when {
            f.contains("cosm") -> parts.add("Cosmo Holo")
            f.contains("galax") || f.contains("galass") -> parts.add("Galassia Holo")
            f.isNotBlank() -> parts.add(foil)
        }
        if (stamps.isNotEmpty()) parts.add("timbro " + stamps.joinToString(", ") { STAMP_IT[it.lowercase()] ?: it.replace('-', ' ') })
        return parts.joinToString(" ").ifEmpty { "Promo" }
    }

    /** Solo dalla memoria o dai file già scaricati (non va su internet). */
    fun cached(ctx: Context, lang: String, cardId: String): CardVars? {
        if (cardId.isEmpty() || none.containsKey(cardId)) return null
        mem[cardId]?.let { return it }
        for (l in listOf(lang, "en").distinct()) {
            val s = CardRepo.cardFile(ctx, l, cardId) ?: continue
            val cv = try { parse(JSONObject(s)) } catch (_: Exception) { null } ?: continue
            mem[cardId] = cv
            return cv
        }
        return null
    }

    /** Legge le varianti da TCGdex (prima la copia salvata se ha meno di 14 giorni). */
    fun load(ctx: Context, lang: String, cardId: String): CardVars? {
        if (cardId.isEmpty()) return null
        mem[cardId]?.let { return it }
        for (l in listOf(lang, "en").distinct()) {
            val o = CardRepo.card(ctx, l, cardId, 14L * 86400_000L) ?: continue
            val cv = parse(o) ?: continue
            mem[cardId] = cv
            none.remove(cardId)
            return cv
        }
        none[cardId] = true
        return null
    }

    /** La variante della carta per la modalità scelta (null = la carta non ce l'ha). */
    fun pick(cv: CardVars, mode: String): VarOpt? = cv.opts.firstOrNull { it.cat == mode }
    /** tutte le varianti della carta per la modalità (le Promo possono essere più di una) */
    fun pickAll(cv: CardVars, mode: String): List<VarOpt> = cv.opts.filter { it.cat == mode }

    @Volatile var progressSet = ""
    private val doneN = AtomicInteger(0)
    val done get() = doneN.get()
    @Volatile var total = 0

    /** Scarica in sottofondo le varianti di tutte le carte del set (4 alla volta), così durante la scansione non serve aspettare. */
    suspend fun prefetch(ctx: Context, lang: String, sd: SetData) {
        val ids = sd.cards.values.map { it.id }.filter { it.isNotEmpty() }.distinct()
        progressSet = "$lang|${sd.id}"; total = ids.size; doneN.set(0)
        val sem = Semaphore(4)
        none.clear()
        coroutineScope {
            ids.map { id -> async(Dispatchers.IO) { sem.withPermit { try { load(ctx, lang, id) } catch (_: Exception) { null }; doneN.incrementAndGet() } } }.awaitAll()
        }
    }

    /** Modalità che esistono nel set (dalle carte già lette) e quante carte sono state lette. */
    fun setModes(ctx: Context, lang: String, sd: SetData): Pair<List<String>, Int> {
        val cats = HashSet<String>()
        var known = 0
        var plainRev = false
        for (c in sd.cards.values) {
            if (c.id.isNotEmpty() && none.containsKey(c.id)) { known++; continue }   // già guardata: nessuna variante su TCGdex
            val cv = cached(ctx, lang, c.id) ?: continue
            known++
            if (cv.plainRev) plainRev = true
            cv.opts.forEach { cats.add(it.cat) }
        }
        val modes = ArrayList<String>()
        modes.add(N)
        if (plainRev || known == 0) modes.add(R)
        SPECIAL.filter { it in cats }.forEach { modes.add(it) }
        return modes to known
    }
}
