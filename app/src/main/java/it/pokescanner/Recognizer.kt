package it.pokescanner

import android.graphics.Rect
import com.google.mlkit.vision.text.Text
import java.nio.ByteBuffer
import java.text.Normalizer
import kotlin.math.max

/** Trova le righe "numero/totale" nel testo letto da ML Kit e le confronta con il set scelto. */
object Recognizer {
    data class Line(val text: String, val box: Rect?, val words: List<Pair<String, Rect?>>)
    /** reverse: true = stemma sigla chiaro (Reverse Holo), false = scuro (normale), null = non deciso */
    data class Hit(val num: String, val total: String, val box: Rect?, val codeBox: Rect?, var reverse: Boolean? = null)
    data class Scan(val good: List<Hit>, val bad: List<Hit>)

    // Sottoserie: TG05/TG30, GG12/GG70
    private val SUB = Regex("([A-Z]{2})\\s?(\\d{1,3})\\s*[/|]\\s*\\1\\s?(\\d{1,3})")
    // Normale: 123/198 (anche con spazi)
    private val NUM = Regex("(?<![0-9])(\\d{1,3})\\s*[/|]\\s*(\\d{2,3})(?![0-9])")
    // Sigla del set: 3-4 caratteri, almeno 2 lettere (SVI, PAF, MEW, MEG…). Le lingue (IT, EN) hanno 2 lettere.
    private val CODE = Regex("^[A-Z][A-Z0-9]{2,3}$")

    fun lines(text: Text): List<Line> =
        text.textBlocks.flatMap { b ->
            b.lines.map { l -> Line(l.text, l.boundingBox, l.elements.map { it.text to it.boundingBox }) }
        }

    private fun codeBoxOf(ln: Line): Rect? =
        ln.words.firstOrNull { (w, _) ->
            val u = w.uppercase()
            CODE.matches(u) && u.count { it.isLetter() } >= 2
        }?.second

    fun scanLines(lines: List<Line>, set: SetData): Scan {
        val good = ArrayList<Hit>()
        val bad = ArrayList<Hit>()
        for (ln in lines) {
            val t = ln.text.uppercase()
            val used = ArrayList<IntRange>()
            val code = codeBoxOf(ln)
            for (m in SUB.findAll(t)) {
                used.add(m.range)
                val num = m.groupValues[1] + m.groupValues[2]
                val hit = Hit(num, m.groupValues[1] + m.groupValues[3], ln.box, code)
                if (set.cards.isEmpty() || set.cards.containsKey(CardRepo.norm(num))) good.add(hit) else bad.add(hit)
            }
            for (m in NUM.findAll(t)) {
                if (used.any { m.range.first in it }) continue
                val total = m.groupValues[2].toInt()
                val hit = Hit(m.groupValues[1], m.groupValues[2], ln.box, code)
                if (set.total <= 0 || total == set.total) good.add(hit) else bad.add(hit)
            }
        }
        return Scan(good, bad)
    }

    fun scan(text: Text, set: SetData): Scan = scanLines(lines(text), set)

    // ---- Reverse Holo: colore dello stemma della sigla ----

    /**
     * Guarda i pixel del riquadro della sigla: se prevalgono i pixel scuri lo stemma è nero con scritta bianca
     * (carta normale), se prevalgono i chiari è bianco con scritta nera (Reverse Holo).
     * Funziona con qualsiasi luce perché confronta i pixel tra loro, non con una soglia fissa.
     */
    fun isLightBadge(r0: Rect, lum: (Int, Int) -> Int, w: Int, h: Int): Boolean? {
        val padY = r0.height() / 8
        val l = r0.left.coerceIn(0, w - 1)
        val rr = r0.right.coerceIn(0, w)
        val t = (r0.top - padY).coerceIn(0, h - 1)
        val b = (r0.bottom + padY).coerceIn(0, h)
        if (rr - l < 4 || b - t < 4) return null
        val sx = max(1, (rr - l) / 60)
        val sy = max(1, (b - t) / 30)
        val vals = ArrayList<Int>()
        var y = t
        while (y < b) {
            var x = l
            while (x < rr) { vals.add(lum(x, y)); x += sx }
            y += sy
        }
        if (vals.size < 20) return null
        vals.sort()
        val p5 = vals[vals.size * 5 / 100]
        val p95 = vals[vals.size * 95 / 100]
        if (p95 - p5 < 40) return null // niente contrasto: non si capisce
        val mid = (p5 + p95) / 2
        val darkFrac = vals.count { it < mid }.toDouble() / vals.size
        return when {
            darkFrac > 0.56 -> false
            darkFrac < 0.44 -> true
            else -> null
        }
    }

    /** Luminosità dal piano Y della fotocamera, con coordinate dell'immagine già raddrizzata. */
    class YPlane(
        private val buf: ByteBuffer, private val rowStride: Int, private val pixStride: Int,
        private val w: Int, private val h: Int, private val rot: Int
    ) {
        fun lum(x: Int, y: Int): Int {
            val rx: Int
            val ry: Int
            when (rot) {
                90 -> { rx = y; ry = h - 1 - x }
                180 -> { rx = w - 1 - x; ry = h - 1 - y }
                270 -> { rx = w - 1 - y; ry = x }
                else -> { rx = x; ry = y }
            }
            if (rx < 0 || ry < 0 || rx >= w || ry >= h) return 0
            val i = ry * rowStride + rx * pixStride
            if (i >= buf.limit()) return 0
            return buf.get(i).toInt() and 0xFF
        }
    }

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

    fun nameInLines(lines: List<Line>, expected: String): Boolean =
        lines.any { nameMatch(it.text, expected) } || nameMatch(lines.joinToString(" ") { it.text }, expected)
}
