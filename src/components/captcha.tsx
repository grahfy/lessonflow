"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shape returned by `/api/captcha`.
 */
type CaptchaChallenge = {
  token: string;
  imageDataUrl: string;
  expiresInSeconds: number;
  prompt: string;
};

/**
 * Public hook return contract used by form components.
 */
export type CaptchaController = {
  captcha: CaptchaChallenge | null;
  userAnswer: string;
  loading: boolean;
  error: string;
  regenerate: () => Promise<void>;
  validateAnswer: () => boolean;
  handleChange: (value: string) => void;
  getPayload: () => { captchaToken: string; captchaAnswer: string };
};

/**
 * Loads and manages image CAPTCHA challenges for client forms.
 *
 * Validation correctness is server-side only; this hook only ensures a challenge is loaded and
 * the user provided a non-empty answer before submission.
 */
export function useCaptcha(): CaptchaController {
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const regenerate = useCallback(async () => {
    setLoading(true);
    setError("");
    setUserAnswer("");

    try {
      const response = await fetch("/api/captcha", {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) {
        setCaptcha(null);
        setError("Unable to load CAPTCHA challenge. Please try again.");
        return;
      }

      const nextChallenge = (await response.json()) as CaptchaChallenge;
      if (!nextChallenge?.token || !nextChallenge?.imageDataUrl) {
        setCaptcha(null);
        setError("Invalid CAPTCHA challenge response. Please try again.");
        return;
      }

      setCaptcha(nextChallenge);
    } catch {
      setCaptcha(null);
      setError("Unable to load CAPTCHA challenge. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void regenerate();
  }, [regenerate]);

  /**
   * Performs lightweight client checks before the request is sent.
   */
  function validateAnswer(): boolean {
    if (loading) {
      setError("CAPTCHA challenge is still loading.");
      return false;
    }
    if (!captcha) {
      setError("CAPTCHA challenge is unavailable. Please reload it.");
      return false;
    }
    if (!userAnswer.trim()) {
      setError("Please enter the CAPTCHA text shown in the image.");
      return false;
    }
    return true;
  }

  /**
   * Accepts letters and digits only to match the generated challenge format.
   */
  function handleChange(value: string) {
    setUserAnswer(value.toUpperCase().replace(/[^A-Z0-9!@#$%&*+\-=?]/g, "").slice(0, 12));
    if (error) {
      setError("");
    }
  }

  /**
   * Returns the payload fields expected by server routes.
   */
  function getPayload() {
    return {
      captchaToken: captcha?.token ?? "",
      captchaAnswer: userAnswer.trim()
    };
  }

  return {
    captcha,
    userAnswer,
    loading,
    error,
    regenerate,
    validateAnswer,
    handleChange,
    getPayload
  };
}

/**
 * Reusable field UI for the image CAPTCHA across public and login forms.
 */
export function CaptchaField(props: {
  idPrefix: string;
  captcha: CaptchaController;
  motionItem?: string;
}) {
  const inputId = `${props.idPrefix}-captcha`;
  const imageId = `${props.idPrefix}-captcha-image`;

  return (
    <div className="field full" data-motion-item={props.motionItem}>
      {/*
       * Honeypot field: visually hidden and removed from keyboard flow.
       * Legitimate users will not fill this, but simple bots often populate every input.
       */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden"
        }}
      >
        <label htmlFor={`${props.idPrefix}-website`}>Leave this field empty</label>
        <input
          id={`${props.idPrefix}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <label htmlFor={inputId}>Security check</label>
      <div id={imageId} aria-live="polite">
        {props.captcha.captcha ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={props.captcha.captcha.imageDataUrl}
            alt="CAPTCHA letters, numbers, and symbols"
            width={220}
            height={72}
          />
        ) : (
          <div className="helper-text" role="status">
            {props.captcha.loading ? "Loading CAPTCHA..." : "CAPTCHA unavailable."}
          </div>
        )}
      </div>
      <input
        id={inputId}
        name={`${props.idPrefix}Captcha`}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        required
        maxLength={12}
        aria-describedby={imageId}
        value={props.captcha.userAnswer}
        onChange={(event) => props.captcha.handleChange(event.currentTarget.value)}
      />
      <button type="button" className="btn btn-small" onClick={() => void props.captcha.regenerate()}>
        New image
      </button>
      {props.captcha.error ? <p className="helper-text" role="alert">{props.captcha.error}</p> : null}
      {props.captcha.captcha ? <p className="helper-text">{props.captcha.captcha.prompt}</p> : null}
    </div>
  );
}
