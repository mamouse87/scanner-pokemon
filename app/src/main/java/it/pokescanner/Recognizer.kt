package it.pokescanner

import android.graphics.Rect
import com.google.mlkit.vision.text.Text
import java.text.Normalizer

/** Trova le righe "numero/totale" nel testo letto da ML Kit e le confronta con il set scelto. */
object Recognizer {
    data class Hit(val num: String, val total: String, val box: Rect?)
    data class Scan(val good: List<Hit>, val bad: List<Hit>)

    // Sottoserie: TG05/TG30, GG12/GG70
    private val SUB = Regex("([A-Z]{2})\\s?(\\d{1,3})\\s*[/|]\\s*\\1\\s?(\\d{1,3})")
    // Normale: 123/198 (anche con spazi)
    private val NUM = Regex("(?<![0-9])(\\d{1,3})\\s*[/|]\\s*(\\d{2,3})(?![0-9])")

    fun scanLines(lines: List<Pair<String, Rect?>>, set: SetData): Scan {
        val good = ArrayList<Hit>()
        val bad = ArrayList<Hit>()
        for ((raw, box) in lines) {
            val t = raw.uppercase()
            val used = ArrayList<IntRange>()
            for (m in SUB.findAll(t)) {
                used.add(m.range)
                val num = m.groupValues[1] + m.groupValues[2]
                val hit = Hit(num, m.groupValues[1] + m.groupValues[3], box)
                if (set.cards.isEmpty() || set.cards.containsKey(CardRepo.norm(num))) good.add(hit) else bad.add(hit)
            }
            for (m in NUM.findAll(t)) {
                if (used.any { m.range.first in it }) continue
                val total = m.groupValues[2].toInt()
                val hit = Hit(m.groupValues[1], m.groupValues[2], box)
                if (set.total <= 0 || total == set.total) good.add(hit) else bad.add(hit)
            }
        }
        return Scan(good, bad)
    }

    fun lines(text: Text): List<Pair<String, Rect?>> =
        text.textBlocks.flatMap { b -> b.lines.map { it.text to it.boundingBox } }

    fun scan(text: Text, set: SetData): Scan = scanLines(lines(text), set)

    // ---- verifica nome ----
    private val MARKS = Regex("\\p{Mn}+")
    private val NON_ALNUM = Regex("[^A-Z0-9]")

    fun simp(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(MARKS, "").uppercase().replace(NON_ALNUM, "")

    private fun lev(a: String, b: String): Int {
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var prev = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1)
            cur[0] = i
            for (j in 1..b.length) {
                cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            }
            prev = cur
        }
        return prev[b.length]
    }

    /** Usa la parola più lunga del nome (es. "Charizard" in "Charizard ex") e tollera qualche lettera sbagliata. */
    fun nameMatch(read: String, expected: String): Boolean {
        val key = expected.split(Regex("[\\s\\-]+")).map { simp(it) }.filter { it.length >= 3 }
            .maxByOrNull { it.length } ?: simp(expected)
        if (key.isEmpty()) return true
        val r = simp(read)
        if (r.contains(key)) return true
        var best = 0.0
        for (i in 0..maxOf(0, r.length - key.length)) {
            for (len in intArrayOf(key.length - 1, key.length, key.length + 1)) {
                if (len < 1 || i >= r.length) continue
                val sub = r.substring(i, minOf(r.length, i + len))
                val score = 1.0 - lev(sub, key).toDouble() / maxOf(sub.length, key.length)
                if (score > best) best = score
            }
        }
        return best >= 0.7
    }

    fun nameInLines(lines: List<Pair<String, Rect?>>, expected: String): Boolean =
        lines.any { nameMatch(it.first, expected) } || nameMatch(lines.joinToString(" ") { it.first }, expected)
}
