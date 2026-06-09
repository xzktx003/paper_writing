function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function firstForwardedValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

function parseHeaderUrl(
  value: string | string[] | undefined,
): { host: string } | null {
  const rawValue = firstForwardedValue(firstHeaderValue(value));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    return {
      host: parsed.host,
    };
  } catch {
    return null;
  }
}

export function resolveVsCodeWebRequestTarget(request: {
  headers: Record<string, string | string[] | undefined>;
  protocol: string;
}): { requestHost?: string; requestProtocol: "http" } {
  const forwardedHost = firstForwardedValue(
    firstHeaderValue(request.headers["x-forwarded-host"]),
  );
  if (forwardedHost) {
    return {
      requestHost: forwardedHost,
      requestProtocol: "http",
    };
  }

  const browserOrigin =
    parseHeaderUrl(request.headers.origin) ??
    parseHeaderUrl(request.headers.referer);
  if (browserOrigin) {
    return {
      requestHost: browserOrigin.host,
      requestProtocol: "http",
    };
  }

  return {
    requestHost: firstForwardedValue(firstHeaderValue(request.headers.host)),
    requestProtocol: "http",
  };
}
