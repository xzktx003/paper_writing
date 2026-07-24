import { useEffect, useState } from 'react';

type AssetState = {
  objectUrl: string;
  loading: boolean;
  error: string;
};

async function fetchAssetBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Protected asset request failed with status ${response.status}`);
  }
  return response.blob();
}

export function useAuthenticatedBlobUrl(src: string | null | undefined): AssetState {
  const [state, setState] = useState<AssetState>({ objectUrl: '', loading: Boolean(src), error: '' });

  useEffect(() => {
    let disposed = false;
    let createdUrl = '';

    if (!src) {
      setState({ objectUrl: '', loading: false, error: '' });
      return () => {};
    }

    setState({ objectUrl: '', loading: true, error: '' });
    fetchAssetBlob(src)
      .then((blob) => {
        if (disposed) return;
        createdUrl = URL.createObjectURL(blob);
        setState({ objectUrl: createdUrl, loading: false, error: '' });
      })
      .catch((cause) => {
        if (disposed) return;
        setState({ objectUrl: '', loading: false, error: cause instanceof Error ? cause.message : String(cause) });
      });

    return () => {
      disposed = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  return state;
}

interface AssetProps {
  src: string;
  title: string;
  loadingLabel: string;
  errorLabel: string;
  style?: React.CSSProperties;
}

export function AuthenticatedImage({ src, title, loadingLabel, errorLabel, style }: AssetProps) {
  const asset = useAuthenticatedBlobUrl(src);
  if (asset.loading) return <div role="status">{loadingLabel}</div>;
  if (asset.error) return <div role="alert" title={asset.error}>{errorLabel}</div>;
  return asset.objectUrl ? <img src={asset.objectUrl} alt={title} style={style} /> : null;
}

export function AuthenticatedPdf({ src, title, loadingLabel, errorLabel, style }: AssetProps) {
  const asset = useAuthenticatedBlobUrl(src);
  if (asset.loading) return <div role="status">{loadingLabel}</div>;
  if (asset.error) return <div role="alert" title={asset.error}>{errorLabel}</div>;
  return asset.objectUrl ? <embed src={asset.objectUrl} title={title} type="application/pdf" style={style} /> : null;
}

export async function downloadAuthenticatedFile(src: string, filename: string): Promise<void> {
  const blob = await fetchAssetBlob(src);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export async function openAuthenticatedFile(src: string): Promise<void> {
  const blob = await fetchAssetBlob(src);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
