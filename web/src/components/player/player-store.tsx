"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isNearEnd, resumePosition } from "@/lib/resume";
import { getResumeMode, getWavPlayback } from "./player-prefs";

export interface QueueTrack {
  id: number;
  title: string;
  workId: string;
  workTitle: string;
  coverSrc: string;
  durationSeconds?: number | null;
  initialPosition?: number;
  /** Set once the track has been played through to the end. */
  completed?: boolean;
}

interface PlayerState {
  queue: QueueTrack[];
  currentIndex: number;
  current: QueueTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

interface PlayerActions {
  playQueue: (tracks: QueueTrack[], startIndex?: number) => void;
  playNow: (track: QueueTrack) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null);

function audioUrl(trackId: number) {
  // `t=1` opts into a compressed copy. The server decides whether this track's
  // format is worth converting and falls back to the original if it isn't, so
  // the flag is safe to send for every track.
  return getWavPlayback() === "compressed"
    ? `/api/audio/${trackId}?t=1`
    : `/api/audio/${trackId}`;
}

/**
 * Start buffering the next track once the current one is this close to its end.
 * The handoff only needs a few seconds of buffer; the window is generous because
 * it costs nothing on a LAN library server and a phone on a weak connection
 * needs the head start.
 */
const PREARM_SECONDS = 30;

/**
 * Hand over this far before the end rather than waiting for `ended`.
 *
 * This is the whole point of the two-deck design. While audio is playing the
 * page keeps its "playing audio" exemption from background throttling; the
 * moment a track ends on a phone with the screen off, the page is just a hidden
 * page and its JS is throttled or suspended. Doing the swap a fraction early
 * means the timer that performs it was scheduled — and fires — while the page is
 * still privileged.
 */
const HANDOFF_LEAD_SECONDS = 0.2;

/**
 * A 44-byte WAV header with no samples. iOS only lets an <audio> element play if
 * `play()` was once called on it inside a user gesture, so the standby deck is
 * unlocked against this the first time the user presses play. Without it the
 * first handoff on iOS is rejected.
 */
const SILENCE_SRC =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);

  // Two decks. The active one plays; the standby one is loaded and buffered with
  // the next queue entry so that advancing costs a single synchronous play().
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeIsARef = useRef(true);
  /** Always points at the active deck. */
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mirrors of the state the DOM-layer handlers need. `ended`, the handoff timer
  // and the media-session buttons all run outside React's render, so they read
  // these rather than a render-time closure.
  const queueRef = useRef<QueueTrack[]>([]);
  const indexRef = useRef(-1);
  const volumeRef = useRef(1);
  const hiddenRef = useRef(false);

  const lastSavedRef = useRef<number>(0);
  // In-session record of each track's most recent position. The page-load
  // RSC snapshot of `track.initialPosition` becomes stale the moment the user
  // plays anything, so when the same trackId is loaded again we prefer this.
  const sessionPosRef = useRef<Map<number, number>>(new Map());
  // The track whose end we just handled. Its final state is already persisted,
  // so the flush on the way out must not write over it.
  const endedIdRef = useRef<number | null>(null);
  // Position the currently loading src was asked to start at, kept so that
  // `loadedmetadata` can re-judge it against the file's real duration.
  const pendingStartRef = useRef(0);
  const loadedIdRef = useRef<number | null>(null);
  /** Track already loaded into the standby deck, if any. */
  const armedIdRef = useRef<number | null>(null);
  const armedStartRef = useRef(0);
  /** Whether the standby deck has reported metadata, so its start is settled. */
  const armedReadyRef = useRef(false);
  const handoffTimerRef = useRef<number | null>(null);
  /** Track id whose load we have already retried once after an error. */
  const errorRetryRef = useRef<number | null>(null);
  const unlockedRef = useRef(false);

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  queueRef.current = queue;
  volumeRef.current = volume;

  function standbyDeck(): HTMLAudioElement | null {
    return activeIsARef.current ? deckBRef.current : deckARef.current;
  }

  function saveProgressFor(
    trackId: number,
    positionSeconds: number,
    completed = false,
  ) {
    sessionPosRef.current.set(trackId, positionSeconds);
    const body = JSON.stringify({ trackId, positionSeconds, completed });
    void fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }

  /**
   * Where this track should start. A saved position sitting in the tail of the
   * track means it was heard to the end, and seeking there would fire `ended`
   * at once — the queue would skip straight past it (and past every finished
   * track after it), which is the whole reason this goes through
   * `resumePosition` rather than using the stored number directly.
   */
  function startPositionFor(track: QueueTrack): number {
    const sessionPos = sessionPosRef.current.get(track.id);
    return resumePosition({
      position: sessionPos ?? track.initialPosition ?? 0,
      duration: track.durationSeconds,
      // A position banked this session supersedes the page-load `completed`
      // snapshot: if the track was restarted since, it is no longer finished.
      completed: sessionPos === undefined && (track.completed ?? false),
      mode: getResumeMode(),
    });
  }

  function setMediaMetadata(track: QueueTrack | null) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const artworkUrl = new URL(track.coverSrc, window.location.origin).href;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.workTitle,
      album: track.workTitle,
      artwork: [
        { src: artworkUrl, sizes: "512x512", type: "image/jpeg" },
        { src: artworkUrl, sizes: "256x256", type: "image/jpeg" },
      ],
    });
  }

  /**
   * Pushed straight from `timeupdate` rather than from a React effect: while the
   * screen is off we deliberately stop re-rendering on every tick, and the
   * lock-screen scrubber still has to move.
   */
  function syncPositionState(el: HTMLAudioElement) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!("setPositionState" in navigator.mediaSession)) return;
    const d = el.duration;
    if (!(d > 0) || !Number.isFinite(d)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: d,
        position: Math.min(el.currentTime, d),
        playbackRate: 1,
      });
    } catch {}
  }

  /**
   * `play()` rejections used to be swallowed, which is how a failed advance
   * could look like "autoplay just doesn't work" with nothing in the console.
   * Log the reason and give it one retry — a deck that Chrome suspended while
   * the page was hidden will usually take the second call.
   */
  function playDeck(el: HTMLAudioElement, allowRetry = true) {
    const promise = el.play();
    if (!promise) return;
    promise.catch((err: unknown) => {
      if (el !== audioRef.current) return;
      const name = err instanceof Error ? err.name : "unknown";
      console.warn(`[player] play() rejected: ${name}`, err);
      if (allowRetry) {
        window.setTimeout(() => {
          if (el === audioRef.current) playDeck(el, false);
        }, 250);
        return;
      }
      setIsPlaying(false);
    });
  }

  /**
   * iOS binds playback permission to the element, not the document, so the deck
   * the user never pressed play on stays locked. Called from every gesture-backed
   * entry point.
   */
  function unlockDecks() {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    for (const el of [deckARef.current, deckBRef.current]) {
      if (!el || el === audioRef.current) continue;
      try {
        el.muted = true;
        el.src = SILENCE_SRC;
        const promise = el.play();
        const release = () => {
          // If a handoff beat this promise to it, this deck is now carrying real
          // playback and must not be paused.
          if (el !== audioRef.current) el.pause();
          el.muted = false;
        };
        if (promise) promise.then(release, release);
        else release();
      } catch {
        el.muted = false;
      }
    }
  }

  function clearHandoff() {
    if (handoffTimerRef.current !== null) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
  }

  /** Forget whatever the standby deck holds and release its buffer. */
  function disarmStandby() {
    clearHandoff();
    armedIdRef.current = null;
    armedStartRef.current = 0;
    armedReadyRef.current = false;
    const el = standbyDeck();
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute("src");
      el.preload = "none";
      el.load();
    } catch {}
  }

  function armStandby(track: QueueTrack) {
    const el = standbyDeck();
    if (!el || armedIdRef.current === track.id) return;
    const startAt = startPositionFor(track);
    armedIdRef.current = track.id;
    armedStartRef.current = startAt;
    armedReadyRef.current = false;
    el.preload = "auto";
    el.volume = volumeRef.current;
    el.muted = false;
    el.src = audioUrl(track.id);
    // Before metadata this only records a default playback start position; the
    // deck's own `loadedmetadata` re-judges it against the real duration.
    if (startAt > 0) el.currentTime = startAt;
  }

  function scheduleHandoff(remaining: number) {
    if (handoffTimerRef.current !== null) return;
    if (indexRef.current + 1 >= queueRef.current.length) return;
    const delay = Math.max(0, (remaining - HANDOFF_LEAD_SECONDS) * 1000);
    handoffTimerRef.current = window.setTimeout(() => {
      handoffTimerRef.current = null;
      advance();
    }, delay);
  }

  /**
   * Move to the next queue entry. Idempotent by construction: it flips
   * `audioRef` first, and every media listener ignores events from a deck that
   * is not the active one, so a late `ended` from the outgoing deck is dropped.
   *
   * `atBoundary` distinguishes the track running out from the user pressing
   * skip. Only the former records the outgoing track as finished; a skip taken
   * through the pre-armed fast path must still bank the real position, exactly
   * as a skip that reloads the active deck does.
   */
  function advance(atBoundary = true) {
    clearHandoff();
    const nextIndex = indexRef.current + 1;
    const nextTrack = queueRef.current[nextIndex];
    const prev = audioRef.current;
    const prevId = loadedIdRef.current;

    if (prevId !== null && atBoundary) {
      endedIdRef.current = prevId;
      lastSavedRef.current = 0;
      saveProgressFor(prevId, 0, true);
    } else if (prevId !== null && prevId !== endedIdRef.current) {
      const prevPos = prev?.currentTime ?? 0;
      if (Number.isFinite(prevPos)) saveProgressFor(prevId, prevPos);
      endedIdRef.current = null;
    }

    if (!nextTrack) {
      // Last track in the queue: rewind rather than leave the deck parked on the
      // end, where pressing play would just fire `ended` again.
      if (prev) {
        prev.pause();
        prev.currentTime = 0;
      }
      setCurrentTime(0);
      setIsPlaying(false);
      return;
    }

    // Not pre-armed — a very short track, or a manual skip past the armed one.
    // Load it now; no worse than the old behaviour.
    if (armedIdRef.current !== nextTrack.id) {
      disarmStandby();
      armStandby(nextTrack);
    }

    const target = standbyDeck();
    if (!target) return;
    const startAt = armedStartRef.current;
    const settled = armedReadyRef.current;

    // Flip first: from here on, events from `prev` are ignored.
    activeIsARef.current = !activeIsARef.current;
    audioRef.current = target;
    loadedIdRef.current = nextTrack.id;
    indexRef.current = nextIndex;
    lastSavedRef.current = startAt;
    // If the standby deck already saw its metadata, its start position is
    // settled and there is nothing left for `loadedmetadata` to re-check.
    pendingStartRef.current = settled ? 0 : startAt;
    armedIdRef.current = null;
    armedStartRef.current = 0;
    armedReadyRef.current = false;
    errorRetryRef.current = null;

    // Pause before playing, in the same synchronous block: iOS will not keep two
    // elements playing at once, and there is no gap to worry about within one task.
    if (prev) prev.pause();
    target.preload = "metadata";
    target.volume = volumeRef.current;
    playDeck(target);

    // Straight to the platform, so the notification is right even if React is
    // being throttled behind a locked screen.
    setMediaMetadata(nextTrack);
    syncPositionState(target);

    // Release the outgoing deck's buffer; it becomes the standby for the track
    // after this one.
    if (prev) {
      try {
        prev.removeAttribute("src");
        prev.preload = "none";
        prev.load();
      } catch {}
    }

    setCurrentIndex(nextIndex);
    setIsPlaying(true);
    setCurrentTime(startAt);
    setDuration(
      Number.isFinite(target.duration) && target.duration > 0
        ? target.duration
        : (nextTrack.durationSeconds ?? 0),
    );
  }

  /** Load an arbitrary queue entry into the active deck and play it. */
  function loadIntoActive(track: QueueTrack, index: number) {
    const audio = audioRef.current;
    if (!audio) return;
    disarmStandby();
    if (loadedIdRef.current !== track.id) {
      // Flush the outgoing track's most recent position before swapping src,
      // since changing src clears currentTime.
      const priorId = loadedIdRef.current;
      const priorPos = audio.currentTime;
      if (
        priorId !== null &&
        priorId !== endedIdRef.current &&
        Number.isFinite(priorPos)
      ) {
        saveProgressFor(priorId, priorPos);
      }
      endedIdRef.current = null;
      const startAt = startPositionFor(track);
      audio.preload = "metadata";
      audio.muted = false;
      audio.src = audioUrl(track.id);
      audio.currentTime = startAt;
      loadedIdRef.current = track.id;
      lastSavedRef.current = startAt;
      pendingStartRef.current = startAt;
      errorRetryRef.current = null;
      setCurrentTime(startAt);
      setDuration(track.durationSeconds ?? 0);
    }
    indexRef.current = index;
    setCurrentIndex(index);
    setMediaMetadata(track);
    playDeck(audio);
    setIsPlaying(true);
  }

  /** Jump to a queue index, taking the pre-armed fast path where it applies. */
  function goToIndex(index: number) {
    const track = queueRef.current[index];
    if (!track) return;
    if (index === indexRef.current + 1 && armedIdRef.current === track.id) {
      advance(false);
      return;
    }
    loadIntoActive(track, index);
  }

  const playQueue = useCallback((tracks: QueueTrack[], startIndex = 0) => {
    queueRef.current = tracks;
    setQueue(tracks);
    unlockDecks();
    goToIndex(startIndex);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const playNow = useCallback((track: QueueTrack) => {
    queueRef.current = [track];
    setQueue([track]);
    unlockDecks();
    goToIndex(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => {
    unlockDecks();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setIsPlaying(true);
      playDeck(audio);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => {
    if (indexRef.current + 1 >= queueRef.current.length) return;
    goToIndex(indexRef.current + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if ((audio?.currentTime ?? 0) > 3) {
      if (audio) audio.currentTime = 0;
      setCurrentTime(0);
      clearHandoff();
      return;
    }
    if (indexRef.current <= 0) return;
    goToIndex(indexRef.current - 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback((seconds: number) => {
    // The user has picked a position, so there is nothing left to second-guess
    // once metadata arrives — and the handoff timer is now wrong.
    pendingStartRef.current = 0;
    clearHandoff();
    const audio = audioRef.current;
    if (audio) audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    volumeRef.current = v;
    // Both decks, so the next track doesn't come in at the old level.
    if (deckARef.current) deckARef.current.volume = v;
    if (deckBRef.current) deckBRef.current.volume = v;
  }, []);

  // Wire up both decks. Every handler ignores the standby deck, except
  // `loadedmetadata`, which is how the standby settles its start position.
  useEffect(() => {
    const a = deckARef.current;
    const b = deckBRef.current;
    if (!a || !b) return;
    if (!audioRef.current) audioRef.current = activeIsARef.current ? a : b;

    function isActive(el: HTMLAudioElement) {
      return el === audioRef.current;
    }

    function onTimeUpdate(this: HTMLAudioElement) {
      if (!isActive(this)) return;
      if (!hiddenRef.current) setCurrentTime(this.currentTime);
      syncPositionState(this);
      const d = this.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const remaining = d - this.currentTime;
      if (remaining > PREARM_SECONDS) return;
      const upcoming = queueRef.current[indexRef.current + 1];
      if (upcoming) armStandby(upcoming);
      scheduleHandoff(remaining);
    }

    function onLoadedMetadata(this: HTMLAudioElement) {
      const d = this.duration || 0;
      if (isActive(this)) {
        setDuration(d);
        // `loadedmetadata` is the first point at which the real length of the
        // file is known. Tracks whose duration was never scanned reach
        // `startPositionFor` with nothing to measure the tail against, so
        // re-run the check here: without it the deck sits at the end of the
        // file and fires `ended` immediately.
        const startedAt = pendingStartRef.current;
        pendingStartRef.current = 0;
        if (startedAt > 0 && isNearEnd(startedAt, d)) {
          this.currentTime = 0;
          setCurrentTime(0);
          lastSavedRef.current = 0;
        }
        return;
      }
      // Standby deck: same check, before it ever becomes active.
      if (armedIdRef.current === null) return;
      if (armedStartRef.current > 0 && isNearEnd(armedStartRef.current, d)) {
        armedStartRef.current = 0;
        this.currentTime = 0;
      }
      armedReadyRef.current = true;
    }

    function onPlay(this: HTMLAudioElement) {
      if (!isActive(this)) return;
      // Playing again means the track is no longer parked on the finished state
      // the advance persisted, so a later flush should record wherever it gets to.
      endedIdRef.current = null;
      errorRetryRef.current = null;
      setIsPlaying(true);
    }

    function onPause(this: HTMLAudioElement) {
      if (!isActive(this)) return;
      // A paused track must not be handed off by a timer armed while it played.
      clearHandoff();
      setIsPlaying(false);
    }

    function onEnded(this: HTMLAudioElement) {
      // Backstop only: the handoff timer normally gets there first, and after it
      // does this deck is no longer active.
      if (!isActive(this)) return;
      advance();
    }

    function onError(this: HTMLAudioElement) {
      if (!isActive(this)) return;
      const id = loadedIdRef.current;
      console.warn("[player] media error", this.error?.code, this.error?.message);
      if (id === null || errorRetryRef.current === id) {
        setIsPlaying(false);
        return;
      }
      errorRetryRef.current = id;
      const at = this.currentTime || pendingStartRef.current || 0;
      try {
        this.load();
        if (at > 0) this.currentTime = at;
        playDeck(this, false);
      } catch {
        setIsPlaying(false);
      }
    }

    const events: Array<[string, EventListener]> = [
      ["timeupdate", onTimeUpdate as EventListener],
      ["loadedmetadata", onLoadedMetadata as EventListener],
      ["play", onPlay as EventListener],
      ["pause", onPause as EventListener],
      ["ended", onEnded as EventListener],
      ["error", onError as EventListener],
    ];
    for (const deck of [a, b]) {
      for (const [name, fn] of events) deck.addEventListener(name, fn);
    }
    return () => {
      for (const deck of [a, b]) {
        for (const [name, fn] of events) deck.removeEventListener(name, fn);
      }
    };
    // Everything these handlers touch is a ref, so they must be attached once
    // and never re-created — re-binding them mid-track would drop events.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMediaMetadata(current);
  }, [current?.id, current?.title, current?.workTitle, current?.coverSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => {
      const audio = audioRef.current;
      if (audio) {
        setIsPlaying(true);
        playDeck(audio);
      }
    });
    ms.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    ms.setActionHandler("nexttrack", () => next());
    ms.setActionHandler("previoustrack", () => previous());
    ms.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("seekto", null);
    };
  }, [next, previous, seek]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Persist the *most recent* playback position. The periodic save catches
  // long sessions; the pause/pagehide/cleanup saves ensure that scrubbing
  // backward then leaving the track (switch, pause, navigate, close tab)
  // doesn't leave a stale forward position in the DB.
  useEffect(() => {
    if (!current) return;
    const trackId = current.id;

    function saveNow(useBeacon = false) {
      // The advance already wrote this track's final state (position 0,
      // completed); the `pause` that rides along with it would otherwise put the
      // end position straight back.
      if (endedIdRef.current === trackId) return;
      // The decks can swap before React re-renders, so make sure the element we
      // are about to read still holds this track.
      if (loadedIdRef.current !== trackId) return;
      if (audioRef.current?.ended) return;
      const t = audioRef.current?.currentTime ?? 0;
      if (t === lastSavedRef.current) return;
      lastSavedRef.current = t;
      sessionPosRef.current.set(trackId, t);
      const body = JSON.stringify({ trackId, positionSeconds: t });
      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        try {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/progress", blob);
          return;
        } catch {}
      }
      void fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }

    const interval = setInterval(() => {
      const t = audioRef.current?.currentTime ?? 0;
      if (Math.abs(t - lastSavedRef.current) >= 5) saveNow();
    }, 5000);

    const onPause = () => saveNow();
    const decks = [deckARef.current, deckBRef.current];
    for (const deck of decks) deck?.addEventListener("pause", onPause);

    const onPageHide = () => saveNow(true);
    window.addEventListener("pagehide", onPageHide);
    const onVisibility = () => {
      hiddenRef.current = document.visibilityState === "hidden";
      if (hiddenRef.current) {
        saveNow(true);
        return;
      }
      // Back on screen: the UI has been frozen since the screen went off, and
      // the deck may not even be the one it was. Resync from the live element.
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      setIsPlaying(!audio.paused);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      for (const deck of decks) deck?.removeEventListener("pause", onPause);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // Track-switch flushes already happened in loadIntoActive; only save here
      // if a deck still holds this trackId (e.g. provider unmount).
      if (loadedIdRef.current === trackId) saveNow(true);
    };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearHandoff();
    };
  }, []);

  const value = useMemo<PlayerState & PlayerActions>(
    () => ({
      queue,
      currentIndex,
      current,
      isPlaying,
      currentTime,
      duration,
      volume,
      playQueue,
      playNow,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
    }),
    [
      queue,
      currentIndex,
      current,
      isPlaying,
      currentTime,
      duration,
      volume,
      playQueue,
      playNow,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {/* Owned here rather than by the player bar: the bar's tree changes as
          tracks come and go, and a re-created element would leave the store
          driving a detached one. */}
      <audio ref={deckARef} preload="metadata" />
      <audio ref={deckBRef} preload="none" />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
