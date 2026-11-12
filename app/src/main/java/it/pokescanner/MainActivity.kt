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
    private lateinit var spLang: Spinner
    private lateinit var btnSet: Button
    private lateinit var rbFan: RadioButton
    private lateinit var cbName: CheckBox
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

    private val langs = listOf("it", "en", "fr", "de", "es", "pt", "ja")

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startCamera() else status("Serve il permesso per la fotocamera.", true)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        previewView = findViewById(R.id.previewView)
        overlay = findViewById(R.id.overlay)
        spLang = findViewById(R.id.spLang)
        btnSet = findViewById(R.id.btnSet)
        rbFan = findViewById(R.id.rbFan)
        cbName = findViewById(R.id.cbName)
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

        // lingua
        spLang.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item,
            langs.map { it.uppercase() })
        spLang.setSelection(max(0, langs.indexOf(lang)), false)
        spLang.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                val l = langs[pos]
                if (l != lang) { lang = l; prefs.edit().putString("lang", l).apply(); loadSets() }
            }
            override fun onNothingSelected(p: AdapterView<*>?) {}
        }
        btnSet.setOnClickListener { pickSet() }

        // modalità
        if (fanMode) rbFan.isChecked = true
        findViewById<android.widget.RadioGroup>(R.id.rgMode).setOnCheckedChangeListener { _, id ->
            fanMode = id == R.id.rbFan
            prefs.edit().putBoolean("fan", fanMode).apply()
            applyMode()
        }
        cbName.isChecked = nameCheck
        cbName.setOnCheckedChangeListener { _, c -> nameCheck = c; prefs.edit().putBoolean("nameCheck", c).apply() }
        applyMode()

        btnShot.setOnClickListener { shootFan() }
        btnForce.setOnClickListener {
            val p = pending ?: return@setOnClickListener
            addCard(p, "forzata")
            locked = p; resetCand(); hideForce()
        }
        findViewById<Button>(R.id.btnTorch).setOnClickListener {
            torch = !torch; camera?.cameraControl?.enableTorch(torch)
        }
        findViewById<Button>(R.id.btnUndo).setOnClickListener {
            val removed = Inventory.undo(this)
            tvLast.text = if (removed != null) "↶ tolta ${CardRepo.pad(removed.num)} ${removed.name}" else "Niente da annullare"
            locked = null; updateListBtn()
        }
        findViewById<Button>(R.id.btnManual).setOnClickListener { manualAdd() }
        btnList.setOnClickListener { startActivity(Intent(this, ListActivity::class.java)) }

        setupGestures()
        loadSets()

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
        btnSet.text = "Caricamento set…"
        set = null
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { runCatching { CardRepo.sets(this@MainActivity, lang) } }
            res.onSuccess { list ->
                sets = list
                val saved = prefs.getString("set_$lang", null)
                val s = list.firstOrNull { it.id == saved } ?: list.firstOrNull()
                if (s != null) selectSet(s.id) else btnSet.text = "Nessun set"
            }.onFailure {
                btnSet.text = "Set non disponibili – tocca per riprovare"
                status("Impossibile scaricare l'elenco dei set: serve internet la prima volta.", true)
            }
        }
    }

    private fun selectSet(id: String) {
        btnSet.text = "Caricamento…"
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { runCatching { CardRepo.set(this@MainActivity, lang, id) } }
            res.onSuccess { sd ->
                set = sd
                prefs.edit().putString("set_$lang", id).apply()
                btnSet.text = "${sd.name} · /${sd.total}"
                resetCand(); locked = null; hideForce()
                status(if (fanMode) "Disponi le carte a ventaglio e premi \"Leggi ventaglio\"."
                       else "Inquadra la carta intera: la aggiungo da sola.")
            }.onFailure {
                btnSet.text = "Errore set – tocca per riprovare"
                status("Non riesco a caricare il set scelto.", true)
            }
        }
    }

    private fun pickSet() {
        if (sets.isEmpty()) { loadSets(); return }
        val search = EditText(this).apply { hint = "Cerca set…"; isSingleLine = true }
        val lv = ListView(this)
        var filtered = sets
        fun label(s: SetInfo) = "${s.name}  (/${s.official})"
        val adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, sets.map { label(it) }.toMutableList())
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
                filtered = sets.filter { q.isEmpty() || it.name.lowercase().contains(q) || it.id.lowercase().contains(q) }
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
            .addOnSuccessListener { text -> if (!paused) onFrame(text, w, h) }
            .addOnCompleteListener { proxy.close() }
    }

    // ---------------- modalità carta singola ----------------

    private fun onFrame(text: Text, w: Int, h: Int) {
        val sd = set ?: return
        val lines = Recognizer.lines(text)
        val scan = Recognizer.scanLines(lines, sd)
        lastScan = scan
        overlay.show(scan.good.map { it.box }, scan.bad.map { it.box }, w, h)

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
        if (n == cand) candN++ else { cand = n; candN = 1; nameFailN = 0; if (pending != null && pending != n) hideForce() }
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
        addCard(n, "")
        locked = n; resetCand(); hideForce()
        status("Ok, prossima carta.")
    }

    private fun resetCand() { cand = null; candN = 0; nameFailN = 0 }
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
                    .addOnSuccessListener { t -> fanDone(); showFanResult(bmp, Recognizer.scan(t, sd), sd) }
                    .addOnFailureListener { fanDone(); status("Errore di lettura, riprova.", true) }
            }
            override fun onError(e: ImageCaptureException) {
                runOnUiThread { fanDone(); status("Errore nello scatto: ${e.message}", true) }
            }
        })
    }

    private fun fanDone() { paused = false; btnShot.isEnabled = true }

    private fun prepare(src: Bitmap, rot: Int, maxSide: Int): Bitmap {
        val m = Matrix()
        if (rot != 0) m.postRotate(rot.toFloat())
        val big = max(src.width, src.height)
        if (big > maxSide) { val s = maxSide.toFloat() / big; m.postScale(s, s) }
        return if (m.isIdentity) src else Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    private fun showFanResult(bmp: Bitmap?, scan: Recognizer.Scan, sd: SetData) {
        paused = true
        val counts = scan.good.groupingBy { CardRepo.norm(it.num) }.eachCount()
            .toSortedMap(compareBy<String>({ it.toIntOrNull() ?: Int.MAX_VALUE }, { it }))
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
            content.addView(ImageView(this).apply {
                adjustViewBounds = true
                maxHeight = (resources.displayMetrics.heightPixels * 0.45).toInt()
                setImageBitmap(out)
            })
        }
        val sb = StringBuilder()
        sb.append(if (total == 0) "Nessuna carta riconosciuta.\n" else "Riconosciute $total carte (${counts.size} diverse):\n")
        for ((n, c) in counts) {
            val name = sd.cards[n]?.name ?: ""
            sb.append("${CardRepo.pad(n)} $name${if (c > 1) "  ×$c" else ""}\n")
        }
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
            for ((n, c) in counts) repeat(c) { Inventory.add(this, lang, sd, n, persist = false) }
            Inventory.save(this)
            counts.keys.forEach { n -> fetchRarityFor(Inventory.key(lang, sd.id, n)) }
            tvLast.text = "✓ aggiunte $total carte dal ventaglio"
            feedback(); updateListBtn()
        }
        b.show()
    }

    // ---------------- lista ----------------

    private fun addCard(num: String, note: String) {
        val sd = set ?: return
        val (k, item) = Inventory.add(this, lang, sd, num)
        tvLast.text = "✓ ${CardRepo.pad(item.num)}/${sd.total}  ${item.name}  ×${item.qty}" +
            if (note.isNotEmpty()) "  ($note)" else ""
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
            }
            .setNegativeButton("Annulla", null)
            .setOnDismissListener { paused = false }
            .show()
    }

    private fun updateListBtn() { btnList.text = "Lista (${Inventory.count()})" }

    private fun feedback() {
        try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 80) } catch (_: Exception) {}
        try {
            getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {}
    }

    private fun status(t: String, warn: Boolean = false) {
        tvStatus.text = t
        tvStatus.setTextColor(if (warn) Color.rgb(255, 107, 107) else tvLast.currentTextColor)
    }

    @Suppress("unused")
    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_SHORT).show()
}
