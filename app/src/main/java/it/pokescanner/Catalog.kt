package it.pokescanner

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Crea una pagina HTML con tutte le carte della lista, divise per set, con logo del set e immagini
 * delle carte (prese da TCGdex). Va chiamata fuori dal thread principale: legge i dati dei set.
 */
object Catalog {

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    fun build(ctx: Context): String {
        val groups = Inventory.groups()
        val total = Inventory.count()
        val rev = Inventory.items.values.filter { it.variant == "R" }.sumOf { it.qty }
        val date = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ITALY).format(Date())

        val body = StringBuilder()
        val nav = StringBuilder()
        groups.forEachIndexed { gi, g ->
            val first = g.items.first().second
            val sd = try { CardRepo.set(ctx, g.lang, first.setId) } catch (_: Exception) { null }
            val n = g.items.sumOf { it.second.qty }
            val nRev = g.items.filter { it.second.variant == "R" }.sumOf { it.second.qty }
            val anchor = "set$gi"
            nav.append("<a href=\"#$anchor\">${esc(g.setName)} <b>$n</b></a>")

            body.append("<section id=\"$anchor\" class=\"set\"><header>")
            if (!sd?.logo.isNullOrEmpty()) body.append("<img class=\"logo\" src=\"${esc(sd!!.logo)}.png\" alt=\"\" data-fb=\"1\">")
            body.append("<div><h2>${esc(g.setName)}</h2><p>${Inventory.LANG_NAMES[g.lang] ?: g.lang} · $n carte · ${g.items.size} diverse")
            if (nRev > 0) body.append(" · $nRev Reverse")
            if (g.total > 0) body.append(" · set da ${g.total}")
            body.append("</p></div></header><div class=\"grid\">")

            for ((_, i) in g.items) {
                val img = sd?.cards?.get(i.num)?.image ?: ""
                val isRev = i.variant == "R"
                val search = esc("${i.name} ${CardRepo.pad(i.num)} ${i.rarity} ${if (isRev) "reverse" else ""}".lowercase())
                body.append("<div class=\"card${if (isRev) " rev" else ""}\" data-s=\"$search\">")
                if (img.isNotEmpty()) {
                    body.append("<img loading=\"lazy\" src=\"${esc(img)}/low.webp\" data-hi=\"${esc(img)}/high.webp\" alt=\"${esc(i.name)}\" data-fb=\"1\">")
                } else {
                    body.append("<div class=\"noimg\">${CardRepo.pad(i.num)}</div>")
                }
                if (i.qty > 1) body.append("<span class=\"qty\">×${i.qty}</span>")
                if (isRev) body.append("<span class=\"badge\">REVERSE</span>")
                body.append("<div class=\"info\"><b>${CardRepo.pad(i.num)}/${if (i.total > 0) i.total else "?"}</b> ${esc(i.name)}")
                if (i.rarity.isNotEmpty()) body.append("<small>${esc(i.rarity)}</small>")
                body.append("</div></div>")
            }
            body.append("</div></section>")
        }

        return """<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalogo carte Pokémon</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--fg:#1c2128;--mut:#6b7280;--acc:#e3b500;--rev:#a64fd1}
@media(prefers-color-scheme:dark){:root{--bg:#111418;--card:#1c2128;--fg:#e8eaed;--mut:#9aa3ad;--acc:#ffcb05;--rev:#cc5de8}}
*{box-sizing:border-box}body{margin:0;font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
.top{position:sticky;top:0;z-index:5;background:var(--card);padding:12px 16px;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.top h1{margin:0 0 4px;font-size:20px}.top p{margin:0 0 8px;color:var(--mut);font-size:13px}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.tools input[type=search]{flex:1;min-width:160px;padding:8px 10px;border-radius:8px;border:1px solid #8884;background:var(--bg);color:var(--fg);font:inherit}
nav{display:flex;gap:6px;overflow-x:auto;margin-top:8px;padding-bottom:2px}
nav a{white-space:nowrap;text-decoration:none;color:var(--fg);background:var(--bg);padding:4px 10px;border-radius:99px;font-size:13px}
nav a b{color:var(--acc)}
.set{max-width:1200px;margin:24px auto;padding:0 16px}
.set header{display:flex;align-items:center;gap:16px;margin-bottom:12px}
.set .logo{height:56px;max-width:180px;object-fit:contain}
.set h2{margin:0;font-size:20px}.set header p{margin:2px 0 0;color:var(--mut);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.card{position:relative;background:var(--card);border-radius:10px;padding:8px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.card img{width:100%;aspect-ratio:63/88;object-fit:contain;border-radius:6px;cursor:zoom-in;background:var(--bg)}
.card.rev{outline:3px solid var(--rev)}
.noimg{aspect-ratio:63/88;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;font-size:28px;color:var(--mut)}
.info{font-size:13px;margin-top:6px}.info small{display:block;color:var(--mut)}
.qty{position:absolute;top:12px;right:12px;background:var(--acc);color:#111;font-weight:700;border-radius:99px;padding:2px 9px}
.badge{position:absolute;top:12px;left:12px;background:var(--rev);color:#fff;font-size:11px;font-weight:700;border-radius:6px;padding:2px 6px}
.hide{display:none!important}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
#zoom img{max-width:92vw;max-height:92vh;border-radius:12px}
</style></head><body>
<div class="top"><h1>Catalogo carte Pokémon</h1>
<p>$total carte · ${Inventory.items.size} diverse · ${groups.size} set${if (rev > 0) " · $rev Reverse" else ""} · aggiornato il $date</p>
<div class="tools"><input type="search" id="q" placeholder="Cerca nome, numero, rarità…">
<label><input type="checkbox" id="onlyRev"> solo Reverse</label></div>
<nav>$nav</nav></div>
$body
<div id="zoom"><img alt=""></div>
<script>
// immagine mancante in questa lingua: prova quella inglese, poi nascondi
document.querySelectorAll('img[data-fb]').forEach(function(im){
  im.addEventListener('error',function(){
    if(!im.dataset.tried && /assets\.tcgdex\.net\/[a-z-]+\//.test(im.src)){
      im.dataset.tried='1'; im.src=im.src.replace(/(assets\.tcgdex\.net\/)[a-z-]+\//,'$1en/');
      if(im.dataset.hi) im.dataset.hi=im.dataset.hi.replace(/(assets\.tcgdex\.net\/)[a-z-]+\//,'$1en/');
    } else { im.style.visibility='hidden'; }
  });
});
var q=document.getElementById('q'), onlyRev=document.getElementById('onlyRev');
function filter(){
  var t=q.value.trim().toLowerCase(), r=onlyRev.checked;
  document.querySelectorAll('.card').forEach(function(c){
    var ok=(!t||c.dataset.s.indexOf(t)>=0)&&(!r||c.classList.contains('rev'));
    c.classList.toggle('hide',!ok);
  });
  document.querySelectorAll('.set').forEach(function(s){
    s.classList.toggle('hide',!s.querySelector('.card:not(.hide)'));
  });
}
q.addEventListener('input',filter); onlyRev.addEventListener('change',filter);
var zoom=document.getElementById('zoom');
document.addEventListener('click',function(e){
  var im=e.target.closest('.card img');
  if(im){ zoom.querySelector('img').src=im.dataset.hi||im.src; zoom.style.display='flex'; }
  else if(e.target.closest('#zoom')) zoom.style.display='none';
});
</script></body></html>"""
    }
}
