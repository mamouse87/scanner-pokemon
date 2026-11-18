package it.pokescanner

import android.content.ClipData
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.io.File
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ListActivity : AppCompatActivity() {

    private sealed class Row {
        data class Header(val title: String, val group: Group) : Row()
        data class Card(val key: String, val item: Item) : Row()
        data class Title(val title: String) : Row()
        data class Saved(val list: SavedList) : Row()
    }

    private val rows = ArrayList<Row>()
    private lateinit var adapter: Adapter
    private lateinit var tvSummary: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_list)
        Inventory.ensureLoaded(this)
        SavedLists.load(this)
        tvSummary = findViewById(R.id.tvSummary)
        val rv = findViewById<RecyclerView>(R.id.rv)
        rv.layoutManager = LinearLayoutManager(this)
        adapter = Adapter()
        rv.adapter = adapter

        findViewById<Button>(R.id.btnCatalog).setOnClickListener { makeCatalog(it as Button) }
        findViewById<Button>(R.id.btnCollection).setOnClickListener { sendAllDialog() }
        findViewById<Button>(R.id.btnClear).setOnClickListener {
            AlertDialog.Builder(this).setMessage("Svuotare tutta la lista?")
                .setPositiveButton("Svuota") { _, _ -> Inventory.clear(this); refresh() }
                .setNegativeButton("Annulla", null).show()
        }
        refresh()
        fillImages()
    }

    /** Carte aggiunte con versioni precedenti dell'app: recupero l'immagine dai dati del set già salvati. */
    private fun fillImages() {
        val missing = Inventory.items.values.filter { it.img.isEmpty() }.map { it.lang to it.setId }.distinct()
        if (missing.isEmpty()) return
        lifecycleScope.launch {
            var changed = false
            withContext(Dispatchers.IO) {
                for ((lang, setId) in missing) {
                    val sd = try { CardRepo.set(this@ListActivity, lang, setId) } catch (_: Exception) { continue }
                    Inventory.items.values.filter { it.lang == lang && it.setId == setId && it.img.isEmpty() }.forEach {
                        val img = sd.cards[it.num]?.image ?: ""
                        if (img.isNotEmpty()) { it.img = img; changed = true }
                        if (it.name.isEmpty()) sd.cards[it.num]?.name?.let { n -> if (n.isNotEmpty()) { it.name = n; changed = true } }
                    }
                }
            }
            if (changed) { Inventory.save(this@ListActivity); refresh() }
        }
    }

    private fun makeCatalog(btn: Button) {
        if (Inventory.items.isEmpty()) { Toast.makeText(this, "Lista vuota", Toast.LENGTH_SHORT).show(); return }
        btn.isEnabled = false
        btn.text = "Creo il catalogo…"
        lifecycleScope.launch {
            val f = withContext(Dispatchers.IO) {
                runCatching {
                    val dir = File(cacheDir, "export").apply { mkdirs() }
                    File(dir, "catalogo-carte.html").apply { writeText(Catalog.build(this@ListActivity), Charsets.UTF_8) }
                }.getOrNull()
            }
            btn.isEnabled = true
            btn.text = "🖼 Catalogo"
            if (f == null) { Toast.makeText(this@ListActivity, "Errore nella creazione del catalogo", Toast.LENGTH_LONG).show(); return@launch }
            val uri = FileProvider.getUriForFile(this@ListActivity, "$packageName.files", f)
            AlertDialog.Builder(this@ListActivity)
                .setTitle("Catalogo pronto")
                .setMessage("Pagina con tutte le carte divise per set, con loghi e immagini. Serve internet per vedere le immagini.")
                .setPositiveButton("Apri") { _, _ ->
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "text/html")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        })
                    } catch (e: Exception) {
                        Toast.makeText(this@ListActivity, "Nessun browser per aprirlo: usa Condividi", Toast.LENGTH_LONG).show()
                    }
                }
                .setNeutralButton("Condividi") { _, _ ->
                    startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "text/html"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }, "Invia il catalogo"))
                }
                .setNegativeButton("Chiudi", null)
                .show()
        }
    }

    // ---------------- liste numerate per set ----------------

    private suspend fun codeFor(g: Group): String = withContext(Dispatchers.IO) {
        try { CardRepo.set(this@ListActivity, g.lang, g.items.first().second.setId).code } catch (_: Exception) { "" }
    }

    private fun commentField(): android.widget.EditText = android.widget.EditText(this).apply {
        hint = "Commento per Cardmarket (facoltativo)"
        setText(getSharedPreferences("app", MODE_PRIVATE).getString("cmComment", ""))
        isSingleLine = true
    }

    private fun box(vararg v: View) = android.widget.LinearLayout(this).apply {
        orientation = android.widget.LinearLayout.VERTICAL
        setPadding(48, 16, 48, 0)
        v.forEach { addView(it) }
    }

    /** Tocco sul nome di un set: chiudi le carte in una lista numerata (ed eventualmente inviala). */
    private fun groupDialog(g: Group) {
        lifecycleScope.launch {
            val code = codeFor(g)
            val first = g.items.first().second
            if (isFinishing || isDestroyed) return@launch
            val next = SavedLists.peekN(this@ListActivity, g.lang, first.setId)
            val name = "${code.ifEmpty { first.setId.uppercase().replace(Regex("[^A-Z0-9]"), "") }}-${SavedLists.compact(g.setName)}${next.toString().padStart(3, '0')}"
            val n = g.items.sumOf { it.second.qty }
            val rev = g.items.filter { it.second.variant == "R" }.sumOf { it.second.qty }
            val et = commentField()
            val info = TextView(this@ListActivity).apply {
                text = "$n carte ($rev Reverse).\n\nChiudendo la lista le carte diventano la lista \"$name\" e la scansione di questo set riparte da zero. " +
                    "Le liste chiuse le trovi in fondo, in \"Liste salvate\", e le mandi tutte insieme con \"📤 Invia liste al gestionale\"."
                setPadding(0, 0, 0, 16)
            }
            AlertDialog.Builder(this@ListActivity)
                .setTitle("${g.setName} (${Inventory.LANG_NAMES[g.lang] ?: g.lang})")
                .setView(box(info, et))
                .setPositiveButton("Chiudi lista") { _, _ ->
                    saveComment(et)
                    val l = SavedLists.closeGroup(this@ListActivity, g, code, et.text.toString())
                    Toast.makeText(this@ListActivity, "Lista ${l.id} salvata", Toast.LENGTH_SHORT).show()
                    refresh()
                }
                .setNeutralButton("Chiudi e invia") { _, _ ->
                    saveComment(et)
                    val l = SavedLists.closeGroup(this@ListActivity, g, code, et.text.toString())
                    refresh()
                    shareLists(listOf(l))
                }
                .setNegativeButton("Annulla", null)
                .show()
        }
    }

    private fun saveComment(et: android.widget.EditText) =
        getSharedPreferences("app", MODE_PRIVATE).edit().putString("cmComment", et.text.toString()).apply()

    /** 📤: chiude tutte le carte in corso (una lista per set) e manda insieme tutte le liste non ancora inviate. */
    private fun sendAllDialog() {
        val groups = Inventory.groups()
        val pending = SavedLists.unsent()
        if (groups.isEmpty() && pending.isEmpty()) {
            Toast.makeText(this, "Niente da inviare: tutte le liste sono già state inviate", Toast.LENGTH_LONG).show()
            return
        }
        val et = commentField()
        val sb = StringBuilder()
        if (groups.isNotEmpty()) {
            sb.append("Le carte in corso diventano nuove liste (una per set):\n")
            groups.forEach { g -> sb.append("• ${g.setName}: ${g.items.sumOf { it.second.qty }} carte\n") }
            sb.append('\n')
        }
        if (pending.isNotEmpty()) {
            sb.append("Liste salvate non ancora inviate:\n")
            pending.forEach { sb.append("• ${it.id}.txt (${it.copies} carte)\n") }
            sb.append('\n')
        }
        sb.append("Tutti i file partono insieme. Sul PC caricali nel gestionale (Carica → Liste dall'app, anche tutti insieme): ognuno va nello Standby del suo set.")
        val views = ArrayList<View>()
        views.add(TextView(this).apply { text = sb.toString(); setPadding(0, 0, 0, 16) })
        if (groups.isNotEmpty()) views.add(et)
        AlertDialog.Builder(this)
            .setTitle("Invia liste al gestionale")
            .setView(android.widget.ScrollView(this).apply { addView(box(*views.toTypedArray())) })
            .setPositiveButton("Invia") { _, _ ->
                saveComment(et)
                lifecycleScope.launch {
                    for (g in groups) SavedLists.closeGroup(this@ListActivity, g, codeFor(g), et.text.toString())
                    refresh()
                    shareLists(SavedLists.unsent())
                }
            }
            .setNegativeButton("Annulla", null)
            .show()
    }

    /** Manda i file .txt (uno per lista) in un colpo solo: Bluetooth, email, Drive, WhatsApp… */
    private fun shareLists(ls: List<SavedList>) {
        if (ls.isEmpty()) return
        val dir = File(cacheDir, "export").apply { mkdirs() }
        val uris = ArrayList<android.net.Uri>()
        for (l in ls) {
            val f = File(dir, "${l.id}.txt").apply { writeText(l.text, Charsets.UTF_8) }
            uris.add(FileProvider.getUriForFile(this, "$packageName.files", f))
        }
        val intent = if (uris.size == 1) Intent(Intent.ACTION_SEND).apply { putExtra(Intent.EXTRA_STREAM, uris[0]) }
                     else Intent(Intent.ACTION_SEND_MULTIPLE).apply { putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris) }
        intent.type = "text/plain"
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = ClipData.newRawUri("lista", uris[0]).also { c -> uris.drop(1).forEach { c.addItem(ClipData.Item(it)) } }
        startActivity(Intent.createChooser(intent, if (uris.size == 1) "Invia ${ls[0].id}.txt" else "Invia ${uris.size} liste al PC"))
        SavedLists.markSent(this, ls)
        refresh()
    }

    private fun savedDialog(l: SavedList) {
        val df = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.ITALY)
        AlertDialog.Builder(this)
            .setTitle("${l.id}.txt")
            .setMessage("${l.setName} · ${l.copies} carte (${l.rows} righe)\nCreata il ${df.format(java.util.Date(l.created))}\n" +
                (if (l.sent > 0) "Inviata il ${df.format(java.util.Date(l.sent))}" else "Non ancora inviata") + "\n\n" +
                l.text.lines().filter { Regex("^\\S+ \\| x").containsMatchIn(it) }.joinToString("\n") { it.substringBeforeLast(" | ") })
            .setPositiveButton(if (l.sent > 0) "Invia di nuovo" else "Invia") { _, _ -> shareLists(listOf(l)) }
            .setNeutralButton("Elimina") { _, _ ->
                AlertDialog.Builder(this).setMessage("Eliminare la lista ${l.id}? (il suo numero non verrà riusato)")
                    .setPositiveButton("Elimina") { _, _ -> SavedLists.delete(this, l); refresh() }
                    .setNegativeButton("Annulla", null).show()
            }
            .setNegativeButton("Chiudi", null)
            .show()
    }

    @Suppress("unused")
    private fun refresh() {
        rows.clear()
        for (g in Inventory.groups()) {
            val n = g.items.sumOf { it.second.qty }
            rows.add(Row.Header("${g.setName} · ${g.lang.uppercase()} · $n carte  ›  (tocca per chiudere la lista)", g))
            g.items.forEach { (k, i) -> rows.add(Row.Card(k, i)) }
        }
        if (SavedLists.lists.isNotEmpty()) {
            val un = SavedLists.unsent().size
            rows.add(Row.Title("Liste salvate (${SavedLists.lists.size}${if (un > 0) ", $un da inviare" else ""})"))
            SavedLists.lists.sortedWith(compareBy({ it.sent != 0L }, { it.setName }, { it.n })).forEach { rows.add(Row.Saved(it)) }
        }
        val tot = Inventory.count()
        val un = SavedLists.unsent().size
        tvSummary.text = (if (tot == 0) "Nessuna carta in corso" else "$tot carte in corso (${Inventory.items.size} diverse)") +
            (if (un > 0) " · $un liste da inviare" else "")
        adapter.notifyDataSetChanged()
    }

    private inner class Adapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount() = rows.size
        override fun getItemViewType(position: Int) = when (rows[position]) { is Row.Card -> 1; is Row.Saved -> 2; else -> 0 }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            if (viewType == 2) {
                val tv = TextView(parent.context).apply { setPadding(16, 18, 8, 18); textSize = 15f }
                return object : RecyclerView.ViewHolder(tv) {}
            }
            return if (viewType == 0) {
                val tv = TextView(parent.context).apply {
                    setPadding(8, 28, 8, 8)
                    textSize = 15f
                    setTypeface(typeface, Typeface.BOLD)
                    setTextColor(0xFFFFCB05.toInt())
                }
                object : RecyclerView.ViewHolder(tv) {}
            } else {
                val v = LayoutInflater.from(parent.context).inflate(R.layout.item_card, parent, false)
                object : RecyclerView.ViewHolder(v) {}
            }
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            when (val r = rows[position]) {
                is Row.Title -> {
                    (holder.itemView as TextView).text = r.title
                    holder.itemView.setOnClickListener(null)
                }
                is Row.Saved -> {
                    val l = r.list
                    (holder.itemView as TextView).text = "${if (l.sent > 0) "✓" else "●"}  ${l.id}.txt · ${l.copies} carte" +
                        if (l.sent > 0) "  (inviata)" else "  (da inviare)"
                    holder.itemView.alpha = if (l.sent > 0) 0.6f else 1f
                    holder.itemView.setOnClickListener { savedDialog(l) }
                }
                is Row.Header -> {
                    (holder.itemView as TextView).text = r.title
                    holder.itemView.setOnClickListener { groupDialog(r.group) }
                }
                is Row.Card -> {
                    val v = holder.itemView
                    v.findViewById<TextView>(R.id.tvNum).text = CardRepo.pad(r.item.num)
                    ImageLoader.load(this@ListActivity, lifecycleScope, v.findViewById(R.id.ivThumb), *ImageLoader.cardUrls(r.item.img))
                    v.findViewById<TextView>(R.id.tvName).text = r.item.name.ifEmpty { "—" }
                    val rar = v.findViewById<TextView>(R.id.tvRarity)
                    val extra = listOfNotNull(
                        if (r.item.variant == "R") "✦ Reverse Holo" else null,
                        r.item.rarity.ifEmpty { null }
                    ).joinToString(" · ")
                    rar.text = extra
                    rar.visibility = if (extra.isEmpty()) View.GONE else View.VISIBLE
                    v.findViewById<TextView>(R.id.tvQty).text = r.item.qty.toString()
                    v.findViewById<Button>(R.id.btnMinus).setOnClickListener { Inventory.change(this@ListActivity, r.key, -1); refresh() }
                    v.findViewById<Button>(R.id.btnPlus).setOnClickListener { Inventory.change(this@ListActivity, r.key, 1); refresh() }
                }
            }
        }
    }
}
