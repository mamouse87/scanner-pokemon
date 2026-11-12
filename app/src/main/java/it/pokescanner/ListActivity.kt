package it.pokescanner

import android.content.ClipData
import android.content.ClipboardManager
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
    }

    private val rows = ArrayList<Row>()
    private lateinit var adapter: Adapter
    private lateinit var tvSummary: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_list)
        tvSummary = findViewById(R.id.tvSummary)
        val rv = findViewById<RecyclerView>(R.id.rv)
        rv.layoutManager = LinearLayoutManager(this)
        adapter = Adapter()
        rv.adapter = adapter

        findViewById<Button>(R.id.btnShareText).setOnClickListener {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, Inventory.text())
            }, "Condividi lista"))
        }
        findViewById<Button>(R.id.btnCopyText).setOnClickListener {
            val cm = getSystemService(ClipboardManager::class.java)
            cm?.setPrimaryClip(ClipData.newPlainText("Lista carte", Inventory.text()))
            Toast.makeText(this, "Testo copiato", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btnCsv).setOnClickListener { shareCsv() }
        findViewById<Button>(R.id.btnCatalog).setOnClickListener { makeCatalog(it as Button) }
        findViewById<Button>(R.id.btnClear).setOnClickListener {
            AlertDialog.Builder(this).setMessage("Svuotare tutta la lista?")
                .setPositiveButton("Svuota") { _, _ -> Inventory.clear(this); refresh() }
                .setNegativeButton("Annulla", null).show()
        }
        refresh()
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

    private fun shareCsv() {
        val dir = File(cacheDir, "export").apply { mkdirs() }
        val f = File(dir, "carte-pokemon.csv")
        f.writeText(Inventory.csv(), Charsets.UTF_8)
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "Esporta CSV"))
    }

    private fun cardmarketDialog(g: Group) {
        val prefs = getSharedPreferences("app", MODE_PRIVATE)
        val et = android.widget.EditText(this).apply {
            hint = "Commento per Cardmarket (facoltativo)"
            setText(prefs.getString("cmComment", ""))
            isSingleLine = true
        }
        val n = g.items.sumOf { it.second.qty }
        val rev = g.items.filter { it.second.variant == "R" }.sumOf { it.second.qty }
        val info = TextView(this).apply {
            text = "$n carte ($rev Reverse). Il file contiene numero, nome, rarità, Normale/Reverse e commento: " +
                "sul PC caricalo nel pulsante \"Card Scanner → CM\" sulla pagina Inserisci carte bulk."
            setPadding(0, 0, 0, 16)
        }
        val box = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 16, 48, 0)
            addView(info); addView(et)
        }
        fun text(): String {
            val c = et.text.toString()
            prefs.edit().putString("cmComment", c).apply()
            return Inventory.cardmarketText(g, c)
        }
        AlertDialog.Builder(this)
            .setTitle("${g.setName} → Cardmarket")
            .setView(box)
            .setPositiveButton("Invia file") { _, _ -> shareCardmarketFile(g, text()) }
            .setNeutralButton("Copia testo") { _, _ ->
                getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Cardmarket", text()))
                Toast.makeText(this, "Lista copiata", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Chiudi", null)
            .show()
    }

    /** Invia un vero file .txt (via Bluetooth, email, WhatsApp…): non viene trasformato in pagina HTML. */
    private fun shareCardmarketFile(g: Group, text: String) {
        val dir = File(cacheDir, "export").apply { mkdirs() }
        val safe = g.setName.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').ifEmpty { "set" }
        val f = File(dir, "cardmarket-$safe-${g.lang}.txt")
        f.writeText(text, Charsets.UTF_8)
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "Invia la lista al PC"))
    }

    private fun refresh() {
        rows.clear()
        for (g in Inventory.groups()) {
            val n = g.items.sumOf { it.second.qty }
            rows.add(Row.Header("${g.setName} · ${g.lang.uppercase()} · $n carte  ›", g))
            g.items.forEach { (k, i) -> rows.add(Row.Card(k, i)) }
        }
        val tot = Inventory.count()
        tvSummary.text = if (tot == 0) "Lista vuota" else "$tot carte (${Inventory.items.size} diverse)"
        adapter.notifyDataSetChanged()
    }

    private inner class Adapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount() = rows.size
        override fun getItemViewType(position: Int) = if (rows[position] is Row.Header) 0 else 1

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
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
                is Row.Header -> {
                    (holder.itemView as TextView).text = r.title
                    holder.itemView.setOnClickListener { cardmarketDialog(r.group) }
                }
                is Row.Card -> {
                    val v = holder.itemView
                    v.findViewById<TextView>(R.id.tvNum).text = CardRepo.pad(r.item.num)
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
