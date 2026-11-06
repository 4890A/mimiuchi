mimiuchi (耳打ち) for Windows
=============================

A player for your voice works (RJ-numbered DLsite releases), in your browser,
on this computer and on your phone.


GETTING STARTED
---------------

1. Extract this zip first (right-click it > Extract All...). Running it from
   inside the zip does not work. Put the extracted folder anywhere you like,
   for example in Documents.

2. Double-click mimiuchi.exe.

   Windows may say "Windows protected your PC". This is because mimiuchi is
   not from a paid, registered publisher. Click "More info", then
   "Run anyway". You only need to do this once.

   Windows may also ask whether to allow node.exe through the firewall.
   Allow it on private networks if you want to listen on your phone. If you
   only use this computer, you can say no.

3. A black window opens, then your browser. In the browser:
     - choose the folder that holds your works, and
     - choose a password.
   mimiuchi then scans your folder and fetches titles and covers. The first
   scan of a big library can take a while. You can start listening while it
   runs.

Keep the black window open while you use mimiuchi. Close it to stop mimiuchi.
Next time, just double-click mimiuchi.exe again.


LISTENING ON YOUR PHONE
-----------------------

The black window shows an address like  http://192.168.1.20:3000
Open it in your phone's browser while the phone is on the same Wi-Fi as this
computer, and sign in with your password. Add it to your home screen for
quick access.

If it does not load on the phone, Windows Firewall is probably blocking it:
open "Allow an app through Windows Firewall", find "Node.js JavaScript
Runtime", and tick "Private".


GOOD TO KNOW
------------

- mimiuchi never changes, moves or deletes anything in your works folders.

- Your library, likes, play positions and settings are stored in
  %LOCALAPPDATA%\mimiuchi   (paste that into the Explorer address bar).
  The app folder itself holds no personal data.

- Forgot your password? Delete the file
  %LOCALAPPDATA%\mimiuchi\data\password , then reload mimiuchi in your
  browser and choose a new one. Your library stays as it is.

- To update: close mimiuchi, delete this folder, extract the new version and
  run its mimiuchi.exe. Your library carries over automatically.

- To uninstall: delete this folder and %LOCALAPPDATA%\mimiuchi.

- Waveform seek bar and smoother WAV playback on phones need ffmpeg. If this
  folder has an "ffmpeg" folder, that is already set up. If not, you can put
  ffmpeg.exe into a new folder named "ffmpeg" next to mimiuchi.exe.

- If something goes wrong, the log is at
  %LOCALAPPDATA%\mimiuchi\logs\server.log


-------------------------------------------------------------------------------

mimiuchi（耳打ち）Windows版
===========================

ボイス作品（DLsiteのRJ番号作品）をブラウザで再生するアプリです。
このパソコンでも、スマートフォンからでも使えます。


はじめかた
----------

1. まずこのzipを展開してください（右クリック →「すべて展開」）。
   zipの中から直接実行しても動きません。展開したフォルダーは
   ドキュメントなど、好きな場所に置いて構いません。

2. mimiuchi.exe をダブルクリックします。

   「WindowsによってPCが保護されました」と表示された場合は、
   「詳細情報」→「実行」を押してください（有料の発行元登録をして
   いないため表示されます。最初の1回だけです）。

   node.exe のファイアウォール許可を求められたら、スマートフォンで
   聴きたい場合は「プライベートネットワーク」で許可してください。

3. 黒いウィンドウが開き、続いてブラウザが開きます。ブラウザで
     ・作品が入っているフォルダー
     ・パスワード
   を選ぶと、フォルダーのスキャンが始まり、タイトルや画像が取得されます。

使っている間は黒いウィンドウを開いたままにしてください。
閉じると mimiuchi は終了します。次回も mimiuchi.exe をダブルクリックするだけです。


スマートフォンで聴く
--------------------

黒いウィンドウに  http://192.168.1.20:3000  のようなアドレスが表示されます。
スマートフォンをパソコンと同じWi-Fiにつなぎ、ブラウザでそのアドレスを開いて
パスワードでサインインしてください。

つながらない場合は、Windowsの「ファイアウォールを介したアプリの許可」で
「Node.js JavaScript Runtime」の「プライベート」にチェックを入れてください。


知っておくと便利なこと
----------------------

・作品フォルダーの中身を変更・移動・削除することは一切ありません。

・ライブラリ、お気に入り、再生位置、設定は
  %LOCALAPPDATA%\mimiuchi  に保存されます（エクスプローラーのアドレス欄に
  貼り付けると開けます）。アプリのフォルダーには個人データはありません。

・パスワードを忘れたら：%LOCALAPPDATA%\mimiuchi\data\password を削除し、
  ブラウザで mimiuchi を再読み込みすると、新しいパスワードを設定できます。
  ライブラリはそのまま残ります。

・更新するには：mimiuchi を閉じてこのフォルダーを削除し、新しい版を展開して
  その mimiuchi.exe を起動します。ライブラリはそのまま引き継がれます。

・アンインストール：このフォルダーと %LOCALAPPDATA%\mimiuchi を削除します。

・波形シークバーとスマートフォンでのWAV再生の安定化には ffmpeg が必要です。
  このフォルダーに「ffmpeg」フォルダーがあれば設定済みです。なければ、
  mimiuchi.exe の隣に「ffmpeg」フォルダーを作って ffmpeg.exe を入れてください。

・問題が起きたときのログ：%LOCALAPPDATA%\mimiuchi\logs\server.log
