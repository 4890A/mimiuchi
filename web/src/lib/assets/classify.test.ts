import test from "node:test";
import assert from "node:assert/strict";
import { classifyAsset, firstNumber } from "./classify";

/**
 * Every path here is a real one, taken from a survey of an actual library.
 * The awkward ones are the point: the readme spellings are what publishers
 * really ship, and the scripts under `台本\` never say 台本 in their own name.
 */

function kindOf(relativePath: string): string | null {
  return classifyAsset(relativePath)?.kind ?? null;
}

test("ignores audio — the scanner already made it a track", () => {
  assert.equal(kindOf("mp3/01 Intro.mp3"), null);
  assert.equal(kindOf("おまけ/フリートーク.wav"), null);
  // Bonus audio living in an extras folder is still a track, not an asset.
  assert.equal(kindOf("おまけ/そらまめ。様‗フリートーク.mp3"), null);
});

test("ignores archives and OS junk", () => {
  assert.equal(kindOf("bundle.zip"), null);
  assert.equal(kindOf("stuff.7z"), null);
  assert.equal(kindOf("Thumbs.db"), null);
  assert.equal(kindOf("画像/desktop.ini"), null);
});

test("ignores every readme spelling found in the wild", () => {
  const readmes = [
    "readme.txt",
    "Readme.txt",
    "read_me.txt",
    "readme txt.txt",
    "本編/■_Read me/Read me.txt",
    "【readme】耳舐めの天才～一度は味わってみたい究極の舌技～.txt",
    // Typo in the original, and a trailing space before the extension.
    "Rreadmeクレジット .txt",
    "RJ01665656/乳首洗脳　― チクビセンノウ ―/readme.txt",
  ];
  for (const r of readmes) {
    assert.equal(kindOf(r), null, `expected ${r} to be ignored`);
  }
});

test("ignores Japanese readmes, which outnumber the Latin-spelled ones", () => {
  const readmes = [
    "リードミー.txt",
    "説明書.txt",
    "説明書☆.txt",
    "説明書です♪.txt",
    "はじめにお読みください！.txt",
    "GKSD005/はじめにお読み下さい.txt",
    "g161/最初にお読みください.txt",
    "隣人サキュバス/おまけ動画/お読みください_おまけ動画について.txt",
    "双子の催眠彼女　注意事項.txt",
    "効果音おまけ/利用規約.txt",
    "ご購入ありがとうございます.txt",
    "04_omake/ライブ壁紙android用説明書.pdf",
  ];
  for (const r of readmes) {
    assert.equal(kindOf(r), null, `expected ${r} to be ignored`);
  }
});

test("はじめに is a readme alone but not inside a longer title", () => {
  assert.equal(kindOf("はじめに.txt"), null);
  assert.equal(kindOf("おわりに.txt"), null);
  // A talk theme, not front matter — must survive.
  assert.equal(
    kindOf("クリスマスフリートーク/0a_【はじめに】三つのトークテーマ.txt"),
    "text",
  );
});

test("はじめに.pdf is a booklet page, not front matter", () => {
  // These come in at ~300 KB beside おわりに.pdf — illustrated content, where
  // a text readme would be a couple of kilobytes.
  assert.equal(kindOf("み・み・ちゅ！/はじめに.pdf"), "other");
  assert.equal(kindOf("み・み・ちゅ！/おわりに.pdf"), "other");
  // A PDF that really is a manual still goes, on the substring rule.
  assert.equal(kindOf("04_omake/ライブ壁紙iphone用説明書.pdf"), null);
});

test("a readme inside a 台本 folder is still a readme", () => {
  assert.equal(kindOf("台本/readme.txt"), null);
  assert.equal(kindOf("台本/リードミー.txt"), null);
});

test("ignores shortcuts, part files and split executables", () => {
  assert.equal(kindOf("s063/雷夢 - 同人ダウンロード - DMM.R18.url"), null);
  assert.equal(kindOf("s063/雷夢 サークルプロフィール.website"), null);
  assert.equal(kindOf("clean/10 【おまけ】.mp3.encrypted.part"), null);
  assert.equal(kindOf("RJ338992.part1.exe"), null);
});

test("detects a 台本 delivered as .docx", () => {
  assert.equal(kindOf("LRC or Script/JP/台本/台本_JP_part1.docx"), "script");
  // Folder alone carries the signal here — the filename is English.
  assert.equal(kindOf("LRC or Script/CN/零号羔羊 音声剧本-CN.docx"), "script");
});

test("detects 台本 by filename", () => {
  assert.equal(kindOf("おまけ/台本.txt"), "script");
  assert.equal(kindOf("台本.txt"), "script");
  assert.equal(kindOf("セリフ初稿台本/セリフ初稿台本_tr01.txt"), "script");
  assert.equal(kindOf("セリフ初稿台本/セリフ初稿台本_トラック1.txt"), "script");
});

test("detects 台本 by folder when the filename never says so", () => {
  // The whole reason folders are checked: ten files like this exist.
  assert.equal(kindOf("台本/0　バイノーラル指示あり.txt"), "script");
  assert.equal(kindOf("台本/7 アリア単独　バイノーラル指示あり.txt"), "script");
  assert.equal(kindOf("台本/ex　バイノーラル指示あり.txt"), "script");
  assert.equal(kindOf("台本/※台本について.txt"), "script");
  assert.equal(kindOf("本編/■03_購入特典『台本』/台本.pdf"), "script");
});

test("detects 台本 delivered as PDF", () => {
  const pdfs = [
    "4大特典/壁穴耳舐め専門「耳犯し亭」へようこそ　台本.pdf",
    "寝取られの家_本体/おまけ/b06台本_美綾_おまけ用_.pdf",
    "4大特典/耳舐め監獄強制耳舐め執行の刑　フィニッシュタイム付き台本.pdf",
  ];
  for (const p of pdfs) assert.equal(kindOf(p), "script");
});

test("a PDF with no script token is not a script", () => {
  assert.equal(kindOf("おまけ/設定資料.pdf"), "other");
});

test("classifies images, including one sitting inside an audio folder", () => {
  assert.equal(kindOf("イラスト/ジャケット.png"), "image");
  assert.equal(kindOf("04_ジャケットイラスト/01_ジャケットイラスト.png"), "image");
  assert.equal(
    kindOf("本編/■01_本編『音源』/■03_本編『SEありMP3』/プレイ内容のメモ.jpg"),
    "image",
  );
});

test("classifies video", () => {
  assert.equal(kindOf("4大特典/壁穴耳舐め　体験版.mp4"), "video");
  assert.equal(kindOf("07_おまけ/01_告知時.mp4"), "video");
});

test("a plain .txt that is neither script nor readme is text", () => {
  assert.equal(kindOf("Finishtime.txt"), "text");
});

test("reports title and extension without the dot duplicated", () => {
  const a = classifyAsset("おまけ/高画質ジャケット.jpg");
  assert.deepEqual(a, {
    kind: "image",
    title: "高画質ジャケット",
    extension: ".jpg",
    orderHint: null,
  });
});

test("extension match is case-insensitive", () => {
  assert.equal(kindOf("イラスト/COVER.JPG"), "image");
  assert.equal(kindOf("おまけ/台本.TXT"), "script");
});

test("handles backslash-separated paths from Windows scans", () => {
  assert.equal(kindOf("台本\\1　バイノーラル指示あり.txt"), "script");
  assert.equal(kindOf("イラスト\\表紙.png"), "image");
});

test("firstNumber keys scripts and tracks the same way", () => {
  // Tracks
  assert.equal(firstNumber("tr01_迫る義妹♪"), 1);
  assert.equal(firstNumber("tr00_タイトルコール"), 0);
  assert.equal(firstNumber("01 【2人_ダブル甘やかし…♡】"), 1);
  assert.equal(firstNumber("09ex 【2人_ダブル囁き乳首洗脳♡】ループ"), 9);
  // Scripts
  assert.equal(firstNumber("セリフ初稿台本_tr01"), 1);
  assert.equal(firstNumber("セリフ初稿台本_トラック1"), 1);
  assert.equal(firstNumber("0　バイノーラル指示あり"), 0);
  assert.equal(firstNumber("7 アリア単独　バイノーラル指示あり"), 7);
  // No number at all
  assert.equal(firstNumber("ex　バイノーラル指示あり"), null);
  assert.equal(firstNumber("※台本について"), null);
  assert.equal(firstNumber("台本"), null);
  assert.equal(firstNumber("陽向葵ゅか様フリートーク"), null);
});

test("firstNumber reads fullwidth digits", () => {
  assert.equal(firstNumber("『１　ねえねえ、オタク君！'"), 1);
});
