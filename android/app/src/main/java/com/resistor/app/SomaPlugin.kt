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
    private val client = OkHttpClient()
    @Volatile private var currentUrl: String =
        "https://ice5.somafm.com/indiepop-32-aac"

    @PluginMethod
    fun start(call: PluginCall) {
        val station = call.getString("station") ?: "indiepop"
        currentUrl = "https://ice5.somafm.com/$station-32-aac"

        if (server == null) {
            server = object : NanoHTTPD(8765) {
                override fun serve(session: IHTTPSession): Response {
                    val req = Request.Builder()
                        .url(currentUrl)
                        .header("User-Agent", "mpv 0.37.0")
                        .header("Icy-MetaData", "1")
                        .build()
                    val upstream = client.newCall(req).execute()
                    val body: InputStream = upstream.body!!.byteStream()
                    return newChunkedResponse(
                        Response.Status.OK,
                        upstream.header("Content-Type") ?: "audio/aac",
                        body
                    )
                }
            }.also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
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
