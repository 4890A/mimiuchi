import test from "node:test";
import assert from "node:assert/strict";
import { linkScriptsToTracks, type LinkableScript } from "./link-scripts";
import { classifyAsset } from "./classify";

/** Builds a script the way the scanner would, so titles and hints agree. */
function script(id: number, relativePath: string): LinkableScript {
  const c = classifyAsset(relativePath);
  assert.ok(c, `${relativePath} should classify`);
  return { id, title: c.title, extension: c.extension, orderHint: c.orderHint };
}

function tracks(...paths: string[]) {
  return paths.map((relativePath, i) => ({ id: 100 + i, relativePath }));
}

test("links tr01-style scripts to tr01-style tracks", () => {
  // These tracks have a NULL track_number — the whole reason for filename keying.
  const t = tracks(
    "tr00_タイトルコール.mp3",
    "tr01_迫る義妹♪.mp3",
    "tr02_発情相互オナニー♪.mp3",
    "陽向葵ゅか様フリートーク.mp3",
  );
  const s = [
    script(1, "セリフ初稿台本/セリフ初稿台本_tr01.txt"),
    script(2, "セリフ初稿台本/セリフ初稿台本_tr02.txt"),
  ];
  const map = linkScriptsToTracks(s, t);

  assert.equal(map.get(101), 1, "tr01 → script 1");
  assert.equal(map.get(102), 2, "tr02 → script 2");
  assert.equal(map.get(100), undefined, "tr00 has no script");
  assert.equal(map.get(103), undefined, "the free talk has no number at all");
});

test("links トラックN-style script names", () => {
  const t = tracks("tr01_学級委員のギャルJKは…♪.mp3", "tr02_でっかいちんこ…♪.mp3");
  const s = [
    script(1, "セリフ初稿台本/セリフ初稿台本_トラック1.txt"),
    script(2, "セリフ初稿台本/セリフ初稿台本_トラック2.txt"),
  ];
  const map = linkScriptsToTracks(s, t);
  assert.equal(map.get(100), 1);
  assert.equal(map.get(101), 2);
});

test("links scripts named only by number, found via their folder", () => {
  const t = tracks(
    "本編/00 【プロローグ】.mp3",
    "本編/01 【2人_ダブル甘やかし…♡】.mp3",
    "本編/08 【2人_ダブル焦らし屈服…♡】.mp3",
    "本編/09ex 【2人_ダブル囁き乳首洗脳♡】ループ.mp3",
  );
  const s = [
    script(1, "台本/0　バイノーラル指示あり.txt"),
    script(2, "台本/1　バイノーラル指示あり.txt"),
    script(3, "台本/8 みお単独　バイノーラル指示あり.txt"),
    script(4, "台本/ex　バイノーラル指示あり.txt"),
    script(5, "台本/※台本について.txt"),
  ];
  const map = linkScriptsToTracks(s, t);

  assert.equal(map.get(100), 1, "00 → script 0");
  assert.equal(map.get(101), 2, "01 → script 1");
  assert.equal(map.get(102), 3, "08 → script 8");
  // 09ex reduces to 9, and there is no script 9.
  assert.equal(map.get(103), undefined);
  // `ex` and `※台本について` carry no number and link to nothing.
  assert.ok(![...map.values()].includes(4));
  assert.ok(![...map.values()].includes(5));
});

test("duplicate track filenames both link to the same script", () => {
  // A work split into SEあり / SEなし repeats every track filename.
  const t = tracks("SEあり/tr01_x.mp3", "SEなし/tr01_x.mp3", "SEあり/tr02_y.mp3");
  const s = [
    script(1, "セリフ初稿台本/セリフ初稿台本_tr01.txt"),
    script(2, "セリフ初稿台本/セリフ初稿台本_tr02.txt"),
  ];
  const map = linkScriptsToTracks(s, t);
  assert.equal(map.get(100), 1);
  assert.equal(map.get(101), 1);
  assert.equal(map.get(102), 2);
});

test("PDF scripts never link — they open in a new tab", () => {
  const t = tracks("06 とどめ.mp3");
  const s = [script(1, "おまけ/b06台本_美綾_おまけ用_.pdf")];
  assert.equal(linkScriptsToTracks(s, t).size, 0);
});

test("a number claimed by two scripts links neither", () => {
  const t = tracks("01 a.mp3", "02 b.mp3");
  const s = [
    script(1, "台本/1 ルートA.txt"),
    script(2, "台本/1 ルートB.txt"),
    script(3, "台本/2 共通.txt"),
  ];
  const map = linkScriptsToTracks(s, t);
  assert.equal(map.get(100), undefined, "ambiguous 1 is dropped");
  assert.equal(map.get(101), 3, "unambiguous 2 still links");
});

test("a single whole-work script links nothing", () => {
  const t = tracks("01 a.mp3", "02 b.mp3");
  assert.equal(linkScriptsToTracks([script(1, "台本.txt")], t).size, 0);
  // Even when it happens to carry a digit.
  assert.equal(linkScriptsToTracks([script(1, "台本1.txt")], t).size, 0);
});

test("no scripts, or no tracks, is not an error", () => {
  assert.equal(linkScriptsToTracks([], tracks("01 a.mp3")).size, 0);
  assert.equal(linkScriptsToTracks([script(1, "台本/1 a.txt")], []).size, 0);
});
