package it.pokescanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.widget.ImageView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Carica immagini da internet (carte e loghi TCGdex) con cache in memoria e su disco. */
object ImageLoader {
    private val mem = LruCache<String, Bitmap>(120)

    /** Prova gli indirizzi in ordine e mostra il primo che funziona. */
    fun load(ctx: Context, scope: CoroutineScope, iv: ImageView, vararg urls: String) {
        val list = urls.filter { it.isNotBlank() }
        val key = list.joinToString("|")
        iv.tag = key
        if (list.isEmpty()) { iv.setImageDrawable(null); return }
        list.firstNotNullOfOrNull { mem.get(it) }?.let { iv.setImageBitmap(it); return }
        iv.setImageDrawable(null)
        val app = ctx.applicationContext
        scope.launch {
            val bmp = withContext(Dispatchers.IO) { list.firstNotNullOfOrNull { fetch(app, it) } }
            if (bmp != null && iv.tag == key) iv.setImageBitmap(bmp)
        }
    }

    private fun fetch(ctx: Context, url: String): Bitmap? {
        mem.get(url)?.let { return it }
        val dir = File(ctx.cacheDir, "img").apply { mkdirs() }
        val f = File(dir, url.hashCode().toUInt().toString(16) + ".bin")
        try {
            if (!f.exists() || f.length() == 0L) {
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 8000
                c.readTimeout = 15000
                c.setRequestProperty("User-Agent", "CardScanner-Android")
                if (c.responseCode != 200) return null
                c.inputStream.use { inp -> f.outputStream().use { inp.copyTo(it) } }
            }
            val bmp = BitmapFactory.decodeFile(f.absolutePath) ?: run { f.delete(); return null }
            mem.put(url, bmp)
            return bmp
        } catch (_: Exception) {
            f.delete()
            return null
        }
    }

    /** Immagine piccola di una carta TCGdex (indirizzo base senza estensione). */
    fun cardUrls(base: String): Array<String> =
        if (base.isBlank()) emptyArray()
        else arrayOf("$base/low.png", base.replace(Regex("(assets\\.tcgdex\\.net/)[a-z-]+/"), "$1en/") + "/low.png")
}
