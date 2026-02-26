const { BlobServiceClient } = require('@azure/storage-blob');

const connString = process.env.TEST_CONN_STR || "BlobEndpoint=https://cicsaztechhub.blob.core.windows.net/;QueueEndpoint=https://cicsaztechhub.queue.core.windows.net/;FileEndpoint=https://cicsaztechhub.file.core.windows.net/;TableEndpoint=https://cicsaztechhub.table.core.windows.net/;SharedAccessSignature=sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2026-02-27T04:15:49Z&st=2026-02-26T20:00:49Z&spr=https&sig=FakeSig";

async function main() {
    console.log('Testing with connection string:', connString);
    try {
        const client = BlobServiceClient.fromConnectionString(connString);
        console.log('Client URL:', client.url);

        const containerClient = client.getContainerClient('uploads');
        console.log('Container URL:', containerClient.url);

        const blobClient = containerClient.getBlockBlobClient('test.png');
        console.log('Blob URL:', blobClient.url);

        // we won't actually do standard network call, just want to see properties

    } catch (err) {
        console.error('Error:', err);
    }
}

main();
