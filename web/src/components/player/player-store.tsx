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

export interface QueueTrack {
  id: number;
  title: string;
  workId: string;
  workTitle: string;
  coverSrc: string;
  durationSeconds?: number | null;
  initialPosition?: number;
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
  _setDuration: (d: number) => void;
  _setIsPlaying: (p: boolean) => void;
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

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  const loadedIdRef = useRef<number | null>(null);
  const loadAndPlay = useCallback((track: QueueTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loadedIdRef.current !== track.id) {
      audio.src = audioUrl(track.id);
      audio.currentTime = track.initialPosition ?? 0;
      loadedIdRef.current = track.id;
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
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (loadedIdRef.current !== current.id) {
      audio.src = audioUrl(current.id);
      audio.currentTime = current.initialPosition ?? 0;
      loadedIdRef.current = current.id;
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

  useEffect(() => {
    if (!current) return;
    const interval = setInterval(() => {
      const t = audioRef.current?.currentTime ?? 0;
      if (Math.abs(t - lastSavedRef.current) >= 5) {
        lastSavedRef.current = t;
        void fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackId: current.id, positionSeconds: t }),
        });
      }
    }, 5000);
    return () => clearInterval(interval);
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
      _setDuration: setDuration,
      _setIsPlaying: setIsPlaying,
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
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
