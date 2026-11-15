package it.pokescanner

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * Suono "campanella" per la carta già presente nella lista: un solo rintocco morbido (due armoniche che sfumano),
 * ben diverso dal bip della carta nuova e dal suono basso dell'errore.
 */
class Chime {
    private val sr = 44100
    private val track: AudioTrack? = try {
        val n = (sr * 0.45).toInt()
        val pcm = ShortArray(n)
        for (i in 0 until n) {
            val t = i.toDouble() / sr
            val env = exp(-t * 9.0) * (if (t < 0.004) t / 0.004 else 1.0)   // attacco rapido, coda che sfuma
            val v = 0.55 * sin(2 * PI * 1318.5 * t) + 0.30 * sin(2 * PI * 1975.5 * t) + 0.12 * sin(2 * PI * 2637.0 * t)
            pcm[i] = (v * env * 0.85 * Short.MAX_VALUE).toInt().coerceIn(-32767, 32767).toShort()
        }
        AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(n * 2)
            .build().also { it.write(pcm, 0, n) }
    } catch (_: Exception) { null }

    fun play() {
        val t = track ?: return
        try {
            if (t.playState == AudioTrack.PLAYSTATE_PLAYING) t.stop()
            t.reloadStaticData()
            t.play()
        } catch (_: Exception) {}
    }

    fun release() { try { track?.release() } catch (_: Exception) {} }
}
