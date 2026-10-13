/* Phone mode: runs the app on this computer and opens a private HTTPS link for your phone.
   Run: npm run phone   (keep this computer awake and the terminal open while you practice)
   The link goes through a free Cloudflare quick tunnel. Anyone without the access key gets a locked page. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

function need(mod) { try { return require(mod); } catch (e) { return null; } }
if (!need("cloudflared") || !need("qrcode-terminal")) {
  console.log("First phone run: installing the tunnel helper (about 30 MB, one time)...");
  execSync("npm install --no-save --no-audit --no-fund --loglevel=error cloudflared@0.7.3 qrcode-terminal@0.12.0", { stdio: "inherit", cwd: __dirname });
}
const { Tunnel, bin, install } = require("cloudflared");
const qrcode = require("qrcode-terminal");

const DATA = process.env.INTERVIEW_REPS_DATA || path.join(__dirname, "data");
fs.mkdirSync(DATA, { recursive: true });
const keyFile = path.join(DATA, "phone-key.txt");
let key = "";
try { key = fs.readFileSync(keyFile, "utf8").trim(); } catch (e) {}
if (!/^[A-Za-z0-9_-]{20,}$/.test(key)) { key = crypto.randomBytes(18).toString("base64url"); fs.writeFileSync(keyFile, key); }
process.env.PHONE_KEY = key;

const { server, PORT } = require("./server.js");

(async () => {
  if (!fs.existsSync(bin)) { console.log("Downloading cloudflared..."); await install(bin); }
  console.log("Opening a secure link for your phone. This takes 5 to 20 seconds...");
  const tunnel = Tunnel.quick("http://127.0.0.1:" + PORT);
  let link = "", connected = false;
  const timer = setTimeout(() => {
    if (connected) return;
    console.log("\nCloudflare has not connected after 45 seconds. Usually a work network, VPN or firewall is blocking cloudflared.");
    console.log("Try your home Wi-Fi or turn the VPN off, then run npm run phone again. Your computer still works at http://localhost:" + PORT + "\n");
  }, 45000);
  tunnel.once("url", url => { link = url + "/?key=" + key; console.log("Link issued. Connecting..."); });
  tunnel.once("connected", () => {
    connected = true; clearTimeout(timer);
    const show = () => {
      if (!link) return setTimeout(show, 200);
      console.log("\nScan this with your phone camera:\n");
      qrcode.generate(link, { small: true });
      console.log("\nOr open this on your phone:\n  " + link);
      console.log("\nOn this computer you can still use http://localhost:" + PORT);
      console.log("The link changes every time you run this. Keep this window open and the computer awake. Ctrl+C to stop.\n");
    };
    setTimeout(show, 1500);   // give Cloudflare a moment to route the new hostname
  });
  tunnel.on("error", e => console.error("Tunnel error:", e && e.message ? e.message : e));
  tunnel.on("exit", code => { if (code) console.error("Tunnel stopped (code " + code + "). Run npm run phone again."); });
  const stop = () => { try { tunnel.stop(); } catch (e) {} server.close(); process.exit(0); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
})().catch(e => { console.error("Could not start phone mode:", e.message || e); process.exit(1); });
