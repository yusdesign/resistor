package com.resistor.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import fi.iki.elonen.NanoHTTPD
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.InputStream

@CapacitorPlugin(name = "Soma")
class SomaPlugin : Plugin() {

    private var server: NanoHTTPD? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
        .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    @Volatile private var currentUrl: String =
        "https://ice5.somafm.com/indiepop-32-aac"

    @PluginMethod
    fun start(call: PluginCall) {
        val station = call.getString("station") ?: "indiepop"
        currentUrl = "https://ice5.somafm.com/$station-32-aac"
    
        if (server == null) {
            server = object : NanoHTTPD(8765) {
                override fun serve(session: IHTTPSession): Response {
                    val stream = object : InputStream() {
                        private var current: InputStream = openUpstream()
                        private fun openUpstream(): InputStream {
                            val req = Request.Builder()
                                .url(currentUrl)
                                .header("User-Agent", "mpv 0.37.0")
                                .header("Icy-MetaData", "1")
                                .build()
                            return client.newCall(req).execute().body!!.byteStream()
                        }
                        override fun read(): Int {
                            val b = current.read()
                            if (b == -1) {
                                current.close()
                                current = openUpstream()   // ← reconnect silently
                                return current.read()
                            }
                            return b
                        }
                        override fun read(b: ByteArray, off: Int, len: Int): Int {
                            val n = current.read(b, off, len)
                            if (n == -1) {
                                current.close()
                                current = openUpstream()
                                return current.read(b, off, len)
                            }
                            return n
                        }
                        override fun close() { current.close() }
                    }
                    return newChunkedResponse(
                        Response.Status.OK,
                        "audio/aac",
                        stream
                    )
                }
            }.also { it.start(60_000, false) }
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        server?.stop()
        server = null
        call.resolve()
    }
}
