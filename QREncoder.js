import { useState, useRef } from "react";

const JARVIS_QR = () => {
  const [input, setInput] = useState("");
  const [qrUrl, setQrUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileContent, setFileContent] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [qrSize, setQrSize] = useState(300);
  const [status, setStatus] = useState("STANDBY");
  const fileRef = useRef();

  const generateQR = () => {
    const content = input.trim();
    if (!content) return;
    setLoading(true);
    setStatus("GENERATING...");
    const encoded = encodeURIComponent(content);
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encoded}&color=00f5ff&bgcolor=0a0f1a&qzone=2&format=png`;
    const img = new Image();
    img.onload = () => {
      setQrUrl(url);
      setLoading(false);
      setStatus("QR ENCODED ◉ ONLINE");
    };
    img.onerror = () => {
      setLoading(false);
      setStatus("ERROR — RETRY");
    };
    img.src = url;
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setStatus("READING FILE...");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setFileContent(text);
      setInput(text.slice(0, 900));
      setStatus("FILE LOADED ◉ READY");
    };
    reader.readAsText(file);
  };

  const downloadQR = () => {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = "JARVIS_QR.png";
    a.click();
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050a10",
      color: "#00f5ff",
      fontFamily: "'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Animated grid bg */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none"
      }} />

      {/* Glow orb */}
      <div style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,245,255,0.04) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0
      }} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 560 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 11, letterSpacing: 8, color: "#00f5ff88", marginBottom: 8
          }}>◈ JARVIS MARK III</div>
          <h1 style={{
            fontSize: 28, fontWeight: 900, letterSpacing: 6,
            color: "#00f5ff",
            textShadow: "0 0 30px rgba(0,245,255,0.8), 0 0 60px rgba(0,245,255,0.3)",
            margin: 0
          }}>QR ENCODER</h1>
          <div style={{
            fontSize: 10, letterSpacing: 4, color: "#00f5ff55", marginTop: 6
          }}>QUANTUM RESPONSE PROTOCOL</div>
        </div>

        {/* Status bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(0,245,255,0.05)",
          border: "1px solid rgba(0,245,255,0.15)",
          padding: "8px 16px", marginBottom: 20, fontSize: 10,
          letterSpacing: 3
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: status.includes("ERROR") ? "#ff4444" : "#00f5ff",
            boxShadow: `0 0 8px ${status.includes("ERROR") ? "#ff4444" : "#00f5ff"}`,
            animation: "pulse 1.5s infinite"
          }} />
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} } @keyframes scan { 0%{top:0} 100%{top:100%} }`}</style>
          ◉ STATUS: {status}
        </div>

        {/* Main panel */}
        <div style={{
          background: "rgba(0,15,30,0.8)",
          border: "1px solid rgba(0,245,255,0.2)",
          padding: 24,
          boxShadow: "0 0 40px rgba(0,245,255,0.05), inset 0 0 40px rgba(0,0,0,0.5)"
        }}>

          {/* File Upload */}
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: "1px dashed rgba(0,245,255,0.3)",
              padding: "16px",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: 20,
              transition: "all 0.2s",
              background: fileName ? "rgba(0,245,255,0.05)" : "transparent"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,245,255,0.08)"}
            onMouseLeave={e => e.currentTarget.style.background = fileName ? "rgba(0,245,255,0.05)" : "transparent"}
          >
            <input ref={fileRef} type="file" onChange={handleFile} style={{ display: "none" }}
              accept=".txt,.csv,.json,.md,.html,.js,.py,.xml" />
            <div style={{ fontSize: 20, marginBottom: 4 }}>📎</div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#00f5ff99" }}>
              {fileName ? `◉ ${fileName.toUpperCase()} LOADED` : "UPLOAD FILE → EXTRACT & ENCODE"}
            </div>
            <div style={{ fontSize: 9, color: "#00f5ff44", marginTop: 4 }}>
              TXT · CSV · JSON · MD · HTML · CODE
            </div>
          </div>

          {/* Text Input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#00f5ff66", marginBottom: 6 }}>
              ◈ DATA INPUT — TEXT / URL / CODE
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Enter URL, text, contact info, anything..."
              rows={4}
              style={{
                width: "100%", background: "rgba(0,245,255,0.03)",
                border: "1px solid rgba(0,245,255,0.2)",
                color: "#00f5ff", fontFamily: "'Courier New', monospace",
                fontSize: 12, padding: "10px 12px", resize: "none",
                outline: "none", boxSizing: "border-box",
                letterSpacing: 1
              }}
            />
            <div style={{ fontSize: 9, color: "#00f5ff44", marginTop: 4, textAlign: "right" }}>
              {input.length}/900 CHARS
            </div>
          </div>

          {/* Size selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#00f5ff66", marginBottom: 8 }}>
              ◈ QR RESOLUTION
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[150, 300, 500].map(s => (
                <button key={s} onClick={() => setQrSize(s)} style={{
                  flex: 1, padding: "6px 0",
                  background: qrSize === s ? "rgba(0,245,255,0.15)" : "transparent",
                  border: `1px solid ${qrSize === s ? "#00f5ff" : "rgba(0,245,255,0.2)"}`,
                  color: qrSize === s ? "#00f5ff" : "#00f5ff66",
                  fontSize: 10, letterSpacing: 2, cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: qrSize === s ? "0 0 10px rgba(0,245,255,0.2)" : "none"
                }}>
                  {s}px
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateQR}
            disabled={!input.trim() || loading}
            style={{
              width: "100%", padding: "14px",
              background: input.trim() ? "rgba(0,245,255,0.12)" : "rgba(0,245,255,0.03)",
              border: `1px solid ${input.trim() ? "#00f5ff" : "rgba(0,245,255,0.1)"}`,
              color: input.trim() ? "#00f5ff" : "#00f5ff33",
              fontSize: 12, letterSpacing: 5, cursor: input.trim() ? "pointer" : "not-allowed",
              fontFamily: "'Courier New', monospace", fontWeight: 700,
              boxShadow: input.trim() ? "0 0 20px rgba(0,245,255,0.15)" : "none",
              transition: "all 0.2s"
            }}
          >
            {loading ? "⟳ ENCODING..." : "⚡ GENERATE QR CODE"}
          </button>
        </div>

        {/* QR Output */}
        {qrUrl && (
          <div style={{
            marginTop: 20,
            background: "rgba(0,15,30,0.9)",
            border: "1px solid rgba(0,245,255,0.3)",
            padding: 24, textAlign: "center",
            boxShadow: "0 0 40px rgba(0,245,255,0.1)"
          }}>
            <div style={{ fontSize: 9, letterSpacing: 4, color: "#00f5ff88", marginBottom: 16 }}>
              ◈ QR MATRIX GENERATED
            </div>

            {/* QR frame */}
            <div style={{
              display: "inline-block", position: "relative",
              padding: 12,
              background: "#0a0f1a",
              border: "2px solid rgba(0,245,255,0.4)",
              boxShadow: "0 0 30px rgba(0,245,255,0.2), inset 0 0 20px rgba(0,0,0,0.5)"
            }}>
              {/* Corner decorations */}
              {["topLeft","topRight","bottomLeft","bottomRight"].map(c => (
                <div key={c} style={{
                  position: "absolute",
                  width: 12, height: 12,
                  borderColor: "#00f5ff",
                  borderStyle: "solid",
                  borderWidth: c.includes("top") ? "2px 0 0 0" : "0 0 2px 0",
                  borderLeftWidth: c.includes("Left") ? "2px" : 0,
                  borderRightWidth: c.includes("Right") ? "2px" : 0,
                  top: c.includes("top") ? 2 : "auto",
                  bottom: c.includes("bottom") ? 2 : "auto",
                  left: c.includes("Left") ? 2 : "auto",
                  right: c.includes("Right") ? 2 : "auto",
                }} />
              ))}
              <img src={qrUrl} alt="QR Code" style={{ display: "block", maxWidth: "100%", height: "auto" }} />
            </div>

            <div style={{ marginTop: 16, fontSize: 9, color: "#00f5ff44", letterSpacing: 2, marginBottom: 16 }}>
              ◉ SCAN WITH ANY QR READER
            </div>

            <button onClick={downloadQR} style={{
              padding: "10px 32px",
              background: "rgba(0,245,255,0.1)",
              border: "1px solid #00f5ff",
              color: "#00f5ff", fontSize: 10, letterSpacing: 4,
              cursor: "pointer", fontFamily: "'Courier New', monospace",
              boxShadow: "0 0 15px rgba(0,245,255,0.2)",
              fontWeight: 700
            }}>
              ↓ DOWNLOAD QR
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JARVIS_QR;
