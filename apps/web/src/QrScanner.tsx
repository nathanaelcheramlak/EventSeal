import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

type ScannerState = "idle" | "starting" | "scanning" | "error";

type QrScannerProps = {
  disabled?: boolean;
  onScan: (token: string) => void;
};

const SCAN_ATTEMPT_DELAY_MS = 75;
const SCAN_SUCCESS_DELAY_MS = 75;
const DUPLICATE_SCAN_COOLDOWN_MS = 700;

export function QrScanner({ disabled = false, onScan }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const disabledRef = useRef(disabled);
  const lastScannedTextRef = useRef("");
  const noResultTimerRef = useRef<number | null>(null);
  const scanCooldownTimerRef = useRef<number | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    disabledRef.current = disabled;

    if (!disabled && controlsRef.current && scannerState === "scanning") {
      setMessage("Camera active. Ready for next guest.");
    }
  }, [disabled, scannerState]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  async function startScanner() {
    if (disabled || scannerState === "starting" || scannerState === "scanning") {
      return;
    }

    if (!isCameraAllowedInContext()) {
      setScannerState("error");
      setMessage("Camera access requires HTTPS or localhost.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerState("error");
      setMessage("Camera is not available in this browser.");
      return;
    }

    const video = videoRef.current;

    if (!video) {
      setScannerState("error");
      setMessage("Camera preview is not available.");
      return;
    }

    lastScannedTextRef.current = "";
    clearNoResultTimer();
    clearScanCooldownTimer();
    setScannerState("starting");
    setMessage("Requesting camera...");

    try {
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: SCAN_ATTEMPT_DELAY_MS,
        delayBetweenScanSuccess: SCAN_SUCCESS_DELAY_MS
      });

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 960 }
          }
        },
        video,
        (result) => {
          const text = result?.getText().trim();

          if (!text || disabledRef.current || lastScannedTextRef.current === text) {
            return;
          }

          lastScannedTextRef.current = text;
          clearNoResultTimer();
          clearScanCooldownTimer();
          setScannerState("scanning");
          setMessage("QR detected. Verifying...");
          onScan(text);

          scanCooldownTimerRef.current = window.setTimeout(() => {
            if (lastScannedTextRef.current === text) {
              lastScannedTextRef.current = "";
            }

            if (controlsRef.current && !disabledRef.current) {
              setMessage("Camera active. Ready for next guest.");
            }
          }, DUPLICATE_SCAN_COOLDOWN_MS);
        }
      );

      controlsRef.current = controls;
      setScannerState("scanning");
      setMessage("Camera active. Ready for next guest.");
      noResultTimerRef.current = window.setTimeout(() => {
        if (controlsRef.current) {
          setMessage("No QR code detected yet.");
        }
      }, 8000);
    } catch (error) {
      clearNoResultTimer();
      controlsRef.current = null;
      BrowserQRCodeReader.releaseAllStreams();
      setScannerState("error");
      setMessage(cameraErrorMessage(error));
    }
  }

  function stopScanner() {
    clearNoResultTimer();
    clearScanCooldownTimer();
    lastScannedTextRef.current = "";
    controlsRef.current?.stop();
    controlsRef.current = null;
    BrowserQRCodeReader.releaseAllStreams();

    if (scannerState !== "idle") {
      setScannerState("idle");
      setMessage("");
    }
  }

  function clearNoResultTimer() {
    if (noResultTimerRef.current !== null) {
      window.clearTimeout(noResultTimerRef.current);
      noResultTimerRef.current = null;
    }
  }

  function clearScanCooldownTimer() {
    if (scanCooldownTimerRef.current !== null) {
      window.clearTimeout(scanCooldownTimerRef.current);
      scanCooldownTimerRef.current = null;
    }
  }

  const isActive = scannerState === "starting" || scannerState === "scanning";
  const scannerLabel = disabled && isActive ? "Verifying" : isActive ? "Scanning" : "Ready";

  return (
    <div className={`scanner ${scannerState}`}>
      <div className={`scanner-preview ${isActive ? "active" : ""}`}>
        <video ref={videoRef} muted playsInline autoPlay aria-label="QR camera preview" />
        <div className="scanner-frame" aria-hidden="true" />
        <span className="scanner-state">{scannerLabel}</span>
        {!isActive && <div className="scanner-placeholder">Camera off</div>}
      </div>

      <div className="actions">
        {isActive ? (
          <button className="secondary" type="button" onClick={stopScanner}>
            Stop camera
          </button>
        ) : (
          <button className="scanner-button" type="button" onClick={startScanner} disabled={disabled}>
            Start camera
          </button>
        )}
      </div>

      {message && (
        <p className={scannerState === "error" ? "error" : "notice"} aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}

function isCameraAllowedInContext() {
  return (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Camera permission denied.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera was found.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Camera is already in use.";
    }
  }

  return "Camera could not start.";
}
