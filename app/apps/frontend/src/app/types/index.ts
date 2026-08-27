export interface OpenFile {
  filename: string;
  content: string;
  type: 'chapter' | 'code' | 'other';
  dirty: boolean;
  lastSyncedContent?: string;
  externalContent?: string;
}

export interface PendingEdit {
  id: string;
  filename: string;
  original: string;
  proposed: string;
  description: string;
}
