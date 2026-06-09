interface ClipboardLike {
  writeText?: (text: string) => Promise<void>;
}

interface NavigatorLike {
  clipboard?: ClipboardLike;
}

interface ClipboardDocumentLike {
  body: {
    appendChild: (element: HTMLTextAreaElement) => void;
    removeChild: (element: HTMLTextAreaElement) => void;
  };
  createElement: (tagName: "textarea") => HTMLTextAreaElement;
  execCommand?: (command: "copy") => boolean;
}

function fallbackCopyText(
  text: string,
  documentRef: ClipboardDocumentLike,
): boolean {
  if (typeof documentRef.execCommand !== "function") {
    return false;
  }

  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";

  documentRef.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return documentRef.execCommand("copy");
  } finally {
    documentRef.body.removeChild(textarea);
  }
}

export async function copyTextToClipboard(
  text: string,
  options: {
    documentRef?: ClipboardDocumentLike;
    navigatorRef?: NavigatorLike;
  } = {},
): Promise<boolean> {
  const navigatorRef = options.navigatorRef ?? navigator;
  const documentRef = options.documentRef ?? document;

  try {
    if (typeof navigatorRef.clipboard?.writeText === "function") {
      await navigatorRef.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path for HTTP LAN pages or denied permissions.
  }

  return fallbackCopyText(text, documentRef);
}
