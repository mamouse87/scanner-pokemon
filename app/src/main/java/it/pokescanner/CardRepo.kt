package it.pokescanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class SetInfo(val id: String, val name: String, val official: Int)
data class CardInfo(val id: String, val localId: String, val name: String, val image: String = "")
class SetData(
    val id: String, val name: String, val total: Int, val cards: Map<String, CardInfo>,
    val logo: String = "", val symbol: String = "",
    /** carte oltre il numero ufficiale (fuoriserie / segrete) */
    val extra: Int = 0
)

/** Dati carte da TCGdex (gratuito, anche in italiano). Ogni risposta viene salvata: offline usa la copia. */
object CardRepo {
    private const val API = "https://api.tcgdex.net/v2"

    /** "045" -> "45", "TG05" -> "TG05" */
    fun norm(n: String): String =
        if (n.isNotEmpty() && n.all { it.isDigit() }) n.trimStart('0').ifEmpty { "0" } else n.uppercase()

    fun pad(n: String): String =
        if (n.isNotEmpty() && n.all { it.isDigit() }) n.padStart(3, '0') else n

    private fun get(ctx: Context, path: String, cacheName: String): String {
        val f = File(ctx.filesDir, cacheName.replace(Regex("[^A-Za-z0-9._-]"), "_"))
        try {
            val c = URL(API + path).openConnection() as HttpURLConnection
            c.connectTimeout = 8000
            c.readTimeout = 15000
            c.setRequestProperty("User-Agent", "CardScanner-Android")
            if (c.responseCode == 200) {
                val s = c.inputStream.bufferedReader().use { it.readText() }
                f.writeText(s)
                return s
            }
        } catch (_: Exception) {
        }
        if (f.exists()) return f.readText()
        throw IOException("offline")
    }

    fun sets(ctx: Context, lang: String): List<SetInfo> {
        val a = JSONArray(get(ctx, "/$lang/sets", "sets_$lang.json"))
        val out = ArrayList<SetInfo>()
        for (i in 0 until a.length()) {
            val o = a.getJSONObject(i)
            val official = o.optJSONObject("cardCount")?.optInt("official", 0) ?: 0
            out.add(SetInfo(o.getString("id"), o.optString("name", o.getString("id")), official))
        }
        return out.reversed() // i più recenti in alto
    }

    private fun parseCards(o: JSONObject): HashMap<String, CardInfo> {
        val cards = HashMap<String, CardInfo>()
        val arr = o.optJSONArray("cards") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            val local = c.optString("localId", "")
            if (local.isEmpty()) continue
            cards[norm(local)] = CardInfo(c.optString("id", ""), local, c.optString("name", ""), c.optString("image", ""))
        }
        return cards
    }

    fun set(ctx: Context, lang: String, id: String): SetData {
        val enc = URLEncoder.encode(id, "UTF-8")
        val o = JSONObject(get(ctx, "/$lang/sets/$enc", "set_${lang}_$id.json"))
        val cards = parseCards(o)
        var logo = o.optString("logo", "")
        var total = o.optJSONObject("cardCount")?.optInt("official", 0) ?: 0
        // Per i set nuovi TCGdex in italiano spesso non ha fuoriserie e immagini: le completo dalla versione inglese
        if (lang != "en") {
            try {
                val en = JSONObject(get(ctx, "/en/sets/$enc", "set_en_$id.json"))
                for ((k, c) in parseCards(en)) {
                    val mine = cards[k]
                    if (mine == null) cards[k] = c
                    else if (mine.image.isEmpty() && c.image.isNotEmpty()) cards[k] = mine.copy(image = c.image)
                }
                if (logo.isEmpty()) logo = en.optString("logo", "")
                if (total == 0) total = en.optJSONObject("cardCount")?.optInt("official", 0) ?: 0
            } catch (_: Exception) {
            }
        }
        val extra = if (total > 0) cards.keys.count { k -> k.toIntOrNull()?.let { it > total } ?: false } else 0
        return SetData(o.getString("id"), o.optString("name", id), total, cards, logo, o.optString("symbol", ""), extra)
    }

    /** Rarità in italiano (TCGdex inglese tradotto, se la carta non c'è in italiano) */
    private val RAR_IT = mapOf(
        "common" to "Comune", "uncommon" to "Non comune", "rare" to "Rara", "rare holo" to "Rara holo", "holo rare" to "Rara holo",
        "double rare" to "Doppia rara", "ultra rare" to "Ultra rara", "illustration rare" to "Rara illustrazione",
        "special illustration rare" to "Rara illustrazione speciale", "hyper rare" to "Iper rara", "secret rare" to "Rara segreta",
        "ace spec rare" to "Rara ASSO TATTICO", "shiny rare" to "Rara cromatica", "shiny ultra rare" to "Ultra rara cromatica",
        "mega hyper rare" to "Mega iper rara", "black white rare" to "Rara bianco nero", "none" to ""
    )
    fun rarityIt(r: String): String = RAR_IT[r.trim().lowercase()] ?: r

    fun rarity(ctx: Context, lang: String, cardId: String): String? {
        val enc = try { URLEncoder.encode(cardId, "UTF-8") } catch (_: Exception) { return null }
        for (l in listOf(lang, "en").distinct()) {
            try {
                val r = JSONObject(get(ctx, "/$l/cards/$enc", "card_${l}_$cardId.json")).optString("rarity", "")
                if (r.isNotEmpty()) return rarityIt(r)
            } catch (_: Exception) {
            }
        }
        return null
    }
}
