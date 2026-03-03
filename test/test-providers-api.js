async function main() {
    try {
        const res = await fetch('http://localhost:3000/api/auth/providers');
        const json = await res.json();
        console.log('--- PROVIDERS_API_START ---');
        console.log(JSON.stringify(json, null, 2));
        console.log('--- PROVIDERS_API_END ---');
    } catch (err) {
        console.error('Failed to fetch providers:', err.message);
    }
}

main();
