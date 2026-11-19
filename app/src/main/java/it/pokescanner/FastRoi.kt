package it.pokescanner

import android.graphics.Rect
import androidx.camera.core.ImageProxy
import kotlin.math.max
import kotlin.math.min

/**
 * Lettura veloce: invece di leggere tutta l'immagine, legge solo la fascia dove ha trovato il numero
 * nell'ultima carta (in basso) oppure la stessa fascia capovolta (in alto, carta girata).
 * Ogni tanto legge comunque l'immagine intera, così se cambi zoom o posizione impara la fascia nuova.
 * Coordinate "dritte": quelle dell'immagine già ruotata come la vedi (larghezza w, altezza h).
 */
class FastRoi {
    /** fascia attiva e fascia capovolta, in frazioni dell'altezza (0..1) */
    private var a: FloatArray? = null
    private var frame = 0
    private var miss = 0

    @Synchronized fun reset() { a = null; miss = 0; frame = 0 }

    /** Zona da leggere in questo fotogramma (coordinate dritte), oppure null = immagine intera. */
    @Synchronized fun next(w: Int, h: Int): Rect? {
        frame++
        val f = a ?: return null
        if (frame % 10 == 0 || miss >= 5) { if (miss >= 5) miss = 2; return null }   // controllo completo ogni tanto
        // dopo 2 fotogrammi senza numero alterno la fascia capovolta (carta girata) e quella solita
        val band = if (miss >= 2 && miss % 2 == 0) mirror(f) else f
        return Rect(0, (band[0] * h).toInt(), w, (band[1] * h).toInt())
    }

    /** Risultato del fotogramma: dove sono stati trovati i numeri buoni (coordinate dritte). */
    @Synchronized fun update(boxes: List<Rect>, used: Rect?, w: Int, h: Int) {
        if (boxes.isEmpty()) { if (used != null || a != null) miss++; return }
        // fascia intorno al numero: 3 volte la sua altezza sopra e sotto, almeno il 7% dell'immagine
        val b = boxes.first()
        val half = max(b.height() * 3, (h * 0.07f).toInt())
        val cy = b.centerY()
        a = floatArrayOf(max(0, cy - half).toFloat() / h, min(h, cy + half).toFloat() / h)
        miss = 0
    }

    private fun mirror(f: FloatArray) = floatArrayOf(1f - f[1], 1f - f[0])

    companion object {
        /**
         * Ritaglia dal fotogramma (YUV della fotocamera, non ruotato) la zona che nell'immagine dritta è [r].
         * Restituisce i dati NV21, la loro larghezza e altezza e l'angolo in alto a sinistra della zona
         * nell'immagine dritta (per riportare le posizioni lette da ML Kit sull'immagine intera).
         */
        fun crop(proxy: ImageProxy, r: Rect, rot: Int): Crop? {
            val W = proxy.width; val H = proxy.height
            // zona nel fotogramma non ruotato
            var bx: Int; var by: Int; var bw: Int; var bh: Int
            when (rot) {
                90 -> { bx = r.top; by = H - r.right; bw = r.height(); bh = r.width() }
                180 -> { bx = W - r.right; by = H - r.bottom; bw = r.width(); bh = r.height() }
                270 -> { bx = W - r.bottom; by = r.left; bw = r.height(); bh = r.width() }
                else -> { bx = r.left; by = r.top; bw = r.width(); bh = r.height() }
            }
            // dentro il fotogramma e con coordinate pari (il colore è a metà risoluzione)
            bx = bx.coerceIn(0, W - 2) and 1.inv(); by = by.coerceIn(0, H - 2) and 1.inv()
            bw = min(bw, W - bx) and 1.inv(); bh = min(bh, H - by) and 1.inv()
            if (bw < 32 || bh < 32) return null
            val pl = proxy.planes
            val yP = pl[0]; val uP = pl[1]; val vP = pl[2]
            val out = ByteArray(bw * bh * 3 / 2)
            val yb = yP.buffer.duplicate(); val ys = yP.rowStride; val yps = yP.pixelStride
            var o = 0
            for (row in 0 until bh) {
                val base = (by + row) * ys + bx * yps
                if (yps == 1) { yb.position(base); yb.get(out, o, bw); o += bw }
                else for (c in 0 until bw) out[o++] = yb.get(base + c * yps)
            }
            val ub = uP.buffer; val vb = vP.buffer
            val urs = uP.rowStride; val ups = uP.pixelStride; val vrs = vP.rowStride; val vps = vP.pixelStride
            for (row in 0 until bh / 2) {
                val sy = by / 2 + row
                for (c in 0 until bw / 2) {
                    val sx = bx / 2 + c
                    out[o++] = vb.get(sy * vrs + sx * vps)
                    out[o++] = ub.get(sy * urs + sx * ups)
                }
            }
            // angolo della zona nell'immagine dritta
            val (ux, uy) = when (rot) {
                90 -> (H - by - bh) to bx
                180 -> (W - bx - bw) to (H - by - bh)
                270 -> by to (W - bx - bw)
                else -> bx to by
            }
            val upright = if (rot == 90 || rot == 270) Rect(ux, uy, ux + bh, uy + bw) else Rect(ux, uy, ux + bw, uy + bh)
            return Crop(out, bw, bh, ux, uy, upright)
        }
    }

    class Crop(val nv21: ByteArray, val w: Int, val h: Int, val dx: Int, val dy: Int, val rect: Rect)
}
