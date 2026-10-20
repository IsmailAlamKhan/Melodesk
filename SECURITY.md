# Security policy

Please report vulnerabilities privately through GitHub's "Report a vulnerability" feature on
this repository rather than a public issue. You will get a response within seven days.

In scope: anything that lets the music.youtube.com webview (or a page it navigates to) reach
Tauri commands other than `bridge_emit`, read local data, execute code in the UI window, or
escape the Content Security Policy; anything that exposes account cookies or tokens to our code.

Out of scope: issues in YouTube Music itself.
