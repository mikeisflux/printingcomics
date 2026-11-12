import { isSupabaseConfigured, supabase } from './supabase';

function requireDriveUploadBackend() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Secure file storage is not configured for this site yet.');
  return supabase;
}

function uploadFileBytes(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('The file upload was interrupted. Please try again.'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('Google Drive did not accept the file. Please try again.'));
        return;
      }
      try {
        resolve(JSON.parse(request.responseText));
      } catch {
        reject(new Error('Google Drive returned an unreadable upload response.'));
      }
    };
    request.send(file);
  });
}

async function invokeUploadAction(body) {
  const client = requireDriveUploadBackend();
  const { data, error } = await client.functions.invoke('google-drive-upload', { body });
  if (error) throw new Error(error.message || 'The secure upload service could not be reached.');
  if (!data?.ok) throw new Error(data?.error || 'The secure upload did not complete.');
  return data;
}

export async function uploadTitleFileToDrive({ titleId, fileType, file, onProgress }) {
  if (!file || !titleId || !fileType) throw new Error('Choose a title and file before uploading.');
  onProgress?.(0);
  const session = await invokeUploadAction({
    action: 'start',
    titleId,
    fileType,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size
  });
  const uploaded = await uploadFileBytes(session.uploadUrl, file, onProgress);
  const completed = await invokeUploadAction({
    action: 'complete',
    titleId,
    fileType,
    fileId: uploaded.id
  });
  onProgress?.(100);
  return completed;
}
