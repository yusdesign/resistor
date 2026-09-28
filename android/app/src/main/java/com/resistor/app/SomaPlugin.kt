package com.resistor.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import fi.iki.elonen.NanoHTTPD
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.InputStream
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name = "Soma")
class SomaPlugin : Plugin() {

    private var server: NanoHTTPD? = null

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)          // never time out a live stream
        .connectTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .connectionPool(ConnectionPool(2, 10, TimeUnit.MINUTES))
        .build()

    @Volatile private var currentUrl: String =
        "https://ice5.somafm.com/indiepop-32-aac"

    private fun openUpstream(): InputStream {
        val req = Request.Builder()
            .url(currentUrl)
            .header("User-Agent", "mpv 0.37.0")
            // .header("Icy-MetaData", "1")
            .build()
        return client.newCall(req).execute().body!!.byteStream()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val station = call.getString("station") ?: "indiepop"
        currentUrl = "https://ice5.somafm.com/$station-32-aac"

        if (server == null) {
            server = object : NanoHTTPD(8765) {
                override fun serve(session: IHTTPSession): Response {
                    return newChunkedResponse(
                        Response.Status.OK,
                        "audio/aac",
                        makeReconnectingStream()
                    )
                }
            }.also { it.start(0, false) }   // 0 = no socket read timeout
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        server?.stop()
        server = null
        call.resolve()
    }

    @PluginMethod
    fun lyricsCacheGet(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("missing key")
        val prefs = context.getSharedPreferences("resistor_lyrics", 0)
        val value = prefs.getString(key, null)
        call.resolve(JSObject().put("value", value))
    }
    
    @PluginMethod
    fun lyricsCachePut(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("missing key")
        val value = call.getString("value") ?: return call.reject("missing value")
        val prefs = context.getSharedPreferences("resistor_lyrics", 0)
        prefs.edit().putString(key, value).apply()
        call.resolve()
    }

    /**
     * An InputStream that transparently re-opens the upstream connection
     * when SomaFM rotates it. From NanoHTTPD's point of view it's one
     * continuous stream; the audio element never sees an EOF.
     */
    private fun makeReconnectingStream(): InputStream {
        return object : InputStream() {
            private var current: InputStream = openUpstream()

            private fun reopen() {
                try { current.close() } catch (_: Exception) {}
                current = openUpstream()
            }

            override fun read(): Int {
                var b = current.read()
                if (b == -1) {
                    reopen()
                    b = current.read()
                }
                return b
            }

            override fun read(buf: ByteArray, off: Int, len: Int): Int {
                var n = current.read(buf, off, len)
                if (n <= 0) {
                    reopen()
                    n = current.read(buf, off, len)
                }
                return n
            }

            override fun close() {
                try { current.close() } catch (_: Exception) {}
                super.close()
            }
        }
    }
}
