package com.resistor.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import fi.iki.elonen.NanoHTTPD
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.InputStream
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@CapacitorPlugin(name = "Soma")
class SomaPlugin : Plugin() {

    private var server: NanoHTTPD? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile private var currentUrl: String =
        "https://ice5.somafm.com/indiepop-32-aac"

    @Volatile private var producer: Thread? = null

    // ring buffer: 512 KB ≈ 2 minutes at 32 kbps
    private val bufferSize = 512 * 1024
    private val buffer = ByteArray(bufferSize)
    @Volatile private var writePos = 0
    @Volatile private var readPos = 0
    private val lock = ReentrantLock()
    private val notEmpty = lock.newCondition()
    private val notFull = lock.newCondition()

    private fun openUpstream(): InputStream {
        val req = Request.Builder()
            .url(currentUrl)
            .header("User-Agent", "mpv 0.37.0")
            .header("Icy-MetaData", "1")
            .build()
        return client.newCall(req).execute().body!!.byteStream()
    }

    private fun startProducer() {
        if (producer?.isAlive == true) return
        producer = Thread {
            var stream: InputStream? = null
            val chunk = ByteArray(8192)
            while (!Thread.currentThread().isInterrupted) {
                try {
                    if (stream == null) stream = openUpstream()
                    val n = stream.read(chunk)
                    if (n <= 0) {
                        stream.close(); stream = null
                        Thread.sleep(500)
                        continue
                    }
                    var written = 0
                    while (written < n) {
                        lock.withLock {
                            while (((writePos + 1) % bufferSize) == readPos) {
                                // buffer full — wait for the consumer
                                notFull.await(100, TimeUnit.MILLISECONDS)
                            }
                            val free = if (writePos >= readPos)
                                bufferSize - writePos + readPos - 1
                            else readPos - writePos - 1
                            val canWrite = minOf(free, n - written)
                            val firstChunk = minOf(canWrite, bufferSize - writePos)
                            System.arraycopy(chunk, written, buffer, writePos, firstChunk)
                            writePos = (writePos + firstChunk) % bufferSize
                            if (canWrite > firstChunk) {
                                val second = canWrite - firstChunk
                                System.arraycopy(chunk, written + firstChunk, buffer, 0, second)
                                writePos = second
                            }
                            written += canWrite
                            notEmpty.signalAll()
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.w("SomaPlugin", "producer: ${e.message}")
                    try { stream?.close() } catch (_: Exception) {}
                    stream = null
                    try { Thread.sleep(1000) } catch (_: InterruptedException) {}
                }
            }
            try { stream?.close() } catch (_: Exception) {}
        }.also { it.isDaemon = true; it.start() }
    }

    private fun makeClientStream(): InputStream {
        startProducer()
        return object : InputStream() {
            override fun read(): Int {
                val b = ByteArray(1)
                val n = read(b, 0, 1)
                return if (n <= 0) -1 else b[0].toInt() and 0xFF
            }
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                lock.withLock {
                    while (readPos == writePos) {
                        notEmpty.await(200, TimeUnit.MILLISECONDS)
                    }
                    val available = if (writePos >= readPos)
                        writePos - readPos
                    else bufferSize - readPos + writePos
                    val toRead = minOf(available, len)
                    val firstChunk = minOf(toRead, bufferSize - readPos)
                    System.arraycopy(buffer, readPos, b, off, firstChunk)
                    readPos = (readPos + firstChunk) % bufferSize
                    if (toRead > firstChunk) {
                        val second = toRead - firstChunk
                        System.arraycopy(buffer, 0, b, off + firstChunk, second)
                        readPos = second
                    }
                    notFull.signalAll()
                    return toRead
                }
            }
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val station = call.getString("station") ?: "indiepop"
        currentUrl = "https://ice5.somafm.com/$station-32-aac"

        // reset buffer on station change
        lock.withLock {
            readPos = 0; writePos = 0
        }
        producer?.interrupt()
        producer = null

        if (server == null) {
            server = object : NanoHTTPD(8765) {
                override fun serve(session: IHTTPSession): Response {
                    return newChunkedResponse(
                        Response.Status.OK,
                        "audio/aac",
                        makeClientStream()
                    )
                }
            }.also { it.start(60_000, false) }
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        producer?.interrupt()
        producer = null
        server?.stop()
        server = null
        call.resolve()
    }
}
