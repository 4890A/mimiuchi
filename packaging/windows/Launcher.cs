// mimiuchi.exe: the thing to double-click in the portable Windows folder.
//
// All it does is run `runtime\node.exe app\launcher.mjs` in this console
// window; the launcher script does the real work. It exists so there is one
// obvious, double-clickable file, instead of a .cmd that Windows shows with a
// gear icon. Built by build.ps1 with the C# compiler that ships with Windows
// (.NET Framework 4), so packaging needs no extra toolchain.

using System;
using System.Diagnostics;
using System.IO;
using System.Text;

static class Launcher
{
    static int Main(string[] args)
    {
        try { Console.Title = "mimiuchi"; } catch { }

        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "runtime", "node.exe");
        string script = Path.Combine(root, "app", "launcher.mjs");

        if (!File.Exists(node) || !File.Exists(script))
        {
            // The classic cause: double-clicking the exe inside the zip, which
            // makes Explorer extract that one file to a temp folder.
            Console.WriteLine("mimiuchi can't start: some of its files are missing.");
            Console.WriteLine();
            Console.WriteLine("If you opened mimiuchi.exe from inside the zip file, extract it first:");
            Console.WriteLine("right-click the zip > Extract All..., then open mimiuchi.exe in the");
            Console.WriteLine("extracted folder.");
            Pause();
            return 1;
        }

        var arguments = new StringBuilder(Quote(script));
        foreach (string a in args) arguments.Append(' ').Append(Quote(a));

        var psi = new ProcessStartInfo(node, arguments.ToString())
        {
            UseShellExecute = false,
            WorkingDirectory = Path.Combine(root, "app"),
        };

        // Ctrl+C reaches node too; let it shut the server down and exit, and
        // leave with it rather than first.
        Console.CancelKeyPress += (sender, e) => { e.Cancel = true; };

        try
        {
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        catch (Exception e)
        {
            Console.WriteLine("mimiuchi can't start: " + e.Message);
            Pause();
            return 1;
        }
    }

    static void Pause()
    {
        Console.WriteLine();
        Console.WriteLine("Press Enter to close this window.");
        try { Console.ReadLine(); } catch { }
    }

    // Windows command-line quoting (CommandLineToArgvW rules).
    static string Quote(string s)
    {
        if (s.Length > 0 && s.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return s;
        var sb = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char c in s)
        {
            if (c == '\\') { backslashes++; continue; }
            if (c == '"') sb.Append('\\', backslashes * 2 + 1);
            else sb.Append('\\', backslashes);
            backslashes = 0;
            sb.Append(c);
        }
        sb.Append('\\', backslashes * 2);
        return sb.Append('"').ToString();
    }
}
