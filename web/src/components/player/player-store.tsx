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
import { getResumeMode } from "./player-prefs";

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
  audioRef: React.RefObject<HTMLAudioElement | null>;
  _setTime: (t: number) => void;
  _onLoadedMetadata: (d: number) => void;
  _setIsPlaying: (p: boolean) => void;
  _onEnded: () => void;
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null);

function audioUrl(trackId: number) {
  return `/api/audio/${trackId}`;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedRef = useRef<number>(0);
  // In-session record of each track's most recent position. The page-load
  // RSC snapshot of `track.initialPosition` becomes stale the moment the user
  // plays anything, so when the same trackId is loaded again we prefer this.
  const sessionPosRef = useRef<Map<number, number>>(new Map());
  // The track whose `ended` we just handled. Its final state is already
  // persisted, so the flush on the way out must not write over it.
  const endedIdRef = useRef<number | null>(null);
  // Position the currently loading src was asked to start at, kept so that
  // `loadedmetadata` can re-judge it against the file's real duration.
  const pendingStartRef = useRef(0);

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  const loadedIdRef = useRef<number | null>(null);

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

  const loadAndPlay = useCallback((track: QueueTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
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
      audio.src = audioUrl(track.id);
      audio.currentTime = startAt;
      loadedIdRef.current = track.id;
      lastSavedRef.current = startAt;
      pendingStartRef.current = startAt;
    }
    audio.play().catch(() => setIsPlaying(false));
  }, []);

  const playQueue = useCallback(
    (tracks: QueueTrack[], startIndex = 0) => {
      setQueue(tracks);
      setCurrentIndex(startIndex);
      setIsPlaying(true);
      const t = tracks[startIndex];
      if (t) loadAndPlay(t);
    },
    [loadAndPlay],
  );

  const playNow = useCallback(
    (track: QueueTrack) => {
      setQueue([track]);
      setCurrentIndex(0);
      setIsPlaying(true);
      loadAndPlay(track);
    },
    [loadAndPlay],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    setIsPlaying((p) => {
      const next = !p;
      if (audio) {
        if (next) audio.play().catch(() => setIsPlaying(false));
        else audio.pause();
      }
      return next;
    });
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      const ni = i + 1 < queue.length ? i + 1 : i;
      const t = queue[ni];
      if (t && ni !== i) loadAndPlay(t);
      return ni;
    });
    setIsPlaying(true);
  }, [queue, loadAndPlay]);

  const previous = useCallback(() => {
    if ((audioRef.current?.currentTime ?? 0) > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    setCurrentIndex((i) => {
      const ni = i > 0 ? i - 1 : i;
      const t = queue[ni];
      if (t && ni !== i) loadAndPlay(t);
      return ni;
    });
    setIsPlaying(true);
  }, [queue, loadAndPlay]);

  const seek = useCallback((seconds: number) => {
    // The user has picked a position, so there is nothing left to second-guess
    // once metadata arrives.
    pendingStartRef.current = 0;
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  /**
   * `loadedmetadata` is the first point at which the real length of the file is
   * known. Tracks whose duration was never scanned reach `startPositionFor`
   * with nothing to measure the tail against, so re-run the check here: without
   * it the element sits at the end of the file and fires `ended` immediately.
   */
  const _onLoadedMetadata = useCallback((audioDuration: number) => {
    setDuration(audioDuration || 0);
    const startedAt = pendingStartRef.current;
    pendingStartRef.current = 0;
    const audio = audioRef.current;
    if (!audio) return;
    if (startedAt > 0 && isNearEnd(startedAt, audioDuration)) {
      audio.currentTime = 0;
      setCurrentTime(0);
      lastSavedRef.current = 0;
    }
  }, []);

  /**
   * Playing out to the end records the track as finished at position zero, so
   * that coming back to it starts it over instead of landing on the end again.
   * The `completed` flag is what track rows use to stop drawing a progress bar.
   */
  const _onEnded = useCallback(() => {
    const trackId = loadedIdRef.current;
    if (trackId !== null) {
      endedIdRef.current = trackId;
      lastSavedRef.current = 0;
      saveProgressFor(trackId, 0, true);
    }
    if (currentIndex + 1 < queue.length) {
      next();
      return;
    }
    // Last track in the queue: rewind rather than leave the element parked on
    // the end, where pressing play would just fire `ended` again.
    if (audioRef.current) audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, [currentIndex, queue.length, next]);

  const _setIsPlaying = useCallback((playing: boolean) => {
    // Playing again means the track is no longer parked on the finished state
    // `ended` persisted, so a later flush should record wherever it gets to.
    if (playing) endedIdRef.current = null;
    setIsPlaying(playing);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (loadedIdRef.current !== current.id) {
      const startAt = startPositionFor(current);
      audio.src = audioUrl(current.id);
      audio.currentTime = startAt;
      loadedIdRef.current = current.id;
      lastSavedRef.current = startAt;
      pendingStartRef.current = startAt;
      if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const artworkUrl = new URL(current.coverSrc, window.location.origin).href;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.workTitle,
      album: current.workTitle,
      artwork: [
        { src: artworkUrl, sizes: "512x512", type: "image/jpeg" },
        { src: artworkUrl, sizes: "256x256", type: "image/jpeg" },
      ],
    });
  }, [current?.id, current?.title, current?.workTitle, current?.coverSrc]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => {
      audioRef.current?.play().catch(() => setIsPlaying(false));
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
  }, [next, previous, seek]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!("setPositionState" in navigator.mediaSession)) return;
    if (duration > 0 && Number.isFinite(duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1,
        });
      } catch {}
    }
  }, [duration, currentTime]);

  // Persist the *most recent* playback position. The periodic save catches
  // long sessions; the cleanup/pause/pagehide saves ensure that scrubbing
  // backward then leaving the track (switch, pause, navigate, close tab)
  // doesn't leave a stale forward position in the DB.
  useEffect(() => {
    if (!current) return;
    const trackId = current.id;

    function saveNow(useBeacon = false) {
      // `ended` already wrote this track's final state (position 0, completed);
      // the `pause` that some browsers fire alongside it would otherwise put
      // the end position straight back.
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

    const audio = audioRef.current;
    const onPause = () => saveNow();
    audio?.addEventListener("pause", onPause);

    const onPageHide = () => saveNow(true);
    window.addEventListener("pagehide", onPageHide);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      audio?.removeEventListener("pause", onPause);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // Track-switch flushes already happened in loadAndPlay; only save here
      // if the audio element still holds this trackId (e.g. provider unmount).
      if (loadedIdRef.current === trackId) saveNow(true);
    };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      audioRef,
      _setTime: setCurrentTime,
      _onLoadedMetadata,
      _setIsPlaying,
      _onEnded,
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
      _onLoadedMetadata,
      _setIsPlaying,
      _onEnded,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
