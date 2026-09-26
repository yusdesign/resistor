// ━━━━━━━━━━━━━━━━━
    //  RESISTOR RADIO 
    //  SomaFM Indie Pop
    // ━━━━━━━━━━━━━━━━━

    // ─── IMPORTS ───
    import { loadTracklist, saveTracklist, addTrack } from '../src/tracklist.js';
    import { loadLyricsCache, saveLyricsCache, fetchLyrics } from '../src/lyrics.js';
    import { Capacitor, registerPlugin } from '@capacitor/core';

    const Soma = registerPlugin('Soma');
    const IS_NATIVE = Capacitor.isNativePlatform();

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
      try {
        const response = await fetch('https://somafm.com/indiepop/songhistory.html', {
          signal: AbortSignal.timeout(8000)
        });
        if (response.ok) {
          const html = await response.text();
          const match = html.match(/<b>(.*?)<\/b>\s*-\s*<span>(.*?)<\/span>/);
          if (match) {
            updateNowPlaying(match[1].trim(), match[2].trim());
            return;
          }
        }

        // Fallback: ICY metadata from current stream
        if (streamUrls.length > 0 && currentStreamIndex < streamUrls.length) {
          const currentUrl = streamUrls[currentStreamIndex];
          const icyResponse = await fetch(currentUrl, {
            headers: { 'Icy-MetaData': '1' },
            signal: AbortSignal.timeout(5000)
          });
          if (icyResponse.ok) {
            const reader = icyResponse.body.getReader();
            const { value } = await reader.read();
            const chunk = new TextDecoder().decode(value);
            reader.releaseLock();
            const icyMatch = chunk.match(/StreamTitle='([^']+)'/);
            if (icyMatch) {
              const full = icyMatch[1].trim();
              if (full.includes(' - ')) {
                const parts = full.split(' - ', 2);
                updateNowPlaying(parts[0].trim(), parts[1].trim());
              }
            }
          }
        }
      } catch (e) {
        console.debug('Metadata fetch error:', e.message);
      }
    }

    // ─── LYRICS DISPLAY ───
    async function displayLyrics(artist, title) {
      lyricsPanel.style.display = 'block';
      lyricsContent.innerHTML = '🔍 Searching...';

      const lyrics = await fetchLyrics(artist, title);
      if (lyrics) {
        const lines = lyrics.split('\n').filter(line => line.trim());
        let html = '';
        lines.forEach(line => {
          html += `<span class="line">${line}</span>`;
        });
        lyricsContent.innerHTML = html;
      } else {
        lyricsContent.innerHTML = '📝 No lyrics found.';
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
      if (metadataTimer) clearTimeout(metadataTimer);
      const tick = async () => {
        if (!isPlaying) {
          metadataTimer = setTimeout(tick, 5000);
          return;
        }
        try {
          await fetchMetadata();
          metadataTimer = setTimeout(tick, 20000);
        } catch (e) {
          metadataTimer = setTimeout(tick, 60000);
        }
      };
      metadataTimer = setTimeout(tick, 1000);
    }
    
    function stopMetadataLoop() {
      if (metadataTimer) {
        clearTimeout(metadataTimer);
        metadataTimer = null;
      }
    }

    // ─── AUDIO SETUP ───
    async function setupAudio() {
      // ─────────────────────────────────────────────
      // NATIVE (Capacitor APK) — talk to SomaPlugin
      // ─────────────────────────────────────────────
      if (IS_NATIVE) {
        await Soma.start({ station: 'indiepop' });
    
        if (audio) {
          audio.pause();
          audio.src = '';
          audio = null;
        }
    
        audio = new Audio();
        // cache-buster — forces a fresh connection on each setup
        audio.src = 'http://127.0.0.1:8765/?t=' + Date.now();
        audio.volume = parseFloat(volumeSlider.value);
    
        audio.addEventListener('playing', () => {
          isPlaying = true;
          reconnectAttempts = 0;
          updateUI(true);
          setStatus('🎵 Playing', 'playing');
          stopMetadataLoop();
          startMetadataLoop();
        });
    
        audio.addEventListener('pause', () => {
          isPlaying = false;
          updateUI(false);
          setStatus('⏸ Paused', '');
          stopMetadataLoop();
        });
    
        audio.addEventListener('error', () => {
          if (settings.autoReconnect && isPlaying && reconnectAttempts < 3) {
            reconnectAttempts++;
            setStatus(`⟳ Reconnecting… (${reconnectAttempts}/3)`, 'buffering');
            setTimeout(() => {
              if (!audio) return;
              audio.src = 'http://127.0.0.1:8765/?t=' + Date.now();
              audio.play().catch(() => {
                if (reconnectAttempts >= 3) {
                  setStatus('❌ Stream error', 'error');
                  isPlaying = false;
                  updateUI(false);
                }
              });
            }, 1500 * reconnectAttempts);   // backoff: 1.5s, 3s, 4.5s
          } else {
            setStatus('❌ Stream error', 'error');
            isPlaying = false;
            updateUI(false);
          }
        });
    
        try {
          await audio.play();
        } catch (e) {
          console.warn('Native play failed:', e.message);
          setStatus('⚠️ Play error', 'error');
        }
    
        return audio;
      }
    
      // ─────────────────────────────────────────────
      // WEB (browser) — original ice-server path
      // ─────────────────────────────────────────────
      if (audio) {
        audio.pause();
        audio.src = '';
        audio = null;
      }
    
      if (streamUrls.length === 0) {
        streamUrls = await fetchStreamUrls();
        currentStreamIndex = 0;
      }
    
      // Try the current stream, fallback to next if it fails
      let success = false;
      for (let i = currentStreamIndex; i < streamUrls.length; i++) {
        try {
          const url = streamUrls[i];
          console.log(`📡 Trying stream ${i + 1}/${streamUrls.length}: ${url}`);
          audio = new Audio();
          audio.src = url;
          audio.crossOrigin = 'anonymous';
          audio.preload = 'metadata';
          audio.setAttribute('decoding', 'async');
          audio.volume = parseFloat(volumeSlider.value);
    
          await audio.play();
          currentStreamIndex = i;
          success = true;
          break;
        } catch (e) {
          console.warn(`Stream ${i + 1} failed:`, e.message);
          continue;
        }
      }
    
      if (!success) {
        setStatus('❌ All streams failed', 'error');
        return null;
      }
    
      // ─── EVENT LISTENERS ───
      audio.addEventListener('playing', () => {
        isPlaying = true;
        updateUI(true);
        setStatus('🎵 Playing', 'playing');
        stopMetadataLoop();
        startMetadataLoop();
        fetchMetadata();
      });
    
      audio.addEventListener('pause', () => {
        isPlaying = false;
        updateUI(false);
        setStatus('⏸ Paused', '');
        stopMetadataLoop();
      });
    
      audio.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        isPlaying = false;
        updateUI(false);
        stopMetadataLoop();
    
        if (currentStreamIndex < streamUrls.length - 1) {
          currentStreamIndex++;
          setStatus(`❌ Stream error. Trying stream ${currentStreamIndex + 1}/${streamUrls.length}…`, 'error');
          setTimeout(async () => {
            await setupAudio();
            if (audio && settings.autoReconnect) {
              audio.play().catch(() => setStatus('❌ Play failed', 'error'));
            }
          }, 3000);
        } else {
          setStatus('❌ All streams exhausted', 'error');
        }
      });
    
      return audio;
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
