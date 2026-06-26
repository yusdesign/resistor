// ─── TRACKLIST CORE ───
const TRACKLIST_KEY = 'resistor_tracklist';
const MAX_TRACKS = 200;

export function loadTracklist() {
  const stored = localStorage.getItem(TRACKLIST_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveTracklist(tracklist) {
  localStorage.setItem(TRACKLIST_KEY, JSON.stringify(tracklist));
}

export function addTrack(tracklist, title, artist) {
  if (!title || !artist) return tracklist;
  const existing = tracklist.find(t => t.title === title && t.artist === artist);
  if (existing) {
    existing.count += 1;
    existing.playedAt = new Date().toISOString();
  } else {
    tracklist.unshift({
      id: Date.now().toString(),
      title,
      artist,
      playedAt: new Date().toISOString(),
      count: 1
    });
  }
  if (tracklist.length > MAX_TRACKS) tracklist.pop();
  return tracklist;
}
