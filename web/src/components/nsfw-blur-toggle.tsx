"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "nsfw:blur";
const CLASS_NAME = "nsfw-blur";

export function NsfwBlurToggle() {
  const [blur, setBlur] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = window.localStorage.getItem(STORAGE_KEY) === "1";
    setBlur(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle(CLASS_NAME, blur);
    try {
      window.localStorage.setItem(STORAGE_KEY, blur ? "1" : "0");
    } catch {}
  }, [blur, ready]);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={blur ? "Show R18 covers" : "Blur R18 covers"}
      title={blur ? "R18 covers: blurred" : "R18 covers: visible"}
      onClick={() => setBlur((b) => !b)}
    >
      {blur ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </Button>
  );
}
