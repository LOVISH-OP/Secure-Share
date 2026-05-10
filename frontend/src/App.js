import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const BASE_URL = "http://localhost:5000";
const DEFAULT_SHARE_DURATION = "60";

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("secureshare-theme") || "dark");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState("");
  const [burnOnRead, setBurnOnRead] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [copied, setCopied] = useState(false);
  const [shareDuration, setShareDuration] = useState(DEFAULT_SHARE_DURATION);
  const [shareMode, setShareMode] = useState("vault");
  const [shareLinkData, setShareLinkData] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [highlightedFile, setHighlightedFile] = useState("");
  const [qrLoadError, setQrLoadError] = useState(false);
  const [initialShareToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("share") || "";
  });
  const [initialSharedFile] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("file") || "";
  });

  const buildShareUrl = useCallback(({ fileName, shareToken }) => {
    const url = new URL(window.location.origin + window.location.pathname);

    if (shareToken) {
      url.searchParams.set("share", shareToken);
      return url.toString();
    }

    if (fileName) {
      url.searchParams.set("file", fileName);
    }

    return url.toString();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/files`);
      setFiles(res.data);
    } catch (err) {
      console.error("Server is not responding...");
    }
  };

  const resolveSharedToken = useCallback(async (token) => {
    try {
      const res = await axios.get(`${BASE_URL}/share/${token}`);
      const sharedFile = res.data.file;
      setHighlightedFile(sharedFile.name);
      setShareTarget(sharedFile);
      setShareMode("expiring");
      setShareLinkData({
        token,
        expiresAt: res.data.shareExpiresAt,
        url: buildShareUrl({ shareToken: token }),
      });
      setMessage("Expiring share link loaded.");
    } catch (err) {
      setMessage("This share link is invalid or has already expired.");
    }
  }, [buildShareUrl]);

  const formatDateTime = (value) => {
    if (!value) return "No expiry set";

    return new Date(value).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const handleFileSelection = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !password) {
      setMessage("Select at least one file and add a protection key.");
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("password", password);
    formData.append("burnOnRead", burnOnRead);

    try {
      setLoading(true);
      setMessage("Encrypting files and preparing your secure upload...");
      await axios.post(`${BASE_URL}/upload`, formData);
      setMessage("Upload complete. Your files are now protected.");
      setSelectedFiles([]);
      setPassword("");
      fetchFiles();
    } catch (err) {
      setMessage("Network error. Check whether the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async (filename) => {
    const pass = prompt("Enter Decryption Key:");
    if (!pass) return;

    try {
      setMessage("Decrypting and preparing your download...");
      const res = await axios.post(
        `${BASE_URL}/download/${filename}`,
        { password: pass },
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "Decrypted_File");
      document.body.appendChild(link);
      link.click();
      setMessage("Download ready. Your file has been unlocked.");
      setTimeout(fetchFiles, 2000);
    } catch (err) {
      alert("Wrong password or the file is no longer available.");
    }
  };

  const openSharePanel = useCallback((file, mode = "vault") => {
    setShareTarget(file);
    setCopied(false);
    setShareMode(mode);
    setHighlightedFile(file.name);

    if (mode === "vault") {
      setShareLinkData(null);
      window.history.replaceState({}, "", buildShareUrl({ fileName: file.name }));
      return;
    }

    if (shareLinkData?.token) {
      window.history.replaceState({}, "", buildShareUrl({ shareToken: shareLinkData.token }));
    }
  }, [buildShareUrl, shareLinkData]);

  const handleShareOpen = (file) => {
    setQrLoadError(false);
    openSharePanel(file, "vault");
  };

  const handleShareClose = () => {
    setShareTarget(null);
    setCopied(false);
    setShareMode("vault");
    setShareLinkData(null);
    setQrLoadError(false);

    const url = new URL(window.location.origin + window.location.pathname);
    window.history.replaceState({}, "", url);
  };

  const generateExpiringLink = async () => {
    if (!shareTarget) return;

    try {
      setShareLoading(true);
      const res = await axios.post(`${BASE_URL}/share/${shareTarget.name}`, {
        expiresInMinutes: Number(shareDuration),
      });

      const nextLink = {
        token: res.data.token,
        expiresAt: res.data.shareExpiresAt,
        url: buildShareUrl({ shareToken: res.data.token }),
      };

      setShareLinkData(nextLink);
      setShareMode("expiring");
      setCopied(false);
      setQrLoadError(false);
      window.history.replaceState({}, "", nextLink.url);
    } catch (err) {
      setMessage("Could not generate an expiring share link.");
    } finally {
      setShareLoading(false);
    }
  };

  const getActiveShareUrl = () => {
    if (!shareTarget) return "";
    if (shareMode === "expiring" && shareLinkData?.url) return shareLinkData.url;
    return buildShareUrl({ fileName: shareTarget.name });
  };

  const handleCopyLink = async () => {
    const activeUrl = getActiveShareUrl();
    if (!activeUrl) return;

    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
    } catch (err) {
      setMessage("Could not copy the share link automatically.");
    }
  };

  const handleNativeShare = async () => {
    if (!shareTarget || !navigator.share) return;

    try {
      await navigator.share({
        title: `SecureShare: ${shareTarget.originalName}`,
        text:
          shareMode === "expiring"
            ? "Open this secure file using the expiring SecureShare link."
            : "Open this secure file in SecureShare and unlock it with the protection key.",
        url: getActiveShareUrl(),
      });
    } catch (err) {
      // Share sheet cancellation should remain silent.
    }
  };

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("secureshare-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!initialShareToken) return;
    resolveSharedToken(initialShareToken);
  }, [initialShareToken, resolveSharedToken]);

  useEffect(() => {
    if (initialShareToken || !initialSharedFile || files.length === 0) return;

    const matchedFile = files.find((file) => file.name === initialSharedFile);
    if (matchedFile) {
      openSharePanel(matchedFile, "vault");
      setHighlightedFile(matchedFile.name);
    }
  }, [files, initialShareToken, initialSharedFile, openSharePanel]);

  const storageLabel = useMemo(() => {
    if (selectedFiles.length === 0) return "No files selected yet";
    if (selectedFiles.length === 1) return selectedFiles[0].name;
    return `${selectedFiles.length} files selected`;
  }, [selectedFiles]);

  const activeShareUrl = shareTarget ? getActiveShareUrl() : "";
  const qrCodeUrl = shareTarget
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(
        activeShareUrl
      )}`
    : "";

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="ambient ambient-center" />
      <div className="mesh-ring mesh-ring-one" />
      <div className="mesh-ring mesh-ring-two" />
      <div className="grid-overlay" />

      <main className="app-frame">
        <section className="hero-panel reveal">
          <div className="hero-copy">
            <div className="hero-topbar">
              <div className="eyebrow">Encrypted transfer workspace</div>
              <button className="theme-toggle" onClick={toggleTheme} type="button">
                <span className="theme-toggle-label">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              </button>
            </div>
            <h1>Secure file delivery with modern motion and smarter sharing.</h1>
            <p className="hero-text">
              SecureShare now supports QR handoff, expiring links, one-time access,
              and a more premium animated interface that feels like a finished product.
            </p>

            <div className="hero-metrics">
              <div className="metric-pill">
                <span className="metric-label">Protection</span>
                <strong>AES-secured flow</strong>
              </div>
              <div className="metric-pill">
                <span className="metric-label">Sharing</span>
                <strong>QR and expiring links</strong>
              </div>
              <div className="metric-pill">
                <span className="metric-label">Vault items</span>
                <strong>{files.length}</strong>
              </div>
            </div>
          </div>

          <div className="hero-status-card reveal delay-1">
            <span className="status-kicker">Live status</span>
            <h2>Timed access, cleaner delivery, stronger control.</h2>
            <p>
              Create protected downloads, share them through QR or direct links,
              and keep delivery windows intentionally short.
            </p>
            <div className="status-stack">
              <div className="status-row shimmer-line">
                <span className="status-dot online" />
                <span>Vault synced with backend</span>
              </div>
              <div className="status-row shimmer-line">
                <span className="status-dot" />
                <span>Expiring link generation ready</span>
              </div>
            </div>
          </div>
        </section>

        <section className="content-grid">
          <div className="upload-card reveal delay-2">
            <div className="section-heading">
              <span className="section-kicker">Upload</span>
              <h2>Protect new files</h2>
            </div>

            <label className="dropzone" htmlFor="file-upload">
              <input
                id="file-upload"
                type="file"
                multiple
                onChange={handleFileSelection}
                className="custom-file-input"
              />
              <span className="dropzone-icon">+</span>
              <strong>Drop files here or browse from your device</strong>
              <span>{storageLabel}</span>
            </label>

            <div className="field-stack">
              <label className="field-label" htmlFor="password">
                Protection key
              </label>
              <input
                id="password"
                type="password"
                placeholder="Set a strong password"
                className="password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <label className="toggle-card" htmlFor="burn">
              <div>
                <span className="toggle-title">Burn after download</span>
                <p>Remove the file automatically after the first successful unlock.</p>
              </div>
              <input
                type="checkbox"
                checked={burnOnRead}
                onChange={(e) => setBurnOnRead(e.target.checked)}
                id="burn"
              />
            </label>

            <button className="primary-btn" onClick={handleUpload} disabled={loading}>
              {loading ? "Securing..." : "Encrypt and Upload"}
            </button>

            {message && <div className="message-box">{message}</div>}
          </div>

          <div className="vault-panel reveal delay-3">
            <div className="section-heading">
              <span className="section-kicker">Vault</span>
              <h2>Your protected files</h2>
            </div>

            <div className="files-grid">
              {files.length > 0 ? (
                files.map((file, index) => (
                  <article
                    className={`file-card ${highlightedFile === file.name ? "file-card-highlight" : ""}`}
                    key={file.name || index}
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div className="file-card-top">
                      <span className="file-badge">{file.burn ? "One-time" : "Available"}</span>
                      <span className="file-meta">{formatDateTime(file.expiresAt)}</span>
                    </div>
                    <h3>{file.originalName}</h3>
                    <p>
                      {file.burn
                        ? "This file will disappear after the next valid download."
                        : "Stored in your vault with timed access and share-ready handoff."}
                    </p>
                    <div className="file-actions">
                      <button className="decrypt-btn" onClick={() => handleDecrypt(file.name)}>
                        Unlock File
                      </button>
                      <button className="share-btn" onClick={() => handleShareOpen(file)}>
                        Share Options
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <span className="empty-state-badge">Vault is empty</span>
                  <p>Upload your first file to see protected items appear here.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {shareTarget && (
        <div className="share-overlay" onClick={handleShareClose}>
          <div className="share-modal" onClick={(event) => event.stopPropagation()}>
            <div className="share-header">
              <div>
                <span className="section-kicker">Share</span>
                <h2>{shareTarget.originalName}</h2>
              </div>
              <button className="icon-btn" onClick={handleShareClose} aria-label="Close share panel">
                x
              </button>
            </div>

            <p className="share-copy">
              Choose a normal vault link or generate an expiring link, then share it as a URL or QR
              code. The recipient will still need the protection key to decrypt the file.
            </p>

            <div className="share-toggle-row">
              <button
                className={`mode-pill ${shareMode === "vault" ? "mode-pill-active" : ""}`}
                onClick={() => openSharePanel(shareTarget, "vault")}
              >
                Vault link
              </button>
              <button
                className={`mode-pill ${shareMode === "expiring" ? "mode-pill-active" : ""}`}
                onClick={() => setShareMode("expiring")}
              >
                Expiring link
              </button>
            </div>

            <div className="share-layout">
              <div className="qr-card">
                {!qrLoadError ? (
                  <img
                    className="qr-image"
                    src={qrCodeUrl}
                    alt={`QR code for ${shareTarget.originalName}`}
                    onError={() => setQrLoadError(true)}
                  />
                ) : (
                  <div className="qr-fallback">
                    <strong>QR preview unavailable</strong>
                    <span>Copy the link below or retry after the connection is restored.</span>
                  </div>
                )}
                <span className="qr-caption">
                  QR points to the {shareMode === "expiring" ? "expiring" : "vault"} link.
                </span>
              </div>

              <div className="share-details">
                <div className="share-block">
                  <label className="field-label" htmlFor="share-url">
                    Active share link
                  </label>
                  <input id="share-url" className="password-input share-input" value={activeShareUrl} readOnly />
                </div>

                <div className="expiry-builder">
                  <div className="expiry-head">
                    <span className="field-label">Expiring link</span>
                    <span className="expiry-meta">
                      {shareLinkData?.expiresAt
                        ? `Expires ${formatDateTime(shareLinkData.expiresAt)}`
                        : "Generate a timed link"}
                    </span>
                  </div>

                  <div className="expiry-controls">
                    <select
                      className="expiry-select"
                      value={shareDuration}
                      onChange={(event) => setShareDuration(event.target.value)}
                    >
                      <option value="15">15 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="360">6 hours</option>
                      <option value="1440">24 hours</option>
                    </select>
                    <button className="primary-btn share-action-btn" onClick={generateExpiringLink} disabled={shareLoading}>
                      {shareLoading ? "Generating..." : "Generate Link"}
                    </button>
                  </div>
                </div>

                <div className="share-actions">
                  <button
                    className="primary-btn share-action-btn"
                    onClick={() => handleDecrypt(shareTarget.name)}
                  >
                    Download File
                  </button>
                  <button className="share-btn share-action-btn" onClick={handleCopyLink}>
                    {copied ? "Copied" : "Copy Link"}
                  </button>
                  {navigator.share && (
                    <button className="share-btn share-action-btn" onClick={handleNativeShare}>
                      Open Share Sheet
                    </button>
                  )}
                </div>

                <div className="share-note">
                  <strong>Tip:</strong> QR links using `localhost` only work on this device. For phone
                  sharing, open the app on your computer&apos;s local IP instead.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
