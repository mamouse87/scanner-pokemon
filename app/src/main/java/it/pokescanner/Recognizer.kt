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
     * Confronta le lettere della sigla con lo sfondo dello stemma subito sopra e sotto il testo.
     * Lettere più chiare dello sfondo = stemma nero, scritta bianca (normale).
     * Lettere più scure dello sfondo = stemma bianco, scritta nera (Reverse Holo).
     * Non dipende dallo spessore delle lettere né dalla luce.
     */
    fun isLightBadge(r: Rect, lum: (Int, Int) -> Int, w: Int, h: Int): Boolean? {
        val bh = r.height()
        val bw = r.width()
        if (bh < 6 || bw < 6) return null
        fun mean(x0: Int, y0: Int, x1: Int, y1: Int): Double? {
            val l = x0.coerceIn(0, w); val rr = x1.coerceIn(0, w)
            val t = y0.coerceIn(0, h); val b = y1.coerceIn(0, h)
            if (rr - l < 2 || b - t < 1) return null
            val sx = max(1, (rr - l) / 40)
            val sy = max(1, (b - t) / 20)
            var sum = 0L; var n = 0
            var y = t
            while (y < b) { var x = l; while (x < rr) { sum += lum(x, y); n++; x += sx }; y += sy }
            return if (n == 0) null else sum.toDouble() / n
        }
        val inner = mean(r.left, r.top, r.right, r.bottom) ?: return null
        val x0 = r.left + bw * 15 / 100
        val x1 = r.right - bw * 15 / 100
        val d0 = max(1, bh * 4 / 100)
        val d1 = max(d0 + 2, bh * 14 / 100)
        val above = mean(x0, r.top - d1, x1, r.top - d0)
        val below = mean(x0, r.bottom + d0, x1, r.bottom + d1)
        val band = when {
            above != null && below != null -> {
                if (kotlin.math.abs(above - below) > 90) return null // sopra e sotto in disaccordo: riquadro impreciso
                (above + below) / 2
            }
            else -> above ?: below ?: return null
        }
        val diff = inner - band
        return when {
            diff < -25 -> true
            diff > 25 -> false
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
