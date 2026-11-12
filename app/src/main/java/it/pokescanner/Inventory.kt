package it.pokescanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class Item(
    val lang: String,
    val setId: String,
    val setName: String,
    val total: Int,
    val num: String,
    var name: String,
    val cardId: String,
    var rarity: String,
    var qty: Int
)

data class Group(val lang: String, val setName: String, val total: Int, val items: List<Pair<String, Item>>)

/** Lista delle carte catalogate, salvata sul telefono. Le carte doppie si sommano. */
object Inventory {
    val items = LinkedHashMap<String, Item>()
    private val history = ArrayDeque<String>()

    val LANG_NAMES = mapOf(
        "it" to "Italiano", "en" to "Inglese", "fr" to "Francese", "de" to "Tedesco",
        "es" to "Spagnolo", "pt" to "Portoghese", "ja" to "Giapponese"
    )

    fun key(lang: String, setId: String, num: String) = "$lang|$setId|$num"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("inventory", Context.MODE_PRIVATE)

    fun load(ctx: Context) {
        items.clear()
        val s = prefs(ctx).getString("data", null) ?: return
        try {
            val a = JSONArray(s)
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                val item = Item(
                    o.getString("lang"), o.getString("setId"), o.optString("setName"), o.optInt("total"),
                    o.getString("num"), o.optString("name"), o.optString("cardId"), o.optString("rarity"),
                    o.optInt("qty", 1)
                )
                items[key(item.lang, item.setId, item.num)] = item
            }
        } catch (_: Exception) {
        }
    }

    fun save(ctx: Context) {
        val a = JSONArray()
        for (i in items.values) {
            a.put(
                JSONObject()
                    .put("lang", i.lang).put("setId", i.setId).put("setName", i.setName).put("total", i.total)
                    .put("num", i.num).put("name", i.name).put("cardId", i.cardId).put("rarity", i.rarity)
                    .put("qty", i.qty)
            )
        }
        prefs(ctx).edit().putString("data", a.toString()).apply()
    }

    /** Aggiunge una copia. Restituisce la chiave e la voce aggiornata. */
    fun add(ctx: Context, lang: String, set: SetData, num: String, persist: Boolean = true): Pair<String, Item> {
        val n = CardRepo.norm(num)
        val k = key(lang, set.id, n)
        val card = set.cards[n]
        val item = items.getOrPut(k) {
            Item(lang, set.id, set.name, set.total, n, card?.name ?: "", card?.id ?: "", "", 0)
        }
        item.qty++
        history.addLast(k)
        if (persist) save(ctx)
        return k to item
    }

    fun change(ctx: Context, k: String, d: Int) {
        val item = items[k] ?: return
        item.qty += d
        if (item.qty <= 0) items.remove(k)
        save(ctx)
    }

    fun undo(ctx: Context): Item? {
        while (history.isNotEmpty()) {
            val k = history.removeLast()
            val item = items[k] ?: continue
            change(ctx, k, -1)
            return item
        }
        return null
    }

    fun setRarity(ctx: Context, k: String, r: String) {
        items[k]?.let { it.rarity = r; save(ctx) }
    }

    fun clear(ctx: Context) {
        items.clear(); history.clear(); save(ctx)
    }

    fun count() = items.values.sumOf { it.qty }

    fun groups(): List<Group> =
        items.entries.groupBy { it.value.lang + "|" + it.value.setId }.values.map { es ->
            val f = es.first().value
            Group(
                f.lang, f.setName, f.total,
                es.map { it.key to it.value }
                    .sortedWith(compareBy({ it.second.num.toIntOrNull() ?: Int.MAX_VALUE }, { it.second.num }))
            )
        }

    fun text(): String {
        val sb = StringBuilder()
        sb.append("Lotto di ${count()} carte Pokémon (${items.size} diverse)\n")
        for (g in groups()) {
            val n = g.items.sumOf { it.second.qty }
            sb.append("\n${g.setName} – ${LANG_NAMES[g.lang] ?: g.lang} – $n carte\n")
            for ((_, i) in g.items) {
                sb.append("• ${CardRepo.pad(i.num)}/${if (i.total > 0) i.total else "?"} ${i.name}")
                if (i.rarity.isNotEmpty()) sb.append(" – ${i.rarity}")
                if (i.qty > 1) sb.append(" ×${i.qty}")
                sb.append('\n')
            }
        }
        return sb.toString()
    }

    fun csv(): String {
        fun q(v: Any?) = "\"" + (v?.toString() ?: "").replace("\"", "\"\"") + "\""
        val sb = StringBuilder("﻿")
        sb.append(listOf("Lingua", "Set", "Numero", "Totale set", "Nome", "Rarità", "Quantità").joinToString(";") { q(it) })
        sb.append('\n')
        for (g in groups()) for ((_, i) in g.items) {
            sb.append(
                listOf(i.lang.uppercase(), i.setName, CardRepo.pad(i.num), if (i.total > 0) i.total else "", i.name, i.rarity, i.qty)
                    .joinToString(";") { q(it) }
            )
            sb.append('\n')
        }
        return sb.toString()
    }
}
