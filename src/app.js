// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RESISTOR app is SomaFM Indie Pop Rocks! Radio, v1.0.0b
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // ─── IMPORTS ───
    import { loadTracklist, saveTracklist, addTrack } from './tracklist.js';
    import { loadLyricsCache, saveLyricsCache, fetchLyrics } from './lyrics.js';
    
    // ─── BUILD INFO ───
    import pkg from '../package.json' with { type: 'json' };
    const VERSION = pkg.version;
    // const VERSION = '1.0.0b';

    // debug mode: 'demo' (seeded panel on web) or 'live' (real logs only)
    // default is 'demo'. override with ?mode=live or ?mode=demo in the URL.
    const DEBUG_MODE = (() => {
      const q = new URLSearchParams(location.search).get('mode');
      return (q === 'live' || q === 'demo') ? q : 'demo';
    })();
    
    // ─── CAPACITOR DETECTION ───
    const IS_NATIVE = typeof window !== 'undefined'
      && !!window.Capacitor?.isNativePlatform?.();
    const Soma = IS_NATIVE ? window.Capacitor.Plugins.Soma : null;
    
    // ─── DEBUG LOGGER ───
    const DEBUG = true;
    const t0 = Date.now();
    const debugEl = document.getElementById('debugLog');
    const debugPanel = document.getElementById('debugPanel');
    const debugToggle = document.getElementById('debugToggle');
    const debugTitle = document.getElementById('debugTitle');
    const debugCopy = document.getElementById('debugCopy');
    const debugClear = document.getElementById('debugClear');
    
    const debugLines = [];
    const DEBUG_MAX_LINES = 500;
    
    function dbg(tag, ...args) {
      if (!DEBUG) return;
      const ms = String(Date.now() - t0).padStart(7, ' ');
      const rest = args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');
      const line = `[${ms}ms] ${tag}${rest ? ' ' + rest : ''}`;
      console.log(line);
      debugLines.push(line);
      if (debugLines.length > DEBUG_MAX_LINES) debugLines.shift();
      if (debugEl) {
        debugEl.textContent = debugLines.join('\n');
        debugEl.scrollTop = debugEl.scrollHeight;
      }
    }
    
    // ─── PANEL BEHAVIOR ───
    if (debugToggle && debugPanel) {
      debugToggle.addEventListener('click', () => {
        debugPanel.classList.toggle('open');
      });
    }
    if (debugCopy) {
      debugCopy.addEventListener('click', async () => {
        const text = debugLines.join('\n');
        try {
          await navigator.clipboard.writeText(text);
          debugCopy.textContent = 'Copied';
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          debugCopy.textContent = 'Copied';
        }
        setTimeout(() => (debugCopy.textContent = 'Copy'), 1500);
      });
    }
    if (debugClear) {
      debugClear.addEventListener('click', () => {
        debugLines.length = 0;
        if (debugEl) debugEl.textContent = '';
      });
    }
    
    // ─── BOOT LINE ───
    dbg('BOOT', `Resistor ${VERSION} · mode=${DEBUG_MODE} · native=${IS_NATIVE}`);
    // ─── PANEL TITLE ───
    if (debugTitle) {
      debugTitle.textContent = IS_NATIVE
        ? `Resistor ${VERSION} — debug`
        : `Resistor ${VERSION} — demo`;
    }
    if (debugToggle) {
      debugToggle.title = IS_NATIVE ? 'Debug log' : 'Demo log';
    }
    
    // ─── DEMO SEED (web only, in demo mode) ───
    if (DEBUG_MODE === 'demo' && !IS_NATIVE) {
      // if (debugTitle) debugTitle.textContent = `Resistor ${VERSION} — demo`;
      // if (debugToggle) debugToggle.title = 'Demo log';
    
      dbg('DEMO', 'Resistor web preview');
      dbg('DEMO', 'Native plugin not available in the browser.');
      dbg('DEMO', 'Below is a simulated log of what the APK does.');
      dbg('DEMO', '─────');
      dbg('DEMO', 'SETUP  → Soma.start({ station: "indiepop" })');
      dbg('DEMO', 'SETUP  → audio.src = "http://127.0.0.1:8765/?t=…"');
      dbg('DEMO', 'AUDIO  → playing  (buffer 32 kbps AAC)');
      dbg('DEMO', 'LOOP   → metadata polling every 20s');
      dbg('DEMO', 'META   → GET somafm.com/songs/indiepop.json');
      dbg('DEMO', 'META   → now playing: <artist> — <title>');
      dbg('DEMO', 'META   → lyrics lookup via LRCLIB on demand');
      dbg('DEMO', '─────');
      dbg('DEMO', 'To hear the stream, install the Android APK.');
    }

    // ─── CONFIG ───
    const PLS_URL = 'https://somafm.com/indiepop32.pls';
    const SETTINGS_KEY = 'resistor_settings';

    // ─── DOM REFS ───
    const titleEl = document.getElementById('title');
    const artistEl = document.getElementById('artist');
    const playBtn = document.getElementById('playBtn');
    const statusEl = document.getElementById('status');
    const liveBadge = document.getElementById('liveBadge');
    const volumeSlider = document.getElementById('volumeSlider');
    const nowPlaying = document.getElementById('nowPlaying');
    const tracklistToggle = document.getElementById('tracklistToggle');
    const tracklistHeader = document.getElementById('tracklistHeader');
    const tracklistItems = document.getElementById('tracklistItems');
    const trackCount = document.getElementById('trackCount');
    const tracklistArrow = document.getElementById('tracklistArrow');
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.getElementById('closeSettings');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const bufferSize = document.getElementById('bufferSize');
    const bufferLabel = document.getElementById('bufferLabel');
    const autoReconnectToggle = document.getElementById('autoReconnectToggle');
    const eliseModeToggle = document.getElementById('eliseModeToggle');
    const showLyricsBtn = document.getElementById('showLyricsBtn');
    const closeLyrics = document.getElementById('closeLyrics');
    const lyricsPanel = document.getElementById('lyricsPanel');
    const lyricsContent = document.getElementById('lyricsContent');
    const toggleDedicationBtn = document.getElementById('toggleDedicationBtn');

    // ─── STATE ───
    let isPlaying = false;
    let reconnectAttempts = 0;
    let audio = null;
    let metadataTimer = null;
    let isTracklistOpen = false;
    let isEliseMode = false;
    let tracklist = [];
    let currentSong = { artist: '', title: '' };
    let streamUrls = [];
    let currentStreamIndex = 0;

    let settings = {
      darkMode: true,
      bufferSize: 30,
      autoReconnect: true,
      eliseMode: false
    };

    // ─── HELPERS ───
    function setStatus(text, type = '') {
      statusEl.textContent = text;
      statusEl.className = 'status ' + type;
    }

    function updateUI(playing) {
      const playIcon = playBtn.querySelector('use');
      if (playing) {
        playIcon.setAttribute('href', '#pause-icon');
        playBtn.classList.add('playing');
        liveBadge.textContent = '● Live';
        liveBadge.style.color = '#4ecdc4';
      } else {
        playIcon.setAttribute('href', '#play-icon');
        playBtn.classList.remove('playing');
        liveBadge.textContent = '○ Paused';
        liveBadge.style.color = '#888';
      }
    }

    // ─── RENDER TRACKLIST ───
    function renderTracklist() {
      trackCount.textContent = tracklist.length;
      if (tracklist.length === 0) {
        tracklistItems.innerHTML = '<div style="padding:8px 0;color:var(--muted);font-size:12px;">No tracks yet.</div>';
        return;
      }
      let html = '';
      tracklist.forEach(t => {
        html += `<div class="track-item"><span>${t.artist} — ${t.title}</span><span class="count">${t.count}x</span></div>`;
      });
      tracklistItems.innerHTML = html;
    }

    // ─── UPDATE NOW PLAYING ───
    function updateNowPlaying(artist, title) {
      if (!artist || !title) return;
      if (currentSong.artist === artist && currentSong.title === title) return;

      currentSong.artist = artist;
      currentSong.title = title;
      artistEl.textContent = artist;
      titleEl.textContent = title;
      setStatus('🎵 Now playing', 'playing');

      tracklist = addTrack(tracklist, title, artist);
      saveTracklist(tracklist);
      renderTracklist();

      if (isEliseMode) {
        displayLyrics(artist, title);
      }
    }

    // ─── METADATA FETCH ───
    async function fetchMetadata() {
      if (!IS_NATIVE) {
        dbg('META', '(demo) would fetch somafm.com/songs/indiepop.json');
        return;
      }
      dbg('META', 'fetch start');
      try {
        const response = await fetch('https://somafm.com/songs/indiepop.json', {
          signal: AbortSignal.timeout(8000)
        });
        dbg('META', 'response', response.status);
        if (!response.ok) return;
    
        const data = await response.json();
        dbg('META', 'songs', data.songs?.length);
    
        const current = data.songs?.[0];
        if (current && current.artist && current.title) {
          dbg('META', 'now playing', current.artist, '-', current.title);
          updateNowPlaying(current.artist, current.title);
        }
      } catch (e) {
        dbg('META', 'fetch error', e.name, e.message);
      }
    }

    // ─── LYRICS DISPLAY ───
    async function displayLyrics(artist, title) {
      lyricsPanel.style.display = 'block';

      if (!IS_NATIVE) {
        dbg('LYRICS', 'skipped — lyrics only available in the APK');
        lyricsContent.innerHTML =
          '<p style="color: var(--muted);">📱 Lyrics work only in the Android app.</p>';
        return;
      }
    
      lyricsContent.innerHTML = '🔍 Searching...';
    
      const lyrics = await fetchLyrics(artist, title);
      if (lyrics) {
        const lines = lyrics.split('\n').filter(line => line.trim());
        lyricsContent.innerHTML = lines.map(l => `<span class="line">${l}</span>`).join('');
      } else {
        lyricsContent.innerHTML = '📝 Lyrics unavailable for this track.';
      }
    }

    // ─── FETCH STREAM URLS FROM PLS ───
    async function fetchStreamUrls() {
      try {
        const response = await fetch(PLS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const lines = text.split('\n');
        const urls = [];
        for (const line of lines) {
          if (line.startsWith('File')) {
            const url = line.split('=')[1]?.trim();
            if (url && url.startsWith('https://')) {
              urls.push(url);
            }
          }
        }
        if (urls.length === 0) throw new Error('No valid HTTPS URLs found in PLS');
        return urls;
      } catch (e) {
        console.error('Failed to fetch PLS:', e.message);
        // Fallback to known working HTTPS URLs
        return [
          'https://ice5.somafm.com/indiepop-32-aac',
          'https://ice2.somafm.com/indiepop-32-aac',
          'https://ice6.somafm.com/indiepop-32-aac'
        ];
      }
    }

    // SETMETADATA
    function startMetadataLoop() {
      dbg('LOOP', 'start');
      if (metadataTimer) clearTimeout(metadataTimer);
      const tick = async () => {
        if (!isPlaying) {
          metadataTimer = setTimeout(tick, 5000);
          return;
        }
        await fetchMetadata();
        metadataTimer = setTimeout(tick, 20000);
      };
      metadataTimer = setTimeout(tick, 1000);
    }
    
    function stopMetadataLoop() {
      dbg('LOOP', 'stop');
      if (metadataTimer) {
        clearTimeout(metadataTimer);
        metadataTimer = null;
      }
    }

    // ─── AUDIO SETUP ───
    async function setupAudio() {
      dbg('SETUP', 'start', { IS_NATIVE, hasAudio: !!audio });
      // ─────────────────────────────────────────────
      // NATIVE (Capacitor APK) — talk to SomaPlugin
      // ─────────────────────────────────────────────
      if (IS_NATIVE) {
        dbg('SETUP', 'native branch, calling Soma.start');
        await Soma.start({ station: 'indiepop' });
        dbg('SETUP', 'Soma.start resolved');
    
        if (audio) {
          audio.pause();
          audio.src = '';
          audio = null;
        }
    
        audio = new Audio();
        // cache-buster — forces a fresh connection on each setup
        audio.src = 'http://127.0.0.1:8765/?t=' + Date.now();
        audio.volume = parseFloat(volumeSlider.value);
    
        // ─── EVENT LISTENERS (native) ───
        let lastWaitingLogAt = 0;
        
        audio.addEventListener('playing', () => {
          dbg('AUDIO', 'playing');
          isPlaying = true;
          reconnectAttempts = 0;
          updateUI(true);
          setStatus('🎵 Playing', 'playing');
          stopMetadataLoop();
          startMetadataLoop();
        });
        
        audio.addEventListener('pause', () => {
          dbg('AUDIO', 'pause');
          isPlaying = false;
          updateUI(false);
          setStatus('⏸ Paused', '');
          stopMetadataLoop();
        });
        
        audio.addEventListener('waiting', () => {
          const now = Date.now();
          if (now - lastWaitingLogAt > 2000) {
            dbg('AUDIO', 'waiting (buffer underrun)');
            lastWaitingLogAt = now;
          }
          if (isPlaying) setStatus('⏳ Buffering…', 'buffering');
        });
        
        audio.addEventListener('stalled', () => {
          dbg('AUDIO', 'stalled (no data for ~3s)');
          if (isPlaying) setStatus('⏳ Stalled…', 'buffering');
        });
        
        audio.addEventListener('canplay', () => {
          dbg('AUDIO', 'canplay (ready to resume)');
        });
        
        audio.addEventListener('error', () => {
          const code = audio.error?.code;
          const msg = audio.error?.message;
          dbg('AUDIO', 'error', { code, msg });
        
          if (settings.autoReconnect && isPlaying && reconnectAttempts < 3) {
            reconnectAttempts++;
            dbg('RECONNECT', `attempt ${reconnectAttempts}/3`);
            setStatus(`⟳ Reconnecting… (${reconnectAttempts}/3)`, 'buffering');
            setTimeout(() => {
              if (!audio) return;
              audio.src = 'http://127.0.0.1:8765/?t=' + Date.now();
              audio.play().catch((e) => {
                dbg('RECONNECT', 'play failed', e.name, e.message);
                if (reconnectAttempts >= 3) {
                  setStatus('❌ Stream error', 'error');
                  isPlaying = false;
                  updateUI(false);
                }
              });
            }, 1500 * reconnectAttempts);
          } else {
            dbg('RECONNECT', 'giving up', { autoReconnect: settings.autoReconnect, isPlaying, reconnectAttempts });
            setStatus('❌ Stream error', 'error');
            isPlaying = false;
            updateUI(false);
          }
        });

        dbg('SETUP', 'calling audio.play() on', audio.src);
        try {
          await audio.play();
          dbg('SETUP', 'audio.play() resolved');
        } catch (e) {
          dbg('SETUP', 'audio.play() rejected', e.name, e.message);
          setStatus('⚠️ Play error', 'error');
        }
    
        return audio;
      }
      if (!IS_NATIVE) {
      // WEB (browser) — SomaFM refuses browser requests.
      // Show an honest notice instead of retrying forever.
      // ─────────────────────────────────────────────
        if (audio) {
          audio.pause();
          audio.src = '';
          audio = null;
        }
        
        dbg('SETUP', 'web branch — playback requires the Android app');
        dbg('SETUP', 'reason: SomaFM blocks browser-originated requests (403)');
        setStatus('📱 Playback requires the Android app', 'error');
        isPlaying = false;
        updateUI(false);
        
        const notice = document.getElementById('status');
        if (notice) {
          notice.title = 'SomaFM blocks browser-originated streams. Install the Android APK to listen.';
        }
        
        return null;
      }
    }

    // ─── PLAYBACK ───
    async function togglePlay() {
      if (!audio || audio.src === '') {
        await setupAudio();
        if (!audio) return;
      }
      if (isPlaying) {
        audio.pause();
      } else {
        reconnectAttempts = 0;
        try {
          await audio.play();
        } catch (e) {
          console.error('Play error:', e);
          // Re-setup audio and try again
          await setupAudio();
          if (audio) {
            try {
              await audio.play();
            } catch (retryError) {
              setStatus('⚠️ Play error', 'error');
            }
          }
        }
      }
    }

    // ─── VOLUME ───
    volumeSlider.addEventListener('input', () => { if (audio) audio.volume = parseFloat(volumeSlider.value); });

    // ─── TRACKLIST TOGGLE ───
    function toggleTracklist() {
      isTracklistOpen = !isTracklistOpen;
      tracklistItems.classList.toggle('open', isTracklistOpen);
      tracklistArrow.classList.toggle('open', isTracklistOpen);
    }
    tracklistHeader.addEventListener('click', toggleTracklist);
    tracklistToggle.addEventListener('click', toggleTracklist);

    // ─── LYRICS BUTTON ───
    showLyricsBtn.addEventListener('click', () => {
      const artist = artistEl.textContent;
      const title = titleEl.textContent;
      if (artist && title && artist !== 'SomaFM' && title !== 'Resistor') {
        displayLyrics(artist, title);
      } else {
        lyricsContent.innerHTML = '🎵 Play a track first.';
        lyricsPanel.style.display = 'block';
      }
    });
    closeLyrics.addEventListener('click', () => { lyricsPanel.style.display = 'none'; });

    // ─── COPY METADATA ───
    function copyMetadata() {
      const title = titleEl.textContent;
      const artist = artistEl.textContent;
      const text = `${title} — ${artist}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setStatus('📋 Copied!', '');
          setTimeout(() => setStatus('🎵 Now playing', 'playing'), 2000);
        }).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    }
    nowPlaying.addEventListener('click', copyMetadata);

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setStatus('📋 Copied!', '');
      setTimeout(() => setStatus('🎵 Now playing', 'playing'), 2000);
    }

    // ─── SETTINGS ───
    function loadSettings() {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) { settings = JSON.parse(stored); applySettings(); }
    }

    function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

    function applySettings() {
      // Dark Mode
      if (settings.darkMode) {
        document.documentElement.removeAttribute('data-theme');
        darkModeToggle.checked = true;
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        darkModeToggle.checked = false;
      }
      // Buffer Size
      bufferSize.value = settings.bufferSize;
      bufferLabel.textContent = settings.bufferSize + 's';
      // Auto Reconnect
      autoReconnectToggle.checked = settings.autoReconnect;
      // Elise Mode
      eliseModeToggle.checked = settings.eliseMode;
      isEliseMode = settings.eliseMode;
      if (isEliseMode) {
        toggleDedicationBtn.classList.add('active');
        setStatus('❤️ Elise Mode', 'playing');
      } else {
        toggleDedicationBtn.classList.remove('active');
        setStatus('🎵 Playing', 'playing');
      }
    }

    function openSettings() { settingsModal.classList.add('open'); }
    function closeSettingsModal() { settingsModal.classList.remove('open'); }
    settingsToggle.addEventListener('click', openSettings);
    closeSettings.addEventListener('click', closeSettingsModal);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });

    darkModeToggle.addEventListener('change', () => { settings.darkMode = darkModeToggle.checked; applySettings(); saveSettings(); });
    bufferSize.addEventListener('input', () => { settings.bufferSize = parseInt(bufferSize.value); bufferLabel.textContent = settings.bufferSize + 's'; saveSettings(); });
    autoReconnectToggle.addEventListener('change', () => { settings.autoReconnect = autoReconnectToggle.checked; saveSettings(); });
    eliseModeToggle.addEventListener('change', () => {
      settings.eliseMode = eliseModeToggle.checked;
      isEliseMode = settings.eliseMode;
      applySettings();
      saveSettings();
    });

    // ─── ELISE MODE BUTTON ───
    toggleDedicationBtn.addEventListener('click', () => {
      settings.eliseMode = !settings.eliseMode;
      eliseModeToggle.checked = settings.eliseMode;
      isEliseMode = settings.eliseMode;
      applySettings();
      saveSettings();
    });

    // ─── MEDIA SESSION ───
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Indie Pop', artist: 'SomaFM', album: 'Resistor Radio' });
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
    }

    // ─── VISIBILITY ───
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && audio && isPlaying) {
        setStatus('🎵 Background', 'playing');
      } else if (!document.hidden && audio && isPlaying) {
        setStatus(isEliseMode ? '❤️ Elise Mode' : '🎵 Playing', 'playing');
      }
    });

    // ─── KEYBOARD ───
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName !== 'INPUT' && e.code === 'Space') { e.preventDefault(); togglePlay(); }
    });

    // ─── INIT ───
    loadSettings();
    tracklist = loadTracklist();
    loadLyricsCache();
    renderTracklist();
    setStatus('🎵 Ready', '');
    updateUI(false);
    console.log('🎸 Resistor, Indie Radio App');

    // ─── EVENT BINDINGS ───
    playBtn.addEventListener('click', togglePlay);

    // Pre-fetch stream URLs
    fetchStreamUrls().then(urls => {
      streamUrls = urls;
      console.log(`📡 Found ${urls.length} streams`);
    });
