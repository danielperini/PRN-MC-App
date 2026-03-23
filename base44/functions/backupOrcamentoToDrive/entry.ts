import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileBase64, fileName, activityTitle, purchaseRequestId } = await req.json();

    // Get Google Drive connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Create folder structure: Compras/[Activity]/[PurchaseRequest]/
    const folderName = `Compras - ${activityTitle} - ${purchaseRequestId}`;
    
    // Search for existing folder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and trashed=false&spaces=drive&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    
    const searchData = await searchResponse.json();
    let folderId = searchData.files?.[0]?.id;

    // Create folder if doesn't exist
    if (!folderId) {
      const createFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });

      const folderData = await createFolderResponse.json();
      folderId = folderData.id;
    }

    // Upload file to folder
    const formData = new FormData();
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    
    formData.append('metadata', JSON.stringify({
      name: fileName,
      parents: [folderId],
    }));
    formData.append('file', blob);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const uploadData = await uploadResponse.json();

    return Response.json({
      success: true,
      fileId: uploadData.id,
      folderName,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});