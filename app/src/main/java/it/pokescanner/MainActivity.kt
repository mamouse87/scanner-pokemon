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
import kotlinx.coroutines.Job
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
    private lateinit var modeBar: LinearLayout
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
    private var chime: Chime? = null
    /** ▶/⏸: la scansione della carta singola parte solo quando la avvii */
    @Volatile private var scanning = false
    private var ambSince = 0L   // da quando l'app vede due numeri insieme

    private var sets: List<SetInfo> = emptyList()
    private var set: SetData? = null
    private var lang = "it"
    private var fanMode = false
    private var nameCheck = true
    /** variante delle carte che scansioni: Normale, Reverse o una speciale (Energia, Ball, Master Ball) */
    private var varMode = Variants.N
    private val reverseMode get() = varMode == Variants.R
    private var prefetchJob: Job? = null
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
    // "impronta" dell'immagine quando la carta è stata aggiunta: la carta si considera tolta
    // solo quando l'immagine cambia davvero (non basta che diventi più scura o che il numero non si legga)
    private var lockedSig: FloatArray? = null
    private var curSig: FloatArray? = null
    private var curStd = 0f
    private var goneN = 0
    private val candRev = ArrayList<Boolean>()
    // per la conferma dei doppioni ravvicinati
    private var lastAddN: String? = null
    private var lastAddVar = ""
    private var lastAddTime = 0L
    private val DUP_MS = 3000L
    private val votes = Votes()

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
        modeBar = findViewById(R.id.modeBar)
        btnShot = findViewById(R.id.btnShot)
        tvLast = findViewById(R.id.tvLast)
        tvStatus = findViewById(R.id.tvStatus)
        btnForce = findViewById(R.id.btnForce)
        btnList = findViewById(R.id.btnList)

        Inventory.load(this)
        tone = try { ToneGenerator(AudioManager.STREAM_MUSIC, 80) } catch (_: Exception) { null }
        chime = Chime()

        lang = prefs.getString("lang", "it") ?: "it"
        fanMode = prefs.getBoolean("fan", false)
        nameCheck = prefs.getBoolean("nameCheck", true)
        varMode = prefs.getString("varMode", null) ?: if (prefs.getBoolean("reverseMode", false)) Variants.R else Variants.N

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
        // variante: Normale, Reverse o una speciale del set (resta attiva finché non la cambi)
        applyVarMode(false)
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
        findViewById<Button>(R.id.btnScan).setOnClickListener { setScanning(!scanning) }
        btnForce.setOnClickListener {
            val p = pending ?: return@setOnClickListener
            addWithMode(p, "forzata")
            lockCurrent(p); resetCand(); hideForce()
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
        // ＋: un'altra copia dell'ultima carta; tenendo premuto chiede quante
        findViewById<Button>(R.id.btnPlus).setOnClickListener { addMoreCopies(1) }
        findViewById<Button>(R.id.btnPlus).setOnLongClickListener { askHowMany(); true }
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
        chime?.release()
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
                prefetchJob?.cancel()
                buildModeBar()
                prefetchJob = lifecycleScope.launch {
                    // mentre leggo le varianti del set i cerchi si aggiornano ogni 2 s (compaiono Energia, Ball…)
                    val tick = launch { while (true) { kotlinx.coroutines.delay(2000); if (set === sd) buildModeBar() } }
                    try { withContext(Dispatchers.IO) { Variants.prefetch(this@MainActivity, lang, sd) } } catch (_: Exception) {}
                    tick.cancel()
                    if (set === sd) { checkModeAvailable(sd); buildModeBar() }
                }
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
        if (media == null || paused || (!fanMode && !scanning)) { proxy.close(); return }
        val rot = proxy.imageInfo.rotationDegrees
        val swap = rot == 90 || rot == 270
        val w = if (swap) proxy.height else proxy.width
        val h = if (swap) proxy.width else proxy.height
        recognizer.process(InputImage.fromMediaImage(media, rot))
            .addOnSuccessListener { text ->
                try {
                    if (!paused && (fanMode || scanning)) {
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
        val now = System.currentTimeMillis()
        computeSignature(yp, w, h)
        votes.add(now, nums.toSet())

        // 1) carta tolta? Solo se l'immagine è cambiata davvero (2 fotogrammi) e il suo numero non si legge.
        //    Un calo di luce o un riflesso non la sbloccano.
        val lk = locked
        if (lk != null) {
            if (lk !in nums && sceneChanged()) goneN++ else goneN = 0
            if (goneN >= 2) { locked = null; lockedSig = null; goneN = 0; votes.clear(); votes.add(now, nums.toSet()) }
        }

        // avviso set sbagliato (totale diverso) se per un po' legge solo numeri con un altro totale
        if (nums.isEmpty()) {
            if (scan.bad.isNotEmpty()) {
                badN++
                if (badN >= 4) {
                    val b = scan.bad.first()
                    status("Letto ${b.num}/${b.total}, ma il set scelto ha /${sd.total}: set o lingua giusti?", true)
                    if (badN == 12) feedbackError()   // solo se continua (non per un'immagine di passaggio)
                }
            } else badN = 0
        } else badN = 0

        // 2) votazione sull'ultimo secondo e mezzo: vince il numero letto più spesso.
        //    I fotogrammi senza lettura non azzerano nulla; una lettura sbagliata ogni tanto resta in minoranza.
        val rank = votes.ranking(now, 1500)
        if (rank.isEmpty()) { if (pending != null && votes.size(now, 1500) >= 6) hideForce(); return }
        val (top, tv) = rank[0]
        val sv = rank.getOrNull(1)?.second ?: 0
        if (top == locked) return                                   // la carta appena aggiunta è ancora lì
        if (sv >= 3 && tv < 2 * sv) {
            status("Leggo ${CardRepo.pad(top)} e ${CardRepo.pad(rank[1].first)}: tieni ferma la carta (riflesso?) o inquadrane una sola.")
            // nel passaggio da una carta all'altra per un attimo si vedono due numeri: errore solo se dura più di 3 s
            if (ambSince == 0L) ambSince = now else if (now - ambSince > 3000) feedbackError()
            return
        }
        ambSince = 0L
        val L = locked
        val ok = when {
            L == null -> tv >= 3
            // la carta precedente si vede ancora ogni tanto: è la stessa carta letta male (es. 078 letto 008)
            votes.count(L, now, 1000) > 0 -> false
            // immagine cambiata: è davvero un'altra carta
            sceneChanged() -> tv >= 3
            // immagine quasi uguale: serve una conferma più lunga
            else -> votes.count(top, now, 3000) >= 6 && votes.count(L, now, 1500) == 0
        }
        if (!ok) {
            if (tv >= 2) status("Leggo ${CardRepo.pad(top)}: tengo ferma la carta…")
            return
        }
        val n = top
        if (n != cand) { cand = n; nameFailN = 0; if (pending != null && pending != n) hideForce() }

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
                if (nameFailN == 20) feedbackError()   // nome ancora non letto dopo un bel po': errore vero
                return
            }
        }
        lockCurrent(n)
        // stessa carta di nuovo entro pochi secondi: probabilmente è la stessa copia ancora davanti alla fotocamera
        val rv = resolveNow(n)
        if (rv != null && n == lastAddN && rv.first == lastAddVar && System.currentTimeMillis() - lastAddTime < DUP_MS) {
            resetCand(); hideForce()
            askDuplicate(n, rv.first, rv.second)
            return
        }
        resetCand(); hideForce()
        status("Ok, prossima carta.")
        addWithMode(n, "")
    }

    private fun lockCurrent(n: String) { locked = n; lockedSig = curSig; goneN = 0 }

    /** Impronta dell'immagine: griglia 16×12 di luminosità, normalizzata (indipendente da luce più o meno forte). */
    private fun computeSignature(yp: Recognizer.YPlane, w: Int, h: Int) {
        val gx = 16; val gy = 12
        val v = FloatArray(gx * gy)
        for (j in 0 until gy) for (i in 0 until gx) {
            var sum = 0
            for (dy in 0..1) for (dx in 0..1) {
                val x = ((i + 0.25f + dx * 0.5f) / gx * w).toInt().coerceIn(0, w - 1)
                val y = ((j + 0.25f + dy * 0.5f) / gy * h).toInt().coerceIn(0, h - 1)
                sum += yp.lum(x, y)
            }
            v[j * gx + i] = sum / 4f
        }
        val mean = v.average().toFloat()
        var varSum = 0f
        for (x in v) varSum += (x - mean) * (x - mean)
        val std = kotlin.math.sqrt(varSum / v.size)
        curStd = std
        if (std > 0.5f) for (k in v.indices) v[k] = (v[k] - mean) / std
        curSig = v
    }

    /** L'immagine è cambiata davvero rispetto a quando la carta è stata aggiunta? */
    private fun sceneChanged(): Boolean {
        val a = lockedSig ?: return true
        val b = curSig ?: return false
        if (curStd < 6f) return true               // inquadratura quasi uniforme: tappetino vuoto, carta tolta
        var dot = 0f
        for (k in a.indices) dot += a[k] * b[k]
        return dot / a.size < 0.7f                 // forme diverse (mano, carta spostata via, altra carta)
    }

    /** Variante della carta per la modalità attiva, se si sa subito: ("" | "R" | "X<idProduct>", nome). null = da leggere o assente */
    private fun resolveNow(n: String): Pair<String, String>? {
        if (!Variants.isSpecial(varMode)) return (if (varMode == Variants.R) "R" else "") to ""
        val id = set?.cards?.get(CardRepo.norm(n))?.id ?: return null
        val cv = Variants.cached(this, lang, id) ?: return null
        val all = Variants.pickAll(cv, varMode)
        val o = all.singleOrNull() ?: return null   // più versioni Promo: si sceglie al momento
        return "X" + o.p to o.label
    }

    /** Aggiunge la carta nella variante della modalità attiva; per le speciali la cerca tra le varianti vere della carta (TCGdex). */
    private fun addWithMode(num: String, note: String) {
        val sd = set ?: return
        if (!Variants.isSpecial(varMode)) { addCard(num, note, if (varMode == Variants.R) "R" else ""); return }
        val n = CardRepo.norm(num)
        val card = sd.cards[n]
        if (card == null || card.id.isEmpty()) {
            feedbackError()
            status("La carta ${CardRepo.pad(n)} non risulta nel set: con la modalità ${Variants.modeLabel(varMode)} non so quale variante sia. Non aggiunta.", true)
            return
        }
        val cv = Variants.cached(this, lang, card.id)
        if (cv != null) { addSpecial(n, note, card, cv); return }
        val mode = varMode
        paused = true
        status("Leggo le varianti di ${CardRepo.pad(n)} ${card.name}…")
        lifecycleScope.launch {
            val r = withContext(Dispatchers.IO) { Variants.load(this@MainActivity, lang, card.id) }
            paused = false
            when {
                r == null -> { feedbackError(); status("Non riesco a leggere le varianti di ${CardRepo.pad(n)} ${card.name} (serve internet): non aggiunta.", true) }
                mode == varMode -> addSpecial(n, note, card, r)
            }
        }
    }

    private fun addSpecial(n: String, note: String, card: CardInfo, cv: CardVars) {
        val all = Variants.pickAll(cv, varMode)
        if (all.size > 1) {
            // più versioni Promo della stessa carta (es. Cosmo Holo e timbrata): scegli tu
            paused = true
            feedbackPresent()
            AlertDialog.Builder(this)
                .setTitle("${CardRepo.pad(n)} ${card.name}: quale Promo?")
                .setItems(all.map { it.label }.toTypedArray()) { _, i -> paused = false; addCard(n, note, "X" + all[i].p, all[i].label) }
                .setNegativeButton("Non aggiungere") { _, _ -> paused = false; status("${CardRepo.pad(n)} non aggiunta.") }
                .setOnCancelListener { paused = false }
                .show()
            return
        }
        val o = all.firstOrNull()
        if (o == null) {
            feedbackError()
            val has = cv.opts.filter { it.cat != "altra" }.joinToString(", ") { it.label }
            showLast("✗ ${CardRepo.pad(n)} ${card.name}\nnon esiste come ${Variants.modeLabel(varMode)}: non aggiunta", card.image)
            status("${CardRepo.pad(n)} ${card.name} non esiste come ${Variants.modeLabel(varMode)}" +
                (if (has.isNotEmpty()) " (esiste come: $has)" else "") + ". Non l'ho aggiunta: cambia modalità o mettila da parte.", true)
            return
        }
        addCard(n, note, "X" + o.p, o.label)
    }

    private fun askDuplicate(n: String, variant: String, label: String) {
        val sd = set ?: return
        paused = true
        val name = sd.cards[n]?.name ?: ""
        val qty = Inventory.items[Inventory.key(lang, sd.id, n, variant)]?.qty ?: 0
        feedbackPresent()
        AlertDialog.Builder(this)
            .setTitle("Stessa carta?")
            .setMessage("${CardRepo.pad(n)} $name${if (variant == "R") " (Reverse)" else if (label.isNotEmpty()) " ($label)" else ""} è stata appena aggiunta (ora ×$qty).\n\nÈ un'altra copia?")
            .setPositiveButton("Sì, aggiungi") { _, _ -> addCard(n, "", variant, label) }
            .setNegativeButton("No, è la stessa") { _, _ -> status("Ok, non aggiunta. Prossima carta.") }
            .setOnDismissListener { paused = false; lockCurrent(n) }
            .show()
    }

    private fun resetCand() { cand = null; candN = 0; nameFailN = 0; candRev.clear() }
    private fun hideForce() { pending = null; btnForce.visibility = View.GONE }

    // ---------------- modalità ventaglio ----------------

    private fun setScanning(on: Boolean) {
        scanning = on
        resetCand(); hideForce(); votes.clear(); ambSince = 0L
        if (!on) { locked = null; overlay.clear() }
        val b = findViewById<Button>(R.id.btnScan)
        b.text = if (on) "⏸ Ferma scansione" else "▶ Avvia scansione"
        status(if (on) "Scansione attiva: inquadra la carta intera, la aggiungo da sola." else "Scansione ferma: premi ▶ Avvia scansione quando sei pronto.")
    }

    private fun applyMode() {
        btnShot.visibility = if (fanMode) View.VISIBLE else View.GONE
        findViewById<Button>(R.id.btnScan).visibility = if (fanMode) View.GONE else View.VISIBLE
        cbName.isEnabled = !fanMode
        resetCand(); locked = null; hideForce(); overlay.clear()
        status(if (fanMode) "Ventaglio: sovrapponi le carte lasciando visibile la riga del numero in basso, poi premi \"Leggi ventaglio\"."
               else if (scanning) "Inquadra la carta intera: la aggiungo da sola." else "Premi ▶ Avvia scansione quando sei pronto.")
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
                if (bmp == null) { runOnUiThread { fanDone(); status("Errore nella foto, riprova.", true); feedbackError() }; return }
                recognizer.process(InputImage.fromBitmap(bmp, 0))
                    .addOnSuccessListener { t ->
                        fanDone()
                        val sc = Recognizer.scan(t, sd)
                        showFanResult(bmp, sc, sd)
                    }
                    .addOnFailureListener { fanDone(); status("Errore di lettura, riprova.", true); feedbackError() }
            }
            override fun onError(e: ImageCaptureException) {
                runOnUiThread { fanDone(); status("Errore nello scatto: ${e.message}", true); feedbackError() }
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
        // modalità speciale: ogni carta prende la sua variante (Energia, la sua Ball…); quelle che non ce l'hanno restano fuori
        val spec = Variants.isSpecial(varMode)
        val vmap = HashMap<String, Pair<String, String>?>()
        if (spec) scan.good.map { CardRepo.norm(it.num) }.distinct().forEach { n -> vmap[n] = resolveNow(n) }
        val good = if (spec) scan.good.filter { vmap[CardRepo.norm(it.num)] != null } else scan.good
        val noVar = if (spec) scan.good.map { CardRepo.norm(it.num) }.distinct().filter { vmap[it] == null } else emptyList()
        val counts = good.groupingBy { h -> CardRepo.norm(h.num).let { n -> n to (if (spec) vmap[n]!!.first else if (h.reverse == true) "R" else "") } }.eachCount()
            .toSortedMap(compareBy<Pair<String, String>>({ it.first.toIntOrNull() ?: Int.MAX_VALUE }, { it.first }, { it.second }))
        val labelOf = { n: String -> if (spec) vmap[n]?.second ?: "" else "" }
        val revN = good.count { it.reverse == true }
        val unknownN = 0
        val total = good.size

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
            sb.append("${CardRepo.pad(nv.first)} $name${if (nv.second == "R") "  ✦Reverse" else if (spec) "  ✦" + labelOf(nv.first) else ""}${if (c > 1) "  ×$c" else ""}\n")
        }
        if (revN > 0) sb.append("\nTutte Reverse Holo (modalità Reverse attiva).\n")
        if (spec && total > 0) sb.append("\nTutte ${Variants.modeLabel(varMode)}: ognuna con la sua variante.\n")
        if (noVar.isNotEmpty()) sb.append("\n⚠ Non esistono come ${Variants.modeLabel(varMode)} (o varianti non ancora lette): ${noVar.joinToString(", ") { CardRepo.pad(it) }}. Non le aggiungo.\n")
        if (noVar.isNotEmpty() && varMode == Variants.PROMO) sb.append("(Le carte con più versioni Promo vanno aggiunte con la carta singola: ti chiedo quale.)\n")
        if (unknownN > 0) sb.append("⚠ Per $unknownN carte non sono riuscito a capire se sono Reverse (sigla grigia): contate come normali.\n")
        if (scan.bad.isNotEmpty())
            sb.append("\n⚠ ${scan.bad.size} righe con totale diverso da /${sd.total} (in rosso, ignorate).\n")
        if (total > 0) sb.append("\nConta le carte del ventaglio: se sono di più, qualcuna non è stata letta (non ha il riquadro verde).")
        content.addView(TextView(this).apply { text = sb.toString(); textSize = 15f; setPadding(0, 12, 0, 0) })

        if (total == 0 || noVar.isNotEmpty()) feedbackError()
        val b = AlertDialog.Builder(this)
            .setTitle("Ventaglio")
            .setView(ScrollView(this).apply { addView(content) })
            .setNegativeButton("Annulla", null)
            .setOnDismissListener { paused = false }
        if (total > 0) b.setPositiveButton("Aggiungi $total") { _, _ ->
            for ((nv, c) in counts) repeat(c) { Inventory.add(this, lang, sd, nv.first, nv.second, persist = false, label = labelOf(nv.first)) }
            Inventory.save(this)
            counts.keys.forEach { nv -> fetchRarityFor(Inventory.key(lang, sd.id, nv.first, nv.second)) }
            showLast("✓ Aggiunte $total carte dal ventaglio", "")
            feedback(); updateListBtn()
        }
        b.show()
    }

    // ---------------- lista ----------------

    private fun addCard(num: String, note: String, variant: String = "", label: String = "") {
        val sd = set ?: return
        val (k, item) = Inventory.add(this, lang, sd, num, variant, label = label)
        lastAddN = item.num; lastAddVar = variant; lastAddTime = System.currentTimeMillis()
        val extra = sd.total > 0 && (item.num.toIntOrNull() ?: 0) > sd.total
        showLast("✓ ${CardRepo.pad(item.num)}/${sd.total}${if (extra) " · fuoriserie" else ""}\n${item.name.ifEmpty { "—" }}" +
            Inventory.tag(item) + "   ×${item.qty}" +
            (if (note.isNotEmpty()) "  ($note)" else ""), item.img)
        when {
            sd.cards[item.num] == null && sd.cards.isNotEmpty() -> {   // numero che nel set non esiste (es. scritto male a mano)
                feedbackError()
                status("Attenzione: la carta ${CardRepo.pad(item.num)} non risulta nel set ${sd.name}. Se è sbagliata premi ↶ Annulla.", true)
            }
            item.qty > 1 -> feedbackPresent()                          // c'era già nella lista: un'altra copia
            else -> feedback()                                         // carta nuova
        }
        updateListBtn()
        fetchRarityFor(k)
    }

    /** ＋: altre copie dell'ultima carta, con la stessa variante (Normale o Reverse). */
    private fun addMoreCopies(n: Int) {
        val r = Inventory.addAgain(this, n)
        if (r == null) { showLast("Nessuna carta a cui aggiungere copie: scansionane prima una", ""); feedbackError(); return }
        val (_, it2) = r
        showLast("＋$n ${CardRepo.pad(it2.num)} ${it2.name}" + Inventory.tag(it2) + "   ×${it2.qty}", it2.img)
        lastAddN = it2.num; lastAddVar = it2.variant; lastAddTime = System.currentTimeMillis()
        feedbackPresent()
        updateListBtn()
    }

    private fun askHowMany() {
        val et = EditText(this).apply { hint = "Quante copie in più?"; inputType = InputType.TYPE_CLASS_NUMBER; setText("2"); selectAll() }
        paused = true
        AlertDialog.Builder(this).setTitle("Aggiungi copie dell'ultima carta")
            .setView(LinearLayout(this).apply { setPadding(48, 16, 48, 0); addView(et, ViewGroup.LayoutParams(-1, -2)) })
            .setPositiveButton("Aggiungi") { _, _ ->
                val n = et.text.toString().trim().toIntOrNull() ?: 0
                if (n in 1..99) addMoreCopies(n) else status("Numero di copie non valido (1–99).", true)
            }
            .setNegativeButton("Annulla", null)
            .setOnDismissListener { paused = false }
            .show()
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
                // anche la carta scritta a mano prende la variante della modalità attiva (Reverse, Energia, Ball…)
                if (v.isNotEmpty()) addWithMode(v, "a mano")
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

    /** Colori viola (Reverse) od oro (varianti speciali) quando la modalità è attiva, per non dimenticarla accesa. */
    private fun tintReverse() {
        val c = when { Variants.isSpecial(varMode) -> OverlayView.SPECIAL; reverseMode -> Color.rgb(204, 93, 232); else -> Color.rgb(255, 203, 5) }
        btnList.backgroundTintList = android.content.res.ColorStateList.valueOf(c)
    }

    /** Mostra la modalità attiva (testo del pulsante, cornice della fotocamera, colori) e la salva. */
    private fun applyVarMode(announce: Boolean) {
        overlay.reverseMode = reverseMode
        overlay.specialLabel = if (Variants.isSpecial(varMode)) Variants.modeLabel(varMode) else null
        tintReverse()
        buildModeBar()
        prefs.edit().putString("varMode", varMode).putBoolean("reverseMode", reverseMode).apply()
        resetCand(); locked = null
        if (announce) status(when {
            varMode == Variants.N -> "Modalità normale."
            varMode == Variants.R -> "Modalità REVERSE: tutte le carte che scansioni ora sono Reverse Holo."
            varMode == Variants.BALL -> "Modalità REVERSE BALL: ogni carta prende la sua Ball (Poké, Love, Scuro…) o il Team Rocket."
            else -> "Modalità ${Variants.modeLabel(varMode).uppercase()}: le carte che non hanno questa variante non vengono aggiunte."
        })
    }

    private fun modeLetter(m: String) = when (m) { Variants.N -> "N"; Variants.R -> "R"; Variants.ENERGIA -> "E"; Variants.BALL -> "B"; Variants.MASTER -> "M"; Variants.PROMO -> "P"; else -> "?" }
    private fun modeColor(m: String) = when { Variants.isSpecial(m) -> OverlayView.SPECIAL; m == Variants.R -> Color.rgb(204, 93, 232); else -> Color.rgb(255, 203, 5) }

    /**
     * Cerchi delle varianti sul bordo destro della fotocamera: solo quelle che esistono nel set.
     * Tocco = passa a quella variante; tocco lungo = elenco con i nomi per esteso.
     */
    private fun buildModeBar() {
        val sd = set
        val (found, known) = if (sd != null) Variants.setModes(this, lang, sd) else listOf(Variants.N, Variants.R) to 0
        val modes = if (varMode in found) found else found + varMode
        val d = resources.displayMetrics.density
        val size = (50 * d).toInt()
        modeBar.removeAllViews()
        for (m in modes) {
            val on = m == varMode
            val col = modeColor(m)
            modeBar.addView(TextView(this).apply {
                text = modeLetter(m); textSize = 19f; gravity = android.view.Gravity.CENTER
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(if (on && m == Variants.R) Color.WHITE else Color.rgb(40, 40, 40))
                background = android.graphics.drawable.GradientDrawable().apply {
                    shape = android.graphics.drawable.GradientDrawable.OVAL
                    setColor(if (on) col else Color.argb(215, 255, 255, 255))
                    setStroke((if (on) 3 * d else 1.5f * d).toInt(), if (on) Color.WHITE else col)
                }
                elevation = if (on) 6 * d else 2 * d
                contentDescription = Variants.modeLabel(m)
                setOnClickListener {
                    if (m != varMode) { varMode = m; applyVarMode(true) }
                    else status("Modalità ${Variants.modeLabel(m)} già attiva.")
                }
                setOnLongClickListener { chooseMode(); true }
            }, LinearLayout.LayoutParams(size, size).apply { setMargins(0, (5 * d).toInt(), 0, (5 * d).toInt()) })
        }
        val tot = sd?.cards?.values?.count { it.id.isNotEmpty() } ?: 0
        if (sd != null && known < tot) modeBar.addView(TextView(this).apply {
            text = "$known/$tot"; textSize = 10f; setTextColor(Color.WHITE); gravity = android.view.Gravity.CENTER
            setShadowLayer(3f, 0f, 0f, Color.BLACK)
        })
    }

    /** Scelta della variante: solo quelle che esistono nel set (lette da TCGdex). */
    private fun chooseMode() {
        val sd = set ?: run { status("Scegli prima un set.", true); return }
        val (found, known) = Variants.setModes(this, lang, sd)
        val modes = if (varMode in found) found else found + varMode
        val labels = modes.map { m -> when (m) {
            Variants.N -> "Normale"
            Variants.R -> "Reverse Holo"
            Variants.ENERGIA -> "Reverse Energia"
            Variants.BALL -> "Reverse Ball (la Ball della carta, o Team Rocket)"
            Variants.MASTER -> "Reverse Master Ball"
            Variants.PROMO -> "Promo (timbrate, Cosmo Holo…)"
            else -> m } }.toTypedArray()
        val tot = sd.cards.values.count { it.id.isNotEmpty() }
        val note = (if (known < tot) "Sto leggendo le varianti del set: $known di $tot carte (serve internet). Se manca una modalità, riapri tra poco.\n\n" else "") +
            "Jumbo e Non Holo aggiungile dal gestionale."
        val head = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(56, 40, 56, 8)
            addView(TextView(this@MainActivity).apply { text = "Variante delle carte"; textSize = 20f; setTypeface(typeface, android.graphics.Typeface.BOLD) })
            addView(TextView(this@MainActivity).apply { text = note; textSize = 13f; setPadding(0, 12, 0, 0) })
        }
        AlertDialog.Builder(this).setCustomTitle(head)
            .setSingleChoiceItems(labels, modes.indexOf(varMode).coerceAtLeast(0)) { d, i ->
                d.dismiss()
                if (modes[i] != varMode) { varMode = modes[i]; applyVarMode(true) }
            }
            .setNegativeButton("Chiudi", null).show()
    }

    /** Set appena letto: se la modalità speciale attiva non esiste in questo set torno a Normale. */
    private fun checkModeAvailable(sd: SetData) {
        if (!Variants.isSpecial(varMode)) return
        val (found, known) = Variants.setModes(this, lang, sd)
        val tot = sd.cards.values.count { it.id.isNotEmpty() }
        if (known >= tot * 0.9 && varMode !in found) {
            val old = Variants.modeLabel(varMode)
            varMode = Variants.N; applyVarMode(false)
            status("In ${sd.name} non c'è la $old: torno alla modalità Normale.", true)
        }
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
                "4. VARIANTE: i cerchi a destra della fotocamera (N Normale, R Reverse, E Energia, B Ball, M Master Ball, P Promo) mostrano solo le varianti del set. " +
                "Tocca un cerchio per cambiare; tieni premuto per l'elenco con i nomi. Finché è attiva, tutte le carte che scansioni prendono quella variante. " +
                "Con \"Ball\" ogni carta prende la sua (Poké, Love, Scuro… o Team Rocket). Una carta che non ha la variante scelta non viene aggiunta (suono di errore). " +
                "La cornice diventa viola per la Reverse, oro per le varianti speciali.\n\n" +
                "5. Verifica nome: controlla anche il nome stampato, per evitare numeri letti male.\n\n" +
                "Altri comandi: due dita per lo zoom, tocca l'immagine per mettere a fuoco, 🔦 luce, ↶ annulla l'ultima, " +
                "⇄ Rev cambia l'ultima tra normale e Reverse, ✍ aggiunge a mano, ＋ aggiunge un'altra copia dell'ultima carta (tieni premuto per scegliere quante).\n\n" +
                "▶ Avvia / ⏸ Ferma scansione: la carta singola viene letta solo a scansione avviata.\n\n" +
                "SUONI: bip corto = carta nuova aggiunta · campanella = carta già presente nella lista (un'altra copia) · suono basso e lungo = errore di lettura che dura (set sbagliato, nome non letto, due numeri insieme).\n\n" +
                "6. In 📋 Lista trovi tutte le carte: tocca il nome di un set per chiuderle in una lista numerata, poi 📤 Invia liste al gestionale manda i file al PC."
            )
            .setPositiveButton("Ho capito", null).show()
    }

    /** Carta nuova aggiunta: bip corto (come prima). */
    private fun feedback() {
        try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 80) } catch (_: Exception) {}
        vibrate(longArrayOf(0, 50))
    }

    /** Carta già presente nella lista (un'altra copia): campanella. */
    private fun feedbackPresent() {
        chime?.play() ?: try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP2, 260) } catch (_: Exception) {}
        vibrate(longArrayOf(0, 30, 70, 30))
    }

    private var lastErrSound = 0L
    /** Errore di scansione: suono basso e lungo + vibrazione lunga (al massimo una volta ogni 2,5 s). */
    private fun feedbackError() {
        val now = System.currentTimeMillis()
        if (now - lastErrSound < 2500) return
        lastErrSound = now
        try { tone?.startTone(ToneGenerator.TONE_SUP_ERROR, 450) } catch (_: Exception) {}
        vibrate(longArrayOf(0, 300))
    }

    private fun vibrate(pattern: LongArray) {
        try {
            getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } catch (_: Exception) {}
    }

    private fun status(t: String, warn: Boolean = false) {
        tvStatus.text = t
        tvStatus.setTextColor(if (warn) Color.rgb(255, 140, 140) else Color.WHITE)
        tvStatus.visibility = if (t.isBlank()) View.GONE else View.VISIBLE
    }

    @Suppress("unused")
    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_SHORT).show()
}

/** Letture degli ultimi secondi: per ogni fotogramma l'insieme dei numeri validi letti. */
class Votes {
    private val frames = ArrayDeque<Pair<Long, Set<String>>>()
    fun add(t: Long, nums: Set<String>) {
        frames.addLast(t to nums)
        while (frames.isNotEmpty() && t - frames.first().first > 3000) frames.removeFirst()
        while (frames.size > 90) frames.removeFirst()
    }
    fun clear() = frames.clear()
    fun size(now: Long, ms: Long) = frames.count { now - it.first <= ms }
    fun count(n: String, now: Long, ms: Long) = frames.count { now - it.first <= ms && n in it.second }
    fun ranking(now: Long, ms: Long): List<Pair<String, Int>> =
        frames.filter { now - it.first <= ms }.flatMap { it.second }.groupingBy { it }.eachCount()
            .toList().sortedByDescending { it.second }
}
