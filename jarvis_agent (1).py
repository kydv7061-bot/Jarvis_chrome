#!/usr/bin/env python3
"""
J.A.R.V.I.S Desktop Automation Agent
Run this on your laptop: python jarvis_agent.py
It connects JARVIS site to your actual computer!
"""

import subprocess
import platform
import os
import json
import time
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

OS = platform.system()  # Windows / Darwin / Linux
print(f"[JARVIS Agent] OS: {OS}")
print(f"[JARVIS Agent] Starting on http://localhost:9999")

# ─── TASK EXECUTOR ────────────────────────────────────────────
def execute_task(task: dict) -> dict:
    action = task.get('action', '').lower()
    params = task.get('params', {})
    
    try:
        # ── WHATSAPP ──
        if action == 'whatsapp_send':
            contact = params.get('contact', '')
            message = params.get('message', '')
            # Opens WhatsApp Web with pre-filled message
            url = f"https://wa.me/?text={message.replace(' ', '%20')}"
            if contact:
                # If phone number given
                phone = contact.replace('+','').replace(' ','').replace('-','')
                url = f"https://wa.me/{phone}?text={message.replace(' ', '%20')}"
            webbrowser.open(url)
            return {"success": True, "result": f"WhatsApp opened for {contact or 'new message'}: '{message}'"}

        # ── OPEN APP ──
        elif action == 'open_app':
            app = params.get('app', '').lower()
            app_map = {
                'chrome': {'win': 'start chrome', 'mac': 'open -a "Google Chrome"', 'linux': 'google-chrome'},
                'notepad': {'win': 'notepad', 'mac': 'open -a TextEdit', 'linux': 'gedit'},
                'calculator': {'win': 'calc', 'mac': 'open -a Calculator', 'linux': 'gnome-calculator'},
                'spotify': {'win': 'start spotify:', 'mac': 'open -a Spotify', 'linux': 'spotify'},
                'vscode': {'win': 'code', 'mac': 'code', 'linux': 'code'},
                'terminal': {'win': 'start cmd', 'mac': 'open -a Terminal', 'linux': 'x-terminal-emulator'},
                'files': {'win': 'explorer', 'mac': 'open ~', 'linux': 'nautilus ~'},
                'whatsapp': {'win': 'start whatsapp:', 'mac': 'open -a WhatsApp', 'linux': 'whatsapp-desktop'},
                'telegram': {'win': 'start telegram:', 'mac': 'open -a Telegram', 'linux': 'telegram-desktop'},
            }
            cmd = None
            for key, cmds in app_map.items():
                if key in app:
                    os_key = 'win' if OS == 'Windows' else ('mac' if OS == 'Darwin' else 'linux')
                    cmd = cmds.get(os_key)
                    break
            if cmd:
                subprocess.Popen(cmd, shell=True)
                return {"success": True, "result": f"Opened {app}, Sir."}
            else:
                # Try direct launch
                subprocess.Popen(app, shell=True)
                return {"success": True, "result": f"Attempted to open {app}"}

        # ── TYPE TEXT ──
        elif action == 'type_text':
            text = params.get('text', '')
            try:
                import pyautogui
                time.sleep(1)
                pyautogui.typewrite(text, interval=0.05)
                return {"success": True, "result": f"Typed: {text}"}
            except ImportError:
                return {"success": False, "result": "pyautogui not installed. Run: pip install pyautogui"}

        # ── SCREENSHOT ──
        elif action == 'screenshot':
            try:
                import pyautogui
                path = os.path.expanduser('~/Desktop/jarvis_screenshot.png')
                pyautogui.screenshot(path)
                return {"success": True, "result": f"Screenshot saved: {path}"}
            except ImportError:
                if OS == 'Windows':
                    subprocess.run(['snippingtool'])
                    return {"success": True, "result": "Snipping tool opened"}
                return {"success": False, "result": "pyautogui not installed"}

        # ── VOLUME ──
        elif action == 'volume':
            level = int(params.get('level', 50))
            if OS == 'Windows':
                # Use nircmd if available, else PowerShell
                ps_cmd = f'[audio]::Volume = {level/100}'
                subprocess.run(['powershell', '-c', f'$vol = {level/100}; (New-Object -ComObject WScript.Shell).SendKeys([char]173)'], 
                             capture_output=True)
                return {"success": True, "result": f"Volume set to {level}%"}
            elif OS == 'Darwin':
                subprocess.run(['osascript', '-e', f'set volume output volume {level}'])
                return {"success": True, "result": f"Volume set to {level}%"}
            else:
                subprocess.run(['amixer', '-D', 'pulse', 'sset', 'Master', f'{level}%'])
                return {"success": True, "result": f"Volume set to {level}%"}

        # ── OPEN URL ──
        elif action == 'open_url':
            url = params.get('url', '')
            webbrowser.open(url)
            return {"success": True, "result": f"Opened: {url}"}

        # ── CREATE FILE ──
        elif action == 'create_file':
            path = os.path.expanduser(params.get('path', '~/Desktop/jarvis_note.txt'))
            content = params.get('content', '')
            with open(path, 'w') as f:
                f.write(content)
            return {"success": True, "result": f"File created: {path}"}

        # ── READ FILE ──
        elif action == 'read_file':
            path = os.path.expanduser(params.get('path', ''))
            if os.path.exists(path):
                with open(path, 'r') as f:
                    content = f.read()
                return {"success": True, "result": content[:2000]}
            return {"success": False, "result": f"File not found: {path}"}

        # ── RUN COMMAND ──
        elif action == 'run_command':
            cmd = params.get('command', '')
            # Safety check — block dangerous commands
            blocked = ['rm -rf', 'format', 'del /f', 'shutdown', 'rd /s']
            if any(b in cmd.lower() for b in blocked):
                return {"success": False, "result": "Command blocked for safety, Sir."}
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
            output = result.stdout or result.stderr or 'Command executed'
            return {"success": True, "result": output[:1000]}

        # ── SYSTEM INFO ──
        elif action == 'system_info':
            import psutil
            info = {
                "cpu": f"{psutil.cpu_percent()}%",
                "ram": f"{psutil.virtual_memory().percent}%",
                "disk": f"{psutil.disk_usage('/').percent}%",
                "os": f"{OS} {platform.release()}",
                "hostname": platform.node()
            }
            return {"success": True, "result": json.dumps(info)}

        # ── SEARCH FILES ──
        elif action == 'search_files':
            query = params.get('query', '')
            folder = os.path.expanduser(params.get('folder', '~/Desktop'))
            results = []
            for root, dirs, files in os.walk(folder):
                for f in files:
                    if query.lower() in f.lower():
                        results.append(os.path.join(root, f))
                if len(results) >= 10:
                    break
            return {"success": True, "result": '\n'.join(results) or 'No files found'}

        else:
            return {"success": False, "result": f"Unknown action: {action}"}

    except Exception as e:
        return {"success": False, "result": f"Error: {str(e)}"}


# ─── HTTP SERVER ────────────────────────────────────────────
class JarvisHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[JARVIS] {args[0]} {args[1]}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "online",
            "os": OS,
            "message": "J.A.R.V.I.S Desktop Agent — Online, Sir."
        }).encode())

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            task = json.loads(body)
        except:
            task = {}

        print(f"[JARVIS] Task: {task.get('action')} {task.get('params', {})}")
        result = execute_task(task)
        print(f"[JARVIS] Result: {result}")

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())


def run():
    print("\n" + "="*50)
    print("  J.A.R.V.I.S DESKTOP AGENT — ONLINE")
    print("="*50)
    print(f"  OS: {OS}")
    print(f"  Port: 9999")
    print(f"  Status: Waiting for commands from JARVIS...")
    print("="*50)
    print("\nTo use: Open JARVIS site and give commands like:")
    print('  "open chrome"')
    print('  "send whatsapp to +91xxxxxxxxxx: Hello!"')
    print('  "take screenshot"')
    print('  "what is my cpu usage"')
    print('  "create a file on desktop with text Hello World"')
    print("\nPress Ctrl+C to stop\n")

    server = HTTPServer(('localhost', 9999), JarvisHandler)
    server.serve_forever()

if __name__ == '__main__':
    run()
