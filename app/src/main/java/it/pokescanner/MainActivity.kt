package it.pokescanner

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.Size
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.RadioButton
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
import kotlin.math.max

class MainActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var overlay: OverlayView
    private lateinit var chipLang: com.google.android.material.chip.Chip
    private lateinit var tvSetName: TextView
    private lateinit var tvSetSub: TextView
    private lateinit var ivSetLogo: ImageView
    private lateinit var cbName: CompoundButton
    private lateinit var cbRev: CompoundButton
    private lateinit var lastCard: View
    private lateinit var ivLast: ImageView
    private lateinit var btnShot: Button
    private lateinit var tvLast: TextView
    private lateinit var tvStatus: TextView
    private lateinit var btnForce: Button
    private lateinit var btnList: Button

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val camExec = Executors.newSingleThreadExecutor()
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var torch = false
    private var tone: ToneGenerator? = null

    private var sets: List<SetInfo> = emptyList()
    private var set: SetData? = null
    private var lang = "it"
    private var fanMode = false
    private var nameCheck = true
    private var reverseMode = false
    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }

    @Volatile private var paused = false   // durante lo scatto del ventaglio / i dialoghi

    // stato modalità singola
    private var cand: String? = null
    private var candN = 0
    private var locked: String? = null
    private var emptyN = 0
    private var badN = 0
    private var nameFailN = 0
    private var pending: String? = null
    private var lastScan: Recognizer.Scan? = null
    private val candRev = ArrayList<Boolean>()
    // per la conferma dei doppioni ravvicinati
    private var lastAddN: String? = null
    private var lastAddVar = ""
    private var lastAddTime = 0L
    private val DUP_MS = 3000L

    private val langs = listOf("it", "en", "fr", "de", "es", "pt", "ja")

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startCamera() else status("Serve il permesso per la fotocamera.", true)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        previewView = findViewById(R.id.previewView)
        overlay = findViewById(R.id.overlay)
        chipLang = findViewById(R.id.chipLang)
        tvSetName = findViewById(R.id.tvSetName)
        tvSetSub = findViewById(R.id.tvSetSub)
        ivSetLogo = findViewById(R.id.ivSetLogo)
        lastCard = findViewById(R.id.lastCard)
        ivLast = findViewById(R.id.ivLast)
        cbName = findViewById(R.id.cbName)
        cbRev = findViewById(R.id.cbRev)
        btnShot = findViewById(R.id.btnShot)
        tvLast = findViewById(R.id.tvLast)
        tvStatus = findViewById(R.id.tvStatus)
        btnForce = findViewById(R.id.btnForce)
        btnList = findViewById(R.id.btnList)

        Inventory.load(this)
        tone = try { ToneGenerator(AudioManager.STREAM_MUSIC, 80) } catch (_: Exception) { null }

        lang = prefs.getString("lang", "it") ?: "it"
        fanMode = prefs.getBoolean("fan", false)
        nameCheck = prefs.getBoolean("nameCheck", true)
        reverseMode = prefs.getBoolean("reverseMode", false)

        // schermo sempre acceso mentre scansioni
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // lingua
        showLang()
        chipLang.setOnClickListener {
            val names = langs.map { "${LANG_FLAG[it] ?: ""} ${Inventory.LANG_NAMES[it] ?: it}" }.toTypedArray()
            AlertDialog.Builder(this).setTitle("Lingua delle carte")
                .setSingleChoiceItems(names, max(0, langs.indexOf(lang))) { d, i ->
                    d.dismiss()
                    if (langs[i] != lang) { lang = langs[i]; prefs.edit().putString("lang", lang).apply(); showLang(); loadSets() }
                }.show()
        }
        findViewById<View>(R.id.setCard).setOnClickListener { pickSet() }
        findViewById<Button>(R.id.btnHelp).setOnClickListener { showHelp() }

        // modalità
        val modeGroup = findViewById<com.google.android.material.button.MaterialButtonToggleGroup>(R.id.modeGroup)
        modeGroup.check(if (fanMode) R.id.btnModeFan else R.id.btnModeSingle)
        modeGroup.addOnButtonCheckedListener { _, id, checked ->
            if (!checked) return@addOnButtonCheckedListener
            fanMode = id == R.id.btnModeFan
            prefs.edit().putBoolean("fan", fanMode).apply()
            applyMode()
        }
        cbName.isChecked = nameCheck
        cbName.setOnCheckedChangeListener { _, c -> nameCheck = c; prefs.edit().putBoolean("nameCheck", c).apply() }
        cbRev.isChecked = reverseMode
        overlay.reverseMode = reverseMode
        cbRev.setOnCheckedChangeListener { _, c ->
            reverseMode = c; overlay.reverseMode = c; tintReverse()
            prefs.edit().putBoolean("reverseMode", c).apply()
            resetCand(); locked = null
            status(if (c) "Modalità REVERSE: tutte le carte che scansioni ora sono Reverse Holo." else "Modalità normale.")
        }
        findViewById<Button>(R.id.btnSwap).setOnClickListener {
            val r = Inventory.toggleLastVariant(this)
            if (r == null) { showLast("Nessuna carta da cambiare", ""); return@setOnClickListener }
            val (k, it2) = r
            showLast("⇄ ${CardRepo.pad(it2.num)} ${it2.name}\nora è ${Inventory.variantName(it2.variant)} (×${it2.qty})", it2.img)
            lastAddVar = it2.variant
            fetchRarityFor(k)
        }
        applyMode()

        btnShot.setOnClickListener { shootFan() }
        btnForce.setOnClickListener {
            val p = pending ?: return@setOnClickListener
            addCard(p, "forzata", decideVariant().first)
            locked = p; resetCand(); hideForce()
        }
        findViewById<Button>(R.id.btnTorch).setOnClickListener {
            torch = !torch; camera?.cameraControl?.enableTorch(torch)
        }
        findViewById<Button>(R.id.btnUndo).setOnClickListener {
            val removed = Inventory.undo(this)
            showLast(if (removed != null) "↶ tolta ${CardRepo.pad(removed.num)} ${removed.name}" else "Niente da annullare", removed?.img ?: "")
            locked = null; updateListBtn()
        }
        findViewById<Button>(R.id.btnManual).setOnClickListener { manualAdd() }
        btnList.setOnClickListener { startActivity(Intent(this, ListActivity::class.java)) }

        tintReverse()
        setupGestures()
        loadSets()
        if (!prefs.getBoolean("helpSeen", false)) { prefs.edit().putBoolean("helpSeen", true).apply(); showHelp() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            startCamera()
        else askCamera.launch(Manifest.permission.CAMERA)
    }

    override fun onResume() {
        super.onResume()
        updateListBtn()
    }

    override fun onDestroy() {
        super.onDestroy()
        camExec.shutdown()
        recognizer.close()
        tone?.release()
    }

    // ---------------- set ----------------

    private fun loadSets() {
        tvSetName.text = "Caricamento set…"; tvSetSub.text = ""
        set = null
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { runCatching { CardRepo.sets(this@MainActivity, lang) } }
            res.onSuccess { list ->
                sets = list
                val saved = prefs.getString("set_$lang", null)
                val s = list.firstOrNull { it.id == saved } ?: list.firstOrNull()
                if (s != null) selectSet(s.id) else tvSetName.text = "Nessun set"
            }.onFailure {
                tvSetName.text = "Set non disponibili"; tvSetSub.text = "Tocca per riprovare (serve internet la prima volta)"
                status("Impossibile scaricare l'elenco dei set: serve internet la prima volta.", true)
            }
        }
    }

    private fun selectSet(id: String) {
        tvSetName.text = "Caricamento…"
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { runCatching { CardRepo.set(this@MainActivity, lang, id) } }
            res.onSuccess { sd ->
                set = sd
                prefs.edit().putString("set_$lang", id).apply()
                rememberRecent(id)
                tvSetName.text = sd.name
                tvSetSub.text = "${Inventory.LANG_NAMES[lang] ?: lang} · ${sd.cards.size} carte" +
                    (if (sd.extra > 0) " (${sd.total} + ${sd.extra} fuoriserie)" else if (sd.total > 0) " · /${sd.total}" else "")
                ImageLoader.load(this@MainActivity, lifecycleScope, ivSetLogo, if (sd.logo.isNotEmpty()) sd.logo + ".png" else "",
                    if (sd.logo.isNotEmpty()) sd.logo.replace(Regex("(assets\\.tcgdex\\.net/)[a-z-]+/"), "$1en/") + ".png" else "")
                resetCand(); locked = null; hideForce()
                status(if (fanMode) "Disponi le carte a ventaglio e premi \"Leggi ventaglio\"."
                       else "Inquadra la carta intera: la aggiungo da sola.")
            }.onFailure {
                tvSetName.text = "Errore nel set"; tvSetSub.text = "Tocca per riprovare"
                status("Non riesco a caricare il set scelto.", true)
            }
        }
    }

    private fun pickSet() {
        if (sets.isEmpty()) { loadSets(); return }
        val search = EditText(this).apply { hint = "Cerca set…"; isSingleLine = true }
        val lv = ListView(this)
        var filtered = sets
        val recentIds = (prefs.getString("recent_$lang", "") ?: "").split(',').filter { it.isNotBlank() }
        val recent = recentIds.mapNotNull { id -> sets.firstOrNull { it.id == id } }
        fun label(s: SetInfo) = (if (s in recent) "🕘 " else "") + "${s.name}  (/${s.official})"
        val ordered = recent + sets.filter { it !in recent }
        filtered = ordered
        val adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, ordered.map { label(it) }.toMutableList())
        lv.adapter = adapter
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 16, 40, 0)
            addView(search)
            addView(lv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                (resources.displayMetrics.heightPixels * 0.55).toInt()))
        }
        val dlg = AlertDialog.Builder(this).setTitle("Scegli il set").setView(box)
            .setNegativeButton("Chiudi", null).create()
        search.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val q = s.toString().trim().lowercase()
                filtered = ordered.filter { q.isEmpty() || it.name.lowercase().contains(q) || it.id.lowercase().contains(q) }
                adapter.clear(); adapter.addAll(filtered.map { label(it) })
            }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        lv.setOnItemClickListener { _, _, pos, _ ->
            if (pos < filtered.size) selectSet(filtered[pos].id)
            dlg.dismiss()
        }
        dlg.show()
    }

    // ---------------- fotocamera ----------------

    private fun startCamera() {
        val fut = ProcessCameraProvider.getInstance(this)
        fut.addListener({
            val provider = fut.get()
            val rs = ResolutionSelector.Builder()
                .setResolutionStrategy(ResolutionStrategy(Size(1920, 1080),
                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                .build()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(rs)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(camExec) { proxy -> analyze(proxy) }
            val capture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()
            provider.unbindAll()
            camera = try {
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis, capture)
                    .also { imageCapture = capture }
            } catch (e: Exception) {
                // alcuni telefoni non reggono 3 flussi insieme: il ventaglio userà l'anteprima
                provider.unbindAll()
                imageCapture = null
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupGestures() {
        val sg = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: ScaleGestureDetector): Boolean {
                val cam = camera ?: return true
                val zs = cam.cameraInfo.zoomState.value ?: return true
                val z = (zs.zoomRatio * d.scaleFactor).coerceIn(zs.minZoomRatio, zs.maxZoomRatio)
                cam.cameraControl.setZoomRatio(z)
                return true
            }
        })
        previewView.setOnTouchListener { _, e ->
            sg.onTouchEvent(e)
            if (e.action == MotionEvent.ACTION_UP && !sg.isInProgress && e.pointerCount == 1) {
                val p = previewView.meteringPointFactory.createPoint(e.x, e.y)
                camera?.cameraControl?.startFocusAndMetering(FocusMeteringAction.Builder(p).build())
            }
            true
        }
    }

    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    private fun analyze(proxy: ImageProxy) {
        val media = proxy.image
        if (media == null || paused) { proxy.close(); return }
        val rot = proxy.imageInfo.rotationDegrees
        val swap = rot == 90 || rot == 270
        val w = if (swap) proxy.height else proxy.width
        val h = if (swap) proxy.width else proxy.height
        recognizer.process(InputImage.fromMediaImage(media, rot))
            .addOnSuccessListener { text ->
                try {
                    if (!paused) {
                        val pl = proxy.planes[0]
                        val yp = Recognizer.YPlane(pl.buffer, pl.rowStride, pl.pixelStride, proxy.width, proxy.height, rot)
                        onFrame(text, w, h, yp)
                    }
                } catch (_: Exception) {
                } finally { proxy.close() }
            }
            .addOnFailureListener { proxy.close() }
    }

    // ---------------- modalità carta singola ----------------

    private fun onFrame(text: Text, w: Int, h: Int, yp: Recognizer.YPlane) {
        val sd = set ?: return
        val lines = Recognizer.lines(text)
        val scan = Recognizer.scanLines(lines, sd)
        lastScan = scan
        overlay.show(scan, w, h)

        if (fanMode) {
            val n = scan.good.size
            status(if (n == 0) "Nessun numero valido inquadrato." else "Ne vedo $n: premi \"Leggi ventaglio\" per aggiungerle.")
            return
        }

        val nums = scan.good.map { CardRepo.norm(it.num) }.distinct()
        if (nums.size != 1) {
            emptyN++; resetCand()
            if (emptyN >= 3) { locked = null; if (pending != null) hideForce() }
            if (nums.size > 1) status("Vedo più carte: inquadrane una sola (o usa la modalità Ventaglio).")
            else if (scan.bad.isNotEmpty()) {
                badN++
                if (badN >= 4) {
                    val b = scan.bad.first()
                    status("Letto ${b.num}/${b.total}, ma il set scelto ha /${sd.total}: set o lingua giusti?", true)
                }
            } else badN = 0
            return
        }
        emptyN = 0; badN = 0
        val n = nums[0]
        if (n == locked) return
        if (n == cand) candN++ else { cand = n; candN = 1; nameFailN = 0; candRev.clear(); if (pending != null && pending != n) hideForce() }
        scan.good.firstOrNull { CardRepo.norm(it.num) == n }?.reverse?.let { candRev.add(it) }
        if (candN < 2) return

        val card = sd.cards[n]
        if (nameCheck && lang != "ja" && card != null && card.name.isNotEmpty()) {
            if (!Recognizer.nameInLines(lines, card.name)) {
                nameFailN++
                if (nameFailN == 8) {
                    pending = n
                    btnForce.text = "Aggiungi comunque ${CardRepo.pad(n)} ${card.name}"
                    btnForce.visibility = View.VISIBLE
                    status("Il numero ${CardRepo.pad(n)} corrisponde a \"${card.name}\", ma non leggo quel nome sulla carta. Inquadra anche il nome.", true)
                } else if (nameFailN < 8) status("Controllo il nome…")
                return
            }
        }
        val (variant, sure) = decideVariant()
        locked = n
        // stessa carta di nuovo entro pochi secondi: probabilmente è la stessa copia ancora davanti alla fotocamera
        if (n == lastAddN && variant == lastAddVar && System.currentTimeMillis() - lastAddTime < DUP_MS) {
            resetCand(); hideForce()
            askDuplicate(n, variant, sure)
            return
        }
        addCard(n, if (sure) "" else "variante non letta", variant)
        resetCand(); hideForce()
        status("Ok, prossima carta.")
    }

    /** Variante decisa a maggioranza sui fotogrammi letti. Restituisce ("" o "R", deciso con certezza?) */
    private fun decideVariant(): Pair<String, Boolean> = (if (reverseMode) "R" else "") to true

    private fun askDuplicate(n: String, variant: String, sure: Boolean) {
        val sd = set ?: return
        paused = true
        val name = sd.cards[n]?.name ?: ""
        val qty = Inventory.items[Inventory.key(lang, sd.id, n, variant)]?.qty ?: 0
        feedbackSoft()
        AlertDialog.Builder(this)
            .setTitle("Stessa carta?")
            .setMessage("${CardRepo.pad(n)} $name${if (variant == "R") " (Reverse)" else ""} è stata appena aggiunta (ora ×$qty).\n\nÈ un'altra copia?")
            .setPositiveButton("Sì, aggiungi") { _, _ -> addCard(n, if (sure) "" else "variante non letta", variant) }
            .setNegativeButton("No, è la stessa") { _, _ -> status("Ok, non aggiunta. Prossima carta.") }
            .setOnDismissListener { paused = false; locked = n }
            .show()
    }

    private fun resetCand() { cand = null; candN = 0; nameFailN = 0; candRev.clear() }
    private fun hideForce() { pending = null; btnForce.visibility = View.GONE }

    // ---------------- modalità ventaglio ----------------

    private fun applyMode() {
        btnShot.visibility = if (fanMode) View.VISIBLE else View.GONE
        cbName.isEnabled = !fanMode
        resetCand(); locked = null; hideForce(); overlay.clear()
        status(if (fanMode) "Ventaglio: sovrapponi le carte lasciando visibile la riga del numero in basso, poi premi \"Leggi ventaglio\"."
               else "Inquadra la carta intera: la aggiungo da sola.")
    }

    private fun shootFan() {
        val sd = set ?: run { status("Scegli prima un set.", true); return }
        val cap = imageCapture
        if (cap == null) {
            val s = lastScan ?: Recognizer.Scan(emptyList(), emptyList())
            showFanResult(null, s, sd)
            return
        }
        paused = true
        btnShot.isEnabled = false
        status("Leggo il ventaglio…")
        cap.takePicture(camExec, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val rot = image.imageInfo.rotationDegrees
                val bmp = try { prepare(image.toBitmap(), rot, 3200) } catch (e: Exception) { null } finally { image.close() }
                if (bmp == null) { runOnUiThread { fanDone(); status("Errore nella foto, riprova.", true) }; return }
                recognizer.process(InputImage.fromBitmap(bmp, 0))
                    .addOnSuccessListener { t ->
                        fanDone()
                        val sc = Recognizer.scan(t, sd)
                        showFanResult(bmp, sc, sd)
                    }
                    .addOnFailureListener { fanDone(); status("Errore di lettura, riprova.", true) }
            }
            override fun onError(e: ImageCaptureException) {
                runOnUiThread { fanDone(); status("Errore nello scatto: ${e.message}", true) }
            }
        })
    }

    private fun fanDone() { paused = false; btnShot.isEnabled = true }

    private fun bmpLum(b: Bitmap, x: Int, y: Int): Int {
        val p = b.getPixel(x, y)
        return (Color.red(p) * 299 + Color.green(p) * 587 + Color.blue(p) * 114) / 1000
    }

    private fun prepare(src: Bitmap, rot: Int, maxSide: Int): Bitmap {
        val m = Matrix()
        if (rot != 0) m.postRotate(rot.toFloat())
        val big = max(src.width, src.height)
        if (big > maxSide) { val s = maxSide.toFloat() / big; m.postScale(s, s) }
        return if (m.isIdentity) src else Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    private fun showFanResult(bmp: Bitmap?, scan: Recognizer.Scan, sd: SetData) {
        paused = true
        scan.good.forEach { it.reverse = reverseMode }
        val counts = scan.good.groupingBy { CardRepo.norm(it.num) to (if (it.reverse == true) "R" else "") }.eachCount()
            .toSortedMap(compareBy<Pair<String, String>>({ it.first.toIntOrNull() ?: Int.MAX_VALUE }, { it.first }, { it.second }))
        val revN = scan.good.count { it.reverse == true }
        val unknownN = 0
        val total = scan.good.size

        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 16, 40, 0) }
        if (bmp != null) {
            val out = bmp.copy(Bitmap.Config.ARGB_8888, true)
            val c = Canvas(out)
            val sw = max(4f, out.width / 250f)
            val pg = Paint().apply { color = Color.rgb(62, 207, 110); style = Paint.Style.STROKE; strokeWidth = sw }
            val pb = Paint().apply { color = Color.rgb(255, 80, 80); style = Paint.Style.STROKE; strokeWidth = sw }
            scan.bad.forEach { h -> h.box?.let { c.drawRect(it, pb) } }
            scan.good.forEach { h -> h.box?.let { c.drawRect(it, pg) } }
            val pc = Paint().apply { style = Paint.Style.STROKE; strokeWidth = sw }
            scan.good.forEach { h -> h.codeBox?.let { pc.color = OverlayView.codeColor(h.reverse); c.drawRect(it, pc) } }
            content.addView(ImageView(this).apply {
                adjustViewBounds = true
                maxHeight = (resources.displayMetrics.heightPixels * 0.45).toInt()
                setImageBitmap(out)
            })
        }
        val sb = StringBuilder()
        sb.append(if (total == 0) "Nessuna carta riconosciuta.\n" else "Riconosciute $total carte (${counts.size} diverse):\n")
        for ((nv, c) in counts) {
            val name = sd.cards[nv.first]?.name ?: ""
            sb.append("${CardRepo.pad(nv.first)} $name${if (nv.second == "R") "  ✦Reverse" else ""}${if (c > 1) "  ×$c" else ""}\n")
        }
        if (revN > 0) sb.append("\nTutte Reverse Holo (modalità Reverse attiva).\n")
        if (unknownN > 0) sb.append("⚠ Per $unknownN carte non sono riuscito a capire se sono Reverse (sigla grigia): contate come normali.\n")
        if (scan.bad.isNotEmpty())
            sb.append("\n⚠ ${scan.bad.size} righe con totale diverso da /${sd.total} (in rosso, ignorate).\n")
        if (total > 0) sb.append("\nConta le carte del ventaglio: se sono di più, qualcuna non è stata letta (non ha il riquadro verde).")
        content.addView(TextView(this).apply { text = sb.toString(); textSize = 15f; setPadding(0, 12, 0, 0) })

        val b = AlertDialog.Builder(this)
            .setTitle("Ventaglio")
            .setView(ScrollView(this).apply { addView(content) })
            .setNegativeButton("Annulla", null)
            .setOnDismissListener { paused = false }
        if (total > 0) b.setPositiveButton("Aggiungi $total") { _, _ ->
            for ((nv, c) in counts) repeat(c) { Inventory.add(this, lang, sd, nv.first, nv.second, persist = false) }
            Inventory.save(this)
            counts.keys.forEach { nv -> fetchRarityFor(Inventory.key(lang, sd.id, nv.first, nv.second)) }
            showLast("✓ Aggiunte $total carte dal ventaglio", "")
            feedback(); updateListBtn()
        }
        b.show()
    }

    // ---------------- lista ----------------

    private fun addCard(num: String, note: String, variant: String = "") {
        val sd = set ?: return
        val (k, item) = Inventory.add(this, lang, sd, num, variant)
        lastAddN = item.num; lastAddVar = variant; lastAddTime = System.currentTimeMillis()
        val extra = sd.total > 0 && (item.num.toIntOrNull() ?: 0) > sd.total
        showLast("✓ ${CardRepo.pad(item.num)}/${sd.total}${if (extra) " · fuoriserie" else ""}\n${item.name.ifEmpty { "—" }}" +
            (if (variant == "R") "  ✦ REVERSE" else "") + "   ×${item.qty}" +
            (if (note.isNotEmpty()) "  ($note)" else ""), item.img)
        feedback()
        updateListBtn()
        fetchRarityFor(k)
    }

    private fun fetchRarityFor(k: String) {
        val item = Inventory.items[k] ?: return
        if (item.rarity.isNotEmpty() || item.cardId.isEmpty()) return
        lifecycleScope.launch {
            val r = withContext(Dispatchers.IO) { CardRepo.rarity(this@MainActivity, item.lang, item.cardId) }
            if (!r.isNullOrEmpty()) Inventory.setRarity(this@MainActivity, k, r)
        }
    }

    private fun manualAdd() {
        if (set == null) { status("Scegli prima un set.", true); return }
        val et = EditText(this).apply {
            hint = "Numero (es. 45 o TG05)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        }
        paused = true
        AlertDialog.Builder(this).setTitle("Aggiungi a mano")
            .setView(LinearLayout(this).apply { setPadding(48, 16, 48, 0); addView(et, ViewGroup.LayoutParams(-1, -2)) })
            .setPositiveButton("Aggiungi") { _, _ ->
                val v = et.text.toString().trim().substringBefore('/').trim()
                if (v.isNotEmpty()) addCard(v, "a mano")
                // per una Reverse inserita a mano: usa il tasto ⇄ Rev subito dopo
            }
            .setNegativeButton("Annulla", null)
            .setOnDismissListener { paused = false }
            .show()
    }

    private fun updateListBtn() { btnList.text = "📋 Lista (${Inventory.count()})" }

    /** Scheda "ultima carta" con immagine. */
    private fun showLast(text: String, img: String) {
        lastCard.visibility = View.VISIBLE
        tvLast.text = text
        ImageLoader.load(this, lifecycleScope, ivLast, *ImageLoader.cardUrls(img))
    }

    private val LANG_FLAG = mapOf("it" to "🇮🇹", "en" to "🇬🇧", "fr" to "🇫🇷", "de" to "🇩🇪", "es" to "🇪🇸", "pt" to "🇵🇹", "ja" to "🇯🇵")
    private fun showLang() { chipLang.text = "${LANG_FLAG[lang] ?: ""} ${lang.uppercase()}" }

    /** Colori viola quando la modalità Reverse è attiva, per non dimenticarla accesa. */
    private fun tintReverse() {
        val c = if (reverseMode) Color.rgb(204, 93, 232) else Color.rgb(255, 203, 5)
        btnList.backgroundTintList = android.content.res.ColorStateList.valueOf(c)
    }

    private fun rememberRecent(id: String) {
        val list = (prefs.getString("recent_$lang", "") ?: "").split(',').filter { it.isNotBlank() && it != id }
        prefs.edit().putString("recent_$lang", (listOf(id) + list).take(6).joinToString(",")).apply()
    }

    private fun showHelp() {
        AlertDialog.Builder(this).setTitle("Come si usa")
            .setMessage(
                "1. Tocca la scheda del set in alto e scegli il set delle carte (in alto trovi quelli usati di recente).\n\n" +
                "2. CARTA SINGOLA: inquadra una carta alla volta. Appena legge il numero (es. 123/198) la aggiunge da sola con un bip. " +
                "Se riconosce la stessa carta entro 3 secondi ti chiede se è un'altra copia.\n\n" +
                "3. VENTAGLIO: sovrapponi le carte lasciando visibile la riga del numero in basso e premi \"Leggi ventaglio\".\n\n" +
                "4. ✦ REVERSE: finché è attiva, tutte le carte che scansioni sono Reverse Holo (la cornice diventa viola).\n\n" +
                "5. Verifica nome: controlla anche il nome stampato, per evitare numeri letti male.\n\n" +
                "Altri comandi: due dita per lo zoom, tocca l'immagine per mettere a fuoco, 🔦 luce, ↶ annulla l'ultima, " +
                "⇄ Rev cambia l'ultima tra normale e Reverse, ✍ aggiunge a mano.\n\n" +
                "6. In 📋 Lista trovi tutte le carte: tocca il nome di un set per mandare il file al PC (Cardmarket e gestionale)."
            )
            .setPositiveButton("Ho capito", null).show()
    }

    private fun feedback() {
        try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 80) } catch (_: Exception) {}
        try {
            getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {}
    }

    private fun feedbackSoft() {
        try { tone?.startTone(ToneGenerator.TONE_PROP_ACK, 120) } catch (_: Exception) {}
    }

    private fun status(t: String, warn: Boolean = false) {
        tvStatus.text = t
        tvStatus.setTextColor(if (warn) Color.rgb(255, 140, 140) else Color.WHITE)
        tvStatus.visibility = if (t.isBlank()) View.GONE else View.VISIBLE
    }

    @Suppress("unused")
    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_SHORT).show()
}
