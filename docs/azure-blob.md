# Azure Blob Storage Uploads

This app can store uploads in Azure Blob Storage by setting `STORAGE_PROVIDER=azure`.

## Configuration

Set one of the following authentication methods:

- Connection string (recommended):
  - `AZURE_STORAGE_CONNECTION_STRING`
- Account + key:
  - `AZURE_STORAGE_ACCOUNT`
  - `AZURE_STORAGE_KEY`

Required:
- `AZURE_BLOB_CONTAINER` (example: `uploads`)

If you save secrets through the admin UI, ensure `SSO_MASTER_KEY` is set so secrets can be encrypted/decrypted.

Optional:
- `AZURE_BLOB_ENDPOINT` (for Azurite or private endpoints)
- `AZURE_SAS_TTL_MINUTES` (default: 10)

## Example .env

```
STORAGE_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
AZURE_BLOB_CONTAINER=uploads
AZURE_SAS_TTL_MINUTES=10
```

## Local development with Azurite

If you use Azurite (local Azure Storage emulator), set:

```
STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT=devstoreaccount1
AZURE_STORAGE_KEY=Eby8vdM02xNOcqFeqC... (Azurite default)
AZURE_BLOB_CONTAINER=uploads
AZURE_BLOB_ENDPOINT=http://127.0.0.1:10000/devstoreaccount1
AZURE_SAS_TTL_MINUTES=10
```

Create the container before use:

```
az storage container create --name uploads --connection-string "<your-connection-string>"
```

## Notes

- Upload keys are stored under the `uploads/` prefix (example: `uploads/<uuid>.png`).
- The storage adapter returns the blob URL as the file location.
- For large files and high scale, consider direct browser uploads using short-lived SAS URLs.

## SAS token endpoint

The admin UI can request a short-lived SAS URL for uploads:

```
POST /api/storage/sas
Content-Type: application/json
X-CSRF-Token: <csrf-token>

{
  "filename": "icon.png",
  "contentType": "image/png",
  "contentLength": 12345
}
```

Response:

```
{
  "uploadUrl": "https://<account>.blob.core.windows.net/<container>/uploads/<uuid>.png?...",
  "blobUrl": "https://<account>.blob.core.windows.net/<container>/uploads/<uuid>.png",
  "blobName": "uploads/<uuid>.png",
  "expiresAt": "2026-02-25T12:00:00.000Z"
}
```
