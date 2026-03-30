export interface ParsedWindowCaptureLabel {
  parsedTitle?: string;
  parsedAppName?: string;
  confidence: "high" | "low";
}

export interface WindowCaptureDisplay {
  title: string;
  appName?: string;
  usesCustomName: boolean;
}

const KNOWN_APP_SUFFIXES = ["Visual Studio Code", "Code"];

function normalizeLabel(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseWindowCaptureLabel(
  rawLabel: string,
): ParsedWindowCaptureLabel {
  if (!rawLabel) {
    return { confidence: "low" };
  }

  // Try splitting from the right, checking each segment against known suffixes
  for (const suffix of KNOWN_APP_SUFFIXES) {
    for (const sep of [" - ", " — ", " – "]) {
      const ending = `${sep}${suffix}`;
      if (rawLabel.endsWith(ending)) {
        const title = rawLabel.slice(0, -ending.length).trim();
        if (title) {
          return {
            parsedTitle: title,
            parsedAppName: suffix,
            confidence: "high",
          };
        }
      }
    }
  }

  return { confidence: "low" };
}

export function getWindowCaptureDisplay(
  displayName: string,
  rawLabel?: string,
): WindowCaptureDisplay {
  const normalizedDisplayName = normalizeLabel(displayName) ?? "VS Code 窗口";
  const normalizedRawLabel = normalizeLabel(rawLabel);

  if (normalizedRawLabel && normalizedDisplayName !== normalizedRawLabel) {
    return {
      title: normalizedDisplayName,
      usesCustomName: true,
    };
  }

  const parsed = parseWindowCaptureLabel(
    normalizedRawLabel ?? normalizedDisplayName,
  );

  if (parsed.confidence === "high" && parsed.parsedTitle) {
    return {
      title: parsed.parsedTitle,
      appName: parsed.parsedAppName,
      usesCustomName: false,
    };
  }

  return {
    title: normalizedDisplayName,
    usesCustomName: false,
  };
}
