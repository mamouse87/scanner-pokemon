package it.pokescanner

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.AttributeSet
import android.view.View
import kotlin.math.max

/**
 * Disegna sopra l'anteprima: verde = riga numero valida, rosso = totale sbagliato,
 * stemma sigla: azzurro = normale, viola = Reverse, grigio = non deciso.
 */
class OverlayView(ctx: Context, attrs: AttributeSet?) : View(ctx, attrs) {
    private var scan: Recognizer.Scan? = null
    private var iw = 1
    private var ih = 1
    private val pGood = Paint().apply { color = Color.rgb(62, 207, 110); style = Paint.Style.STROKE; strokeWidth = 6f }
    private val pBad = Paint().apply { color = Color.rgb(255, 107, 107); style = Paint.Style.STROKE; strokeWidth = 4f }

    companion object {
        val NORMAL = Color.rgb(77, 171, 247)
        val REVERSE = Color.rgb(204, 93, 232)
        val UNKNOWN = Color.rgb(150, 150, 150)
        fun codeColor(r: Boolean?) = when (r) { true -> REVERSE; false -> NORMAL; null -> UNKNOWN }
    }

    private val pCode = Paint().apply { style = Paint.Style.STROKE; strokeWidth = 5f }

    fun show(s: Recognizer.Scan, w: Int, h: Int) {
        scan = s; iw = max(1, w); ih = max(1, h)
        invalidate()
    }

    fun clear() { scan = null; invalidate() }

    override fun onDraw(c: Canvas) {
        super.onDraw(c)
        val s0 = scan ?: return
        // stessa regola di PreviewView (FILL_CENTER): scala per riempire e centra
        val s = max(width.toFloat() / iw, height.toFloat() / ih)
        val ox = (width - iw * s) / 2f
        val oy = (height - ih * s) / 2f
        fun rect(r: Rect, p: Paint, grow: Float = 0f) =
            c.drawRect(ox + r.left * s - grow, oy + r.top * s - grow, ox + r.right * s + grow, oy + r.bottom * s + grow, p)
        s0.bad.forEach { h -> h.box?.let { rect(it, pBad) } }
        s0.good.forEach { h ->
            h.box?.let { rect(it, pGood, 6f) }
            h.codeBox?.let { pCode.color = codeColor(h.reverse); rect(it, pCode) }
        }
    }
}
