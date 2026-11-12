package it.pokescanner

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.AttributeSet
import android.view.View
import kotlin.math.max

/** Disegna sopra l'anteprima i riquadri delle righe numero riconosciute (verde) o con totale sbagliato (rosso). */
class OverlayView(ctx: Context, attrs: AttributeSet?) : View(ctx, attrs) {
    private var good: List<Rect> = emptyList()
    private var bad: List<Rect> = emptyList()
    private var iw = 1
    private var ih = 1
    private val pGood = Paint().apply { color = Color.rgb(62, 207, 110); style = Paint.Style.STROKE; strokeWidth = 6f }
    private val pBad = Paint().apply { color = Color.rgb(255, 107, 107); style = Paint.Style.STROKE; strokeWidth = 4f }

    fun show(g: List<Rect?>, b: List<Rect?>, w: Int, h: Int) {
        good = g.filterNotNull(); bad = b.filterNotNull(); iw = max(1, w); ih = max(1, h)
        invalidate()
    }

    fun clear() {
        good = emptyList(); bad = emptyList(); invalidate()
    }

    override fun onDraw(c: Canvas) {
        super.onDraw(c)
        // stessa regola di PreviewView (FILL_CENTER): scala per riempire e centra
        val s = max(width.toFloat() / iw, height.toFloat() / ih)
        val ox = (width - iw * s) / 2f
        val oy = (height - ih * s) / 2f
        for (r in bad) c.drawRect(ox + r.left * s, oy + r.top * s, ox + r.right * s, oy + r.bottom * s, pBad)
        for (r in good) c.drawRect(ox + r.left * s - 4, oy + r.top * s - 4, ox + r.right * s + 4, oy + r.bottom * s + 4, pGood)
    }
}
